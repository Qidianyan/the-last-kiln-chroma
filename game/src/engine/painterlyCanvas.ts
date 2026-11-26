import { ENDINGS } from '../data/narrative';
import {
  computeBlackbodyRadiation,
  computeKintsugiCraftReport,
  stepKintsugiSparks,
  type KintsugiSession,
  type KintsugiSpark,
} from '../kintsugi';
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
 * V4 Cinema Stage Renderer:
 * Composites high-resolution impasto oil concept plates (`public/art/*.png`)
 * with physically inspired 1300°C ceramic blackbody thermal radiation flames,
 * live mineral glaze washes, interactive player-traced Kintsugi gold seams,
 * flowing gold lacquer sparks, depth-layered drifting embers, and 35mm warm film grain.
 */
export class PainterlyKilnRenderer {
  private particles: EmberParticle[] = [];
  private activeKintsugiSparks: KintsugiSpark[] = [];
  private lastKintsugiStrokeCount = 0;
  private lastKintsugiSeed = -1;
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
    for (let i = 0; i < 24; i += 1) {
      this.particles.push({
        x: 0.44 + (this.rand() - 0.5) * 0.24,
        y: 0.72 + (this.rand() - 0.5) * 0.12,
        vx: (this.rand() - 0.5) * 0.14,
        vy: -(0.14 + this.rand() * 0.25),
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
    kintsugi?: KintsugiSession,
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

    const blackbody = computeBlackbodyRadiation(state.temperatureC);
    const heatNorm = blackbody.normalizedHeat;
    const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);

    ctx.save();
    ctx.fillStyle = '#0D0A08';
    ctx.fillRect(0, 0, width, height);

    // 1. Oil-Painting Cinema Backdrop (smooth crossfade between acts)
    const prevImg = sharedArtCache[this.prevArtKey];
    const currImg = sharedArtCache[this.activeArtKey];
    if (this.crossfadeProgress < 1 && prevImg) {
      this.drawCoverImage(ctx, prevImg, width, height, timeSec, 1, reducedMotion);
    }
    if (currImg && currImg.complete && currImg.naturalWidth > 0) {
      this.drawCoverImage(ctx, currImg, width, height, timeSec, this.crossfadeProgress, reducedMotion);
    } else {
      const fallbackGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.48,
        30,
        width * 0.5,
        height * 0.5,
        width * 0.65,
      );
      fallbackGrad.addColorStop(0, blackbody.midHex);
      fallbackGrad.addColorStop(0.5, '#221611');
      fallbackGrad.addColorStop(1, '#0D0A08');
      ctx.fillStyle = fallbackGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Physically inspired 1300°C Ceramic Blackbody Thermal Radiation & Multi-Layer Convective Flames
    this.drawBlackbodyThermalFlames(ctx, width, height, timeSec, state, blend, blackbody, reducedMotion);

    // 3. Interactive Player-Traced Kintsugi Fracture Skeleton & Molten Gold Deposition
    this.drawInteractiveKintsugiOverlay(ctx, width, height, timeSec, dt, state, blend, heatNorm, kintsugi);

    // 4. Acoustic Golden Memory Rings
    this.drawMemoryWaves(ctx, width, height, timeSec, state);

    // 5. Depth-Layered Drifting Embers & Warm Ash Snow
    this.updateAndDrawParticles(ctx, width, height, dt, timeSec, state, heatNorm, reducedMotion);

    // 6. 35mm Warm Film Grain & Edge Scrim
    this.drawCinemaGradingAndFraming(ctx, width, height, heatNorm);
    ctx.restore();
  }

  private drawBlackbodyThermalFlames(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    state: KilnState,
    blend: GlazeBlend,
    blackbody: ReturnType<typeof computeBlackbodyRadiation>,
    reducedMotion: boolean,
  ): void {
    const heatNorm = blackbody.normalizedHeat;
    const breath = reducedMotion
      ? 0.9
      : 0.82 + 0.18 * Math.sin(t * (2.6 + heatNorm * 2.2)) + this.pulseEnergy * 0.52;
    const isFiring = state.scene === 'stoking' || state.scene === 'vitrification';
    const baseStrength = state.scene === 'unsealing' ? 0.14 : isFiring ? 0.38 : 0.22;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Ceramic blackbody core-to-rim radial radiation bloom
    const cx = w * 0.5;
    const cy = h * 0.46;
    const fireGlow = ctx.createRadialGradient(cx, cy, 18, cx, cy, w * (0.36 + heatNorm * 0.16));
    fireGlow.addColorStop(0, blackbody.coreHex);
    fireGlow.addColorStop(0.32, blackbody.midHex);
    fireGlow.addColorStop(0.68, blackbody.rimHex);
    fireGlow.addColorStop(1, 'rgba(15, 11, 9, 0)');
    ctx.globalAlpha = Math.min(0.68, (baseStrength + heatNorm * 0.28) * breath);
    ctx.fillStyle = fireGlow;
    ctx.fillRect(0, 0, w, h);

    // Multi-layered convective flame ribbons around the furnace mouth during active kiln firing
    if ((isFiring || this.pulseEnergy > 0.15) && state.scene !== 'unsealing') {
      const tongues = 7;
      const baseY = h * 0.72;
      const flameIntensity = Math.min(1.2, heatNorm * 0.92 + this.pulseEnergy * 0.55);
      for (let i = 0; i < tongues; i += 1) {
        const offset = (i / (tongues - 1) - 0.5) * Math.min(w * 0.34, 410);
        const phase = reducedMotion ? i * 1.1 : t * (3.1 + (i % 3) * 0.85) + i * 1.3;
        const sway = Math.sin(phase) * (14 + flameIntensity * 18) * blackbody.flameTurbulence;
        const fh = (95 + flameIntensity * 170) * (0.74 + 0.26 * Math.cos(i * 1.2));
        const fw = 28 + flameIntensity * 24;

        const fg = ctx.createLinearGradient(cx + offset, baseY, cx + offset + sway, baseY - fh);
        fg.addColorStop(0, blackbody.coreHex);
        fg.addColorStop(0.45, blackbody.midHex);
        fg.addColorStop(1, 'rgba(184, 58, 34, 0)');

        ctx.globalAlpha = Math.min(0.42, 0.16 + flameIntensity * 0.22);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(cx + offset - fw, baseY);
        ctx.bezierCurveTo(
          cx + offset - fw * 0.65,
          baseY - fh * 0.45,
          cx + offset + sway - fw * 0.2,
          baseY - fh * 0.8,
          cx + offset + sway,
          baseY - fh,
        );
        ctx.bezierCurveTo(
          cx + offset + sway + fw * 0.25,
          baseY - fh * 0.76,
          cx + offset + fw * 0.65,
          baseY - fh * 0.42,
          cx + offset + fw,
          baseY,
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // Live mineral glaze pigment atmosphere tint in Act II+
    if (state.glazeMixed || state.scene !== 'hearth') {
      const glazeHalo = ctx.createRadialGradient(cx, cy, 18, cx, cy, w * 0.32);
      glazeHalo.addColorStop(0, blend.veinHex);
      glazeHalo.addColorStop(0.55, blend.bodyHex);
      glazeHalo.addColorStop(1, 'rgba(15, 11, 9, 0)');
      ctx.globalAlpha = this.glazeRippleAge < 1.8 ? 0.28 : 0.1;
      ctx.fillStyle = glazeHalo;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private drawInteractiveKintsugiOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
    dt: number,
    state: KilnState,
    blend: GlazeBlend,
    heatNorm: number,
    kintsugi?: KintsugiSession,
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

    // Render interactive procedural Kintsugi crack skeleton in Act IV (and subtle heat hairline if overstressed in Act III),
    // keeping Act V dawn oil plates uncluttered by raw vector fissure lines.
    const showKintsugi =
      kintsugi &&
      (state.scene === 'vitrification' ||
        (state.scene === 'stoking' && state.thermalStress > 25));

    if (!showKintsugi || !kintsugi) {
      this.activeKintsugiSparks = [];
      return;
    }

    // Ingest newly emitted gold sparks once per strokeCount change and animate them cleanly across RAF frames
    if (kintsugi.seed !== this.lastKintsugiSeed || kintsugi.strokeCount === 0) {
      this.activeKintsugiSparks = [];
      this.lastKintsugiSeed = kintsugi.seed;
      this.lastKintsugiStrokeCount = kintsugi.strokeCount;
    } else if (kintsugi.strokeCount !== this.lastKintsugiStrokeCount) {
      const freshCount = Math.min(kintsugi.sparks.length, 6);
      if (freshCount > 0) {
        this.activeKintsugiSparks = [
          ...this.activeKintsugiSparks.slice(-42),
          ...kintsugi.sparks.slice(-freshCount),
        ];
      }
      this.lastKintsugiStrokeCount = kintsugi.strokeCount;
    }
    this.activeKintsugiSparks = stepKintsugiSparks(this.activeKintsugiSparks, dt);

    const interactiveAct = state.scene === 'vitrification';
    const scale = Math.min(w, h) / 720;
    const pulse = 0.78 + 0.22 * Math.sin(t * 4.0);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const branch of kintsugi.branches) {
      const pts = branch.nodeIds.map((id) => kintsugi.nodes[id]!).filter(Boolean);
      if (pts.length < 2) continue;

      // 1. Raw fractured stoneware fissure + glowing thermal edge
      ctx.beginPath();
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x * w, p.y * h);
        else ctx.lineTo(p.x * w, p.y * h);
      });
      ctx.strokeStyle = interactiveAct ? 'rgba(20, 12, 9, 0.92)' : 'rgba(20, 12, 9, 0.45)';
      ctx.lineWidth = 5.2 * scale;
      ctx.stroke();

      ctx.strokeStyle = interactiveAct
        ? `rgba(255, 138, 66, ${(0.55 + heatNorm * 0.35).toFixed(3)})`
        : 'rgba(230, 90, 40, 0.32)';
      ctx.lineWidth = 2.0 * scale;
      ctx.stroke();

      // 2. Segment-by-segment liquid 24k gold deposition wherever the player traced!
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const segGold = Math.min(
          1,
          state.ending === 'gilded_reliquary' && kintsugi.coveragePct === 0
            ? 0.9
            : (a.gilded + b.gilded) * 0.5,
        );
        if (segGold <= 0.04) continue;

        const taper = branch.branchIndex === 0 ? 1.0 - (i / pts.length) * 0.24 : 0.86 - (i / pts.length) * 0.34;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);

        // Warm outer 24k molten gold aura
        ctx.strokeStyle = '#DBA13C';
        ctx.shadowColor = '#E65A28';
        ctx.shadowBlur = 13 * segGold * pulse;
        ctx.globalAlpha = 0.78 * segGold;
        ctx.lineWidth = (2.8 + segGold * 2.4) * taper * scale;
        ctx.stroke();

        // Crisp luminous white-gold urushi specular spine
        ctx.strokeStyle = '#FFF4DC';
        ctx.shadowColor = '#F7DDA0';
        ctx.shadowBlur = 7 * segGold;
        ctx.globalAlpha = 0.88 * segGold;
        ctx.lineWidth = 1.45 * taper * scale;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Subtle pulsing guide beads on remaining un-gilded nodes during Act IV so tracing affordance is unmistakable
    if (interactiveAct) {
      for (let i = 0; i < kintsugi.nodes.length; i += 3) {
        const node = kintsugi.nodes[i]!;
        if (node.gilded >= 0.65) continue;
        const glow = 0.35 + 0.4 * Math.sin(t * 3.6 + i * 0.6);
        ctx.fillStyle = `rgba(247, 221, 160, ${glow.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(node.x * w, node.y * h, 3.2 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Active molten gold brush sparks (stepped persistently across RAF frames above)
    ctx.globalCompositeOperation = 'lighter';
    for (const sp of this.activeKintsugiSparks) {
      const alpha = Math.max(0, 1 - sp.life / sp.maxLife);
      ctx.fillStyle = `rgba(255, 240, 194, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sp.x * w, sp.y * h, sp.size * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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
 * showcasing the oil-painting hero art plate, player's traced Kintsugi grade & unique signature,
 * mineral glaze swatches, and real 600°C-1300°C kiln firing curve.
 */
export function renderRelicCardToCanvas(
  canvas: HTMLCanvasElement,
  state: KilnState,
  endingId: EndingId,
  kintsugi?: KintsugiSession,
): void {
  const W = 1000;
  const H = 1400;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ending = ENDINGS[endingId];
  const blend = computeGlazeBlend(state.primaryGlaze, state.secondaryGlaze);
  const craftReport = kintsugi
    ? computeKintsugiCraftReport(kintsugi, blend.blendName, state.peakTempC)
    : null;

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

  const portraitBox = { x: 110, y: 235, w: 780, h: 480 };
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
    kintsugi,
  );
  ctx.restore();

  ctx.strokeStyle = 'rgba(219, 161, 60, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(portraitBox.x, portraitBox.y, portraitBox.w, portraitBox.h);

  ctx.fillStyle = '#F2E8DA';
  ctx.font = 'italic 23px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.fillText(`“${ending.epigraph}”`, W / 2, 766);

  const statY = 816;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9E9182';
  ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('GLAZE FORMULA', 110, statY);
  ctx.fillText('PEAK KILN TEMP', 425, statY);
  ctx.fillText('KINTSUGI HALLMARK', 670, statY);

  ctx.fillStyle = '#FBF7F0';
  ctx.font = '600 24px Georgia, "Times New Roman", serif';
  ctx.fillText(blend.blendName, 110, statY + 34);
  ctx.fillText(`${Math.round(state.peakTempC)}°C`, 425, statY + 34);
  ctx.fillStyle = ending.primaryTint;
  ctx.fillText(
    craftReport ? `${craftReport.signature} (${craftReport.grade})` : ending.sealMark,
    670,
    statY + 34,
  );

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
  if (craftReport) {
    ctx.fillStyle = '#F7DDA0';
    ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(
      `Gold ${craftReport.coveragePct}%  Precision ${craftReport.precisionPct}%`,
      670,
      statY + 68,
    );
  }

  // Kiln Temperature Firing Curve Graph (600°C – 1300°C)
  const gx = 110;
  const gy = 950;
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
    `${ending.relicClassification}  ·  ${craftReport ? craftReport.gradeTitle : ending.sealMark}  ·  Bellows Strokes: ${state.bellowsStrokes}`,
    W / 2,
    1290,
  );
  ctx.fillStyle = '#DBA13C';
  ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('CHROMA AWARDS SEASON 2  ·  ORIGINAL INTERACTIVE NARRATIVE RELIC', W / 2, 1326);
}
