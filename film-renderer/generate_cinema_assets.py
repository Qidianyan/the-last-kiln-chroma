#!/usr/bin/env python3
"""Generate 8 high-resolution cinema oil-painting storyboard plates via elidot-media-hub
(gemini-3.1-flash-image-landscape) and sync the 4 core hero scenes into the playable web game."""

from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ART_DIR = ROOT / "art"
GAME_ART_DIR = ROOT.parent / "game" / "public" / "art"

BASE_URL = os.environ.get("MEDIA_API_BASE_URL", "http://100.105.95.126:7864/v1").rstrip("/")
API_KEY = os.environ.get("MEDIA_API_KEY", "")

STYLE_GUIDE = (
    "Studio Ghibli meets Love Death and Robots and Dunhuang mineral pigment oil painting on linen, "
    "cinematic 2.39:1 anamorphic feature film still, rich impasto brushwork, atmospheric depth, "
    "dramatic warm chiaroscuro lighting, museum-grade concept art. "
    "STRICT COLOR PALETTE: kiln obsidian (#171210), warm ash parchment (#F2E8DA), molten ember orange (#E65A28), "
    "kiln gold (#DBA13C), red cinnabar (#C74325), charred olive moss (#4A5D3F), bone ceramic (#FBF7F0). "
    "ABSOLUTELY ZERO blue, cyan, teal, indigo, violet, or purple anywhere in the sky or shadows. "
    "ZERO text, ZERO typography, ZERO watermark, ZERO frame borders."
)

PLATES = [
    (
        "01_ember_valley.png",
        "Panoramic establishing shot of Ember Valley at golden-umber dusk after the great smelters fell silent: "
        "sweeping dry terraced hillsides dotted with gnarled charred-olive trees, crumbling ancient terracotta aqueduct arches "
        "spanning a parched ochre riverbed, and on a solitary upper ridge a centuries-old brick tunnel kiln exhaling a thin "
        "graceful curl of warm ash smoke toward a hazy parchment-amber twilight sky with drifting glowing embers.",
    ),
    (
        "02_hearth_apprentice.png",
        "Cinematic medium over-the-shoulder shot inside a centuries-old arched brick tunnel kiln workshop at dusk: "
        "a young potter apprentice seen from behind in weathered unbleached linen robes, gently cradling a raw pale bone-ceramic "
        "amphora toward the glowing molten-amber mouth of the brick furnace, floating pine ash motes illuminated by volumetric "
        "warm orange firelight across soot-darkened terracotta brickwork.",
    ),
    (
        "03_glaze_table.png",
        "Cinematic low-angle macro still life of an ancient cedar potter workbench lit by warm oil lantern light: "
        "four hand-thrown dark stoneware mortars arranged gracefully in depth holding matte pale pine wood ash, "
        "golden-brown river ochre pigment, vivid crushed red cinnabar mineral powder, and delicate luminous sheets of "
        "hammered 24k gold leaf resting inside Master Orin's open dark wooden lacquer box beside an unglazed damp clay amphora on a throwing wheel.",
    ),
    (
        "04_molten_glaze_pour.png",
        "Dramatic slow-motion close-up of thick glossy molten cinnabar-vermilion and honeyed river-ochre mineral glaze "
        "pouring in a rich luminous ribbon from a dark stoneware ladle over the spinning curved shoulder of a hand-thrown terracotta amphora, "
        "tiny flecks of hammered gold leaf swirling inside the dripping wet slip, warm specular highlights against deep smoked obsidian studio shadows.",
    ),
    (
        "05_kiln_fire.png",
        "Breathtaking cinematic view looking straight through the arched masonry brick mouth of a roaring wood-fired tunnel kiln "
        "at 1100 degrees Celsius: a glazed cinnabar-and-ochre stoneware amphora standing heroically on a firebrick sagger pedestal "
        "engulfed in swirling molten amber flame curtains, incandescent white-gold heat waves, and spiraling cedar sparks against deeply charred obsidian brick walls.",
    ),
    (
        "06_fracture_gold_crack.png",
        "Intense dramatic cinematic macro close-up of a glowing incandescent dark-cinnabar stoneware amphora inside a blazing 1100 degree kiln chamber "
        "as a sharp lightning-like thermal stress fracture splits diagonally across its curved shoulder, blindingly luminous liquid 24k gold "
        "flowing and glowing from inside the crack while molten orange embers drift through shallow depth of field.",
    ),
    (
        "07_kintsugi_dawn.png",
        "Transcendent cinematic hero shot at first pale amber dawn: the finished charred-terracotta and smoked-cinnabar stoneware amphora "
        "rests outside the cooling arched brick kiln on a weathered cedar pedestal, every fracture sealed with luminous raised kintsugi veins "
        "of hammered 24k gold radiating warm sunrise beams through gently drifting pale ash dust against a warm bone-parchment morning sky.",
    ),
    (
        "08_olive_shoots_ash.png",
        "Poetic closing widescreen cinematic macro shot at warm apricot sunrise: tender fresh green olive shoots unfurling vibrantly "
        "out of dark warm kiln ash beside a glowing gold-rimmed glazed terracotta shard on an ancient stone terrace overlooking Ember Valley "
        "bathed in soft morning gold mist and warm parchment sunlight.",
    ),
]

GAME_ART_MAP = {
    "02_hearth_apprentice.png": "hearth_scene.png",
    "03_glaze_table.png": "glaze_table.png",
    "05_kiln_fire.png": "kiln_fire.png",
    "07_kintsugi_dawn.png": "kintsugi_dawn.png",
}


def fetch_image(filename: str, prompt: str) -> tuple[str, int, str]:
    out_path = ART_DIR / filename
    payload = {
        "model": "gemini-3.1-flash-image-landscape",
        "prompt": f"{prompt} {STYLE_GUIDE}",
        "n": 1,
        "response_format": "b64_json",
    }
    req = urllib.request.Request(
        f"{BASE_URL}/images/generations",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        err_text = err.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"{filename}: HTTP {err.code} {err_text}") from err

    item = body["data"][0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        img_url = item["url"]
        if img_url.startswith("/"):
            host = BASE_URL.rsplit("/v1", 1)[0]
            img_url = f"{host}{img_url}"
        with urllib.request.urlopen(
            urllib.request.Request(img_url, headers={"Authorization": f"Bearer {API_KEY}"}),
            timeout=90,
        ) as dl:
            raw = dl.read()
    else:
        raise RuntimeError(f"{filename}: unexpected response keys {list(item.keys())}")

    out_path.write_bytes(raw)
    return filename, len(raw), body.get("model", "gemini-3.1-flash-image-landscape")


def main() -> None:
    if not API_KEY:
        raise RuntimeError("MEDIA_API_KEY not set. Source ~/.secrets/media_api.env first.")
    ART_DIR.mkdir(parents=True, exist_ok=True)
    GAME_ART_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[art] Generating {len(PLATES)} cinema oil-painting plates via {BASE_URL} (gemini-3.1-flash-image-landscape)...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fetch_image, fn, pr) for fn, pr in PLATES]
        for fut in concurrent.futures.as_completed(futures):
            fn, size, model = fut.result()
            print(f"[art] OK {fn} ({size // 1024} KB) via {model}")

    for src_name, dst_name in GAME_ART_MAP.items():
        shutil.copy2(ART_DIR / src_name, GAME_ART_DIR / dst_name)
        print(f"[art] Synced game plate -> {GAME_ART_DIR / dst_name}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[art] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
