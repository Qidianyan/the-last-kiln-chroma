#!/usr/bin/env python3
"""
V6-iter3 Game + Behind-The-Scenes Dual-Division 1080p Trailer Renderer
for 《The Last Kiln of Ember Valley》 (Chroma Awards Season 2).

Combines:
  1. Native 1920x1080 live Playwright Chromium gameplay capture of the V6 web game:
     - Act I-III: Impasto oil stage, 600C-1300C bellows physics, mineral glaze alchemy, WebAudio Foley.
     - Act IV-V: 1300C blackbody flames, live mouse Kintsugi gold vein tracing (Grade S / 100% precision),
       and The Gilded Reliquary 1000x1400 Ceramic Relic Card PNG generation.
  2. Real Behind-The-Scenes AI Cinema Breakdown (ZERO fake placeholders!):
     - Live side-by-side split-screen comparing Static 4K Oil Keyframes (`05_kiln_fire.png`, `04_molten_glaze_pour.png`)
       directly against their real `Lightricks/LTX-Video-0.9.5` 81-frame AI I2V moving clips (`shot_05.mp4`, `shot_04.mp4`).
     - 5-Track `-14.09 LUFS` Cinema Sound Architecture & Open-Source Triple-Division Engineering Deck
       with live 2x2 cinema monitor playing real AI I2V shots (`shot_01`, `shot_06`, `shot_07`, `shot_08`).
  3. Audio Master (66.0s @ 48kHz, two-pass EBU R128 `-14.0 LUFS`, ZERO macOS say):
     - All 3 studio Zyphra/ZONOS3-Mini (`Savannah`) English narrations from
       /Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma_game_bts/
     - Original 4-voice chamber cello score, ceramic chimes, wood-kiln Foley & thermal crack beat.
  4. Warm bone-parchment Georgia serif English subtitles burned strictly inside the bottom 138px
     letterbox bar + synchronized .srt deliverable.

All FFmpeg stderr logs are redirected to disk (`out/v6_bts/logs/v6_bts_ffmpeg.log`) — never stderr=PIPE.
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
ACTIVE_H = OUT_H - 2 * BAR_H  # 804px (2.39:1 CinemaScope aperture)
XFADE_SEC = 0.8

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent.parent
ART_DIR = ROOT / "art"
OUT_DIR = ROOT / "out" / "v6_bts"
QA_DIR = OUT_DIR / "qa_frames"
LOG_PATH = OUT_DIR / "logs" / "v6_bts_ffmpeg.log"

I2V_CLIPS_DIR = Path("/Volumes/Extra/datasets/s4_chroma_i2v_clips")
BTS_VO_DIR = Path("/Volumes/Extra/datasets/wave2_studio_audio/S4_Chroma_game_bts")

FINAL_MP4 = PROJECT_ROOT / "materials" / "The_Last_Kiln_Game_and_BTS_Trailer_1080p.mp4"
FINAL_SRT = PROJECT_ROOT / "materials" / "The_Last_Kiln_Game_and_BTS_Trailer_1080p.srt"
ASS_PATH = OUT_DIR / "trailer_subtitles_v6.ass"

GEORGIA_REGULAR = "/System/Library/Fonts/Supplemental/Georgia.ttf"
GEORGIA_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
GEORGIA_ITALIC = "/System/Library/Fonts/Supplemental/Georgia Italic.ttf"

# 7-segment 66.0s trailer arc: sum(durs) = 70.8s, minus 6 * 0.8s xfade = 66.0s exact!
SEG_DURATIONS = {
    "seg00_title": 3.5,           # 0.0 -> 3.5 (dissolve 2.7)
    "seg01_game_acts1_3": 17.8,   # 2.7 -> 20.5 (dissolve 19.7) — Act I-III Live Gameplay
    "seg02_game_kintsugi": 19.6,  # 19.7 -> 39.3 (dissolve 38.5) — Act IV Live Mouse Kintsugi + Relic Card!
    "seg03_bts_i2v_fire": 6.6,    # 38.5 -> 45.1 (dissolve 44.3) — Split-Screen: 05_kiln_fire Static vs LTX-Video I2V!
    "seg04_bts_i2v_pour": 6.6,    # 44.3 -> 50.9 (dissolve 50.1) — Split-Screen: 04_molten_glaze Static vs LTX-Video I2V!
    "seg05_bts_arch_deck": 10.7,  # 50.1 -> 60.8 (dissolve 60.0) — 5-Track -14.09 LUFS Sound & Triple-Division Deck + Live 2x2 I2V!
    "seg06_closing": 6.0,         # 60.0 -> 66.0 — Triple-Division Closing Slate
}
DURATION_SEC = round(sum(SEG_DURATIONS.values()) - (len(SEG_DURATIONS) - 1) * XFADE_SEC, 3)
NUM_SAMPLES = int(round(SAMPLE_RATE * DURATION_SEC))

TRAILER_VO_CUES: list[tuple[float, str]] = [
    (2.6, "act1_game_intro.wav"),  # 2.60 -> 16.47s
    (19.0, "act2_gameplay.wav"),   # 19.00 -> 36.60s
    (39.2, "act3_bts_craft.wav"),  # 39.20 -> 57.53s
]

SUBTITLE_CUES: list[tuple[float, float, str, str]] = [
    (2.6, 9.6, "Step inside The Last Kiln of Ember Valley, a playable narrative craft game",
     "created alongside our animated short film for Chroma Awards Season 2."),
    (9.8, 16.5, "Every scene unfolds over hand-painted oil canvases,",
     "rendered live with interactive kiln firelight and studio neural narration."),
    (19.0, 27.4, "Gather wild mineral oxides, balance reduction airflow against real kiln",
     "thermal physics, and guide the vessel past 1300 degrees Celsius."),
    (27.6, 36.6, "Your firing choices unlock four distinct endings,",
     "from shattered ash to luminous gold-seam kintsugi dawn."),
    (39.2, 48.2, "Behind the scenes, we threw away every flat geometric draft, commissioning",
     "eight impasto oil storyboard plates and 44.1 kilohertz neural narration,"),
    (48.4, 57.6, "and a four-part chamber cello score, uniting film, interactive game,",
     "and transparent craft into one cohesive world."),
]

QA_SAMPLES: list[tuple[str, float]] = [
    ("00_title_slate", 1.6),
    ("01_game_hearth_sub", 7.2),
    ("02_game_glaze_sub", 13.5),
    ("03_game_kintsugi_drag_sub", 25.0),
    ("04_game_relic_card_sub", 35.2),
    ("05_bts_split_kiln_i2v_sub", 41.8),
    ("06_bts_split_glaze_i2v", 47.2),
    ("07_bts_5track_deck_sub", 54.5),
    ("08_closing_slate", 63.0),
]


def run_ffmpeg(cmd: list[str], step_label: str) -> None:
    """Run FFmpeg with stderr appended to log file (never stderr=PIPE)."""
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as logf:
        logf.write(f"\n=== [{step_label}] {' '.join(cmd)} ===\n")
        logf.flush()
        proc = subprocess.run(cmd, stdout=logf, stderr=logf, stdin=subprocess.DEVNULL)
    if proc.returncode != 0:
        tail = LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()[-30:]
        raise RuntimeError(f"FFmpeg failed ({proc.returncode}) at {step_label}:\n" + "\n".join(tail))


def probe_duration_sec(path: Path) -> float:
    return float(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            text=True,
        ).strip()
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
    srt_blocks = [
        f"{idx}\n{format_srt_ts(t0)} --> {format_srt_ts(t1)}\n{l1}\n{l2}\n"
        for idx, (t0, t1, l1, l2) in enumerate(SUBTITLE_CUES, start=1)
    ]
    FINAL_SRT.parent.mkdir(parents=True, exist_ok=True)
    FINAL_SRT.write_text("\n".join(srt_blocks).strip() + "\n", encoding="utf-8")

    # Warm bone-parchment #F2E8DA (&H00DAE8F2 in ASS BGR) strictly inside bottom 138px letterbox bar!
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
        f"Dialogue: 0,{format_ass_ts(t0)},{format_ass_ts(t1)},KilnSub,,0,0,0,,{{\\fad(200,200)}}{l1}\\N{l2}"
        for t0, t1, l1, l2 in SUBTITLE_CUES
    ]
    ASS_PATH.write_text(ass_header + "\n".join(ev_lines) + "\n", encoding="utf-8")


def draw_centered_text(
    draw: ImageDraw.ImageDraw,
    y: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    cx: int = OUT_W // 2,
) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, y), text, font=font, fill=fill)


def create_title_or_closing_card(kind: str, out_png: Path) -> None:
    """Create crisp copper-gold warm obsidian title or triple-division closing slate inside 2.39:1 frame."""
    img = Image.new("RGB", (OUT_W, OUT_H), (8, 6, 5))
    plate_name = "02_hearth_apprentice.png" if kind == "title" else "08_olive_shoots_ash.png"
    bg_plate = Image.open(ART_DIR / plate_name).convert("RGB")
    # Crop & darken oil plate subtly inside the 2.39:1 window so editorial gold typography pops effortlessly
    scale = max(OUT_W / bg_plate.width, ACTIVE_H / bg_plate.height)
    rw, rh = int(bg_plate.width * scale), int(bg_plate.height * scale)
    bg_res = bg_plate.resize((rw, rh), Image.Resampling.LANCZOS)
    x0, y0 = (rw - OUT_W) // 2, (rh - ACTIVE_H) // 2
    crop = bg_res.crop((x0, y0, x0 + OUT_W, y0 + ACTIVE_H))
    dark_scrim = Image.new("RGB", (OUT_W, ACTIVE_H), (12, 9, 7))
    blended = Image.blend(crop, dark_scrim, 0.72)
    img.paste(blended, (0, BAR_H))

    draw = ImageDraw.Draw(img)
    draw.line([(160, BAR_H + 1), (OUT_W - 160, BAR_H + 1)], fill=(96, 68, 36), width=1)
    draw.line([(160, OUT_H - BAR_H - 2), (OUT_W - 160, OUT_H - BAR_H - 2)], fill=(96, 68, 36), width=1)

    f_eyebrow = ImageFont.truetype(GEORGIA_REGULAR, 23)
    f_title = ImageFont.truetype(GEORGIA_BOLD, 78)
    f_sub = ImageFont.truetype(GEORGIA_REGULAR, 40)
    f_italic = ImageFont.truetype(GEORGIA_ITALIC, 28)
    f_card_hd = ImageFont.truetype(GEORGIA_BOLD, 24)
    f_card_tx = ImageFont.truetype(GEORGIA_REGULAR, 22)

    if kind == "title":
        draw_centered_text(draw, 300, "CHROMA AWARDS SEASON 2  ·  GAME & BEHIND-THE-SCENES REEL", f_eyebrow, (219, 161, 60))
        draw_centered_text(draw, 368, "THE LAST KILN", f_title, (251, 247, 240))
        draw_centered_text(draw, 468, "OF EMBER VALLEY", f_sub, (242, 232, 218))
        draw.line([(OUT_W // 2 - 190, 548), (OUT_W // 2 + 190, 548)], fill=(219, 161, 60), width=2)
        draw_centered_text(
            draw, 580,
            "Playable 1300°C Kintsugi Fable  ·  8-Shot LTX-Video I2V Cinema  ·  5-Track Soundscape",
            f_italic, (238, 206, 152),
        )
        draw_centered_text(draw, 680, "ALL FOOTAGE RECORDED LIVE IN CHROMIUM & RENDERED ON REAL GPU", f_eyebrow, (186, 163, 136))
    else:
        draw_centered_text(draw, 226, "ONE UNIFIED CERAMIC WORLD · THREE CHROMA AWARDS DIVISIONS", f_eyebrow, (219, 161, 60))
        draw_centered_text(draw, 276, "THE LAST KILN OF EMBER VALLEY", f_sub, (251, 247, 240))
        draw.line([(OUT_W // 2 - 200, 344), (OUT_W // 2 + 200, 344)], fill=(219, 161, 60), width=2)

        boxes = [
            ("FILM & TV DIVISION", "85.0s 2.39:1 Animated Short", "8× LTX-Video-0.9.5 AI I2V Shots", "5-Track Sound (-14.09 LUFS)"),
            ("GAME DIVISION", "Playable 5-Act Web Fable", "1300°C Blackbody & Mouse Kintsugi", "WebAudio Kiln Foley · 21/21 Tests"),
            ("BEHIND-THE-SCENES", "Open-Source MIT Pipeline", "Real Keyframe-to-I2V Breakdown", "Dual 1080p Masters + .SRT Captions"),
        ]
        bw, bh, gap = 500, 290, 44
        start_x = (OUT_W - (3 * bw + 2 * gap)) // 2
        y_top = 396
        for i, (head, l1, l2, l3) in enumerate(boxes):
            bx = start_x + i * (bw + gap)
            draw.rounded_rectangle([bx, y_top, bx + bw, y_top + bh], radius=8, fill=(20, 15, 12), outline=(170, 124, 52), width=2)
            cx = bx + bw // 2
            draw_centered_text(draw, y_top + 36, head, f_card_hd, (219, 161, 60), cx)
            draw.line([(bx + 42, y_top + 82), (bx + bw - 42, y_top + 82)], fill=(78, 56, 32), width=1)
            draw_centered_text(draw, y_top + 112, l1, f_card_tx, (251, 247, 240), cx)
            draw_centered_text(draw, y_top + 162, l2, f_card_tx, (242, 232, 218), cx)
            draw_centered_text(draw, y_top + 212, l3, f_card_tx, (206, 184, 154), cx)

        draw_centered_text(draw, 742, "MIT OPEN SOURCE REPOSITORY  ·  ZERO BLUE/PURPLE PALETTE  ·  CHROMA AWARDS SEASON 2", f_eyebrow, (186, 163, 136))

    img.save(out_png)


def create_bts_split_backdrop(title_label: str, plate_name: str, motion_label: str, out_png: Path) -> None:
    """Create the editorial frame & LEFT static oil keyframe for the live Static-vs-I2V split-screen."""
    img = Image.new("RGB", (OUT_W, OUT_H), (8, 6, 5))
    draw = ImageDraw.Draw(img)
    # Obsidian workspace strictly inside 2.39:1 window (y=138..942)
    draw.rectangle([0, BAR_H, OUT_W, OUT_H - BAR_H], fill=(16, 12, 10))
    draw.line([(120, BAR_H + 1), (OUT_W - 120, BAR_H + 1)], fill=(88, 64, 34), width=1)
    draw.line([(120, OUT_H - BAR_H - 2), (OUT_W - 120, OUT_H - BAR_H - 2)], fill=(88, 64, 34), width=1)

    f_hdr = ImageFont.truetype(GEORGIA_BOLD, 30)
    f_sub = ImageFont.truetype(GEORGIA_REGULAR, 21)
    f_tag = ImageFont.truetype(GEORGIA_BOLD, 20)
    f_cap = ImageFont.truetype(GEORGIA_ITALIC, 22)

    draw_centered_text(draw, 166, f"BEHIND THE SCENES  ·  {title_label}", f_hdr, (251, 247, 240))
    draw_centered_text(draw, 210, "4K Impasto Oil Concept Keyframe  to  Real Colab GPU Lightricks/LTX-Video-0.9.5 AI Image-to-Video (81 Frames)", f_sub, (219, 161, 60))

    # Left box: Static Oil Keyframe (820x478) at x=96, y=276
    # Right box: Live AI I2V Video (820x478) will be overlaid by FFmpeg at x=1004, y=276!
    pw, ph = 820, 478
    lx, rx, py = 96, 1004, 276

    plate = Image.open(ART_DIR / plate_name).convert("RGB").resize((pw, ph), Image.Resampling.LANCZOS)
    img.paste(plate, (lx, py))
    draw.rectangle([lx - 2, py - 2, lx + pw + 2, py + ph + 2], outline=(138, 102, 54), width=2)
    draw.rectangle([rx - 2, py - 2, rx + pw + 2, py + ph + 2], outline=(230, 90, 40), width=3)

    # Crisp panel header pills above each monitor
    draw.rounded_rectangle([lx, py + ph + 16, lx + pw, py + ph + 62], radius=4, fill=(26, 20, 16), outline=(110, 82, 46), width=1)
    draw_centered_text(draw, py + ph + 27, f"INPUT KEYFRAME · {plate_name} (STATIC OIL PLATE)", f_tag, (222, 204, 178), lx + pw // 2)

    draw.rounded_rectangle([rx, py + ph + 16, rx + pw, py + ph + 62], radius=4, fill=(38, 22, 14), outline=(230, 90, 40), width=1)
    draw_centered_text(draw, py + ph + 27, f"LIVE AI I2V OUTPUT · {motion_label}", f_tag, (247, 221, 160), rx + pw // 2)

    # Warm gold arrow between static plate and live AI video
    ax, ay = OUT_W // 2, py + ph // 2
    draw.polygon([(ax - 22, ay - 14), (ax + 16, ay), (ax - 22, ay + 14)], fill=(219, 161, 60))
    draw_centered_text(draw, 868, "Zero blue/cyan/teal/purple drift · Faithful oil brushwork preserved across all 8 shots (648 real AI video frames)", f_cap, (196, 174, 146))

    img.save(out_png)


def create_bts_arch_deck_backdrop(out_png: Path) -> None:
    """Create the 5-Track Sound & Open-Source Triple-Division Architecture Deck with space for a live 2x2 I2V quad."""
    img = Image.new("RGB", (OUT_W, OUT_H), (8, 6, 5))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, BAR_H, OUT_W, OUT_H - BAR_H], fill=(16, 12, 10))
    draw.line([(120, BAR_H + 1), (OUT_W - 120, BAR_H + 1)], fill=(88, 64, 34), width=1)
    draw.line([(120, OUT_H - BAR_H - 2), (OUT_W - 120, OUT_H - BAR_H - 2)], fill=(88, 64, 34), width=1)

    f_hdr = ImageFont.truetype(GEORGIA_BOLD, 30)
    f_sub = ImageFont.truetype(GEORGIA_REGULAR, 20)
    f_sec = ImageFont.truetype(GEORGIA_BOLD, 22)
    f_row = ImageFont.truetype(GEORGIA_REGULAR, 20)
    f_tag = ImageFont.truetype(GEORGIA_BOLD, 18)

    draw_centered_text(draw, 164, "5-TRACK CINEMA SOUND ARCHITECTURE  &  OPEN-SOURCE PIPELINE", f_hdr, (251, 247, 240))
    draw_centered_text(draw, 206, "Mastered to -14.09 LUFS / -1.19 dBTP · Zero OS Speech · Reproducible MIT Codebase (21/21 Vitest · sloplint 0 FAIL)", f_sub, (219, 161, 60))

    # Left column (x=88..960): 5-Track Audio Engineering + Game Craft Stack
    lx, lw = 88, 860
    tracks = [
        ("TRACK 1 · STUDIO VOICE", "4× Zyphra ZONOS3-Mini (Savannah, 44.1kHz) + 3× BTS Cuts", (230, 90, 40)),
        ("TRACK 2 · CHAMBER SCORE", "4-Voice Bowed Cello/Viola (Dm to Picardy D Major Dawn, -5.5dB Duck)", (219, 161, 60)),
        ("TRACK 3 · SHOT FOLEY", "Pine Embers, Molten Pour, 56.2s Stoneware Crack Snap & Gold Shimmer", (199, 67, 37)),
        ("TRACK 4 · 1300°C SUB BED", "38Hz–115Hz Thermal Cavity Drone Swell + Dawn Silence Release", (156, 118, 62)),
        ("TRACK 5 · SAFE CAPTIONS", "Warm Georgia Serif Burned Inside Bottom 138px Bar + Synced .SRT", (116, 142, 92)),
    ]
    ty = 264
    for label, desc, bar_col in tracks:
        draw.rounded_rectangle([lx, ty, lx + lw, ty + 84], radius=6, fill=(24, 18, 14), outline=(88, 66, 40), width=1)
        draw.rectangle([lx, ty, lx + 10, ty + 84], fill=bar_col)
        draw.text((lx + 26, ty + 14), label, font=f_sec, fill=(247, 221, 160))
        draw.text((lx + 26, ty + 48), desc, font=f_row, fill=(235, 223, 206))
        ty += 100

    # Bottom stat ribbon under left stack
    draw.rounded_rectangle([lx, 772, lx + lw, 858], radius=6, fill=(32, 22, 14), outline=(219, 161, 60), width=2)
    draw.text((lx + 24, 786), "VERIFIED PRODUCTION GATES (V4 - V6)", font=f_tag, fill=(219, 161, 60))
    draw.text(
        (lx + 24, 818),
        "8× LTX-Video I2V (648f)  ·  21/21 Vitest  ·  Playwright Real Drag  ·  sloplint 0 FAIL",
        font=f_row, fill=(251, 247, 240),
    )

    # Right column (x=996..1832): Frame for live 2x2 AI I2V Cinema Quad Monitor (each tile 408x238, gap 16)
    qx, qy = 996, 264
    qw, qh = 832, 594
    draw.rounded_rectangle([qx - 6, qy - 6, qx + qw + 6, qy + qh + 6], radius=8, fill=(20, 15, 12), outline=(170, 124, 52), width=2)
    draw_centered_text(draw, qy + 536, "LIVE 4-SHOT AI I2V MONITOR  ·  SHOT 01 / SHOT 06 / SHOT 07 / SHOT 08", f_tag, (247, 221, 160), qx + qw // 2)

    img.save(out_png)


def render_static_card_video(png_path: Path, dur: float, out_mp4: Path, fade_in: bool = False, fade_out: bool = False) -> None:
    vf_parts = ["format=yuv420p"]
    if fade_in:
        vf_parts.append("fade=t=in:st=0:d=0.7:color=#080605")
    vf_parts.append("noise=alls=3:allf=t+u")
    if fade_out:
        vf_parts.append(f"fade=t=out:st={max(0.1, dur - 1.2):.2f}:d=1.2:color=#080605")
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-loop", "1", "-framerate", str(FPS),
            "-i", str(png_path),
            "-t", f"{dur:.3f}",
            "-vf", ",".join(vf_parts),
            "-c:v", "libx264", "-crf", "16", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            str(out_mp4),
        ],
        f"card:{out_mp4.stem}",
    )


def render_gameplay_segment(src_mp4: Path, target_dur: float, badge_text: str, out_mp4: Path) -> None:
    """Conform real Playwright 1920x1080 capture cleanly to target_dur with subtle cinema header badge."""
    actual = probe_duration_sec(src_mp4)
    # Speed gently within [0.85x..1.25x] so the entire real gameplay action fits the exact voiceover window!
    pts_scale = target_dur / max(1.0, actual)
    pts_scale = max(0.72, min(1.35, pts_scale))
    badge_escaped = badge_text.replace(":", "\\:").replace("'", "\\'")

    # Place crisp copper-gold cinema chapter label strictly inside the top 138px black letterbox bar (zero UI overlap!)
    vf = (
        f"setpts=PTS*{pts_scale:.4f},fps={FPS},"
        f"tpad=stop_mode=clone:stop_duration=2.0,"
        f"trim=0:{target_dur:.3f},setpts=PTS-STARTPTS,"
        f"drawtext=fontfile='{GEORGIA_REGULAR}':text='{badge_escaped}':"
        f"fontcolor=#DBA13C:fontsize=21:x=(w-text_w)/2:y=62,"
        f"format=yuv420p"
    )
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(src_mp4),
            "-vf", vf,
            "-t", f"{target_dur:.3f}",
            "-c:v", "libx264", "-crf", "16", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            str(out_mp4),
        ],
        f"gameplay:{out_mp4.stem}",
    )


def render_bts_split_segment(
    bg_png: Path,
    i2v_clip: Path,
    dur: float,
    out_mp4: Path,
) -> None:
    """Overlay live slow-motion AI I2V video directly onto the right monitor of the static-vs-I2V split board."""
    src_dur = probe_duration_sec(i2v_clip)
    xf_seg = 0.65
    slow_speed = min(0.62, max(0.45, (src_dur * 2.0 - 0.25) / (dur + xf_seg + 0.35)))
    fwd_dur = round((src_dur - 0.05) / slow_speed, 3)
    rev_dur = round(min((src_dur - 0.10) / slow_speed, max(3.0, dur - fwd_dur + xf_seg + 0.30)), 3)
    xf_off = round(fwd_dur - xf_seg, 3)

    fc = (
        f"[1:v]setpts=PTS/{slow_speed:.4f},minterpolate=fps={FPS}:mi_mode=blend,trim=0:{fwd_dur:.3f},setpts=PTS-STARTPTS[fwd];"
        f"[1:v]reverse,setpts=PTS/{slow_speed:.4f},minterpolate=fps={FPS}:mi_mode=blend,trim=0.06:{0.06 + rev_dur:.3f},setpts=PTS-STARTPTS[rev];"
        f"[fwd][rev]xfade=transition=fade:duration={xf_seg:.2f}:offset={xf_off:.3f},"
        f"trim=0:{dur:.3f},setpts=PTS-STARTPTS,scale=820:478:flags=lanczos,unsharp=5:5:0.45:3:3:0.15[live];"
        f"[0:v][live]overlay=x=1004:y=276:shortest=1,noise=alls=3:allf=t+u,fps={FPS},format=yuv420p[vout]"
    )
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-loop", "1", "-framerate", str(FPS), "-i", str(bg_png),
            "-i", str(i2v_clip),
            "-filter_complex", fc,
            "-map", "[vout]",
            "-t", f"{dur:.3f}",
            "-c:v", "libx264", "-crf", "16", "-preset", "fast",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            str(out_mp4),
        ],
        f"bts_split:{out_mp4.stem}",
    )


def render_bts_arch_quad_segment(bg_png: Path, dur: float, out_mp4: Path) -> None:
    """Composite the 5-track architecture board with a live 2x2 playing quad of real AI I2V clips."""
    clips = [
        I2V_CLIPS_DIR / "shot_01.mp4",
        I2V_CLIPS_DIR / "shot_06.mp4",
        I2V_CLIPS_DIR / "shot_07.mp4",
        I2V_CLIPS_DIR / "shot_08.mp4",
    ]
    cmd = [
        "ffmpeg", "-y", "-loglevel", "warning",
        "-loop", "1", "-framerate", str(FPS), "-i", str(bg_png),
    ]
    for c in clips:
        cmd.extend(["-stream_loop", "-1", "-i", str(c)])

    # Tile 4 live I2V clips (404x244 each) cleanly inside the right frame (qx=1004, qy=274)
    fc = (
        f"[1:v]setpts=PTS/0.62,fps={FPS},scale=404:244:flags=lanczos[q1];"
        f"[2:v]setpts=PTS/0.62,fps={FPS},scale=404:244:flags=lanczos[q2];"
        f"[3:v]setpts=PTS/0.62,fps={FPS},scale=404:244:flags=lanczos[q3];"
        f"[4:v]setpts=PTS/0.62,fps={FPS},scale=404:244:flags=lanczos[q4];"
        f"[0:v][q1]overlay=1004:274:shortest=1[b1];"
        f"[b1][q2]overlay=1420:274:shortest=1[b2];"
        f"[b2][q3]overlay=1004:532:shortest=1[b3];"
        f"[b3][q4]overlay=1420:532:shortest=1,noise=alls=3:allf=t+u,fps={FPS},format=yuv420p[vout]"
    )
    cmd.extend([
        "-filter_complex", fc,
        "-map", "[vout]",
        "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-crf", "16", "-preset", "fast",
        "-pix_fmt", "yuv420p", "-r", str(FPS),
        str(out_mp4),
    ])
    run_ffmpeg(cmd, "bts_arch_quad")


def assemble_trailer_video(seg_files: list[Path], silent_master: Path) -> float:
    cmd = ["ffmpeg", "-y", "-loglevel", "warning"]
    actual_durs: list[float] = []
    for p in seg_files:
        cmd.extend(["-i", str(p)])
        actual_durs.append(probe_duration_sec(p))

    filters: list[str] = []
    running_dur = actual_durs[0]
    prev = "[0:v]"
    for idx in range(1, len(seg_files)):
        offset = round(max(0.1, running_dur - XFADE_SEC), 3)
        trans = "fadeblack" if idx in (1, len(seg_files) - 1) else "fade"
        out_l = f"[v{idx}]"
        filters.append(f"{prev}[{idx}:v]xfade=transition={trans}:duration={XFADE_SEC:.2f}:offset={offset:.3f}{out_l}")
        running_dur = offset + actual_durs[idx]
        prev = out_l

    escaped_ass = str(ASS_PATH).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
    filters.append(f"{prev}ass='{escaped_ass}',format=yuv420p[vfinal]")

    cmd.extend([
        "-filter_complex", ";".join(filters),
        "-map", "[vfinal]",
        "-c:v", "libx264", "-crf", "17", "-preset", "medium",
        "-pix_fmt", "yuv420p", "-r", str(FPS),
        str(silent_master),
    ])
    run_ffmpeg(cmd, "assemble_trailer_video")
    return probe_duration_sec(silent_master)


# ---------------------------------------------------------------------------
# V6 Trailer Audio Master (66.0s @ 48kHz, Two-Pass -14.0 LUFS, ZERO macOS say)
# ---------------------------------------------------------------------------

def read_wav_stereo_f32(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wf:
        ch, sw = wf.getnchannels(), wf.getsampwidth()
        raw = wf.readframes(wf.getnframes())
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return np.stack([data, data], axis=1) if ch == 1 else data.reshape(-1, ch)[:, :2]


def write_wav_stereo_i16(path: Path, stereo: np.ndarray) -> None:
    pcm = (np.clip(stereo, -0.98, 0.98) * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def apply_reverb(stereo: np.ndarray, wet: float = 0.30) -> np.ndarray:
    taps_l = [(int(0.031 * SAMPLE_RATE), 0.32), (int(0.071 * SAMPLE_RATE), 0.24), (int(0.131 * SAMPLE_RATE), 0.16)]
    taps_r = [(int(0.037 * SAMPLE_RATE), 0.32), (int(0.083 * SAMPLE_RATE), 0.24), (int(0.149 * SAMPLE_RATE), 0.16)]
    wl = np.zeros(stereo.shape[0], dtype=np.float32)
    wr = np.zeros(stereo.shape[0], dtype=np.float32)
    for d, g in taps_l:
        wl[d:] += stereo[:-d, 0] * g + stereo[:-d, 1] * (g * 0.28)
    for d, g in taps_r:
        wr[d:] += stereo[:-d, 1] * g + stereo[:-d, 0] * (g * 0.28)
    out = np.empty_like(stereo)
    out[:, 0] = stereo[:, 0] * (1.0 - wet * 0.35) + wl * wet
    out[:, 1] = stereo[:, 1] * (1.0 - wet * 0.35) + wr * wet
    return out


def build_trailer_soundtrack(final_wav: Path) -> dict[str, Any]:
    vo_out = OUT_DIR / "vo_master"
    vo_out.mkdir(parents=True, exist_ok=True)
    voice_bed = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    speech_env = np.zeros(NUM_SAMPLES, dtype=np.float32)

    for start_s, fname in TRAILER_VO_CUES:
        src = BTS_VO_DIR / fname
        if not src.exists():
            raise FileNotFoundError(f"Missing studio ZONOS3 BTS narration: {src}")
        mastered = vo_out / f"master_{fname}"
        af = (
            "highpass=f=68,"
            "equalizer=f=190:width_type=o:width=1.4:g=1.8,"
            "equalizer=f=3200:width_type=o:width=1.3:g=1.6,"
            "acompressor=threshold=-18dB:ratio=2.2:attack=12:release=140:makeup=2,"
            "aecho=0.88:0.86:22|46:0.09|0.04"
        )
        run_ffmpeg(
            ["ffmpeg", "-y", "-loglevel", "warning", "-i", str(src), "-af", af, "-ar", str(SAMPLE_RATE), "-ac", "2", "-c:a", "pcm_s16le", str(mastered)],
            f"bts_vo:{fname}",
        )
        clip = read_wav_stereo_f32(mastered)
        rms = float(np.sqrt(np.mean(clip ** 2))) + 1e-6
        clip = np.clip(clip * (0.15 / rms), -0.92, 0.92)
        s0 = int(round(start_s * SAMPLE_RATE))
        s1 = min(NUM_SAMPLES, s0 + clip.shape[0])
        usable = s1 - s0
        if usable > 0:
            fi = min(int(0.03 * SAMPLE_RATE), usable // 4)
            fo = min(int(0.08 * SAMPLE_RATE), usable // 4)
            clip[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
            clip[usable - fo:usable] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[:, None]
            voice_bed[s0:s1] += clip[:usable]
            pad = int(0.30 * SAMPLE_RATE)
            speech_env[max(0, s0 - pad):min(NUM_SAMPLES, s1 + pad)] = 1.0

    win = int(0.34 * SAMPLE_RATE)
    smooth_env = np.clip(np.convolve(speech_env, np.ones(win, dtype=np.float32) / float(win), mode="same"), 0.0, 1.0)

    # Original 4-voice chamber cello & ceramic bell score + kiln Foley + Kintsugi gold shimmer + ceramic crack cue
    rng = np.random.default_rng(20261217)
    t = np.arange(NUM_SAMPLES, dtype=np.float32) / float(SAMPLE_RATE)
    score = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)

    def bowed(length: int, freq: float, amp: float, vib_hz: float, warmth: float) -> np.ndarray:
        lt = np.arange(length, dtype=np.float32) / float(SAMPLE_RATE)
        dur = length / float(SAMPLE_RATE)
        env = (np.clip(lt / min(0.7, dur * 0.25), 0.0, 1.0) ** 1.3) * (np.clip((dur - lt) / min(1.0, dur * 0.3), 0.0, 1.0) ** 1.35)
        vib = 0.004 * np.clip((lt - 0.3) / 1.0, 0.0, 1.0) * np.sin(2.0 * math.pi * vib_hz * lt)
        phase = np.cumsum(2.0 * math.pi * freq * (1.0 + vib) / SAMPLE_RATE)
        sig = np.sin(phase) + 0.44 * warmth * np.sin(2.0 * phase + 0.14) + 0.22 * warmth * np.sin(3.0 * phase - 0.18) + 0.10 * warmth * np.sin(4.0 * phase)
        return (sig * env * amp).astype(np.float32)

    chords = [
        (0.0, 9.5, [73.42, 146.83, 220.00, 349.23], 0.22),
        (8.5, 10.5, [58.27, 116.54, 174.61, 293.66], 0.25),
        (18.0, 10.5, [65.41, 130.81, 196.00, 329.63], 0.28),
        (27.5, 11.2, [55.00, 110.00, 220.00, 349.23], 0.33),
        (38.0, 12.2, [73.42, 146.83, 220.00, 369.99], 0.34),  # Radiant D Major BTS I2V reveal!
        (49.4, 10.4, [98.00, 146.83, 246.94, 369.99], 0.30),
        (58.8, 7.2, [73.42, 146.83, 220.00, 293.66], 0.24),
    ]
    pans = [-0.28, 0.22, -0.34, 0.30]
    weights = [0.42, 0.30, 0.20, 0.14]
    for s_sec, d_sec, freqs, inten in chords:
        s0 = int(round(s_sec * SAMPLE_RATE))
        ln = min(int(round(d_sec * SAMPLE_RATE)), NUM_SAMPLES - s0)
        if ln <= 0:
            continue
        for idx, f in enumerate(freqs):
            v = bowed(ln, f, inten * weights[idx], 4.2 + idx * 0.4, 1.0 - idx * 0.14)
            score[s0:s0 + ln, 0] += v * math.sqrt(0.5 * (1.0 - pans[idx]))
            score[s0:s0 + ln, 1] += v * math.sqrt(0.5 * (1.0 + pans[idx]))

    # Kintsugi pentatonic gold shimmer cues synced to Act IV drag (23-31s) + structural chimes
    chimes = [
        (0.5, 293.66, -0.2, 0.15), (2.5, 440.00, 0.2, 0.14),
        (19.7, 523.25, 0.25, 0.16), (23.2, 587.33, -0.2, 0.12),
        (25.2, 739.99, 0.18, 0.12), (27.4, 880.00, -0.15, 0.13),
        (30.0, 1174.66, 0.12, 0.14), (33.5, 587.33, 0.0, 0.18),  # Relic reveal bronze chime!
        (38.5, 739.99, -0.22, 0.20), (44.3, 880.00, 0.22, 0.17),
        (50.1, 587.33, -0.18, 0.18), (60.0, 440.00, 0.0, 0.18),
    ]
    for onset_s, freq, pan, amp in chimes:
        s0 = int(round(onset_s * SAMPLE_RATE))
        ln = min(int(3.4 * SAMPLE_RATE), NUM_SAMPLES - s0)
        if ln <= 0:
            continue
        lt = np.arange(ln, dtype=np.float32) / float(SAMPLE_RATE)
        tone = (np.sin(2.0 * math.pi * freq * lt) + 0.18 * np.exp(-lt * 4.0) * np.sin(2.0 * math.pi * freq * 2.756 * lt))
        tone = tone * np.clip(lt / 0.012, 0.0, 1.0) * np.exp(-lt * 1.2) * amp
        score[s0:s0 + ln, 0] += tone * math.sqrt(0.5 * (1.0 - pan))
        score[s0:s0 + ln, 1] += tone * math.sqrt(0.5 * (1.0 + pan))

    # Wood-kiln hearth rumble & ember crackles + crisp stoneware snap entering BTS I2V reveal (38.3s)
    white = rng.standard_normal(NUM_SAMPLES).astype(np.float32)
    spec = np.fft.rfft(white)
    ff = np.fft.rfftfreq(NUM_SAMPLES, 1.0 / SAMPLE_RATE)
    rumble = np.fft.irfft(spec * np.exp(-((ff / 148.0) ** 2)) * (ff >= 28.0), n=NUM_SAMPLES).astype(np.float32)
    rumble /= max(1e-5, float(np.max(np.abs(rumble))))
    fade_arc = np.clip(t / 2.0, 0.0, 1.0) * np.clip((DURATION_SEC - t) / 2.5, 0.0, 1.0)
    fire_boost = np.clip((t - 19.5) / 2.5, 0.0, 1.0) * np.clip((45.5 - t) / 3.0, 0.0, 1.0)
    foley_gain = (0.036 + 0.085 * fire_boost) * fade_arc

    crackle = np.zeros((NUM_SAMPLES, 2), dtype=np.float32)
    for pt in rng.uniform(0.8, DURATION_SEC - 2.0, size=290):
        s0 = int(pt * SAMPLE_RATE)
        plen = int(0.013 * SAMPLE_RATE)
        if s0 + plen >= NUM_SAMPLES:
            continue
        lt = np.arange(plen, dtype=np.float32) / float(SAMPLE_RATE)
        pop = np.sin(2.0 * math.pi * float(rng.uniform(1700.0, 4200.0)) * lt) * np.exp(-lt * 300.0) * float(rng.uniform(0.03, 0.095))
        if 19.5 <= pt <= 45.0:
            pop *= 1.75
        pan = float(rng.uniform(-0.6, 0.6))
        crackle[s0:s0 + plen, 0] += pop * (0.5 * (1.0 - pan))
        crackle[s0:s0 + plen, 1] += pop * (0.5 * (1.0 + pan))

    # Crisp stoneware crack Foley accent at 38.35s right on transition into BTS I2V reveal
    cs0 = int(round(38.35 * SAMPLE_RATE))
    clen = int(0.32 * SAMPLE_RATE)
    lt_c = np.arange(clen, dtype=np.float32) / float(SAMPLE_RATE)
    snap = (
        np.sin(2.0 * math.pi * 2840.0 * lt_c) * np.exp(-lt_c * 34.0) * 0.16
        + np.sin(2.0 * math.pi * 4520.0 * lt_c) * np.exp(-lt_c * 46.0) * 0.10
        + np.sin(2.0 * math.pi * 215.0 * lt_c) * np.exp(-lt_c * 18.0) * 0.18
    )
    crackle[cs0:cs0 + clen, 0] += snap
    crackle[cs0:cs0 + clen, 1] += snap

    foley = np.stack([rumble * foley_gain, rumble * foley_gain * 0.96], axis=1) + crackle
    music_bed = apply_reverb(score, wet=0.32) + foley

    premix = music_bed * (1.0 - 0.46 * smooth_env[:, None]) + voice_bed
    fi = int(0.7 * SAMPLE_RATE)
    fo = int(2.0 * SAMPLE_RATE)
    premix[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    premix[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)[:, None]
    peak = float(np.max(np.abs(premix)))
    if peak > 0.92:
        premix *= 0.90 / peak

    raw_wav = OUT_DIR / "trailer_premix_v6.wav"
    write_wav_stereo_i16(raw_wav, premix)

    # Two-pass exact -14.0 LUFS mastering (logs to disk)
    p1_log = OUT_DIR / "logs" / "trailer_loudnorm_p1.log"
    p1_log.parent.mkdir(parents=True, exist_ok=True)
    with open(p1_log, "w", encoding="utf-8") as lf:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw_wav), "-af", "loudnorm=I=-14.0:TP=-1.2:LRA=8:print_format=json", "-f", "null", "-"],
            stdout=lf, stderr=lf, stdin=subprocess.DEVNULL, check=True,
        )
    txt = p1_log.read_text(encoding="utf-8", errors="replace")
    measured = json.loads(txt[txt.rfind("{"):txt.rfind("}") + 1])

    ln = (
        f"loudnorm=I=-14.0:TP=-1.2:LRA=8:"
        f"measured_I={measured['input_i']}:measured_LRA={measured['input_lra']}:"
        f"measured_TP={measured['input_tp']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}:linear=true"
    )
    run_ffmpeg(
        ["ffmpeg", "-y", "-loglevel", "warning", "-i", str(raw_wav), "-af", ln, "-ar", str(SAMPLE_RATE), "-ac", "2", "-c:a", "pcm_s16le", str(final_wav)],
        "trailer_loudnorm_p2",
    )

    v_log = OUT_DIR / "logs" / "trailer_loudnorm_verify.log"
    with open(v_log, "w", encoding="utf-8") as lf:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(final_wav), "-af", "loudnorm=I=-14.0:TP=-1.2:LRA=8:print_format=json", "-f", "null", "-"],
            stdout=lf, stderr=lf, stdin=subprocess.DEVNULL, check=True,
        )
    vt = v_log.read_text(encoding="utf-8", errors="replace")
    return json.loads(vt[vt.rfind("{"):vt.rfind("}") + 1])


def extract_qa_frames(mp4_path: Path) -> list[Path]:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for name, ts in QA_SAMPLES:
        out_png = QA_DIR / f"{name}.png"
        run_ffmpeg(
            ["ffmpeg", "-y", "-loglevel", "warning", "-ss", f"{ts:.2f}", "-i", str(mp4_path), "-frames:v", "1", "-update", "1", str(out_png)],
            f"qa:{name}",
        )
        saved.append(out_png)

    # Build two high-res contact sheets covering all 9 QA frames
    for sheet_name, batch in [("v6_bts_sheet_1_5.png", saved[:5]), ("v6_bts_sheet_6_9.png", saved[5:])]:
        tw, th, pad = 960, 540, 10
        rows = (len(batch) + 1) // 2
        sheet = Image.new("RGB", (tw * 2 + pad * 3, th * rows + pad * (rows + 1)), (10, 8, 7))
        draw = ImageDraw.Draw(sheet)
        for idx, fp in enumerate(batch):
            im = Image.open(fp).convert("RGB").resize((tw, th), Image.Resampling.LANCZOS)
            x = pad + (idx % 2) * (tw + pad)
            y = pad + (idx // 2) * (th + pad)
            sheet.paste(im, (x, y))
            draw.rectangle([x + 8, y + 8, x + 310, y + 32], fill=(10, 8, 7))
            draw.text((x + 14, y + 13), fp.stem, fill=(247, 221, 160))
        sheet.save(QA_DIR / sheet_name)
    return saved


def main() -> None:
    t0 = time.time()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "logs").mkdir(parents=True, exist_ok=True)
    if LOG_PATH.exists():
        LOG_PATH.unlink()

    part1_mp4 = OUT_DIR / "gameplay_part1_acts1_3.mp4"
    part2_mp4 = OUT_DIR / "gameplay_part2_kintsugi_relic.mp4"
    if not part1_mp4.exists() or not part2_mp4.exists():
        raise FileNotFoundError(f"Missing live Playwright 1080p gameplay captures in {OUT_DIR}. Run capture_gameplay_video.mjs first.")

    print(f"[v6-bts] Target: {FINAL_MP4} (1920x1080 @ 24fps, 2.39:1, {DURATION_SEC:.1f}s)", flush=True)
    write_subtitles()

    # 1. Generate crisp editorial cards & backdrops
    title_png = OUT_DIR / "seg00_title.png"
    close_png = OUT_DIR / "seg06_closing.png"
    split_fire_png = OUT_DIR / "seg03_split_fire.png"
    split_pour_png = OUT_DIR / "seg04_split_pour.png"
    arch_png = OUT_DIR / "seg05_arch.png"

    create_title_or_closing_card("title", title_png)
    create_title_or_closing_card("closing", close_png)
    create_bts_split_backdrop(
        "SHOT 05 · 1100°C TUNNEL KILN FIRE",
        "05_kiln_fire.png",
        "shot_05.mp4 (LTX-VIDEO-0.9.5 · 81 FRAMES)",
        split_fire_png,
    )
    create_bts_split_backdrop(
        "SHOT 04 · MOLTEN CINNABAR & GOLD POUR",
        "04_molten_glaze_pour.png",
        "shot_04.mp4 (LTX-VIDEO-0.9.5 · 81 FRAMES)",
        split_pour_png,
    )
    create_bts_arch_deck_backdrop(arch_png)

    # 2. Render all 7 segments
    seg_files: list[Path] = []

    s0 = OUT_DIR / "seg00_title.mp4"
    render_static_card_video(title_png, SEG_DURATIONS["seg00_title"], s0, fade_in=True)
    seg_files.append(s0)

    s1 = OUT_DIR / "seg01_game_acts1_3.mp4"
    render_gameplay_segment(part1_mp4, SEG_DURATIONS["seg01_game_acts1_3"], "LIVE 1080P GAMEPLAY · ACTS I–III · GLAZE & THERMAL PHYSICS", s1)
    seg_files.append(s1)

    s2 = OUT_DIR / "seg02_game_kintsugi.mp4"
    render_gameplay_segment(part2_mp4, SEG_DURATIONS["seg02_game_kintsugi"], "LIVE 1080P GAMEPLAY · ACT IV MOUSE KINTSUGI & RELIC CARD", s2)
    seg_files.append(s2)

    s3 = OUT_DIR / "seg03_bts_i2v_fire.mp4"
    render_bts_split_segment(split_fire_png, I2V_CLIPS_DIR / "shot_05.mp4", SEG_DURATIONS["seg03_bts_i2v_fire"], s3)
    seg_files.append(s3)

    s4 = OUT_DIR / "seg04_bts_i2v_pour.mp4"
    render_bts_split_segment(split_pour_png, I2V_CLIPS_DIR / "shot_04.mp4", SEG_DURATIONS["seg04_bts_i2v_pour"], s4)
    seg_files.append(s4)

    s5 = OUT_DIR / "seg05_bts_arch_deck.mp4"
    render_bts_arch_quad_segment(arch_png, SEG_DURATIONS["seg05_bts_arch_deck"], s5)
    seg_files.append(s5)

    s6 = OUT_DIR / "seg06_closing.mp4"
    render_static_card_video(close_png, SEG_DURATIONS["seg06_closing"], s6, fade_out=True)
    seg_files.append(s6)

    # 3. Assemble seamless dissolved widescreen master + burn bottom-bar Georgia subtitles
    silent_master = OUT_DIR / "trailer_video_master_v6.mp4"
    print("[v6-bts] Assembling 7-segment 2.39:1 Game + BTS video master + bottom-bar Georgia subtitles...", flush=True)
    vid_dur = assemble_trailer_video(seg_files, silent_master)

    # 4. Master 66.0s -14 LUFS soundtrack from 3 real ZONOS3-Mini WAVs + chamber score + kiln Foley
    audio_wav = OUT_DIR / "trailer_soundtrack_v6_14lufs.wav"
    print("[v6-bts] Mastering 66.0s ZONOS3-Mini + chamber cello + kiln Foley soundtrack (-14 LUFS)...", flush=True)
    audio_stats = build_trailer_soundtrack(audio_wav)

    # 5. Final mux -> materials/The_Last_Kiln_Game_and_BTS_Trailer_1080p.mp4
    FINAL_MP4.parent.mkdir(parents=True, exist_ok=True)
    run_ffmpeg(
        [
            "ffmpeg", "-y", "-loglevel", "warning",
            "-i", str(silent_master),
            "-i", str(audio_wav),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "256k", "-ar", str(SAMPLE_RATE),
            "-shortest", "-movflags", "+faststart",
            str(FINAL_MP4),
        ],
        "final_mux_trailer",
    )

    # 6. Extract 9 QA frames across every beat
    qa_frames = extract_qa_frames(FINAL_MP4)
    size_mb = FINAL_MP4.stat().st_size / (1024 * 1024)
    print(
        f"[v6-bts] DONE in {time.time() - t0:.1f}s -> {FINAL_MP4.name} "
        f"({size_mb:.2f} MB, {vid_dur:.2f}s, {audio_stats['input_i']} LUFS, {audio_stats['input_tp']} dBTP, {len(qa_frames)} QA frames)",
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[v6-bts] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
