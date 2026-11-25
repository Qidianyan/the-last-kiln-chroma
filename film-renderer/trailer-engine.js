/* V3 Game & Behind-The-Scenes Trailer Compositor (1920x1080 @ 24fps, 2.39:1 obsidian cinema framing)
 * Renders:
 *   - Intro segment (0..3.2s): Opening cinema title over 02_hearth_apprentice.png
 *   - BTS + Outro segment (0..27.8s):
 *       0..9.0s:   8 Impasto Oil Storyboard Plates Gallery with golden spotlight progression
 *       9.0..16.5s: Multi-Track Production & Audio Pipeline Breakdown (ZONOS3 + 4-part Cello + Physics)
 *       16.5..21.5s: Unified Dual-Category Showcase (Film Dawn Plate + Playable Relic Card)
 *       21.5..27.8s: Chroma Awards Season 2 Three-Division Closing Card over Olive Shoots Dawn
 * Bottom 138px obsidian bar stays 100% clean for FFmpeg libass .srt subtitle burn-in!
 */

(function () {
  const W = 1920;
  const H = 1080;
  const BAR_H = 138;
  const ACTIVE_H = H - BAR_H * 2; // 804px

  const canvas = document.getElementById('trailer-canvas');
  const ctx = canvas.getContext('2d');

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const ASSETS = [
    './art/01_ember_valley.png',
    './art/02_hearth_apprentice.png',
    './art/03_glaze_table.png',
    './art/04_molten_glaze_pour.png',
    './art/05_kiln_fire.png',
    './art/06_fracture_gold_crack.png',
    './art/07_kintsugi_dawn.png',
    './art/08_olive_shoots_ash.png',
    './materials/game_shot_04_relic_ending.png',
  ];

  const PLATE_LABELS = [
    '01 · Ember Valley Dusk',
    '02 · The Cooling Hearth',
    '03 · Four Mineral Mortars',
    '04 · Molten Cinnabar Pour',
    '05 · 1100°C Tunnel Kiln',
    '06 · Midnight Gold Fracture',
    '07 · Kintsugi Dawn Hero',
    '08 · Olive Shoots in Ash',
  ];

  const images = new Map();

  // Deterministic warm ember particles
  const EMBERS = [];
  (function initEmbers() {
    const rng = seededRandom(20261217);
    for (let i = 0; i < 110; i += 1) {
      EMBERS.push({
        x0: rng(),
        y0: rng(),
        vx: (rng() - 0.5) * 0.03,
        vy: 0.04 + rng() * 0.11,
        size: 1.5 + rng() * 3.8,
        phase: rng() * Math.PI * 2,
        isGold: rng() > 0.55,
      });
    }
  })();

  window.preloadTrailerAssets = async function preloadTrailerAssets() {
    await Promise.all(
      ASSETS.map(
        (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              images.set(src, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load trailer asset: ${src}`));
            img.src = src;
          }),
      ),
    );
    return images.size;
  };

  function drawCoverRect(img, rx, ry, rw, rh, scale = 1.0, panX = 0, panY = 0) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();

    const ia = img.naturalWidth / Math.max(1, img.naturalHeight);
    const ra = rw / Math.max(1, rh);
    let dw = rw;
    let dh = rh;
    if (ia > ra) {
      dh = rh;
      dw = rh * ia;
    } else {
      dw = rw;
      dh = rw / ia;
    }
    dw *= scale;
    dh *= scale;
    const dx = rx + (rw - dw) * 0.5 + panX;
    const dy = ry + (rh - dh) * 0.5 + panY;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawEmbers(t, intensity) {
    ctx.save();
    for (let i = 0; i < EMBERS.length; i += 1) {
      const p = EMBERS[i];
      const y = ((p.y0 - t * p.vy * (0.6 + intensity * 0.6)) % 1 + 1) % 1;
      const x = ((p.x0 + t * p.vx + Math.sin(t * 1.1 + p.phase + y * 5) * 0.02) % 1 + 1) % 1;
      const py = BAR_H + y * ACTIVE_H;
      const px = x * W;
      const alpha = Math.sin(y * Math.PI) * 0.72 * intensity;
      if (alpha <= 0.02) continue;
      ctx.fillStyle = p.isGold
        ? `rgba(247, 221, 160, ${alpha.toFixed(3)})`
        : `rgba(230, 90, 40, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLetterboxFrame(topLabel, fadeDark) {
    // 2.39:1 obsidian letterbox bars
    ctx.fillStyle = '#0F0B09';
    ctx.fillRect(0, 0, W, BAR_H);
    ctx.fillRect(0, H - BAR_H, W, BAR_H);

    // Antique gold cinema matte trim lines
    ctx.strokeStyle = 'rgba(219, 161, 60, 0.36)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, BAR_H);
    ctx.lineTo(W, BAR_H);
    ctx.moveTo(0, H - BAR_H);
    ctx.lineTo(W, H - BAR_H);
    ctx.stroke();

    if (topLabel) {
      ctx.save();
      ctx.fillStyle = '#DBA13C';
      ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('THE LAST KILN OF EMBER VALLEY', 74, BAR_H * 0.5);

      ctx.fillStyle = '#C8BBA8';
      ctx.textAlign = 'right';
      ctx.fillText(topLabel, W - 74, BAR_H * 0.5);
      ctx.restore();
    }

    if (fadeDark > 0.005) {
      ctx.fillStyle = `rgba(14, 10, 8, ${clamp01(fadeDark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  window.renderIntroFrame = function renderIntroFrame(localT, dur) {
    ctx.fillStyle = '#0F0B09';
    ctx.fillRect(0, 0, W, H);

    const img = images.get('./art/02_hearth_apprentice.png');
    const zoom = lerp(1.04, 1.14, smoothstep(0, dur, localT));
    drawCoverRect(img, 0, BAR_H, W, ACTIVE_H, zoom, 0, 0);

    // Warm obsidian scrim for crisp theatrical title readability
    ctx.fillStyle = 'rgba(15, 11, 9, 0.54)';
    ctx.fillRect(0, BAR_H, W, ACTIVE_H);

    drawEmbers(localT, 0.8);

    const textIn = smoothstep(0.15, 0.9, localT);
    ctx.save();
    ctx.globalAlpha = textIn;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('CHROMA AWARDS SEASON 2  ·  GAMES & BEHIND-THE-SCENES SHOWCASE', W / 2, H * 0.41);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = '600 74px Baskerville, Palatino, Georgia, serif';
    ctx.shadowColor = 'rgba(10, 7, 5, 0.9)';
    ctx.shadowBlur = 22;
    ctx.fillText('THE LAST KILN OF EMBER VALLEY', W / 2, H * 0.50);

    ctx.shadowBlur = 0;
    const ruleW = 340 * smoothstep(0.3, 1.4, localT);
    ctx.strokeStyle = 'rgba(247, 221, 160, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(W / 2 - ruleW, H * 0.545);
    ctx.lineTo(W / 2 + ruleW, H * 0.545);
    ctx.stroke();

    ctx.fillStyle = '#F2E8DA';
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillText('Interactive Narrative Craft Game & Production Breakdown', W / 2, H * 0.605);
    ctx.restore();

    const fade = Math.max(1 - smoothstep(0, 0.5, localT), smoothstep(dur - 0.55, dur, localT));
    drawLetterboxFrame('GAME & BEHIND-THE-SCENES TRAILER', fade);
  };

  function drawSection8PlatesMosaic(lt, t) {
    ctx.fillStyle = '#120D0B';
    ctx.fillRect(0, BAR_H, W, ACTIVE_H);

    const padX = 72;
    const padY = 42;
    const gapX = 22;
    const gapY = 34;
    const cols = 4;
    const rows = 2;
    const cellW = (W - padX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (ACTIVE_H - padY * 2 - gapY * (rows - 1) - 42) / rows;

    // Header inside active frame
    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BEHIND THE SCENES  ·  8 IMPASTO OIL-ON-LINEN STORYBOARD PLATES (ZERO 2D VECTORS)', padX, BAR_H + 30);

    const activeIdx = Math.min(7, Math.floor((lt / 8.8) * 8));

    for (let i = 0; i < 8; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = padX + col * (cellW + gapX);
      const y = BAR_H + 54 + row * (cellH + gapY);

      const reveal = smoothstep(i * 0.35, i * 0.35 + 0.7, lt);
      const isSpotlight = i === activeIdx;
      const zoom = isSpotlight ? 1.09 : 1.02;

      ctx.save();
      ctx.globalAlpha = reveal * (isSpotlight ? 1.0 : 0.82);
      drawCoverRect(images.get(ASSETS[i]), x, y, cellW, cellH, zoom, 0, 0);

      // Subtle card border, glowing gold on current spotlight plate
      ctx.strokeStyle = isSpotlight ? '#F7DDA0' : 'rgba(219, 161, 60, 0.32)';
      ctx.lineWidth = isSpotlight ? 2.6 : 1.2;
      ctx.strokeRect(x, y, cellW, cellH);

      // Clean bottom label ribbon on each plate
      ctx.fillStyle = 'rgba(14, 10, 8, 0.78)';
      ctx.fillRect(x, y + cellH - 30, cellW, 30);
      ctx.fillStyle = isSpotlight ? '#F7DDA0' : '#C8BBA8';
      ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(PLATE_LABELS[i], x + 12, y + cellH - 10);
      ctx.restore();
    }

    drawEmbers(t, 0.35);
  }

  function drawSectionAudioAndTech(lt, t) {
    ctx.fillStyle = '#120D0B';
    ctx.fillRect(0, BAR_H, W, ACTIVE_H);

    // Left 46%: dramatic macro painting 06_fracture_gold_crack.png
    const leftX = 72;
    const leftY = BAR_H + 46;
    const leftW = 810;
    const leftH = ACTIVE_H - 92;
    drawCoverRect(
      images.get('./art/06_fracture_gold_crack.png'),
      leftX,
      leftY,
      leftW,
      leftH,
      lerp(1.04, 1.15, smoothstep(0, 7.5, lt)),
      0,
      0,
    );
    ctx.strokeStyle = 'rgba(219, 161, 60, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(leftX, leftY, leftW, leftH);

    // Right 46%: Multi-Track Production & Audio Architecture Cards
    const rx = 930;
    const rw = W - rx - 72;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('MULTI-TRACK CINEMA & GAME CRAFT PIPELINE', rx, BAR_H + 74);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = '600 40px Baskerville, Georgia, serif';
    ctx.fillText('Zero Shortcuts. Real Craft.', rx, BAR_H + 126);

    const layers = [
      {
        tag: 'TRACK 01 · NEURAL STUDIO VOICE',
        title: 'Zyphra ZONOS3-Mini (Savannah · 44.1 kHz)',
        desc: '7 bespoke theatrical narrations mastered with warm EQ & -5 dB sidechain ducking.',
        color: '#E65A28',
      },
      {
        tag: 'TRACK 02 · CHAMBER SCORE & KILN FOLEY',
        title: '4-Voice Bowed Cello + Wood-Kiln Acoustics',
        desc: 'D minor to Picardy D major sunrise bloom, ceramic bells & cedar crackles at -14 LUFS.',
        color: '#DBA13C',
      },
      {
        tag: 'TRACK 03 · REAL KILN THERMAL ENGINE',
        title: '600°C–1300°C Physics · 16 Warm Glaze Blends',
        desc: 'React 19 + TypeScript + Canvas2D shaders, Vitest 9/9 PASS, sloplint 0 FAIL.',
        color: '#657A54',
      },
      {
        tag: 'TRACK 04 · STRICT PALETTE CONSTITUTION',
        title: 'Terracotta · Molten Amber · Kiln Gold · Olive',
        desc: 'Zero blue, cyan, teal, or purple channels verified programmatically across every blend.',
        color: '#C74325',
      },
    ];

    layers.forEach((layer, idx) => {
      const appear = smoothstep(idx * 0.55, idx * 0.55 + 0.7, lt);
      const cy = BAR_H + 162 + idx * 140;
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.fillStyle = '#191310';
      ctx.fillRect(rx, cy, rw, 122);
      ctx.fillStyle = layer.color;
      ctx.fillRect(rx, cy, 6, 122);
      ctx.strokeStyle = 'rgba(219, 161, 60, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, cy, rw, 122);

      ctx.fillStyle = '#DBA13C';
      ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(layer.tag, rx + 24, cy + 30);

      ctx.fillStyle = '#FBF7F0';
      ctx.font = '600 25px Baskerville, Georgia, serif';
      ctx.fillText(layer.title, rx + 24, cy + 64);

      ctx.fillStyle = '#C8BBA8';
      ctx.font = '18px Georgia, serif';
      ctx.fillText(layer.desc, rx + 24, cy + 96);

      // Animated real-time audio spectrum meter bars on tracks 1 & 2
      if (idx < 2) {
        for (let b = 0; b < 14; b += 1) {
          const level = 0.25 + 0.75 * Math.abs(Math.sin(t * (3.2 + idx) + b * 0.75));
          const bh = 8 + level * 26;
          ctx.fillStyle = idx === 0 ? 'rgba(230, 90, 40, 0.75)' : 'rgba(219, 161, 60, 0.75)';
          ctx.fillRect(rx + rw - 172 + b * 10, cy + 54 - bh * 0.5, 6, bh);
        }
      }
      ctx.restore();
    });

    drawEmbers(t, 0.5);
  }

  function drawSectionUnifiedWorld(lt, t) {
    ctx.fillStyle = '#120D0B';
    ctx.fillRect(0, BAR_H, W, ACTIVE_H);

    const padX = 72;
    const gap = 36;
    const halfW = (W - padX * 2 - gap) / 2;
    const boxY = BAR_H + 64;
    const boxH = ACTIVE_H - 122;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 19px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('ONE COHESIVE ORIGINAL IP  ·  FILM  ×  PLAYABLE GAME  ×  BEHIND-THE-SCENES', W / 2, BAR_H + 38);

    // Left: Film & TV 2.39:1 Dawn Hero Plate
    drawCoverRect(images.get('./art/07_kintsugi_dawn.png'), padX, boxY, halfW, boxH, lerp(1.03, 1.1, lt / 5), 0, 0);
    ctx.strokeStyle = 'rgba(247, 221, 160, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, boxY, halfW, boxH);

    // Right: Actual Playable Game Ending & Collectible Relic Card Screenshot
    drawCoverRect(images.get('./materials/game_shot_04_relic_ending.png'), padX + halfW + gap, boxY, halfW, boxH, 1.0, 0, 0);
    ctx.strokeStyle = 'rgba(247, 221, 160, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX + halfW + gap, boxY, halfW, boxH);

    // Bottom captions inside panels
    const drawRibbon = (x, label) => {
      ctx.fillStyle = 'rgba(14, 10, 8, 0.84)';
      ctx.fillRect(x, boxY + boxH - 46, halfW, 46);
      ctx.fillStyle = '#F7DDA0';
      ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + halfW / 2, boxY + boxH - 18);
    };
    drawRibbon(padX, 'FILM & TV DIVISION  ·  84s 1080p ANIMATED SHORT');
    drawRibbon(padX + halfW + gap, 'GAME DIVISION  ·  4 ENDINGS & DOWNLOADABLE RELIC CARD');

    drawEmbers(t, 0.45);
  }

  function drawSectionClosingSlate(lt, dur, t) {
    const img = images.get('./art/08_olive_shoots_ash.png');
    drawCoverRect(img, 0, BAR_H, W, ACTIVE_H, lerp(1.04, 1.12, lt / dur), 0, 0);

    const scrim = ctx.createLinearGradient(W * 0.2, 0, W, 0);
    scrim.addColorStop(0, 'rgba(14, 10, 8, 0.34)');
    scrim.addColorStop(0.5, 'rgba(14, 10, 8, 0.82)');
    scrim.addColorStop(1, 'rgba(14, 10, 8, 0.92)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, BAR_H, W, ACTIVE_H);

    const textIn = smoothstep(0.2, 1.2, lt);
    ctx.save();
    ctx.globalAlpha = textIn;
    ctx.textAlign = 'left';
    const x = W * 0.46;

    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('CHROMA AWARDS SEASON 2  ·  TRIPLE-DIVISION SUBMISSION', x, H * 0.33);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = '600 54px Baskerville, Palatino, Georgia, serif';
    ctx.fillText('The Last Kiln of Ember Valley', x, H * 0.42);

    ctx.strokeStyle = 'rgba(219, 161, 60, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.465);
    ctx.lineTo(W - 92, H * 0.465);
    ctx.stroke();

    const rows = [
      'FILM & TV         ·  84s 2.39:1 Impasto Oil Short Film + SRT',
      'GAME DIVISION     ·  Playable 5-Act Thermal Kiln & Relic Web Game',
      'BEHIND-THE-SCENES ·  Live Playthrough, 8 Plates & ZONOS3 Pipeline',
    ];
    ctx.font = '500 22px ui-monospace, SFMono-Regular, Menlo, monospace';
    rows.forEach((line, i) => {
      ctx.fillStyle = i === 1 ? '#F7DDA0' : '#F2E8DA';
      ctx.fillText(line, x, H * 0.54 + i * 44);
    });

    ctx.fillStyle = '#C8BBA8';
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('“Nothing we truly loved was lost to the fire—it was transformed to outlive the dark.”', x, H * 0.725);
    ctx.restore();

    drawEmbers(t, 0.4);
  }

  window.renderBtsOutroFrame = function renderBtsOutroFrame(localT, dur) {
    ctx.fillStyle = '#0F0B09';
    ctx.fillRect(0, 0, W, H);

    let topLabel = 'BEHIND THE SCENES · STORYBOARD ART';
    if (localT < 9.0) {
      drawSection8PlatesMosaic(localT, localT + 38.2);
    } else if (localT < 16.5) {
      topLabel = 'BEHIND THE SCENES · AUDIO & ENGINE ARCHITECTURE';
      drawSectionAudioAndTech(localT - 9.0, localT + 38.2);
    } else if (localT < 21.5) {
      topLabel = 'UNIFIED IP · FILM × GAME × BEHIND-THE-SCENES';
      drawSectionUnifiedWorld(localT - 16.5, localT + 38.2);
    } else {
      topLabel = 'CHROMA AWARDS SEASON 2 · OFFICIAL ENTRY';
      drawSectionClosingSlate(localT - 21.5, dur - 21.5, localT + 38.2);
    }

    // Subtle dark dip on internal chapter cuts + closing fade out
    let fade = 0;
    if (localT < 0.45) fade = Math.max(fade, 1 - localT / 0.45);
    for (const cut of [9.0, 16.5, 21.5]) {
      const d = Math.abs(localT - cut);
      if (d < 0.25) fade = Math.max(fade, (1 - d / 0.25) * 0.75);
    }
    if (localT > dur - 1.3) fade = Math.max(fade, (localT - (dur - 1.3)) / 1.3);

    drawLetterboxFrame(topLabel, fade);
  };
})();
