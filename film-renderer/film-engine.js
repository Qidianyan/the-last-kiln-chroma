/* V2 Cinema Feature-Film Compositor — The Last Kiln of Ember Valley (1920x1080 @ 24fps, 84s)
 * Composites 8 high-resolution oil-painting cinema plates (art/01..08_*.png) with:
 *   - True 2.39:1 Cinemascope anamorphic letterbox framing (138px bars)
 *   - Smooth 2.5D Ken Burns dolly/pan/crane camera moves & warm cross-dissolves
 *   - Real-time volumetric firelight glow, heat shimmer, golden kintsugi light flares,
 *     depth-layered drifting ember & ash bokeh particles, and warm 35mm film grain
 *   - Verbatim synchronized subtitles matching the 4 studio Zyphra/ZONOS3-Mini narrations.
 */

(function () {
  const W = 1920;
  const H = 1080;
  const FPS = 24;
  const TOTAL_SECONDS = 84.0;
  // True 2.39:1 Cinemascope framing inside 1920x1080 (active height = 804px -> 138px bars)
  const BAR_H = 138;

  const canvas = document.getElementById('film-canvas');
  const ctx = canvas.getContext('2d');

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  // 8 Storyboarded Cinema Plates with tailored camera choreography and lighting VFX
  const SHOTS = [
    {
      file: './art/01_ember_valley.png',
      start: 0.0,
      end: 13.5,
      scale0: 1.08,
      scale1: 1.18,
      panX0: -0.04,
      panX1: 0.04,
      panY0: 0.01,
      panY1: -0.02,
      emberIntensity: 0.55,
      firePulse: 0.18,
      goldBloom: 0.1,
      ashSnow: false,
      titleOverlay: true,
    },
    {
      file: './art/02_hearth_apprentice.png',
      start: 12.2,
      end: 22.8,
      scale0: 1.04,
      scale1: 1.14,
      panX0: 0.02,
      panX1: -0.02,
      panY0: 0.02,
      panY1: -0.01,
      emberIntensity: 0.72,
      firePulse: 0.36,
      goldBloom: 0.12,
      ashSnow: false,
    },
    {
      file: './art/03_glaze_table.png',
      start: 21.4,
      end: 32.5,
      scale0: 1.05,
      scale1: 1.16,
      panX0: -0.035,
      panX1: 0.03,
      panY0: 0.015,
      panY1: -0.015,
      emberIntensity: 0.38,
      firePulse: 0.16,
      goldBloom: 0.24,
      ashSnow: false,
    },
    {
      file: './art/04_molten_glaze_pour.png',
      start: 31.1,
      end: 43.2,
      scale0: 1.12,
      scale1: 1.03,
      panX0: 0.01,
      panX1: -0.015,
      panY0: -0.03,
      panY1: 0.025,
      emberIntensity: 0.52,
      firePulse: 0.28,
      goldBloom: 0.34,
      ashSnow: false,
    },
    {
      file: './art/05_kiln_fire.png',
      start: 41.8,
      end: 52.4,
      scale0: 1.04,
      scale1: 1.18,
      panX0: 0.0,
      panX1: 0.0,
      panY0: 0.02,
      panY1: -0.02,
      emberIntensity: 1.0,
      firePulse: 0.85,
      goldBloom: 0.32,
      ashSnow: false,
      pyrometerHud: true,
      cameraTremor: 2.2,
    },
    {
      file: './art/06_fracture_gold_crack.png',
      start: 51.0,
      end: 60.8,
      scale0: 1.06,
      scale1: 1.2,
      panX0: -0.015,
      panX1: 0.015,
      panY0: 0.01,
      panY1: -0.015,
      emberIntensity: 0.96,
      firePulse: 0.72,
      goldBloom: 0.65,
      ashSnow: false,
      cameraTremor: 1.4,
    },
    {
      file: './art/07_kintsugi_dawn.png',
      start: 59.3,
      end: 72.5,
      scale0: 1.15,
      scale1: 1.04,
      panX0: 0.0,
      panX1: 0.0,
      panY0: 0.025,
      panY1: -0.02,
      emberIntensity: 0.5,
      firePulse: 0.14,
      goldBloom: 0.82,
      ashSnow: true,
      sunbeams: true,
    },
    {
      file: './art/08_olive_shoots_ash.png',
      start: 71.0,
      end: 84.0,
      scale0: 1.05,
      scale1: 1.14,
      panX0: -0.02,
      panX1: 0.025,
      panY0: 0.015,
      panY1: -0.02,
      emberIntensity: 0.32,
      firePulse: 0.08,
      goldBloom: 0.45,
      ashSnow: true,
      creditsOverlay: true,
    },
  ];

  // Exact verbatim captions synchronized to the 4 studio Zyphra ZONOS3-Mini WAV tracks
  const SUBTITLES = [
    // shot1_valley.wav (4.2s – 18.4s)
    { start: 4.2, end: 9.8, text: 'After the river dried and the great smelters fell silent, the people of Ember Valley learned a quieter craft.' },
    { start: 10.0, end: 18.4, text: 'Paper turns to ash in a season, so they glazed everything worth remembering onto wet clay, and trusted the fire to keep it.' },
    // shot2_glazes.wav (22.6s – 38.9s)
    { start: 22.6, end: 28.4, text: 'Tonight, only one tunnel kiln still breathes. Wood ash for the vanished forest, river ochre for the monsoon floods,' },
    { start: 28.6, end: 38.9, text: 'cinnabar for the courage of those who stayed—and the last leaf of hammered gold, folded in Master Orin’s wooden box.' },
    // shot3_firing.wav (44.2s – 56.3s)
    { start: 44.2, end: 50.4, text: 'Eleven hundred degrees. At the threshold of vitrification, a vessel either fractures into dust or sings forever.' },
    { start: 50.6, end: 56.4, text: 'I feed the last cedar embers into the throat of the hearth and hold my breath.' },
    // shot4_kintsugi_dawn.wav (60.8s – 73.6s)
    { start: 60.8, end: 66.8, text: 'When dawn breaks over the ash terraces, golden veins seal every scar across the clay.' },
    { start: 67.0, end: 73.8, text: 'Nothing we truly loved was lost to the fire. It was only transformed into something that could outlive the dark.' },
  ];

  // Warm 35mm cinema film grain tile (strictly warm parchment/obsidian RGB)
  const grainTile = document.createElement('canvas');
  grainTile.width = 256;
  grainTile.height = 256;
  (function buildFilmGrain() {
    const g = grainTile.getContext('2d');
    const img = g.createImageData(256, 256);
    const rng = seededRandom(884422);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng() > 0.5 ? 236 : 24;
      img.data[i] = v;
      img.data[i + 1] = Math.round(v * 0.92);
      img.data[i + 2] = Math.round(v * 0.8);
      img.data[i + 3] = Math.round(10 + rng() * 14);
    }
    g.putImageData(img, 0, 0);
  })();
  const grainPattern = ctx.createPattern(grainTile, 'repeat');

  // Depth-layered bokeh embers & drifting pale ash particles
  const PARTICLES = [];
  (function buildParticles() {
    const rng = seededRandom(20261215);
    for (let i = 0; i < 190; i += 1) {
      const depth = rng(); // 0 = distant fine, 1 = foreground bokeh
      PARTICLES.push({
        x0: rng(),
        y0: rng(),
        vx: (rng() - 0.5) * (0.025 + depth * 0.05),
        vy: 0.035 + rng() * (0.08 + depth * 0.14),
        size: 1.4 + depth * 5.2,
        depth,
        phase: rng() * Math.PI * 2,
        isGold: rng() > 0.65,
        isAsh: i % 3 === 0,
      });
    }
  })();

  const loadedImages = new Map();

  window.preloadFilmAssets = async function preloadFilmAssets() {
    await Promise.all(
      SHOTS.map(
        (shot) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              loadedImages.set(shot.file, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load cinema plate: ${shot.file}`));
            img.src = shot.file;
          }),
      ),
    );
    return loadedImages.size;
  };

  function drawPlateWithCamera(shot, img, t, opacity) {
    if (opacity <= 0.002) return;
    const dur = Math.max(0.1, shot.end - shot.start);
    const u = clamp01((t - shot.start) / dur);
    const eased = u * u * (3 - 2 * u);

    const scale = lerp(shot.scale0, shot.scale1, eased);
    const panX = lerp(shot.panX0, shot.panX1, eased) * W;
    const panY = lerp(shot.panY0, shot.panY1, eased) * H;

    // Subtle organic heat-tremor during high-fire furnace shots
    const tremor = shot.cameraTremor || 0;
    const jx = tremor ? Math.sin(t * 17.3) * tremor * 0.6 : 0;
    const jy = tremor ? Math.cos(t * 21.1) * tremor * 0.45 : 0;

    // Fit image to cover 1920x1080 cleanly while honoring aspect ratio
    const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const viewAspect = W / H;
    let drawW = W;
    let drawH = H;
    if (imgAspect > viewAspect) {
      drawH = H;
      drawW = H * imgAspect;
    } else {
      drawW = W;
      drawH = W / imgAspect;
    }
    drawW *= scale;
    drawH *= scale;

    const dx = (W - drawW) * 0.5 + panX + jx;
    const dy = (H - drawH) * 0.5 + panY + jy;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
  }

  function drawVolumetricVfx(t, emberIntensity, firePulse, goldBloom, ashSnow, sunbeams) {
    // 1. Breathing warm kiln firelight bloom
    if (firePulse > 0.02) {
      const pulse = 0.78 + 0.22 * Math.sin(t * 3.8) + 0.1 * Math.sin(t * 8.4);
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.62, 60, W * 0.5, H * 0.54, W * 0.58);
      glow.addColorStop(0, `rgba(255, 206, 118, ${(0.24 * firePulse * pulse).toFixed(3)})`);
      glow.addColorStop(0.45, `rgba(230, 90, 40, ${(0.22 * firePulse * pulse).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(23, 18, 16, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = glow;
      ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);
      ctx.restore();
    }

    // 2. Radiant golden kintsugi aura & sunrise volumetric rays
    if (goldBloom > 0.04) {
      const halo = ctx.createRadialGradient(W * 0.5, H * 0.48, 30, W * 0.5, H * 0.5, W * 0.48);
      halo.addColorStop(0, `rgba(247, 221, 160, ${(0.22 * goldBloom).toFixed(3)})`);
      halo.addColorStop(0.5, `rgba(219, 161, 60, ${(0.12 * goldBloom).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(23, 18, 16, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = halo;
      ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);

      if (sunbeams) {
        for (let i = 0; i < 5; i += 1) {
          const rx = W * (0.28 + i * 0.11) + Math.sin(t * 0.4 + i) * 30;
          const beam = ctx.createLinearGradient(rx, BAR_H, rx + 220, H - BAR_H);
          beam.addColorStop(0, `rgba(251, 247, 240, ${(0.1 * goldBloom).toFixed(3)})`);
          beam.addColorStop(0.6, `rgba(242, 201, 107, ${(0.06 * goldBloom).toFixed(3)})`);
          beam.addColorStop(1, 'rgba(219, 161, 60, 0)');
          ctx.fillStyle = beam;
          ctx.beginPath();
          ctx.moveTo(rx - 40, BAR_H);
          ctx.lineTo(rx + 65, BAR_H);
          ctx.lineTo(rx + 310, H - BAR_H);
          ctx.lineTo(rx + 120, H - BAR_H);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 3. Depth-layered drifting embers & warm ash snow
    ctx.save();
    for (let i = 0; i < PARTICLES.length; i += 1) {
      const p = PARTICLES[i];
      if (!ashSnow && p.isAsh && i % 2 === 0) continue;
      const dir = p.isAsh ? 1 : -1;
      const speed = p.isAsh ? 0.36 : 0.65 + emberIntensity * 0.85;
      const y = ((p.y0 + dir * t * p.vy * speed) % 1 + 1) % 1;
      const x = ((p.x0 + t * p.vx + Math.sin(t * 1.2 + p.phase + y * 5.2) * 0.022) % 1 + 1) % 1;
      const py = BAR_H + y * (H - BAR_H * 2);
      const px = x * W;
      const edgeFade = Math.sin(y * Math.PI);
      const alpha = edgeFade * (p.isAsh ? 0.42 : Math.min(0.95, 0.25 + emberIntensity * 0.72));
      if (alpha <= 0.02) continue;

      if (p.isAsh) {
        ctx.fillStyle = `rgba(242, 232, 218, ${(alpha * 0.7).toFixed(3)})`;
      } else if (p.isGold) {
        ctx.fillStyle = `rgba(247, 221, 160, ${alpha.toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(230, 90, 40, ${alpha.toFixed(3)})`;
      }

      const r = p.size * (p.isAsh ? 0.75 : 0.7 + emberIntensity * 0.45);
      if (p.depth > 0.72 && !p.isAsh) {
        // Soft cinematic bokeh ember glow in foreground
        const bokeh = ctx.createRadialGradient(px, py, 0, px, py, r * 2.4);
        bokeh.addColorStop(0, `rgba(255, 221, 160, ${(alpha * 0.85).toFixed(3)})`);
        bokeh.addColorStop(0.5, `rgba(230, 90, 40, ${(alpha * 0.42).toFixed(3)})`);
        bokeh.addColorStop(1, 'rgba(230, 90, 40, 0)');
        ctx.fillStyle = bokeh;
        ctx.beginPath();
        ctx.arc(px, py, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawTitleOverlay(t) {
    if (t > 6.2) return;
    const alpha = smoothstep(0.3, 1.4, t) * (1 - smoothstep(4.2, 5.8, t));
    if (alpha <= 0.01) return;

    ctx.save();
    // Subtle obsidian scrim behind opening cinema title for luminous legibility
    ctx.fillStyle = `rgba(16, 11, 9, ${(alpha * 0.48).toFixed(3)})`;
    ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);

    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 21px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('THE CHROMA AWARDS SEASON 2  ·  ORIGINAL ANIMATED FABLE', W / 2, H * 0.42);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = '600 76px Baskerville, Palatino, Georgia, serif';
    ctx.shadowColor = 'rgba(14, 9, 7, 0.85)';
    ctx.shadowBlur = 24;
    ctx.fillText('THE LAST KILN OF EMBER VALLEY', W / 2, H * 0.505);

    const halfRule = 360 * smoothstep(0.5, 2.2, t);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(247, 221, 160, 0.78)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(W / 2 - halfRule, H * 0.545);
    ctx.lineTo(W / 2 + halfRule, H * 0.545);
    ctx.stroke();

    ctx.fillStyle = '#F2E8DA';
    ctx.font = 'italic 32px Georgia, "Times New Roman", serif';
    ctx.fillText('A Story of Clay, Memory, and Fire', W / 2, H * 0.605);
    ctx.restore();
  }

  function drawPyrometerOverlay(t) {
    if (t < 42.5 || t > 52.8) return;
    const alpha = smoothstep(42.5, 43.6, t) * (1 - smoothstep(51.4, 52.6, t));
    if (alpha <= 0.01) return;
    const temp = Math.round(lerp(860, 1165, smoothstep(42.6, 51.8, t)));

    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    ctx.fillStyle = 'rgba(18, 13, 10, 0.72)';
    ctx.strokeStyle = 'rgba(219, 161, 60, 0.52)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(W - 365, BAR_H + 34, 305, 104, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('KILN PYROMETER · CHAMBER IV', W - 340, BAR_H + 66);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = '700 40px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`${temp}°C`, W - 340, BAR_H + 114);

    ctx.fillStyle = temp >= 1100 ? '#FF8B4A' : '#C8BBA8';
    ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(temp >= 1100 ? 'VITRIFICATION' : 'STONEWARE RISE', W - 188, BAR_H + 110);
    ctx.restore();
  }

  function drawCreditsOverlay(t) {
    if (t < 74.0) return;
    const alpha = smoothstep(74.2, 76.0, t) * (1 - smoothstep(82.4, 83.9, t));
    if (alpha <= 0.01) return;

    ctx.save();
    // Subtle dark gradient veil on right half so olive-shoots painting remains luminous on left
    const scrim = ctx.createLinearGradient(W * 0.25, 0, W, 0);
    scrim.addColorStop(0, `rgba(16, 11, 9, ${(alpha * 0.25).toFixed(3)})`);
    scrim.addColorStop(0.55, `rgba(16, 11, 9, ${(alpha * 0.78).toFixed(3)})`);
    scrim.addColorStop(1, `rgba(16, 11, 9, ${(alpha * 0.88).toFixed(3)})`);
    ctx.fillStyle = scrim;
    ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);

    ctx.globalAlpha = alpha;
    ctx.textAlign = 'left';

    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('EMBER VALLEY ARCHIVE · EPIGRAPH', W * 0.48, H * 0.34);

    ctx.fillStyle = '#FBF7F0';
    ctx.font = 'italic 44px Baskerville, Palatino, Georgia, serif';
    ctx.fillText('“Nothing we truly loved was lost to the fire.', W * 0.48, H * 0.42);
    ctx.fillText('It was transformed to outlive the dark.”', W * 0.48, H * 0.48);

    ctx.strokeStyle = 'rgba(219, 161, 60, 0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(W * 0.48, H * 0.535);
    ctx.lineTo(W * 0.89, H * 0.535);
    ctx.stroke();

    ctx.fillStyle = '#F2E8DA';
    ctx.font = '600 32px Baskerville, Georgia, serif';
    ctx.fillText('THE LAST KILN OF EMBER VALLEY', W * 0.48, H * 0.60);

    ctx.fillStyle = '#C8BBA8';
    ctx.font = '21px Georgia, serif';
    ctx.fillText('Dual-Category Submission · The Chroma Awards Season 2', W * 0.48, H * 0.65);
    ctx.fillText('Original Playable Interactive Fable & Animated Short Film', W * 0.48, H * 0.688);

    ctx.fillStyle = '#DBA13C';
    ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('OIL-CONCEPT CINEMA PLATES · ZYPHRA ZONOS3 VOICE · CHAMBER CELLO SCORE', W * 0.48, H * 0.745);
    ctx.restore();
  }

  function drawCinemaFrameAndSubtitles(t) {
    // 35mm warm film grain overlay
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);
    ctx.restore();

    // Subtle anamorphic edge vignette
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.34, W * 0.5, H * 0.5, W * 0.6);
    vig.addColorStop(0, 'rgba(14, 10, 8, 0)');
    vig.addColorStop(1, 'rgba(12, 8, 6, 0.52)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, BAR_H, W, H - BAR_H * 2);

    // 2.39:1 Cinemascope obsidian letterbox bars
    ctx.fillStyle = '#0F0B09';
    ctx.fillRect(0, 0, W, BAR_H);
    ctx.fillRect(0, H - BAR_H, W, BAR_H);

    // Hairline antique gold cinema gate trim
    ctx.strokeStyle = 'rgba(219, 161, 60, 0.32)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, BAR_H);
    ctx.lineTo(W, BAR_H);
    ctx.moveTo(0, H - BAR_H);
    ctx.lineTo(W, H - BAR_H);
    ctx.stroke();

    // Optional canvas subtitle path (disabled by default when external .srt is burned via FFmpeg libass)
    if (window.RENDER_BAKED_SUBTITLES === true) {
      const cue = SUBTITLES.find((s) => t >= s.start && t <= s.end);
      if (cue) {
        const alpha =
          smoothstep(cue.start, cue.start + 0.35, t) *
          (1 - smoothstep(cue.end - 0.35, cue.end, t));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FBF7F0';
        ctx.font = '500 28px Georgia, "Times New Roman", serif';
        ctx.fillText(cue.text, W / 2, H - BAR_H * 0.5);
        ctx.restore();
      }
    }

    // Smooth opening fade in & closing fade out
    let dark = 0;
    if (t < 0.75) dark = Math.max(dark, 1 - t / 0.75);
    if (t > TOTAL_SECONDS - 1.4) dark = Math.max(dark, (t - (TOTAL_SECONDS - 1.4)) / 1.4);
    if (dark > 0.005) {
      ctx.fillStyle = `rgba(14, 10, 8, ${clamp01(dark).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  window.renderFilmFrame = function renderFilmFrame(frameIndex, totalFrames) {
    const t = (frameIndex / Math.max(1, totalFrames)) * TOTAL_SECONDS;

    ctx.fillStyle = '#0F0B09';
    ctx.fillRect(0, 0, W, H);

    // Compute cross-dissolving active shots & weighted VFX parameters
    let emberAcc = 0;
    let fireAcc = 0;
    let goldAcc = 0;
    let weightSum = 0;
    let ashSnow = false;
    let sunbeams = false;

    for (let i = 0; i < SHOTS.length; i += 1) {
      const shot = SHOTS[i];
      if (t < shot.start || t > shot.end) continue;
      const img = loadedImages.get(shot.file);
      if (!img) continue;

      const fadeIn = i === 0 ? 1 : smoothstep(shot.start, shot.start + 1.35, t);
      const fadeOut = i === SHOTS.length - 1 ? 1 : 1 - smoothstep(shot.end - 1.35, shot.end, t);
      const opacity = clamp01(Math.min(fadeIn, fadeOut));

      drawPlateWithCamera(shot, img, t, opacity);

      emberAcc += shot.emberIntensity * opacity;
      fireAcc += shot.firePulse * opacity;
      goldAcc += shot.goldBloom * opacity;
      weightSum += opacity;
      if (shot.ashSnow && opacity > 0.35) ashSnow = true;
      if (shot.sunbeams && opacity > 0.35) sunbeams = true;
    }

    const inv = weightSum > 0.01 ? 1 / weightSum : 1;
    drawVolumetricVfx(t, emberAcc * inv, fireAcc * inv, goldAcc * inv, ashSnow, sunbeams);
    drawTitleOverlay(t);
    drawPyrometerOverlay(t);
    drawCreditsOverlay(t);
    drawCinemaFrameAndSubtitles(t);
  };
})();
