#!/usr/bin/env python3
"""
V2 Cinema-Grade Stereo Soundtrack & Studio Voice Mastering Engine
for The Last Kiln of Ember Valley (84.0s @ 48kHz).

ZERO macOS `say` usage!
Mixes:
  1. All 4 real Zyphra/ZONOS3-Mini studio 44.1kHz English narrations (`Savannah` voice)
     from /Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma/
  2. Rich original 4-voice stereo bowed-cello & chamber strings film score (D Dorian ->
     radiant Picardy D Major sunrise bloom) + hand-struck ceramic chimes + stereo Schroeder reverb.
  3. Authentic wood-fired kiln hearth Foley (furnace bellows rumble + stereo cedar-ember crackles).
  4. Smooth speech-triggered sidechain ducking (-5 dB) + FFmpeg cinema loudness normalization (-14 LUFS).
"""

from __future__ import annotations

import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 48000
DURATION_SEC = 84.0
NUM_SAMPLES = int(SAMPLE_RATE * DURATION_SEC)

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"
VO_DIR = OUT_DIR / "studio_vo_master"
STUDIO_AUDIO_SRC = Path("/Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma")

# Exact cue placements aligned to the 8-plate 84-second storyboard
STUDIO_VO_CUES = [
    # Shot 1-2: Title dissolve (0-4s) -> Dying Valley (4-14s) -> Apprentice Hearth (14-22s)
    (4.2, "shot1_valley.wav"),
    # Shot 3-4: Mineral Glaze Table (22-32s) -> Molten Cinnabar Pour (32-43s)
    (22.6, "shot2_glazes.wav"),
    # Shot 5-6: 1100C Roaring Kiln (43-52s) -> Midnight Fracture (52-60s)
    (44.2, "shot3_firing.wav"),
    # Shot 7-8: Kintsugi Dawn Hero (60-72s) -> Olive Shoots & Moral Credits (72-84s)
    (60.8, "shot4_kintsugi_dawn.wav"),
]


def run_cmd(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr}")
    return proc


def read_wav_stereo_f32(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)
    if sampwidth != 2:
        raise ValueError(f"Expected 16-bit PCM WAV, got {sampwidth * 8}-bit")
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if channels == 1:
        return np.stack([data, data], axis=1)
    return data.reshape(-1, channels)[:, :2]


def write_wav_stereo_i16(path: Path, stereo: np.ndarray) -> None:
    clipped = np.clip(stereo, -0.98, 0.98)
    pcm = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def load_studio_zonos3_narration() -> tuple[np.ndarray, np.ndarray]:
    """Master and time-align all 4 real Zyphra ZONOS3-Mini 44.1kHz WAV narration clips."""
    VO_DIR.mkdir(parents=True, exist_ok=True)
    voice_bed = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    speech_envelope = np.zeros(NUM_SAMPLES, dtype=np.float32)

    for start_sec, filename in STUDIO_VO_CUES:
        src = STUDIO_AUDIO_SRC / filename
        if not src.exists():
            raise FileNotFoundError(f"Required studio ZONOS3 WAV missing: {src}")
        mastered = VO_DIR / f"master_{filename}"

        # Warm theatrical cinema vocal polish: clean sub rumble, gentle warmth, intimate hall air
        af = (
            "highpass=f=68,"
            "equalizer=f=190:width_type=o:width=1.4:g=1.8,"
            "equalizer=f=3200:width_type=o:width=1.3:g=1.6,"
            "acompressor=threshold=-18dB:ratio=2.2:attack=12:release=140:makeup=2,"
            "aecho=0.88:0.86:24|48:0.11|0.05"
        )
        run_cmd([
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(src),
            "-af", af,
            "-ar", str(SAMPLE_RATE),
            "-ac", "2",
            "-c:a", "pcm_s16le",
            str(mastered),
        ])

        clip = read_wav_stereo_f32(mastered)
        # Normalize each studio vocal clip to uniform RMS presence
        rms = float(np.sqrt(np.mean(clip ** 2))) + 1e-6
        clip = clip * (0.145 / rms)
        clip = np.clip(clip, -0.92, 0.92)

        start_idx = int(start_sec * SAMPLE_RATE)
        end_idx = min(NUM_SAMPLES, start_idx + clip.shape[0])
        usable = end_idx - start_idx
        if usable > 0:
            fade_n = min(int(0.03 * SAMPLE_RATE), usable // 4)
            if fade_n > 0:
                ramp = np.linspace(0.0, 1.0, fade_n, dtype=np.float32)[:, None]
                clip[:fade_n] *= ramp
                clip[usable - fade_n:usable] *= ramp[::-1]
            voice_bed[start_idx:end_idx] += clip[:usable]

            pad = int(0.32 * SAMPLE_RATE)
            s0 = max(0, start_idx - pad)
            s1 = min(NUM_SAMPLES, end_idx + pad)
            speech_envelope[s0:s1] = 1.0

    # Smooth sidechain envelope (~360ms moving average)
    win = int(0.36 * SAMPLE_RATE)
    kernel = np.ones(win, dtype=np.float32) / float(win)
    smooth_env = np.convolve(speech_envelope, kernel, mode="same")
    return voice_bed, np.clip(smooth_env, 0.0, 1.0)


def apply_stereo_hall_reverb(stereo: np.ndarray, wet: float = 0.34) -> np.ndarray:
    """Rich multi-tap concert-hall stereo reverb in pure numpy."""
    taps_l = [
        (int(0.031 * SAMPLE_RATE), 0.34),
        (int(0.067 * SAMPLE_RATE), 0.27),
        (int(0.119 * SAMPLE_RATE), 0.21),
        (int(0.193 * SAMPLE_RATE), 0.15),
        (int(0.289 * SAMPLE_RATE), 0.10),
    ]
    taps_r = [
        (int(0.037 * SAMPLE_RATE), 0.34),
        (int(0.079 * SAMPLE_RATE), 0.27),
        (int(0.137 * SAMPLE_RATE), 0.21),
        (int(0.211 * SAMPLE_RATE), 0.15),
        (int(0.313 * SAMPLE_RATE), 0.10),
    ]
    wet_l = np.zeros(stereo.shape[0], dtype=np.float32)
    wet_r = np.zeros(stereo.shape[0], dtype=np.float32)
    for d, g in taps_l:
        wet_l[d:] += stereo[:-d, 0] * g + stereo[:-d, 1] * (g * 0.32)
    for d, g in taps_r:
        wet_r[d:] += stereo[:-d, 1] * g + stereo[:-d, 0] * (g * 0.32)
    out = np.empty_like(stereo)
    out[:, 0] = stereo[:, 0] * (1.0 - wet * 0.35) + wet_l * wet
    out[:, 1] = stereo[:, 1] * (1.0 - wet * 0.35) + wet_r * wet
    return out


def bowed_string_note(length: int, freq: float, amp: float, vibrato_hz: float = 4.6, warmth: float = 1.0) -> np.ndarray:
    """Synthesize an expressive bowed cello/viola voice with rich harmonic spectrum and organic bow attack."""
    lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
    dur = length / float(SAMPLE_RATE)
    # Slow bow onset + smooth expressive release
    attack = np.clip(lt / min(0.85, dur * 0.25), 0.0, 1.0) ** 1.3
    release = np.clip((dur - lt) / min(1.2, dur * 0.3), 0.0, 1.0) ** 1.4
    env = attack * release
    # Vibrato deepens gently after bow settles
    vib_depth = 0.0045 * np.clip((lt - 0.35) / 1.2, 0.0, 1.0)
    inst_f = freq * (1.0 + vib_depth * np.sin(2.0 * math.pi * vibrato_hz * lt))
    phase = np.cumsum(2.0 * math.pi * inst_f / SAMPLE_RATE)
    sig = (
        1.00 * np.sin(phase)
        + 0.46 * warmth * np.sin(2.0 * phase + 0.15)
        + 0.24 * warmth * np.sin(3.0 * phase - 0.20)
        + 0.11 * warmth * np.sin(4.0 * phase + 0.35)
        + 0.05 * warmth * np.sin(5.0 * phase)
    )
    return (sig * env * amp).astype(np.float32)


def synthesize_chamber_score_and_foley() -> np.ndarray:
    """Compose an 84-second emotional cello/strings cinema score + ceramic bells + wood-kiln Foley."""
    rng = np.random.default_rng(20261215)
    t = np.arange(NUM_SAMPLES, dtype=np.float32) / float(SAMPLE_RATE)
    score = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)

    # Emotional chord progression across the 84-second narrative arc
    # (start_s, dur_s, [bass_cello_hz, inner_cello_hz, viola_hz, high_string_hz], intensity)
    chords = [
        # Opening Title & Dying Valley (contemplative D minor / Dorian)
        (0.0, 10.5, [73.42, 146.83, 220.00, 349.23], 0.20),   # Dm
        (9.5, 11.5, [58.27, 116.54, 174.61, 293.66], 0.22),   # Bbmaj7
        (20.0, 10.5, [65.41, 130.81, 196.00, 329.63], 0.24),  # C
        (29.5, 12.0, [73.42, 146.83, 220.00, 349.23], 0.26),  # Dm (glaze pour)
        # 1100C Kiln Ignition & Midnight Tension (rising dramatic intensity)
        (40.5, 9.5, [58.27, 116.54, 220.00, 349.23], 0.34),   # Bbmaj7#11 swell
        (49.0, 9.5, [55.00, 110.00, 220.00, 329.63], 0.38),   # Asus4 -> A dramatic hold
        # Kintsugi Dawn Bloom (radiant Picardy D Major sunrise release!)
        (57.5, 11.0, [73.42, 146.83, 220.00, 369.99], 0.36),  # D Major (F#4!)
        (67.5, 9.5, [98.00, 146.83, 246.94, 369.99], 0.30),   # Gmaj7
        (75.8, 8.2, [73.42, 146.83, 220.00, 293.66], 0.22),   # Warm D5 resolution
    ]

    pans = [-0.28, 0.22, -0.35, 0.32]
    weights = [0.42, 0.30, 0.20, 0.14]
    for start_s, dur_s, freqs, intensity in chords:
        s0 = int(start_s * SAMPLE_RATE)
        length = min(int(dur_s * SAMPLE_RATE), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        for v_idx, f in enumerate(freqs):
            voice = bowed_string_note(
                length,
                f,
                amp=intensity * weights[v_idx],
                vibrato_hz=4.2 + v_idx * 0.45,
                warmth=1.0 - v_idx * 0.14,
            )
            pan = pans[v_idx]
            gl = math.sqrt(0.5 * (1.0 - pan))
            gr = math.sqrt(0.5 * (1.0 + pan))
            score[s0:s0 + length, 0] += voice * gl
            score[s0:s0 + length, 1] += voice * gr

    # Solo lyrical cello melody weaving gently between narration phrases
    melody = [
        (1.2, 3.2, 293.66, 0.11),   # D4
        (18.6, 3.8, 349.23, 0.12),  # F4
        (20.6, 2.4, 329.63, 0.11),  # E4
        (39.4, 4.4, 293.66, 0.13),  # D4
        (41.8, 2.8, 329.63, 0.12),  # E4
        (56.8, 4.0, 369.99, 0.15),  # F#4 sunrise lift!
        (59.4, 2.6, 440.00, 0.14),  # A4
        (74.4, 5.2, 587.33, 0.12),  # D5
        (78.2, 5.2, 440.00, 0.10),  # A4
    ]
    for onset_s, dur_s, f, amp in melody:
        s0 = int(onset_s * SAMPLE_RATE)
        length = min(int(dur_s * SAMPLE_RATE), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        note = bowed_string_note(length, f, amp=amp, vibrato_hz=5.1, warmth=0.95)
        score[s0:s0 + length, 0] += note * 0.68
        score[s0:s0 + length, 1] += note * 0.74

    # Resonant ceramic bells & stoneware chimes on visual cuts
    chime_events = [
        (0.6, 293.66, -0.25, 0.16), (3.8, 440.00, 0.25, 0.14),
        (14.0, 349.23, -0.30, 0.14), (22.2, 523.25, 0.30, 0.16),
        (32.0, 587.33, -0.35, 0.16), (37.5, 440.00, 0.35, 0.14),
        (43.2, 293.66, -0.20, 0.20), (52.0, 440.00, 0.25, 0.22),
        (58.5, 369.99, -0.25, 0.22), (60.2, 587.33, 0.25, 0.22),
        (68.2, 739.99, -0.18, 0.18), (74.5, 587.33, 0.18, 0.20),
        (79.0, 440.00, 0.0, 0.16),
    ]
    for onset_s, freq, pan, amp in chime_events:
        s0 = int(onset_s * SAMPLE_RATE)
        length = min(int(4.2 * SAMPLE_RATE), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
        tone = (
            np.sin(2.0 * math.pi * freq * lt)
            + 0.20 * np.exp(-lt * 3.8) * np.sin(2.0 * math.pi * freq * 2.756 * lt)
        ) * np.clip(lt / 0.012, 0.0, 1.0) * np.exp(-lt * 1.15) * amp
        score[s0:s0 + length, 0] += tone * math.sqrt(0.5 * (1.0 - pan))
        score[s0:s0 + length, 1] += tone * math.sqrt(0.5 * (1.0 + pan))

    # Authentic Wood-Fired Kiln Hearth Foley (sub-rumble + rhythmic bellows + stereo cedar crackles)
    white = rng.standard_normal(NUM_SAMPLES).astype(np.float32)
    spec = np.fft.rfft(white)
    freqs_fft = np.fft.rfftfreq(NUM_SAMPLES, 1.0 / SAMPLE_RATE)
    rumble = np.fft.irfft(spec * np.exp(-((freqs_fft / 145.0) ** 2)) * (freqs_fft >= 26.0), n=NUM_SAMPLES).astype(np.float32)
    rumble /= max(1e-5, float(np.max(np.abs(rumble))))

    firing_window = np.clip((t - 41.0) / 3.0, 0.0, 1.0) * np.clip((62.0 - t) / 3.5, 0.0, 1.0)
    bellows_breath = 1.0 + 0.6 * np.maximum(0.0, np.sin(2.0 * math.pi * 0.38 * t)) * firing_window
    fade_arc = np.clip(t / 2.5, 0.0, 1.0) * np.clip((DURATION_SEC - t) / 3.0, 0.0, 1.0)
    foley_gain = (0.035 + 0.11 * firing_window) * bellows_breath * fade_arc

    crackle = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    for pt in rng.uniform(1.0, DURATION_SEC - 2.5, size=380):
        s0 = int(pt * SAMPLE_RATE)
        plen = int(0.013 * SAMPLE_RATE)
        if s0 + plen >= NUM_SAMPLES:
            continue
        lt = np.arange(plen, dtype=np.float32) / float(SAMPLE_RATE)
        f_pop = float(rng.uniform(1700.0, 4400.0))
        pop = np.sin(2.0 * math.pi * f_pop * lt) * np.exp(-lt * 310.0) * float(rng.uniform(0.03, 0.11))
        if 42.0 <= pt <= 60.0:
            pop *= 1.9
        pan = float(rng.uniform(-0.65, 0.65))
        crackle[s0:s0 + plen, 0] += pop * (0.5 * (1.0 - pan))
        crackle[s0:s0 + plen, 1] += pop * (0.5 * (1.0 + pan))

    foley = np.stack([rumble * foley_gain, rumble * foley_gain * 0.95], axis=1) + crackle
    return (apply_stereo_hall_reverb(score, wet=0.35) + foley).astype(np.float32)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("[audio-v2] Mastering 4 real Zyphra/ZONOS3-Mini studio English narrations (ZERO macOS say)...")
    voice_bed, speech_env = load_studio_zonos3_narration()

    print("[audio-v2] Composing 84s stereo chamber cello/strings score & wood-kiln Foley...")
    music_bed = synthesize_chamber_score_and_foley()

    # Smooth sidechain ducking (-5 dB) under Savannah's narration
    duck = 1.0 - 0.46 * speech_env[:, None]
    premix = music_bed * duck + voice_bed

    fade_in = int(0.8 * SAMPLE_RATE)
    fade_out = int(2.2 * SAMPLE_RATE)
    premix[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)[:, None]
    premix[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]

    peak = float(np.max(np.abs(premix)))
    if peak > 0.92:
        premix *= 0.90 / peak

    raw_mix_path = OUT_DIR / "premix_v2_84s.wav"
    final_wav_path = OUT_DIR / "soundtrack_84s.wav"
    write_wav_stereo_i16(raw_mix_path, premix)

    print("[audio-v2] Applying FFmpeg cinema loudness normalization (-14 LUFS)...")
    run_cmd([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(raw_mix_path),
        "-af", "loudnorm=I=-14:TP=-1.2:LRA=8",
        "-ar", str(SAMPLE_RATE),
        "-ac", "2",
        "-c:a", "pcm_s16le",
        str(final_wav_path),
    ])

    vol_proc = run_cmd([
        "ffmpeg", "-i", str(final_wav_path),
        "-af", "volumedetect",
        "-f", "null", "-",
    ])
    for line in vol_proc.stderr.splitlines():
        if "mean_volume" in line or "max_volume" in line:
            print(f"[audio-v2] {line.strip()}")

    print(f"[audio-v2] Ready: {final_wav_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[audio-v2] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
