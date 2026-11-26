# The Last Kiln of Ember Valley

An original unified IP created for **The Chroma Awards Season 2** spanning all three core divisions:
- **Film & TV Division (*Animation & Anime / Experimental*)** — 85.0-second 2.39:1 `1920×1080 @ 24fps` living oil-painting animated short (`film-renderer/render_v5_i2v_film.py`) edited from **8 real GPU `Lightricks/LTX-Video-0.9.5` AI Image-to-Video shots** (`648` real AI frames), mastered with a **5-track `-14.09 LUFS` cinema soundscape** (`Zyphra ZONOS3-Mini` studio narration, 4-voice chamber cello/viola score, shot-aligned ceramic & `56.2s` thermal fracture Foley, `1300°C` sub-bass bed, and bottom-bar Georgia serif subtitles).
- **Game Division (*Interactive Narrative*)** — Playable 5-act browser fable (`game/`) combining real `600°C–1300°C` ceramic blackbody thermal shaders, mineral glaze alchemy, **interactive Act IV mouse/touch/keyboard Kintsugi gold-seam repair (`src/kintsugi.ts`)**, **zero-dependency WebAudio procedural kiln Foley (`src/audio/kilnFoley.ts`)**, bundled studio `ZONOS3-Mini` narrations, and downloadable `1000×1400` Collectible Ceramic Relic Card PNGs with unique Kintsugi signatures.
- **Behind-The-Scenes Division** — 65.9-second `1080p` Game & BTS Master Trailer (`film-renderer/render_v6_bts_trailer.py`) uniting native `1920×1080` live Playwright gameplay captures, real side-by-side Static Oil Keyframe vs. `LTX-Video-0.9.5` I2V comparisons, and a live 2×2 AI I2V quad monitor beside the 5-track audio & engineering architecture deck.

## Repository Structure

```text
code/last-kiln/
├── game/                          # Playable React 19 + TypeScript + Vite 6 interactive narrative game
│   ├── dist/                      # Production static bundle (ready for GitHub Pages / itch.io / Vercel)
│   ├── public/art/                # 4 impasto oil hero plates (hearth, glaze table, kiln fire, kintsugi dawn)
│   ├── public/audio/              # 4 studio Zyphra ZONOS3-Mini English narration MP3 tracks
│   ├── scripts/                   # Headless Chromium Playwright E2E playthrough & real mouse drag verifier
│   └── src/
│       ├── audio/kilnFoley.ts     # Pure WebAudio procedural kiln bellows, flue, glaze, crack & gold shimmer Foley
│       ├── kintsugi.ts            # 1300°C ceramic blackbody curve & interactive Kintsugi fracture repair engine
│       ├── components/            # Accessible native <dialog> archive, chapter drawer, interactive canvas stage
│       ├── data/                  # Original 5-act English script & 16-cue ElevenLabs expansion manifest
│       ├── engine/                # Kiln thermal physics, glaze blender, Canvas2D VFX, audio engine, 21 Vitest tests
│       └── styles/                # Tokenized 2.39:1 dark-obsidian & kiln-amber CSS (sloplint 0 FAIL / 0 WARN)
└── film-renderer/                 # Reproducible AI I2V, 85.0s short film & 65.9s Game/BTS trailer pipeline
    ├── art/                       # 8 bespoke 4K impasto oil-on-linen concept plates (01..08)
    ├── generate_i2v_colab.py      # Colab GPU Lightricks/LTX-Video-0.9.5 8-shot I2V batch generator + auto-stop
    ├── render_v5_i2v_film.py      # 85.0s 2.39:1 living AI oil short film + 5-track -14.09 LUFS master + .srt
    ├── capture_gameplay_video.mjs # Native 1920x1080 headless Chromium live gameplay capture (incl. Act IV drag)
    └── render_v6_bts_trailer.py   # 65.9s Game + BTS dual-division trailer + live I2V split-screen + -14.10 LUFS + .srt
```

## Quick Start (Playable Web Game)

```bash
cd game
pnpm install                # or npm install
npm run dev                 # Launch interactive dev server
npm test                    # Run 21 Vitest tests (physics, 16 glazes, 4 endings, blackbody, Kintsugi, WebAudio Foley)
npx tsc --noEmit            # Strict TypeScript check
npm run build               # Production static bundle in game/dist/
npm run verify:playthrough  # Headless Chromium full 5-act playthrough, live mouse Kintsugi drag & screenshot capture
```

## Rendering Both 1080p Cinema Masters

Prerequisites: Node.js 22+, Python 3.11+ (`numpy`, `pillow`), FFmpeg (with `libx264`, `aac`, `libass`, `libfreetype`), and local Chromium.

```bash
cd film-renderer
pnpm install

# 1. Generate 8 real AI Image-to-Video clips via Lightricks/LTX-Video-0.9.5 (Colab GPU with automatic stop)
python3 generate_i2v_colab.py

# 2. Render 85.0s 2.39:1 Animated Short Film + 5-track -14.09 LUFS soundtrack + bottom-bar Georgia subtitles + .srt
python3 render_v5_i2v_film.py

# 3. Capture native 1920x1080 live gameplay & render 65.9s Game + BTS Master Trailer + .srt
node capture_gameplay_video.mjs
python3 render_v6_bts_trailer.py
```

## Chromatic Constitution

Every oil plate, AI I2V prompt, 1300°C blackbody thermal curve, mineral glaze blend, and CSS token strictly honors our **Fired Terracotta, Molten Amber & Ash-Ink** palette (`#0E0B09`, `#F2E8DA`, `#FBF7F0`, `#E65A28`, `#C74325`, `#DBA13C`, `#4A5D3F`) with zero cool blue, cyan, teal, or purple channels.

## License

Released under the [MIT License](./LICENSE).
