import { ENDINGS } from '../data/narrative';
import { computeGlazeBlend, GLAZE_MINERALS, MAX_KILN_TEMP, MIN_KILN_TEMP } from './kilnPhysics';
import type { EndingId, GlazeBlend, KilnState, SceneId } from '../types/game';

interface EmberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  depth: number;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'ember' | 'ash' | 'gold';
}

type ArtKey = 'hearth' | 'glaze' | 'fire' | 'dawn';

const ART_PATHS: Record<ArtKey, string> = {
  hearth: './art/hearth_scene.png',
  glaze: './art/glaze_table.png',
  fire: './art/kiln_fire.png',
  dawn: './art/kintsugi_dawn.png',
};

const sharedArtCache: Partial<Record<ArtKey, HTMLImageElement>> = {};
let artPreloadStarted = false;

export function preloadCinemaArtPlates(): void {
  if (artPreloadStarted || typeof Image === 'undefined') return;
  artPreloadStarted = true;
  (Object.keys(ART_PATHS) as ArtKey[]).forEach((key) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = ART_PATHS[key];
    sharedArtCache[key] = img;
  });
}

function getArtKeyForState(scene: SceneId, ending: EndingId | null): ArtKey {
  if (ending || scene === 'unsealing') return 'dawn';
  if (scene === 'hearth') return 'hearth';
  if (scene === 'glaze') return 'glaze';
  return 'fire';
}

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * V2 Cinema Stage Renderer:
 * Composites high-resolution oil-painting concept art plates (`public/art/*.png`)
 * with real-time Canvas2D interactive kiln firelight, heat-shimmer blooms,
 * mineral glaze resonance ripples, glowing kintsugi fracture veins, depth-layered
 * drifting embers, warm 35mm film grain, and 2.39:1 obsidian cinema framing.
 */
export class PainterlyKilnRenderer {
  private particles: EmberParticle[] = [];
  private grainCanvas: HTMLCanvasElement | null = null;
  private pulseEnergy = 0;
  private echoWaveAge = 99;
  private glazeRippleAge = 99;
  private activeArtKey: ArtKey = 'hearth';
  private prevArtKey: ArtKey = 'hearth';
  private crossfadeProgress = 1;
  private rand = createSeededRandom(20261215);

  constructor() {
    preloadCinemaArtPlates();
    this.seedInitialParticles(96);
  }

  public triggerBellowsSurge(): void {
    this.pulseEnergy = Math.min(1.5, this.pulseEnergy + 0.9);
    for (let i = 0; i < 22; i += 1) {
      this.particles.push({
        x: 0.44 + (this.rand() - 0.5) * 0.24,
        y: 0.72 + (this.rand() - 0.5) * 0.12,
        vx: (this.rand() - 0.5) * 0.14,
        vy: -(0.14 + this.rand() * 0.24),
        size: 1.6 + this.rand() * 3.8,
        depth: this.rand(),
        alpha: 0.95,
        life: 0,
        maxLife: 1.2 + this.rand() * 1.8,
        kind: this.rand() > 0.28 ? 'ember' : 'gold',
      });
    }
  }

  public triggerEchoWave(): void {
    this.echoWaveAge = 0;
  }

  public triggerGlazeSwirl(): void {
    this.glazeRippleAge = 0;
  }

  private seedInitialParticles(count: number): void {
    this.particles = [];
    for (let i = 0; i < count; i += 1) {
      const isAsh = i % 3 === 0;
      const depth = this.rand();
      this.particles.push({
        x: this.rand(),
        y: this.rand(),
        vx: (this.rand() - 0.5) * (0.02 + depth * 0.03),
        vy: isAsh ? 0.015 + this.rand() * 0.025 : -(0.03 + this.rand() * (0.06 + depth * 0.08)),
        size: isAsh ? 1.2 + depth * 2.0 : 1.4 + depth * 3.4,
        depth,
        alpha: 0.25 + this.rand() * 0.65,
        life: this.rand() * 3,
        maxLife: 2.5 + this.rand() * 3.5,
        kind: isAsh ? 'ash' : this.rand() > 0.7 ? 'gold' : 'ember',
      });
    }
  }

  private ensureGrainPattern(): HTMLCanvasElement | null {
    if (this.grainCanvas || typeof document === 'undefined') return this.grainCanvas;
    const tile = document.createElement('canvas');
    tile.width = 180;
    tile.height = 180;
    const g = tile.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(180, 180);
    const localRand = createSeededRandom(9401);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = localRand();
      const base = n > 0.5 ? 236 : 24;
      img.data[i] = base;
      img.data[i + 1] = Math.round(base * 0.92);
      img.data[i + 2] = Math.round(base * 0.8);
      img.data[i + 3] = Math.round(10 + localRand() * 12);
    }
    g.putImageData(img, 0, 0);
    this.grainCanvas = tile;
    return tile;
  }

  private drawCoverImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    timeSec: number,
    alpha: number,
    reducedMotion: boolean,
  ): void {
    if (!img.complete || img.naturalWidth === 0 || alpha <= 0.005) return;
    const driftScale = reducedMotion ? 1.03 : 1.045 + Math.sin(timeSec * 0.16) * 0.02;
    const driftX = reducedMotion ? 0 : Math.sin(timeSec * 0.12) * w * 0.012;
    const driftY = reducedMotion ? 0 : Math.cos(timeSec * 0.1) * h * 0.008;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const viewAspect = w / h;
    let drawW = w;
    let drawH = h;
    if (imgAspect > viewAspect) {
      drawH = h;
      drawW = h * imgAspect;
    } else {
      drawW = w;
      drawH = w / imgAspect;
    }
    drawW *= driftScale;
    drawH *= driftScale;

    const dx = (w - drawW) * 0.5 + driftX;
    const dy = (h - drawH) * 0.5 + driftY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number,
    dtSec: number,
    state: KilnState,
    reducedMotion: boolean,
  ): void {
    const dt = reducedMotion ? 0 : Math.min(0.05, dtSec);
    this.pulseEnergy = Math.max(0, this.pulseEnergy - dt * 1.45);
    this.echoWaveAge += dt;
    this.glazeRippleAge += dt;

    const targetKey = getArtKeyForState(state.scene, state.ending);
    if (targetKey !== this.activeArtKey) {
      this.prevArtKey = this.activeArtKey;
      this.activeArtKey = targetKey;
      this.crossfadeProgress = reducedMotion ? 1 : 0;
    }
    if (this.crossfadeProgress < 1) {
      this.crossfadeProgress = Math.min(1, this.crossfadeProgress + dt * 1.35);
    }

    const heatNorm = Math.max(
      0,
      Math.min(1, (state.temperatureC - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)),
    );
    const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);

    ctx.save();
    // Base obsidian cinema ground
    ctx.fillStyle = '#0D0A08';
    ctx.fillRect(0, 0, width, height);

    // 1. Oil-Painting Cinema Backdrop (with smooth crossfade between acts)
    const prevImg = sharedArtCache[this.prevArtKey];
    const currImg = sharedArtCache[this.activeArtKey];
    if (this.crossfadeProgress < 1 && prevImg) {
      this.drawCoverImage(ctx, prevImg, width, height, timeSec, 1, reducedMotion);
    }
    if (currImg && currImg.complete && currImg.naturalWidth > 0) {
      this.drawCoverImage(ctx, currImg, width, height, timeSec, this.crossfadeProgress, reducedMotion);
    } else {
      // Rich warm obsidian-ember atmospheric fallback while image finishes decoding
      const fallbackGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        30,
        width * 0.5,
        height * 0.5,
        width * 0.65,
      );
      fallbackGrad.addColorStop(0, '#592914');
      fallbackGrad.addColorStop(0.5, '#221611');
      fallbackGrad.addColorStop(1, '#0D0A08');
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Interactive Kiln Fire Breathing Glow & Bellows Surge
    this.drawInteractiveHeatLighting(ctx, width, height, timeSec, state, blend, heatNorm);

    // 3. Interactive Mineral Glaze Ripple & Kintsugi Gold Fracture Veins
    this.drawGlazeAndKintsugiOverlay(ctx, width, height, timeSec, state, blend, heatNorm);

    // 4. Acoustic Golden Memory Rings
    this.drawMemoryWaves(ctx, width, height, timeSec, state);

    // 5. Depth-Layered Drifting Embers & Warm Ash Snow
    this.updateAndDrawParticles(ctx, width, height, dt, timeSec, state, heatNorm, reducedMotion);

    // 6. 35mm Warm Film Grain, Edge Scrim & Subtle 2.39:1 Obsidian Framing
    this.drawCinemaGradingAndFraming(ctx, width, height, heatNorm);
    ctx.restore();
  }

  private drawInteractiveHeatLighting(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    state: KilnState,
    blend: GlazeBlend,
    heatNorm: number,
  ): void {
    const breath = 0.8 + 0.2 * Math.sin(t * 3.1) + this.pulseEnergy * 0.55;
    const isHighFire = state.scene === 'stoking' || state.scene === 'vitrification';
    const baseStrength = state.scene === 'unsealing' ? 0.14 : isHighFire ? 0.34 : 0.22;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Volumetric radial kiln fire bloom centered on the focal vessel/furnace
    const fireGlow = ctx.createRadialGradient(w * 0.5, h * 0.48, 24, w * 0.5, h * 0.5, w * 0.46);
    const alphaCore = Math.min(0.75, (baseStrength + heatNorm * 0.24) * breath);
    fireGlow.addColorStop(0, `rgba(255, 214, 128, ${(alphaCore * 0.65).toFixed(3)})`);
    fireGlow.addColorStop(0.42, `rgba(230, 90, 40, ${(alphaCore * 0.55).toFixed(3)})`);
    fireGlow.addColorStop(1, 'rgba(15, 11, 9, 0)');
    ctx.fillStyle = fireGlow;
    ctx.fillRect(0, 0, w, h);

    // Live mineral glaze pigment atmosphere tint in Act II+
    if (state.glazeMixed || state.scene !== 'hearth') {
      const glazeHalo = ctx.createRadialGradient(w * 0.5, h * 0.46, 18, w * 0.5, h * 0.46, w * 0.32);
      glazeHalo.addColorStop(0, blend.veinHex);
      glazeHalo.addColorStop(0.55, blend.bodyHex);
      glazeHalo.addColorStop(1, 'rgba(15, 11, 9, 0)');
      ctx.globalAlpha = this.glazeRippleAge < 1.8 ? 0.28 : 0.11;
      ctx.fillStyle = glazeHalo;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private drawGlazeAndKintsugiOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    state: KilnState,
    blend: GlazeBlend,
    heatNorm: number,
  ): void {
    const cx = w * 0.5;
    const cy = h * 0.46;

    // Expanding mineral swirl ring when user changes glaze pigments
    if (this.glazeRippleAge < 2.2) {
      const prog = this.glazeRippleAge / 2.2;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = blend.veinHex;
      ctx.globalAlpha = (1 - prog) * 0.65;
      ctx.lineWidth = 3 * (1 - prog * 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, 42 + prog * Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Live glowing Kintsugi / thermal stress fracture veins during Vitrification & Dawn
    const showVeins =
      state.scene === 'vitrification' ||
      state.thermalStress > 16 ||
      state.choiceThree === 'kintsugi' ||
      state.ending === 'gilded_reliquary';

    if (showVeins) {
      const isGold = state.choiceThree === 'kintsugi' || state.ending === 'gilded_reliquary';
      const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
      const scale = Math.min(w, h) / 720;
      const veinColor = isGold ? '#F7DDA0' : '#FF7E42';
      const glowColor = isGold ? '#DBA13C' : '#E65A28';

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = veinColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isGold ? 24 : 16) * pulse;
      ctx.lineWidth = (isGold ? 2.8 : 2.1) * scale;
      ctx.globalAlpha = (isGold ? 0.85 : 0.48 + heatNorm * 0.35) * pulse;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const paths: Array<Array<[number, number]>> = [
        [
          [cx - 18 * scale, cy - 92 * scale],
          [cx - 34 * scale, cy - 36 * scale],
          [cx + 12 * scale, cy + 8 * scale],
          [cx - 24 * scale, cy + 72 * scale],
        ],
        [
          [cx + 12 * scale, cy + 8 * scale],
          [cx + 58 * scale, cy + 32 * scale],
          [cx + 76 * scale, cy + 74 * scale],
        ],
        [
          [cx - 34 * scale, cy - 36 * scale],
          [cx - 78 * scale, cy - 8 * scale],
        ],
      ];

      for (const pts of paths) {
        ctx.beginPath();
        pts.forEach(([px, py], i) => {
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawMemoryWaves(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    state: KilnState,
  ): void {
    const cx = w * 0.5;
    const cy = h * 0.45;
    if (this.echoWaveAge < 3.6 || state.ending === 'singing_hearth_vessel') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i += 1) {
        const progress =
          state.ending === 'singing_hearth_vessel'
            ? (t * 0.25 + i / 3) % 1
            : Math.max(0, Math.min(1, (this.echoWaveAge - i * 0.35) / 2.6));
        if (progress <= 0 || progress >= 1) continue;
        const radius = 58 + progress * Math.min(w, h) * 0.36;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(247, 221, 160, ${((1 - progress) * 0.52).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private updateAndDrawParticles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dt: number,
    t: number,
    state: KilnState,
    heatNorm: number,
    reducedMotion: boolean,
  ): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      if (!p) continue;
      if (!reducedMotion) {
        p.life += dt;
        const curl = Math.sin(t * 1.35 + p.y * 7.5 + i) * 0.016;
        p.x += (p.vx + curl) * dt;
        p.y += p.vy * (p.kind === 'ember' ? 0.8 + heatNorm * 0.85 : 1) * dt;

        if (p.life > p.maxLife || p.y < -0.05 || p.y > 1.05 || p.x < -0.05 || p.x > 1.05) {
          if (this.particles.length > 108) {
            this.particles.splice(i, 1);
            continue;
          }
          p.life = 0;
          if (p.kind === 'ash' || state.scene === 'unsealing') {
            p.x = this.rand();
            p.y = -0.02;
            p.vy = 0.018 + this.rand() * 0.028;
            p.kind = 'ash';
          } else {
            p.x = 0.25 + this.rand() * 0.5;
            p.y = 0.82 + (this.rand() - 0.5) * 0.14;
            p.vy = -(0.045 + this.rand() * (0.075 + heatNorm * 0.12));
            p.kind = this.rand() > 0.72 ? 'gold' : 'ember';
          }
        }
      }

      const fade = Math.sin(Math.min(1, p.life / p.maxLife) * Math.PI);
      const px = p.x * w;
      const py = p.y * h;
      const a = Math.max(0.08, p.alpha * (reducedMotion ? 0.6 : fade));

      if (p.kind === 'ash') {
        ctx.fillStyle = `rgba(242, 232, 218, ${(a * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.depth > 0.72) {
        const bokeh = ctx.createRadialGradient(px, py, 0, px, py, p.size * 2.4);
        bokeh.addColorStop(0, `rgba(255, 224, 156, ${(a * 0.9).toFixed(3)})`);
        bokeh.addColorStop(0.5, `rgba(230, 90, 40, ${(a * 0.45).toFixed(3)})`);
        bokeh.addColorStop(1, 'rgba(230, 90, 40, 0)');
        ctx.fillStyle = bokeh;
        ctx.beginPath();
        ctx.arc(px, py, p.size * 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle =
          p.kind === 'gold'
            ? `rgba(247, 221, 160, ${a.toFixed(3)})`
            : `rgba(230, 90, 40, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawCinemaGradingAndFraming(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    heatNorm: number,
  ): void {
    const grain = this.ensureGrainPattern();
    if (grain) {
      const pattern = ctx.createPattern(grain, 'repeat');
      if (pattern) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // Deep dark cinema edge scrim so top HUD, side controls, and bottom subtitles read cleanly over oil art
    const topShade = ctx.createLinearGradient(0, 0, 0, h * 0.22);
    topShade.addColorStop(0, 'rgba(12, 9, 7, 0.88)');
    topShade.addColorStop(1, 'rgba(12, 9, 7, 0)');
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, w, h * 0.22);

    const bottomShade = ctx.createLinearGradient(0, h * 0.56, 0, h);
    bottomShade.addColorStop(0, 'rgba(12, 9, 7, 0)');
    bottomShade.addColorStop(0.55, 'rgba(12, 9, 7, 0.74)');
    bottomShade.addColorStop(1, 'rgba(12, 9, 7, 0.94)');
    ctx.fillStyle = bottomShade;
    ctx.fillRect(0, h * 0.56, w, h * 0.44);

    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.44,
      Math.min(w, h) * 0.26,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.72,
    );
    vig.addColorStop(0, 'rgba(13, 10, 8, 0)');
    vig.addColorStop(1, `rgba(11, 8, 6, ${(0.58 - heatNorm * 0.08).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Generates a high-resolution (1000x1400) museum-grade collectible Ceramic Relic Card PNG
 * showcasing the oil-painting hero art plate, mineral glaze swatches, and real kiln firing curve.
 */
export function renderRelicCardToCanvas(
  canvas: HTMLCanvasElement,
  state: KilnState,
  endingId: EndingId,
): void {
  const W = 1000;
  const H = 1400;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ending = ENDINGS[endingId];
  const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);

  ctx.fillStyle = '#0F0B09';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#18120F';
  ctx.fillRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = '#DBA13C';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = 'rgba(242, 232, 218, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(50, 50, W - 100, H - 100);

  ctx.fillStyle = '#DBA13C';
  ctx.font = '600 20px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText('EMBER VALLEY CERAMIC ARCHIVE  ·  FINAL FIRING RECORD', W / 2, 102);

  ctx.fillStyle = '#FBF7F0';
  ctx.font = '700 46px Georgia, "Times New Roman", serif';
  ctx.fillText(ending.title, W / 2, 162);

  ctx.fillStyle = '#C8BBA8';
  ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
  ctx.fillText(ending.subtitle, W / 2, 200);

  // Hero Oil-Painting Plate framed cleanly inside exhibition medallion
  const portraitBox = { x: 110, y: 235, w: 780, h: 490 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(portraitBox.x, portraitBox.y, portraitBox.w, portraitBox.h);
  ctx.clip();
  ctx.translate(portraitBox.x, portraitBox.y);
  const portraitRenderer = new PainterlyKilnRenderer();
  portraitRenderer.render(
    ctx,
    portraitBox.w,
    portraitBox.h,
    3.5,
    0,
    { ...state, scene: 'unsealing', ending: endingId },
    true,
  );
  ctx.restore();

  ctx.strokeStyle = 'rgba(219, 161, 60, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(portraitBox.x, portraitBox.y, portraitBox.w, portraitBox.h);

  ctx.fillStyle = '#F2E8DA';
  ctx.font = 'italic 23px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText(`“${ending.epigraph}”`, W / 2, 775);

  const statY = 825;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9E9182';
  ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('GLAZE FORMULA', 110, statY);
  ctx.fillText('PEAK KILN TEMP', 450, statY);
  ctx.fillText('RELIC SEAL', 710, statY);

  ctx.fillStyle = '#FBF7F0';
  ctx.font = '600 24px Georgia, "Times New Roman", serif';
  ctx.fillText(blend.blendName, 110, statY + 34);
  ctx.fillText(`${Math.round(state.peakTempC)}°C`, 450, statY + 34);
  ctx.fillStyle = ending.primaryTint;
  ctx.fillText(ending.sealMark, 710, statY + 34);

  const primaryMin = GLAZE_MINERALS[state.primaryGlaze];
  const secondaryMin = GLAZE_MINERALS[state.secondaryGlaze];
  const drawSwatch = (sx: number, sy: number, hex: string, label: string) => {
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.arc(sx + 10, sy - 6, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#F2E8DA';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#C8BBA8';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText(label, sx + 28, sy);
  };
  drawSwatch(110, statY + 68, primaryMin.hex, primaryMin.name);
  drawSwatch(280, statY + 68, secondaryMin.hex, secondaryMin.name);

  // Kiln Temperature Firing Curve Graph (600°C – 1300°C)
  const gx = 110;
  const gy = 955;
  const gw = 780;
  const gh = 265;

  ctx.fillStyle = '#140F0D';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = 'rgba(242, 232, 218, 0.22)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = '#DBA13C';
  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('KILN THERMAL FIRING CURVE (600°C – 1300°C)', gx + 16, gy + 28);

  const gridTemps = [600, 800, 1000, 1150, 1300];
  gridTemps.forEach((gt) => {
    const norm = (gt - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP);
    const y = gy + gh - 30 - norm * (gh - 72);
    ctx.strokeStyle = gt === 1150 ? 'rgba(230, 90, 40, 0.38)' : 'rgba(242, 232, 218, 0.1)';
    ctx.beginPath();
    ctx.moveTo(gx + 68, y);
    ctx.lineTo(gx + gw - 20, y);
    ctx.stroke();

    ctx.fillStyle = '#9E9182';
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`${gt}°`, gx + 16, y + 4);
  });

  const history =
    state.tempHistory.length >= 2
      ? state.tempHistory
      : [
          { step: 0, scene: 'hearth', tempC: 645, stress: 0 },
          { step: 1, scene: 'glaze', tempC: 840, stress: 0 },
          { step: 2, scene: 'stoking', tempC: Math.max(1020, state.peakTempC - 90), stress: 6 },
          { step: 3, scene: 'vitrification', tempC: state.peakTempC, stress: state.thermalStress },
          { step: 4, scene: 'unsealing', tempC: 675, stress: 0 },
        ];

  const plotX0 = gx + 76;
  const plotW = gw - 104;
  const plotBottom = gy + gh - 30;
  const plotH = gh - 72;

  ctx.beginPath();
  history.forEach((sample, idx) => {
    const x = plotX0 + (idx / Math.max(1, history.length - 1)) * plotW;
    const norm = Math.max(
      0,
      Math.min(1, (sample.tempC - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)),
    );
    const y = plotBottom - norm * plotH;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#E65A28';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.lineTo(plotX0 + plotW, plotBottom);
  ctx.lineTo(plotX0, plotBottom);
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, gy + 40, 0, plotBottom);
  fillGrad.addColorStop(0, 'rgba(230, 90, 40, 0.34)');
  fillGrad.addColorStop(1, 'rgba(219, 161, 60, 0.03)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  history.forEach((sample, idx) => {
    if (
      history.length > 14 &&
      idx % Math.ceil(history.length / 10) !== 0 &&
      idx !== history.length - 1
    ) {
      return;
    }
    const x = plotX0 + (idx / Math.max(1, history.length - 1)) * plotW;
    const norm = Math.max(
      0,
      Math.min(1, (sample.tempC - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)),
    );
    const y = plotBottom - norm * plotH;
    ctx.fillStyle = '#F7DDA0';
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#9E9182';
  ctx.font = '15px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${ending.relicClassification}  ·  Bellows Strokes: ${state.bellowsStrokes}  ·  The Last Kiln of Ember Valley`,
    W / 2,
    1292,
  );
  ctx.fillStyle = '#DBA13C';
  ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('CHROMA AWARDS SEASON 2  ·  ORIGINAL INTERACTIVE NARRATIVE RELIC', W / 2, 1326);
}
