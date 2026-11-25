# The Last Kiln of Ember Valley

An original unified IP created for **The Chroma Awards Season 2** spanning all three core divisions:
- **Game Division (*Interactive Narrative*)** — Playable browser fable (`game/`) combining real `600°C–1300°C` kiln thermal physics, four valley mineral glazes, impasto oil-painting Canvas2D shader stages, studio neural voice narration (`Zyphra ZONOS3-Mini`), procedural WebAudio chamber cello & kiln Foley, and downloadable `1000×1400` Ceramic Relic Card PNGs.
- **Film & TV Division (*Animation & Anime / Experimental*)** — Deterministic 84-second 2.39:1 `1920×1080 @ 24fps` animated short film (`film-renderer/`) compositing 8 impasto oil-on-linen concept plates with 2.5D camera choreography, volumetric ember/firelight VFX, studio neural voiceover, and an original 4-voice chamber cello score mastered at `-14 LUFS`.
- **Behind-The-Scenes Division** — Dedicated 66-second `1080p` Game & BTS Trailer capturing live interactive Playwright playthroughs alongside our 8-plate oil storyboard & multi-track audio breakdown.

## Repository Structure

```text
code/last-kiln/
├── game/                   # Playable React 19 + TypeScript + Vite interactive narrative game
│   ├── public/art/         # 4 impasto oil hero plates (hearth, glaze table, kiln fire, kintsugi dawn)
│   ├── public/audio/       # 4 studio Zyphra ZONOS3-Mini English narration MP3 tracks
│   ├── scripts/            # Headless Chromium Playwright E2E playthrough & screenshot verifier
│   └── src/
│       ├── components/     # Accessible native <dialog> archive, chapter drawer, HUD overlay
│       ├── data/           # Original 5-act English script & 16-cue ElevenLabs expansion manifest
│       ├── engine/         # Kiln thermal physics, glaze blender, oil-plate Canvas2D VFX, WebAudio
│       └── styles/         # Tokenized 2.39:1 dark-obsidian & kiln-amber CSS (sloplint 0 FAIL)
└── film-renderer/          # Deterministic 1080p 24fps short film & Game/BTS trailer pipeline
    ├── art/                # 8 impasto oil-on-linen storyboard plates (01..08)
    ├── build_audio.py      # 84s short film audio master (ZONOS3 WAVs + 4-part cello + kiln Foley)
    ├── build_trailer_audio.py  # 66s Game & BTS trailer audio master (-14 LUFS)
    ├── capture_gameplay_video.mjs # Live Playwright gameplay capture for the BTS trailer
    ├── film-engine.js      # 84s 2.39:1 film compositor
    ├── render_film.mjs     # Headless Chromium -> FFmpeg H.264 yuv420p short film encoder
    └── render_trailer.mjs  # 66s Game & BTS trailer compositor + SRT burn-in
```

## Quick Start (Playable Web Game)

```bash
cd game
pnpm install          # or npm install
npm run dev           # Launch interactive dev server
npm test              # Run Vitest suite (physics, 16 warm glazes, 4 endings, manifest)
npx tsc --noEmit      # Strict TypeScript check
npm run build         # Production static bundle in game/dist/
npm run verify:playthrough  # Headless Chromium full 5-act playthrough & 4 screenshot captures
```

## Rendering the 1080p Short Film & Game/BTS Trailer

Prerequisites: Node.js 22+, Python 3.11+ (`numpy`), FFmpeg (with `libx264`, `aac`, `libass`), and local Chromium.

```bash
cd film-renderer
pnpm install

# 84s Animated Short Film + bottom-bar burned subtitles + .srt
python3 build_audio.py
node render_film.mjs

# 66s Game & Behind-The-Scenes Trailer + .srt
python3 build_trailer_audio.py
node capture_gameplay_video.mjs
node render_trailer.mjs
```

## Color Constitution

Every asset, shader, and CSS token honors our **Fired Terracotta, Molten Amber & Ash-Ink** palette (`#0E0B09`, `#F2E8DA`, `#FBF7F0`, `#E65A28`, `#C74325`, `#DBA13C`, `#4A5D3F`) with zero cool blue, cyan, teal, or purple channels.

## License

Released under the [MIT License](./LICENSE).
