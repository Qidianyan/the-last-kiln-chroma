#!/usr/bin/env python3
"""
V5-iter2 Cinema Master Renderer for 《The Last Kiln of Ember Valley》 (Chroma Awards Season 2).

Edits all 8 real Colab AI Image-to-Video (Lightricks/LTX-Video-0.9.5) living oil-painting shots
from /Volumes/Extra/datasets/s4_chroma_i2v_clips/shot_01..08.mp4 into a 2.39:1 widescreen 1080p
24fps cinema short film (85.0s) with 5-track cinema sound engineering (-14.0 LUFS):

  Track 1: 4 real Zyphra/ZONOS3-Mini (`Savannah`) studio English narrations (ZERO macOS say).
  Track 2: 4-voice stereo bowed-cello & viola original film score (D Dorian -> Picardy D Major
           sunrise bloom) with smooth speech-triggered sidechain ducking (-5.5 dB).
  Track 3: Shot-aligned procedural ceramic & wood-kiln Foley (arid valley wind, pine embers &
           leather bellows, mineral mortar clinks, viscous molten glaze pour, 1100C kiln fire,
           precision-timed Shot 6 stoneware fracture snap + molten 24k gold shimmer, dawn chimes).
  Track 4: 1300C vitrification sub-bass cinema drone bed (38Hz-115Hz).
  Track 5: Warm bone-parchment Georgia serif English subtitles strictly inside the bottom 138px
           cinema letterbox safe zone + synchronized .srt sidecar.

All FFmpeg stderr logs are redirected to disk (`out/v5_ffmpeg.log`) — never stderr=PIPE.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
import time
import wave
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SAMPLE_RATE = 48000
FPS = 24
OUT_W = 1920
OUT_H = 1080
BAR_H = 138
ACTIVE_H = OUT_H - 2 * BAR_H  # 804px -> 1920/804 = 2.388 (~2.39:1 CinemaScope)
XFADE_SEC = 0.9

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent.parent
OUT_DIR = ROOT / "out" / "v5_cinema"
QA_DIR = OUT_DIR / "qa_frames"
LOG_PATH = OUT_DIR / "v5_ffmpeg.log"

I2V_CLIPS_DIR = Path("/Volumes/Extra/datasets/s4_chroma_i2v_clips")
STUDIO_VO_DIR = Path("/Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma")

FINAL_MP4 = PROJECT_ROOT / "materials" / "The_Last_Kiln_ShortFilm_1080p.mp4"
FINAL_SRT = PROJECT_ROOT / "materials" / "The_Last_Kiln_ShortFilm_1080p.srt"
ASS_PATH = OUT_DIR / "subtitles_v5.ass"

GEORGIA_REGULAR = "/System/Library/Fonts/Supplemental/Georgia.ttf"
GEORGIA_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
GEORGIA_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf"

# 10-segment timeline: sum(durations) = 93.1s, minus 9 * 0.9s xfade = 85.0s exact cinema runtime
SEGMENTS: list[dict[str, Any]] = [
    {"id": "seg00_title", "kind": "title", "duration": 4.6},
    {"id": "seg01_shot01", "kind": "i2v", "clip": "shot_01.mp4", "duration": 10.8, "label": "Shot 1: Ember Valley Dusk"},
    {"id": "seg02_shot02", "kind": "i2v", "clip": "shot_02.mp4", "duration": 9.8, "label": "Shot 2: Apprentice Hearth"},
    {"id": "seg03_shot03", "kind": "i2v", "clip": "shot_03.mp4", "duration": 10.4, "label": "Shot 3: Mineral Glaze Table"},
    {"id": "seg04_shot04", "kind": "i2v", "clip": "shot_04.mp4", "duration": 11.4, "label": "Shot 4: Molten Glaze Pour"},
    {"id": "seg05_shot05", "kind": "i2v", "clip": "shot_05.mp4", "duration": 10.4, "label": "Shot 5: 1100C Roaring Kiln"},
    {"id": "seg06_shot06", "kind": "i2v", "clip": "shot_06.mp4", "duration": 9.8, "label": "Shot 6: Midnight Fracture & Gold"},
    {"id": "seg07_shot07", "kind": "i2v", "clip": "shot_07.mp4", "duration": 11.0, "label": "Shot 7: Kintsugi Dawn Hero"},
    {"id": "seg08_shot08", "kind": "i2v", "clip": "shot_08.mp4", "duration": 8.8, "label": "Shot 8: Olive Shoots in Ash"},
    {"id": "seg09_credits", "kind": "credits", "duration": 6.1},
]

DURATION_SEC = round(sum(s["duration"] for s in SEGMENTS) - (len(SEGMENTS) - 1) * XFADE_SEC, 3)
NUM_SAMPLES = int(round(SAMPLE_RATE * DURATION_SEC))

# Exact timeline start of each of the 4 real ZONOS3-Mini studio narrations
STUDIO_VO_CUES: list[tuple[float, str]] = [
    (4.2, "shot1_valley.wav"),         # 4.20s -> 18.40s (Shots 1-2)
    (23.0, "shot2_glazes.wav"),        # 23.00s -> 39.33s (Shots 3-4)
    (43.6, "shot3_firing.wav"),        # 43.60s -> 55.73s (Shots 5-6; ends 0.47s before 56.2s crack snap!)
    (61.4, "shot4_kintsugi_dawn.wav"), # 61.40s -> 74.20s (Shots 7-8)
]

# Subtitle cues synchronized verbatim to the 4 ZONOS3-Mini narrations
SUBTITLE_CUES: list[tuple[float, float, str, str]] = [
    (4.2, 9.8, "After the river dried and the great smelters fell silent,",
     "the people of Ember Valley learned a quieter craft."),
    (10.0, 18.4, "Paper turns to ash in a season, so they glazed everything",
     "worth remembering onto wet clay, and trusted the fire to keep it."),
    (23.0, 28.9, "Tonight, only one tunnel kiln still breathes.",
     "Wood ash for the vanished forest, river ochre for the monsoon floods,"),
    (29.1, 39.3, "cinnabar for the courage of those who stayed, and the last leaf",
     "of hammered gold, folded in Master Orin's wooden box."),
    (43.6, 49.8, "Eleven hundred degrees. At the threshold of vitrification,",
     "a vessel either fractures into dust or sings forever."),
    (50.0, 55.8, "I feed the last cedar embers into the throat of the hearth",
     "and hold my breath."),
    (61.4, 67.4, "When dawn breaks over the ash terraces,",
     "golden veins seal every scar across the clay."),
    (67.6, 74.4, "Nothing we truly loved was lost to the fire.",
     "It was only transformed into something that could outlive the dark."),
]

# Key moments for post-render visual inspection (covers title, all 8 I2V shots, subtitles, credits)
QA_SAMPLE_TIMESTAMPS: list[tuple[str, float]] = [
    ("00_title_card", 2.0),
    ("01_shot01_valley_sub", 7.2),
    ("02_shot02_hearth_sub", 16.5),
    ("03_shot03_glaze_table", 26.5),
    ("04_shot04_molten_pour_sub", 35.5),
    ("05_shot05_kiln_fire_sub", 47.0),
    ("06_shot06_fracture_gold", 56.8),
    ("07_shot07_kintsugi_dawn_sub", 65.0),
    ("08_shot08_olive_shoots", 75.5),
    ("09_end_credits", 82.0),
]


def run_ffmpeg(cmd: list[str], step_label: str) -> None:
    """Run FFmpeg with stderr appended to a log file (never stderr=PIPE)."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== [{step_label}] {' '.join(cmd)} ===\n")
        logf.flush()
        proc = subprocess.run(cmd, stdout=logf, stderr=logf, stdin=subprocess.DEVNULL)
    if proc.returncode != 0:
        tail = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()[-30:]
        raise RuntimeError(
            f"FFmpeg failed ({proc.returncode}) at {step_label}.\nLast log lines:\n" + "\n".join(tail)
        )


def format_srt_ts(sec: float) -> str:
    ms_total = int(round(sec * 1000))
    hrs, rem = divmod(ms_total, 3600000)
    mins, rem = divmod(rem, 60000)
    secs, ms = divmod(rem, 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def format_ass_ts(sec: float) -> str:
    cs_total = int(round(sec * 100))
    hrs, rem = divmod(cs_total, 360000)
    mins, rem = divmod(rem, 6000)
    secs, cs = divmod(rem, 100)
    return f"{hrs:d}:{mins:02d}:{secs:02d}.{cs:02d}"


def write_subtitles() -> None:
    """Write synchronized .srt deliverable and libass .ass script strictly inside bottom 138px bar."""
    srt_lines: list[str] = []
    for idx, (t0, t1, l1, l2) in enumerate(SUBTITLE_CUES, start=1):
        srt_lines.append(f"{idx}\n{format_srt_ts(t0)} --> {format_srt_ts(t1)}\n{l1}\n{l2}\n")
    FINAL_SRT.parent.mkdir(parents=True, exist_ok=True)
    FINAL_SRT.write_text("\n".join(srt_lines).strip() + "\n", encoding="utf-8")

    # Warm bone-parchment #F2E8DA in ASS &H00BBGGRR -> &H00DAE8F2
    # MarginV=34 centers two 34px lines inside the 138px bottom black bar (y=942..1080), zero overlap!
    ass_header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KilnSub,Georgia,33,&H00DAE8F2,&H00DAE8F2,&H00080605,&H00080605,0,0,0,0,100,100,0.6,0,1,1.4,0,2,140,140,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev_lines = [
        f"Dialogue: 0,{format_ass_ts(t0)},{format_ass_ts(t1)},KilnSub,,0,0,0,,{{\\fad(220,220)}}{l1}\\N{l2}"
        for t0, t1, l1, l2 in SUBTITLE_CUES
    ]
    ASS_PATH.write_text(ass_header + "\n".join(ev_lines) + "\n", encoding="utf-8")


def render_card_png(kind: str, out_png: Path) -> None:
    """Render crisp copper-gold Georgia serif title or end-credits card strictly within 2.39:1 frame."""
    img = Image.new("RGB", (OUT_W, OUT_H), (8, 6, 5))
    # Subtle warm hearth glow strictly inside the 2.39:1 active window (y=138..942)
    glow = Image.new("RGB", (OUT_W, OUT_H), (13, 10, 8))
    gdraw = ImageDraw.Draw(glow)
    cx, cy = OUT_W // 2, OUT_H // 2
    for r, col in [
        (560, (24, 15, 11)),
        (380, (36, 21, 13)),
        (220, (48, 27, 15)),
    ]:
        gdraw.ellipse([cx - r, cy - int(r * 0.52), cx + r, cy + int(r * 0.52)], fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=95))

    # Composite active 2.39:1 area while keeping exact 138px top & bottom letterbox bars pure #080605
    active_crop = glow.crop((0, BAR_H, OUT_W, OUT_H - BAR_H))
    img.paste(active_crop, (0, BAR_H))

    # Subtle 1px warm bronze inner cinema rule inside letterbox edges
    draw = ImageDraw.Draw(img)
    draw.line([(160, BAR_H + 1), (OUT_W - 160, BAR_H + 1)], fill=(64, 46, 28), width=1)
    draw.line([(160, OUT_H - BAR_H - 2), (OUT_W - 160, OUT_H - BAR_H - 2)], fill=(64, 46, 28), width=1)

    font_eyebrow = ImageFont.truetype(GEORGIA_REGULAR, 22)
    font_title_lg = ImageFont.truetype(GEORGIA_BOLD, 88)
    font_title_md = ImageFont.truetype(GEORGIA_REGULAR, 46)
    font_italic = ImageFont.truetype(GEORGIA_ITALIC, 30)
    font_credit_hd = ImageFont.truetype(GEORGIA_REGULAR, 22)
    font_credit_val = ImageFont.truetype(GEORGIA_REGULAR, 28)

    def center_text(y: int, text: str, font: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> None:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((OUT_W - tw) // 2, y), text, font=font, fill=fill)

    if kind == "title":
        center_text(320, "EMBER VALLEY CERAMIC ARCHIVE  ·  ORIGINAL ANIMATED SHORT", font_eyebrow, (219, 161, 60))
        center_text(388, "THE LAST KILN", font_title_lg, (251, 247, 240))
        center_text(496, "OF EMBER VALLEY", font_title_md, (242, 232, 218))
        draw.line([(cx - 170, 582), (cx + 170, 582)], fill=(219, 161, 60), width=2)
        center_text(612, "What breaks in the fire is not lost. It is where the gold enters.", font_italic, (214, 185, 134))
        center_text(712, "THE CHROMA AWARDS SEASON 2  ·  2026", font_eyebrow, (166, 146, 122))
    else:
        center_text(248, "THE LAST KILN OF EMBER VALLEY", font_title_md, (251, 247, 240))
        draw.line([(cx - 150, 322), (cx + 150, 322)], fill=(219, 161, 60), width=2)
        rows = [
            ("ORIGINAL STORY, DIRECTION & INTERACTIVE GAME", "Ember Valley Studio  ·  Elidot Creative Lab"),
            ("LIVING OIL CINEMA (AI IMAGE-TO-VIDEO)", "Lightricks LTX-Video-0.9.5 on 4K Impasto Concept Plates"),
            ("STUDIO ENGLISH NARRATION", "Zyphra ZONOS3-Mini (Savannah)  ·  48kHz Cinema Master"),
            ("ORIGINAL CHAMBER SCORE & KILN FOLEY", "4-Voice Bowed Cello/Viola & Procedural Ceramic Soundscape"),
        ]
        y = 368
        for role, val in rows:
            center_text(y, role, font_credit_hd, (219, 161, 60))
            center_text(y + 30, val, font_credit_val, (242, 232, 218))
            y += 96
        center_text(786, "PLAY THE COMPANION INTERACTIVE NARRATIVE GAME  ·  CHROMA AWARDS SEASON 2", font_eyebrow, (186, 163, 136))

    img.save(out_png)


def build_video_segment(seg: dict[str, Any], out_mp4: Path) -> None:
    """Prepare one 1920x1080 @ 24fps 2.39:1 widescreen video segment from either title/credits or real AI I2V clip."""
    dur = float(seg["duration"])
    sid = str(seg["id"])

    if seg["kind"] in ("title", "credits"):
        card_png = OUT_DIR / f"{sid}.png"
        render_card_png(str(seg["kind"]), card_png)
        fade_in_str = "fade=t=in:st=0:d=0.9:color=#080605," if seg["kind"] == "title" else ""
        fade_out_str = f",fade=t=out:st={max(0.1, dur - 1.4):.2f}:d=1.4:color=#080605" if seg["kind"] == "credits" else ""
        vf = (
            f"format=yuv420p,"
            f"{fade_in_str}"
            f"noise=alls=3:allf=t+u"
            f"{fade_out_str}"
        )
        run_ffmpeg(
            [
                "ffmpeg", "-y", "-loglevel", "warning",
                "-loop", "1", "-framerate", str(FPS),
                "-i", str(card_png),
                "-t", f"{dur:.3f}",
                "-vf", vf,
                "-c:v", "libx264", "-crf", "16", "-preset", "fast",
                "-pix_fmt", "yuv420p", "-r", str(FPS),
                str(out_mp4),
            ],
            f"card:{sid}",
        )
        return

    src_clip = I2V_CLIPS_DIR / str(seg["clip"])
    if not src_clip.exists():
        raise FileNotFoundError(f"Missing V4 I2V clip: {src_clip}")

    # Dynamically derive gentle cinema slow-motion factor from the real clip duration so
    # forward + feathered reverse ALWAYS exceeds the exact target segment duration cleanly!
    src_dur = float(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src_clip)],
            text=True,
        ).strip()
    )
    # Use 0.52x..0.62x cinema slow-motion so living oil motion breathes organically without stutter
    xf_seg = 0.80
    slow_speed = min(0.62, max(0.45, (src_dur * 2.0 - 0.35) / (dur + xf_seg + 0.55)))
    fwd_dur = round((src_dur - 0.06) / slow_speed, 3)
    rev_full = round((src_dur - 0.12) / slow_speed, 3)
    rev_dur = round(min(rev_full, max(4.2, dur - fwd_dur + xf_seg + 0.35)), 3)
    xf_offset = round(fwd_dur - xf_seg, 3)

    fc = (
        f"[0:v]setpts=PTS/{slow_speed:.4f},minterpolate=fps={FPS}:mi_mode=blend,trim=0:{fwd_dur:.3f},setpts=PTS-STARTPTS[fwd];"
        f"[0:v]reverse,setpts=PTS/{slow_speed:.4f},minterpolate=fps={FPS}:mi_mode=blend,trim=0.08:{0.08 + rev_dur:.3f},setpts=PTS-STARTPTS[rev];"
        f"[fwd][rev]xfade=transition=fade:duration={xf_seg:.2f}:offset={xf_offset:.3f},"
        f"trim=0:{dur:.3f},setpts=PTS-STARTPTS,"
        f"scale={OUT_W}:{ACTIVE_H}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={OUT_W}:{ACTIVE_H},"
        f"unsharp=5:5:0.55:3:3:0.20,"
        f"eq=contrast=1.04:saturation=1.06:gamma=0.98,"
        f"vignette=angle=PI/5.2,"
        f"noise=alls=4:allf=t+u,"
        f"pad={OUT_W}:{OUT_H}:0:{BAR_H}:#080605,"
        f"fps={FPS},format=yuv420p[vout]"
    )

    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(src_clip),
            "-filter_complex", fc,
            "-map", "[vout]",
            "-t", f"{dur:.3f}",
            "-c:v", "libx264", "-crf", "16", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            str(out_mp4),
        ],
        f"i2v:{sid}",
    )


def probe_duration_sec(path: Path) -> float:
    return float(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            text=True,
        ).strip()
    )


def assemble_video_master(seg_files: list[Path], silent_master: Path) -> float:
    """Join all 10 widescreen segments with warm cinema dissolves using actual probed frame durations."""
    cmd = ["ffmpeg", "-y", "-loglevel", "warning"]
    actual_durs: list[float] = []
    for p in seg_files:
        cmd.extend(["-i", str(p)])
        actual_durs.append(probe_duration_sec(p))

    # Chain xfade transitions using exact probed frame-aligned durations so EOF never truncates
    filters: list[str] = []
    running_dur = actual_durs[0]
    prev_label = "[0:v]"
    for idx in range(1, len(seg_files)):
        offset = round(max(0.1, running_dur - XFADE_SEC), 3)
        trans = "fadeblack" if idx in (1, len(seg_files) - 1) else "fade"
        out_label = f"[v{idx}]"
        filters.append(
            f"{prev_label}[{idx}:v]xfade=transition={trans}:duration={XFADE_SEC:.2f}:offset={offset:.3f}{out_label}"
        )
        running_dur = offset + actual_durs[idx]
        prev_label = out_label

    # Burn warm bone-parchment Georgia serif subtitles strictly inside bottom 138px bar
    escaped_ass = str(ASS_PATH).replace("\\", "/").replace(":", "\\:")
    filters.append(f"{prev_label}ass='{escaped_ass}',format=yuv420p[vfinal]")

    cmd.extend([
        "-filter_complex", ";".join(filters),
        "-map", "[vfinal]",
        "-c:v", "libx264", "-crf", "17", "-preset", "medium",
        "-pix_fmt", "yuv420p", "-r", str(FPS),
        str(silent_master),
    ])
    run_ffmpeg(cmd, "assemble_video_master")
    final_dur = probe_duration_sec(silent_master)
    if abs(final_dur - DURATION_SEC) > 1.0:
        raise RuntimeError(f"Assembled video duration mismatch: got {final_dur:.2f}s, expected ~{DURATION_SEC:.2f}s")
    return final_dur


# ---------------------------------------------------------------------------
# 5-Track Cinema Sound Engineering (48kHz Stereo, -14.0 LUFS, ZERO macOS say)
# ---------------------------------------------------------------------------

def read_wav_stereo_f32(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())
    if sw != 2:
        raise ValueError(f"Expected 16-bit PCM WAV, got {sw * 8}-bit: {path}")
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch == 1:
        return np.stack([data, data], axis=1)
    return data.reshape(-1, ch)[:, :2]


def write_wav_stereo_i16(path: Path, stereo: np.ndarray) -> None:
    clipped = np.clip(stereo, -0.98, 0.98)
    pcm = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def apply_stereo_hall_reverb(stereo: np.ndarray, wet: float = 0.34) -> np.ndarray:
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


def bandpass_fft(sig: np.ndarray, f_lo: float, f_hi: float) -> np.ndarray:
    spec = np.fft.rfft(sig)
    freqs = np.fft.rfftfreq(len(sig), 1.0 / SAMPLE_RATE)
    lo_mask = np.clip((freqs - f_lo * 0.8) / max(1.0, f_lo * 0.4), 0.0, 1.0)
    hi_mask = np.exp(-((np.maximum(0.0, freqs - f_hi)) / max(20.0, f_hi * 0.35)) ** 2)
    out = np.fft.irfft(spec * lo_mask * hi_mask, n=len(sig)).astype(np.float32)
    peak = float(np.max(np.abs(out)))
    return out / max(1e-5, peak)


def track1_studio_zonos3_narration() -> tuple[np.ndarray, np.ndarray]:
    """Track 1: All 4 real Zyphra/ZONOS3-Mini studio 44.1kHz English narrations + ducking envelope."""
    vo_out = OUT_DIR / "vo_master"
    vo_out.mkdir(parents=True, exist_ok=True)
    voice_bed = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    speech_env = np.zeros(NUM_SAMPLES, dtype=np.float32)

    for start_sec, filename in STUDIO_VO_CUES:
        src = STUDIO_VO_DIR / filename
        if not src.exists():
            raise FileNotFoundError(f"Required studio ZONOS3 WAV missing: {src}")
        mastered = vo_out / f"master_{filename}"
        af = (
            "highpass=f=68,"
            "equalizer=f=190:width_type=o:width=1.4:g=1.8,"
            "equalizer=f=3200:width_type=o:width=1.3:g=1.6,"
            "acompressor=threshold=-18dB:ratio=2.2:attack=12:release=140:makeup=2,"
            "aecho=0.88:0.86:24|48:0.10|0.04"
        )
        run_ffmpeg(
            [
                "ffmpeg", "-y", "-loglevel", "warning",
                "-i", str(src),
                "-af", af,
                "-ar", str(SAMPLE_RATE), "-ac", "2", "-c:a", "pcm_s16le",
                str(mastered),
            ],
            f"vo:{filename}",
        )
        clip = read_wav_stereo_f32(mastered)
        rms = float(np.sqrt(np.mean(clip ** 2))) + 1e-6
        clip = np.clip(clip * (0.15 / rms), -0.92, 0.92)

        s0 = int(round(start_sec * SAMPLE_RATE))
        s1 = min(NUM_SAMPLES, s0 + clip.shape[0])
        usable = s1 - s0
        if usable > 0:
            fade_n = min(int(0.03 * SAMPLE_RATE), usable // 4)
            if fade_n > 0:
                ramp = np.linspace(0.0, 1.0, fade_n, dtype=np.float32)[:, None]
                clip[:fade_n] *= ramp
                clip[usable - fade_n:usable] *= ramp[::-1]
            voice_bed[s0:s1] += clip[:usable]
            pad = int(0.32 * SAMPLE_RATE)
            speech_env[max(0, s0 - pad):min(NUM_SAMPLES, s1 + pad)] = 1.0

    win = int(0.36 * SAMPLE_RATE)
    smooth_env = np.convolve(speech_env, np.ones(win, dtype=np.float32) / float(win), mode="same")
    return voice_bed, np.clip(smooth_env, 0.0, 1.0)


def bowed_string_note(length: int, freq: float, amp: float, vibrato_hz: float = 4.6, warmth: float = 1.0) -> np.ndarray:
    lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
    dur = length / float(SAMPLE_RATE)
    attack = np.clip(lt / min(0.85, dur * 0.25), 0.0, 1.0) ** 1.3
    release = np.clip((dur - lt) / min(1.2, dur * 0.3), 0.0, 1.0) ** 1.4
    env = attack * release
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


def track2_chamber_cello_score() -> np.ndarray:
    """Track 2: 4-voice bowed cello & viola film score with breathless pre-crack pause and D Major sunrise bloom."""
    score = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)

    chords = [
        (0.0, 10.6, [73.42, 146.83, 220.00, 349.23], 0.20),   # Dm (Title + Shot 1)
        (9.6, 12.2, [58.27, 116.54, 174.61, 293.66], 0.22),   # Bbmaj7 (Shot 2)
        (21.0, 11.4, [65.41, 130.81, 196.00, 329.63], 0.24),  # C (Shot 3)
        (31.5, 11.8, [73.42, 146.83, 220.00, 349.23], 0.26),  # Dm (Shot 4 glaze pour)
        (42.2, 10.2, [58.27, 116.54, 220.00, 349.23], 0.33),  # Bbmaj7#11 (Shot 5 roaring kiln)
        (51.4, 4.4, [55.00, 110.00, 220.00, 329.63], 0.35),   # Asus4 tension swell -> breath hold at 55.8s!
        # Brief breathless tension gap 55.8s..56.3s so the 56.2s ceramic fracture snap cuts crystal clear!
        (56.4, 5.2, [73.42, 146.83, 220.00, 329.63], 0.30),   # Dsus2 golden awakening
        (60.6, 11.4, [73.42, 146.83, 220.00, 369.99], 0.37),  # Picardy D Major sunrise bloom (Shot 7!)
        (70.8, 8.6, [98.00, 146.83, 246.94, 369.99], 0.29),   # Gmaj7 (Shot 8 olive shoots)
        (78.2, 6.8, [73.42, 146.83, 220.00, 293.66], 0.20),   # Warm D5 end credits resolution
    ]

    pans = [-0.28, 0.22, -0.35, 0.32]
    weights = [0.42, 0.30, 0.20, 0.14]
    for start_s, dur_s, freqs, intensity in chords:
        s0 = int(round(start_s * SAMPLE_RATE))
        length = min(int(round(dur_s * SAMPLE_RATE)), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        for v_idx, f in enumerate(freqs):
            voice = bowed_string_note(
                length, f, amp=intensity * weights[v_idx],
                vibrato_hz=4.2 + v_idx * 0.45, warmth=1.0 - v_idx * 0.14,
            )
            pan = pans[v_idx]
            score[s0:s0 + length, 0] += voice * math.sqrt(0.5 * (1.0 - pan))
            score[s0:s0 + length, 1] += voice * math.sqrt(0.5 * (1.0 + pan))

    # Expressive solo cello lines breathing between narrations
    melody = [
        (1.0, 3.2, 293.66, 0.11),   # D4
        (18.8, 3.6, 349.23, 0.12),  # F4
        (20.9, 2.2, 329.63, 0.11),  # E4
        (39.8, 3.6, 293.66, 0.13),  # D4
        (57.2, 3.8, 369.99, 0.15),  # F#4 molten gold lift
        (60.0, 2.8, 440.00, 0.14),  # A4
        (74.6, 5.2, 587.33, 0.13),  # D5 sunrise coda
        (79.0, 5.4, 440.00, 0.10),  # A4
    ]
    for onset_s, dur_s, f, amp in melody:
        s0 = int(round(onset_s * SAMPLE_RATE))
        length = min(int(round(dur_s * SAMPLE_RATE)), NUM_SAMPLES - s0)
        if length <= 0:
            continue
        note = bowed_string_note(length, f, amp=amp, vibrato_hz=5.1, warmth=0.95)
        score[s0:s0 + length, 0] += note * 0.68
        score[s0:s0 + length, 1] += note * 0.74

    return apply_stereo_hall_reverb(score, wet=0.35).astype(np.float32)


def add_stereo_event(buf: np.ndarray, start_s: float, mono: np.ndarray, pan: float = 0.0) -> None:
    s0 = int(round(start_s * SAMPLE_RATE))
    if s0 >= buf.shape[0]:
        return
    usable = min(len(mono), buf.shape[0] - s0)
    if usable <= 0:
        return
    gl = math.sqrt(0.5 * (1.0 - pan))
    gr = math.sqrt(0.5 * (1.0 + pan))
    buf[s0:s0 + usable, 0] += mono[:usable] * gl
    buf[s0:s0 + usable, 1] += mono[:usable] * gr


def track3_shot_aligned_kiln_foley() -> np.ndarray:
    """
    Track 3: Precision shot-aligned procedural ceramic & wood-kiln Foley:
      - Shot 1: Distant dry Ember Valley dusk wind
      - Shot 2 & 5: Pine-wood kiln crackles & leather bellows exhalations
      - Shot 3: Ceramic mortar & mineral pestle taps
      - Shot 4: Viscous molten glaze liquid pour & slow glossy drips
      - Shot 6: Hero 56.2s stoneware thermal fracture snap + liquid 24k gold iridescent shimmer
      - Shot 7 & 8: Cool dawn valley breeze & hand-struck stoneware wind chimes
    """
    rng = np.random.default_rng(20261215)
    foley = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    t = np.arange(NUM_SAMPLES, dtype=np.float32) / float(SAMPLE_RATE)

    # A. Shot 1 (3.7-14.5s) & Shot 7-8 (61.0-79.8s) valley breeze
    raw_wind = rng.standard_normal(NUM_SAMPLES).astype(np.float32)
    wind_band = bandpass_fft(raw_wind, 220.0, 640.0)
    dusk_win = np.clip((t - 3.5) / 2.2, 0.0, 1.0) * np.clip((15.2 - t) / 2.5, 0.0, 1.0)
    dawn_win = np.clip((t - 60.8) / 2.4, 0.0, 1.0) * np.clip((80.2 - t) / 2.8, 0.0, 1.0)
    breeze_mod = 0.65 + 0.35 * np.sin(2.0 * math.pi * 0.19 * t)
    wind_sig = wind_band * (dusk_win * 0.028 + dawn_win * 0.024) * breeze_mod
    foley[:, 0] += wind_sig * 0.72
    foley[:, 1] += np.roll(wind_sig, int(0.018 * SAMPLE_RATE)) * 0.68

    # B. Shot 2 (13.6-23.4s) & Shot 5-6 (42.5-59.5s) leather bellows whooshes
    bellows_times = [15.4, 19.8, 43.4, 46.8, 50.1, 53.2]
    for idx, bt in enumerate(bellows_times):
        dur = 1.35
        n = int(dur * SAMPLE_RATE)
        lt = np.arange(n, dtype=np.float32) / float(SAMPLE_RATE)
        whoosh_raw = bandpass_fft(rng.standard_normal(n).astype(np.float32), 140.0, 520.0)
        env = np.sin(math.pi * np.clip(lt / dur, 0.0, 1.0)) ** 1.6
        # Subtle wooden bellows intake thump
        thump = np.sin(2.0 * math.pi * 68.0 * lt) * np.exp(-lt * 14.0) * 0.35
        strength = 0.095 if bt >= 42.0 else 0.055
        add_stereo_event(foley, bt, (whoosh_raw * 0.85 + thump) * env * strength, pan=-0.18 if idx % 2 == 0 else 0.18)

    # C. Pine-wood ember crackles (gentle in Shot 2, roaring storm in Shot 5-6)
    crackle_specs = [
        (13.8, 23.0, 90, 0.055),
        (42.5, 59.0, 260, 0.115),
    ]
    for t_start, t_end, count, max_amp in crackle_specs:
        for pt in rng.uniform(t_start, t_end, size=count):
            plen = int(rng.uniform(0.008, 0.019) * SAMPLE_RATE)
            lt = np.arange(plen, dtype=np.float32) / float(SAMPLE_RATE)
            f_pop = float(rng.uniform(1650.0, 4900.0))
            pop = (
                np.sin(2.0 * math.pi * f_pop * lt) * 0.7
                + rng.standard_normal(plen).astype(np.float32) * 0.3
            ) * np.exp(-lt * float(rng.uniform(240.0, 420.0))) * float(rng.uniform(0.35, 1.0)) * max_amp
            add_stereo_event(foley, float(pt), pop, pan=float(rng.uniform(-0.7, 0.7)))

    # D. Shot 3 (22.5-32.9s) stone mortar & ceramic pestle gentle clinks
    for mt, freq, pan in [(24.6, 1180.0, -0.32), (27.4, 980.0, 0.24), (30.5, 1340.0, -0.15)]:
        n = int(0.28 * SAMPLE_RATE)
        lt = np.arange(n, dtype=np.float32) / float(SAMPLE_RATE)
        tap = (
            np.sin(2.0 * math.pi * freq * lt) * np.exp(-lt * 26.0)
            + 0.45 * np.sin(2.0 * math.pi * freq * 2.18 * lt) * np.exp(-lt * 42.0)
        ) * 0.052
        add_stereo_event(foley, mt, tap, pan=pan)

    # E. Shot 4 (32.2-42.2s) viscous molten glaze liquid pour + warm ceramic drips
    pour_len = int(9.6 * SAMPLE_RATE)
    lt_p = np.arange(pour_len, dtype=np.float32) / float(SAMPLE_RATE)
    glaze_stream = bandpass_fft(rng.standard_normal(pour_len).astype(np.float32), 420.0, 1450.0)
    pour_env = np.clip(lt_p / 1.4, 0.0, 1.0) * np.clip((9.6 - lt_p) / 1.8, 0.0, 1.0)
    lfo_visc = 0.72 + 0.28 * np.sin(2.0 * math.pi * 1.45 * lt_p + 0.6 * np.sin(2.0 * math.pi * 0.35 * lt_p))
    add_stereo_event(foley, 32.4, glaze_stream * pour_env * lfo_visc * 0.048, pan=0.08)
    for dt_s in rng.uniform(33.0, 41.4, size=24):
        dlen = int(0.065 * SAMPLE_RATE)
        lt_d = np.arange(dlen, dtype=np.float32) / float(SAMPLE_RATE)
        f0 = float(rng.uniform(460.0, 740.0))
        # Characteristic upward liquid-droplet pitch chirp
        chirp_phase = 2.0 * math.pi * (f0 * lt_d + 1600.0 * (lt_d ** 2))
        drop = np.sin(chirp_phase) * np.clip(lt_d / 0.005, 0.0, 1.0) * np.exp(-lt_d * 52.0) * 0.042
        add_stereo_event(foley, float(dt_s), drop, pan=float(rng.uniform(-0.35, 0.35)))

    # F. Shot 6 HERO BEAT (56.2s): Crisp Thermal Ceramic Fracture Snap + Liquid 24k Gold Shimmer!
    crack_t = 56.20
    # 1. Sharp stoneware thermal fissure snap (crisp multi-mode brittle ceramic transient)
    snap_len = int(0.55 * SAMPLE_RATE)
    lt_s = np.arange(snap_len, dtype=np.float32) / float(SAMPLE_RATE)
    snap_noise = bandpass_fft(rng.standard_normal(snap_len).astype(np.float32), 1800.0, 7800.0)
    ceramic_snap = (
        snap_noise * np.exp(-lt_s * 58.0) * 0.48
        + np.sin(2.0 * math.pi * 2840.0 * lt_s) * np.exp(-lt_s * 34.0) * 0.28
        + np.sin(2.0 * math.pi * 4590.0 * lt_s) * np.exp(-lt_s * 44.0) * 0.22
        + np.sin(2.0 * math.pi * 215.0 * lt_s) * np.exp(-lt_s * 18.0) * 0.30
    ) * np.clip(lt_s / 0.0018, 0.0, 1.0)
    # Secondary hairline stress ping 140ms later
    ping_len = int(0.35 * SAMPLE_RATE)
    lt_pg = np.arange(ping_len, dtype=np.float32) / float(SAMPLE_RATE)
    hairline_ping = (
        np.sin(2.0 * math.pi * 3520.0 * lt_pg) * np.exp(-lt_pg * 24.0) * 0.22
        + np.sin(2.0 * math.pi * 5380.0 * lt_pg) * np.exp(-lt_pg * 36.0) * 0.14
    ) * np.clip(lt_pg / 0.0015, 0.0, 1.0)
    add_stereo_event(foley, crack_t, ceramic_snap * 0.42, pan=-0.06)
    add_stereo_event(foley, crack_t + 0.14, hairline_ping * 0.34, pan=0.14)

    # 2. Molten 24k gold flowing along the glowing fracture (56.35s -> 60.8s)
    gold_notes = [
        (56.38, 587.33, -0.22, 0.085),
        (56.95, 739.99, 0.20, 0.090),
        (57.58, 880.00, -0.15, 0.095),
        (58.25, 1174.66, 0.18, 0.090),
        (59.05, 1479.98, 0.0, 0.085),
    ]
    for gt, gf, gpan, gamp in gold_notes:
        glen = int(2.6 * SAMPLE_RATE)
        lt_g = np.arange(glen, dtype=np.float32) / float(SAMPLE_RATE)
        shimmer = (
            np.sin(2.0 * math.pi * gf * lt_g)
            + 0.24 * np.sin(2.0 * math.pi * gf * 2.002 * lt_g) * np.exp(-lt_g * 1.4)
            + 0.10 * np.sin(2.0 * math.pi * gf * 3.005 * lt_g) * np.exp(-lt_g * 2.8)
        ) * np.clip(lt_g / 0.06, 0.0, 1.0) * np.exp(-lt_g * 1.15) * gamp
        add_stereo_event(foley, gt, shimmer, pan=gpan)

    # G. Stoneware dawn chimes & structural scene-cut bells
    chime_events = [
        (0.6, 293.66, -0.25, 0.12), (3.8, 440.00, 0.25, 0.11),
        (13.8, 349.23, -0.28, 0.11), (22.6, 523.25, 0.28, 0.12),
        (32.1, 587.33, -0.32, 0.12), (42.6, 293.66, -0.20, 0.15),
        (61.1, 587.33, 0.22, 0.18), (68.0, 739.99, -0.20, 0.15),
        (74.4, 587.33, 0.18, 0.16), (79.2, 440.00, 0.0, 0.14),
    ]
    for ct, freq, pan, amp in chime_events:
        clen = int(4.0 * SAMPLE_RATE)
        lt_c = np.arange(clen, dtype=np.float32) / float(SAMPLE_RATE)
        tone = (
            np.sin(2.0 * math.pi * freq * lt_c)
            + 0.20 * np.exp(-lt_c * 3.8) * np.sin(2.0 * math.pi * freq * 2.756 * lt_c)
        ) * np.clip(lt_c / 0.012, 0.0, 1.0) * np.exp(-lt_c * 1.15) * amp
        add_stereo_event(foley, ct, tone, pan=pan)

    return apply_stereo_hall_reverb(foley, wet=0.22).astype(np.float32)


def track4_vitrification_sub_drone() -> np.ndarray:
    """Track 4: 1300C vitrification climax cinema low-frequency bed (38Hz-115Hz)."""
    rng = np.random.default_rng(1300)
    t = np.arange(NUM_SAMPLES, dtype=np.float32) / float(SAMPLE_RATE)

    rumble_raw = bandpass_fft(rng.standard_normal(NUM_SAMPLES).astype(np.float32), 34.0, 118.0)
    # Deep resonant D1/A1 thermal kiln cavity harmonics
    sub_osc = (
        0.65 * np.sin(2.0 * math.pi * 36.71 * t)
        + 0.35 * np.sin(2.0 * math.pi * 55.00 * t + 0.4 * np.sin(2.0 * math.pi * 0.22 * t))
    )
    # Builds gently from hearth -> roars across 1100C-1300C (41s-60.5s) -> dissolves cleanly at dawn
    base_warmth = np.clip((t - 2.0) / 3.0, 0.0, 1.0) * np.clip((63.0 - t) / 4.5, 0.0, 1.0) * 0.032
    climax_swell = np.clip((t - 39.5) / 4.0, 0.0, 1.0) * np.clip((61.4 - t) / 2.2, 0.0, 1.0) * 0.105
    # Brief dramatic sub drop-out right before the 56.2s crack, then warm resonant bloom at 56.25s!
    crack_dip = 1.0 - 0.62 * np.exp(-((t - 55.95) / 0.22) ** 2)
    crack_bloom = 1.0 + 0.48 * np.exp(-((t - 56.45) / 0.85) ** 2)
    env = (base_warmth + climax_swell) * crack_dip * crack_bloom

    sig = (rumble_raw * 0.62 + sub_osc * 0.38) * env
    return np.stack([sig, sig * 0.96], axis=1).astype(np.float32)


def build_five_track_soundtrack(final_wav: Path) -> dict[str, Any]:
    """Master all 5 audio/subtitle tracks (Tracks 1-4 audio -> -14.0 LUFS EBU R128 WAV; Track 5 ASS/SRT)."""
    print("[v5-audio] Mastering Track 1: 4 real Zyphra/ZONOS3-Mini studio narrations...", flush=True)
    t1_voice, speech_env = track1_studio_zonos3_narration()

    print("[v5-audio] Composing Track 2: 4-voice bowed cello & viola chamber score...", flush=True)
    t2_score = track2_chamber_cello_score()

    print("[v5-audio] Synthesizing Track 3: Shot-aligned ceramic & wood-kiln Foley...", flush=True)
    t3_foley = track3_shot_aligned_kiln_foley()

    print("[v5-audio] Synthesizing Track 4: 1300C vitrification sub-bass cinema bed...", flush=True)
    t4_sub = track4_vitrification_sub_drone()

    # Smooth sidechain ducking under Savannah's narration (-5.5 dB on music, -2.5 dB on foley/sub)
    music_duck = 1.0 - 0.47 * speech_env[:, None]
    foley_duck = 1.0 - 0.25 * speech_env[:, None]
    premix = t1_voice + t2_score * music_duck + t3_foley * foley_duck + t4_sub * foley_duck

    fade_in = int(0.8 * SAMPLE_RATE)
    fade_out = int(2.4 * SAMPLE_RATE)
    premix[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)[:, None]
    premix[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)[:, None]

    peak = float(np.max(np.abs(premix)))
    if peak > 0.92:
        premix *= 0.90 / peak

    raw_wav = OUT_DIR / "premix_v5_5track.wav"
    write_wav_stereo_i16(raw_wav, premix)

    # Two-pass EBU R128 exact -14.0 LUFS cinema loudness normalization (logs to file, never stderr=PIPE)
    pass1_log = OUT_DIR / "loudnorm_pass1.log"
    with open(pass1_log, "w", encoding="utf-8") as lf:
        p1 = subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(raw_wav),
                "-af", "loudnorm=I=-14.0:TP=-1.2:LRA=8:print_format=json",
                "-f", "null", "-",
            ],
            stdout=lf, stderr=lf, stdin=subprocess.DEVNULL,
        )
    if p1.returncode != 0:
        raise RuntimeError(f"loudnorm pass 1 failed; inspect {pass1_log}")

    log_txt = pass1_log.read_text(encoding="utf-8", errors="replace")
    j_start = log_txt.rfind("{")
    j_end = log_txt.rfind("}")
    measured = json.loads(log_txt[j_start:j_end + 1])

    ln_filter = (
        f"loudnorm=I=-14.0:TP=-1.2:LRA=8:"
        f"measured_I={measured['input_i']}:measured_LRA={measured['input_lra']}:"
        f"measured_TP={measured['input_tp']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}:linear=true"
    )
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(raw_wav),
            "-af", ln_filter,
            "-ar", str(SAMPLE_RATE), "-ac", "2", "-c:a", "pcm_s16le",
            str(final_wav),
        ],
        "loudnorm_pass2",
    )

    # Verify final measured LUFS
    verify_log = OUT_DIR / "loudnorm_verify.log"
    with open(verify_log, "w", encoding="utf-8") as lf:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(final_wav),
                "-af", "loudnorm=I=-14.0:TP=-1.2:LRA=8:print_format=json",
                "-f", "null", "-",
            ],
            stdout=lf, stderr=lf, stdin=subprocess.DEVNULL, check=True,
        )
    v_txt = verify_log.read_text(encoding="utf-8", errors="replace")
    final_stats = json.loads(v_txt[v_txt.rfind("{"):v_txt.rfind("}") + 1])
    print(
        f"[v5-audio] Mastered 5-track soundtrack -> I={final_stats['input_i']} LUFS, "
        f"TP={final_stats['input_tp']} dBTP, LRA={final_stats['input_lra']} LU",
        flush=True,
    )
    return final_stats


def extract_qa_frames(mp4_path: Path) -> list[Path]:
    """Extract 10 representative frames across title, Shots 1-8, subtitles, and end credits + build contact sheets."""
    QA_DIR.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for name, ts in QA_SAMPLE_TIMESTAMPS:
        out_png = QA_DIR / f"{name}.png"
        run_ffmpeg(
            [
                "ffmpeg", "-y", "-loglevel", "warning",
                "-ss", f"{ts:.2f}",
                "-i", str(mp4_path),
                "-frames:v", "1",
                "-update", "1",
                str(out_png),
            ],
            f"qa_frame:{name}",
        )
        saved.append(out_png)

    # Also build two crisp 5-frame high-res contact sheets for rapid full-film visual verification
    for sheet_name, batch in [("v5_qa_sheet_1_5.png", saved[:5]), ("v5_qa_sheet_6_10.png", saved[5:])]:
        tw, th, pad = 960, 540, 10
        sheet = Image.new("RGB", (tw * 2 + pad * 3, th * 3 + pad * 4), (10, 8, 7))
        draw = ImageDraw.Draw(sheet)
        for idx, fp in enumerate(batch):
            im = Image.open(fp).convert("RGB").resize((tw, th), Image.Resampling.LANCZOS)
            col = idx % 2
            row = idx // 2
            x = pad + col * (tw + pad)
            y = pad + row * (th + pad)
            sheet.paste(im, (x, y))
            draw.rectangle([x + 8, y + 8, x + 280, y + 32], fill=(10, 8, 7))
            draw.text((x + 14, y + 13), fp.stem, fill=(247, 221, 160))
        sheet.save(QA_DIR / sheet_name)
    return saved


def main() -> None:
    t0 = time.time()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if LOG_PATH.exists():
        LOG_PATH.unlink()

    print(f"[v5-film] Target: {FINAL_MP4} ({OUT_W}x{OUT_H} @ {FPS}fps, 2.39:1 CinemaScope, {DURATION_SEC:.1f}s)", flush=True)

    # 1. Write synchronized Track 5 subtitles (.srt + bottom-bar .ass)
    write_subtitles()
    print(f"[v5-film] Wrote synchronized subtitles -> {FINAL_SRT} & {ASS_PATH}", flush=True)

    # 2. Render all 10 widescreen video segments from real AI I2V clips + copper-gold serif cards
    seg_files: list[Path] = []
    for seg in SEGMENTS:
        out_seg = OUT_DIR / f"{seg['id']}.mp4"
        print(f"[v5-film] Rendering {seg['id']} ({seg['duration']:.1f}s)...", flush=True)
        build_video_segment(seg, out_seg)
        seg_files.append(out_seg)

    # 3. Assemble seamless dissolved widescreen video master with bottom-bar Georgia subtitles
    silent_master = OUT_DIR / "video_master_v5_1080p.mp4"
    print("[v5-film] Assembling 10-segment dissolved 2.39:1 video master + Georgia bottom-bar subtitles...", flush=True)
    assemble_video_master(seg_files, silent_master)

    # 4. Master 5-track cinema soundtrack (-14.0 LUFS)
    soundtrack_wav = OUT_DIR / "soundtrack_v5_5track_14lufs.wav"
    audio_stats = build_five_track_soundtrack(soundtrack_wav)

    # 5. Final mux to competition deliverable materials/The_Last_Kiln_ShortFilm_1080p.mp4
    FINAL_MP4.parent.mkdir(parents=True, exist_ok=True)
    print(f"[v5-film] Muxing final 1080p cinema master -> {FINAL_MP4}", flush=True)
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(silent_master),
            "-i", str(soundtrack_wav),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "256k", "-ar", str(SAMPLE_RATE),
            "-shortest",
            "-movflags", "+faststart",
            str(FINAL_MP4),
        ],
        "final_mux",
    )

    # 6. Extract 10 QA frames across the entire film for visual inspection
    qa_frames = extract_qa_frames(FINAL_MP4)
    size_mb = FINAL_MP4.stat().st_size / (1024 * 1024)
    elapsed = time.time() - t0
    print(
        f"[v5-film] DONE in {elapsed:.1f}s -> {FINAL_MP4.name} ({size_mb:.2f} MB, "
        f"{DURATION_SEC:.1f}s, {audio_stats['input_i']} LUFS, {len(qa_frames)} QA frames in {QA_DIR})",
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[v5-film] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
