#!/usr/bin/env python3
"""
V3 Game & Behind-The-Scenes Trailer Audio Mastering Engine (66.0s @ 48kHz).
ZERO macOS `say` usage!
Mixes:
  1. All 3 studio Zyphra/ZONOS3-Mini 44.1kHz English narrations (`Savannah` voice)
     from /Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma_game_bts/
     (act1_game_intro.wav, act2_gameplay.wav, act3_bts_craft.wav).
  2. Original 66s stereo chamber cello, ceramic chimes & warm kiln hearth Foley bed.
  3. Smooth -5 dB sidechain ducking under narration + FFmpeg -14 LUFS loudness mastering.
"""

from __future__ import annotations

import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 48000
DURATION_SEC = 66.0
NUM_SAMPLES = int(SAMPLE_RATE * DURATION_SEC)

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"
VO_DIR = OUT_DIR / "trailer_vo_master"
LOG_DIR = OUT_DIR / "logs"
STUDIO_AUDIO_SRC = Path("/Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma_game_bts")

TRAILER_VO_CUES = [
    (2.6, "act1_game_intro.wav"),
    (19.0, "act2_gameplay.wav"),
    (39.2, "act3_bts_craft.wav"),
]


def run_cmd_logged(cmd: list[str], log_name: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / log_name
    with open(log_path, "w", encoding="utf-8") as log_f:
        proc = subprocess.run(cmd, stdout=log_f, stderr=subprocess.STDOUT)
    if proc.returncode != 0:
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-800:]
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{tail}")


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


def load_trailer_zonos3_narration() -> tuple[np.ndarray, np.ndarray]:
    VO_DIR.mkdir(parents=True, exist_ok=True)
    voice_bed = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    speech_env = np.zeros(NUM_SAMPLES, dtype=np.float32)

    for idx, (start_sec, filename) in enumerate(TRAILER_VO_CUES):
        src = STUDIO_AUDIO_SRC / filename
        if not src.exists():
            raise FileNotFoundError(f"Required studio ZONOS3 WAV missing: {src}")
        mastered = VO_DIR / f"master_{filename}"
        af = (
            "highpass=f=68,"
            "equalizer=f=190:width_type=o:width=1.4:g=1.8,"
            "equalizer=f=3200:width_type=o:width=1.3:g=1.6,"
            "acompressor=threshold=-18dB:ratio=2.2:attack=12:release=140:makeup=2,"
            "aecho=0.88:0.86:22|46:0.10|0.05"
        )
        run_cmd_logged(
            [
                "ffmpeg", "-y", "-loglevel", "warning",
                "-i", str(src),
                "-af", af,
                "-ar", str(SAMPLE_RATE),
                "-ac", "2",
                "-c:a", "pcm_s16le",
                str(mastered),
            ],
            f"vo_master_{idx}.log",
        )

        clip = read_wav_stereo_f32(mastered)
        rms = float(np.sqrt(np.mean(clip ** 2))) + 1e-6
        clip = np.clip(clip * (0.148 / rms), -0.92, 0.92)

        start_idx = int(start_sec * SAMPLE_RATE)
        end_idx = min(NUM_SAMPLES, start_idx + clip.shape[0])
        usable = end_idx - start_idx
        if usable > 0:
            fade_in = min(int(0.03 * SAMPLE_RATE), usable // 4)
            fade_out = min(int(0.08 * SAMPLE_RATE), usable // 4)
            if fade_in > 0:
                clip[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)[:, None]
            if fade_out > 0:
                clip[usable - fade_out:usable] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]
            voice_bed[start_idx:end_idx] += clip[:usable]

            pad = int(0.30 * SAMPLE_RATE)
            speech_env[max(0, start_idx - pad):min(NUM_SAMPLES, end_idx + pad)] = 1.0

    win = int(0.34 * SAMPLE_RATE)
    smooth_env = np.convolve(speech_env, np.ones(win, dtype=np.float32) / float(win), mode="same")
    return voice_bed, np.clip(smooth_env, 0.0, 1.0)


def apply_stereo_reverb(stereo: np.ndarray, wet: float = 0.32) -> np.ndarray:
    taps_l = [(int(0.031 * SAMPLE_RATE), 0.32), (int(0.071 * SAMPLE_RATE), 0.25), (int(0.131 * SAMPLE_RATE), 0.18), (int(0.211 * SAMPLE_RATE), 0.12)]
    taps_r = [(int(0.037 * SAMPLE_RATE), 0.32), (int(0.083 * SAMPLE_RATE), 0.25), (int(0.149 * SAMPLE_RATE), 0.18), (int(0.233 * SAMPLE_RATE), 0.12)]
    wet_l = np.zeros(stereo.shape[0], dtype=np.float32)
    wet_r = np.zeros(stereo.shape[0], dtype=np.float32)
    for d, g in taps_l:
        wet_l[d:] += stereo[:-d, 0] * g + stereo[:-d, 1] * (g * 0.30)
    for d, g in taps_r:
        wet_r[d:] += stereo[:-d, 1] * g + stereo[:-d, 0] * (g * 0.30)
    out = np.empty_like(stereo)
    out[:, 0] = stereo[:, 0] * (1.0 - wet * 0.35) + wet_l * wet
    out[:, 1] = stereo[:, 1] * (1.0 - wet * 0.35) + wet_r * wet
    return out


def bowed_voice(length: int, freq: float, amp: float, vib_hz: float = 4.5, warmth: float = 1.0) -> np.ndarray:
    lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
    dur = length / float(SAMPLE_RATE)
    env = (np.clip(lt / min(0.7, dur * 0.25), 0.0, 1.0) ** 1.3) * (np.clip((dur - lt) / min(1.0, dur * 0.3), 0.0, 1.0) ** 1.35)
    vib = 0.004 * np.clip((lt - 0.3) / 1.0, 0.0, 1.0) * np.sin(2.0 * math.pi * vib_hz * lt)
    phase = np.cumsum(2.0 * math.pi * freq * (1.0 + vib) / SAMPLE_RATE)
    sig = (
        1.00 * np.sin(phase)
        + 0.44 * warmth * np.sin(2.0 * phase + 0.14)
        + 0.22 * warmth * np.sin(3.0 * phase - 0.18)
        + 0.10 * warmth * np.sin(4.0 * phase + 0.3)
    )
    return (sig * env * amp).astype(np.float32)


def synthesize_trailer_score_and_foley() -> np.ndarray:
    rng = np.random.default_rng(20261216)
    t = np.arange(NUM_SAMPLES, dtype=np.float32) / float(SAMPLE_RATE)
    score = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)

    chords = [
        (0.0, 9.5, [73.42, 146.83, 220.00, 349.23], 0.23),    # Dm
        (8.5, 10.5, [58.27, 116.54, 174.61, 293.66], 0.26),   # Bbmaj7
        (18.0, 10.0, [65.41, 130.81, 196.00, 329.63], 0.28),  # C
        (27.0, 11.5, [55.00, 110.00, 220.00, 349.23], 0.34),  # A/Dm firing surge
        (37.5, 11.0, [73.42, 146.83, 220.00, 369.99], 0.33),  # Picardy D Major BTS bloom
        (47.5, 10.5, [98.00, 146.83, 246.94, 369.99], 0.30),  # Gmaj7
        (57.0, 9.0, [73.42, 146.83, 220.00, 293.66], 0.24),   # Warm D5 close
    ]
    pans = [-0.28, 0.22, -0.34, 0.30]
    weights = [0.42, 0.30, 0.20, 0.14]
    for start_s, dur_s, freqs, intensity in chords:
        s0 = int(start_s * SAMPLE_RATE)
        length = min(int(dur_s * SAMPLE_RATE), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        for idx, f in enumerate(freqs):
            v = bowed_voice(length, f, intensity * weights[idx], 4.2 + idx * 0.4, 1.0 - idx * 0.14)
            score[s0:s0 + length, 0] += v * math.sqrt(0.5 * (1.0 - pans[idx]))
            score[s0:s0 + length, 1] += v * math.sqrt(0.5 * (1.0 + pans[idx]))

    # Ceramic bell & marimba pulses marking gameplay beats & BTS transitions
    chimes = [
        (0.5, 293.66, -0.2, 0.18), (2.2, 440.00, 0.2, 0.16),
        (16.8, 349.23, -0.3, 0.16), (18.4, 523.25, 0.3, 0.18),
        (26.5, 587.33, -0.25, 0.18), (32.0, 440.00, 0.25, 0.20),
        (37.2, 369.99, -0.2, 0.22), (38.8, 587.33, 0.2, 0.22),
        (48.0, 659.25, -0.25, 0.18), (57.4, 587.33, 0.15, 0.22),
        (60.6, 440.00, -0.1, 0.18), (62.8, 293.66, 0.0, 0.20),
    ]
    for onset_s, freq, pan, amp in chimes:
        s0 = int(onset_s * SAMPLE_RATE)
        length = min(int(3.6 * SAMPLE_RATE), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
        tone = (np.sin(2.0 * math.pi * freq * lt) + 0.18 * np.exp(-lt * 4.0) * np.sin(2.0 * math.pi * freq * 2.756 * lt))
        tone = tone * np.clip(lt / 0.012, 0.0, 1.0) * np.exp(-lt * 1.2) * amp
        score[s0:s0 + length, 0] += tone * math.sqrt(0.5 * (1.0 - pan))
        score[s0:s0 + length, 1] += tone * math.sqrt(0.5 * (1.0 + pan))

    # Warm wood-kiln hearth Foley
    white = rng.standard_normal(NUM_SAMPLES).astype(np.float32)
    spec = np.fft.rfft(white)
    freqs_fft = np.fft.rfftfreq(NUM_SAMPLES, 1.0 / SAMPLE_RATE)
    rumble = np.fft.irfft(spec * np.exp(-((freqs_fft / 150.0) ** 2)) * (freqs_fft >= 28.0), n=NUM_SAMPLES).astype(np.float32)
    rumble /= max(1e-5, float(np.max(np.abs(rumble))))
    fade_arc = np.clip(t / 2.0, 0.0, 1.0) * np.clip((DURATION_SEC - t) / 2.5, 0.0, 1.0)
    fire_boost = np.clip((t - 20.0) / 3.0, 0.0, 1.0) * np.clip((39.0 - t) / 3.0, 0.0, 1.0)
    foley_gain = (0.04 + 0.09 * fire_boost) * fade_arc

    crackle = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    for pt in rng.uniform(0.8, DURATION_SEC - 2.0, size=290):
        s0 = int(pt * SAMPLE_RATE)
        plen = int(0.013 * SAMPLE_RATE)
        if s0 + plen >= NUM_SAMPLES:
            continue
        lt = np.arange(plen, dtype=np.float32) / float(SAMPLE_RATE)
        pop = np.sin(2.0 * math.pi * float(rng.uniform(1700.0, 4200.0)) * lt) * np.exp(-lt * 300.0) * float(rng.uniform(0.03, 0.10))
        if 20.0 <= pt <= 38.0:
            pop *= 1.8
        pan = float(rng.uniform(-0.6, 0.6))
        crackle[s0:s0 + plen, 0] += pop * (0.5 * (1.0 - pan))
        crackle[s0:s0 + plen, 1] += pop * (0.5 * (1.0 + pan))

    foley = np.stack([rumble * foley_gain, rumble * foley_gain * 0.96], axis=1) + crackle
    return (apply_stereo_reverb(score, wet=0.33) + foley).astype(np.float32)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("[trailer-audio] Mastering 3 real Zyphra/ZONOS3-Mini studio English narrations...")
    voice_bed, speech_env = load_trailer_zonos3_narration()

    print("[trailer-audio] Synthesizing 66s stereo chamber cello & wood-kiln Foley...")
    music_bed = synthesize_trailer_score_and_foley()

    premix = music_bed * (1.0 - 0.45 * speech_env[:, None]) + voice_bed
    fade_in = int(0.7 * SAMPLE_RATE)
    fade_out = int(2.0 * SAMPLE_RATE)
    premix[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)[:, None]
    premix[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]

    peak = float(np.max(np.abs(premix)))
    if peak > 0.92:
        premix *= 0.90 / peak

    raw_wav = OUT_DIR / "trailer_premix_66s.wav"
    final_wav = OUT_DIR / "trailer_soundtrack_66s.wav"
    write_wav_stereo_i16(raw_wav, premix)

    print("[trailer-audio] Applying FFmpeg -14 LUFS loudness mastering...")
    run_cmd_logged(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(raw_wav),
            "-af", "loudnorm=I=-14:TP=-1.2:LRA=8",
            "-ar", str(SAMPLE_RATE),
            "-ac", "2",
            "-c:a", "pcm_s16le",
            str(final_wav),
        ],
        "trailer_loudnorm.log",
    )

    run_cmd_logged(
        [
            "ffmpeg", "-i", str(final_wav),
            "-af", "volumedetect",
            "-f", "null", "-",
        ],
        "trailer_volumedetect.log",
    )
    vol_text = (LOG_DIR / "trailer_volumedetect.log").read_text(encoding="utf-8", errors="replace")
    for line in vol_text.splitlines():
        if "mean_volume" in line or "max_volume" in line:
            print(f"[trailer-audio] {line.strip()}")

    print(f"[trailer-audio] Ready: {final_wav}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[trailer-audio] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
