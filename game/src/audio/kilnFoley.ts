/**
 * V5 Pure WebAudio Procedural Ceramic & Wood-Kiln Foley Engine.
 *
 * Zero external asset dependencies, 100% autoplay-safe, and harmonizes cleanly
 * with the top-bar Studio Voice & Audio toggle:
 *   - Wooden bellows rush + temperature-scaled pine-ember crackle pops (`playBellowsStoke`)
 *   - Cast-iron kiln damper clank & draft intake (`playFlueVent`)
 *   - Mineral pigment tactile mortar/pour/gold-leaf Foley (`playGlazeMix`)
 *   - Live Act IV Kintsugi 24k gold-leaf brush shimmer ascending smoothly along
 *     a warm D-Major pentatonic scale as gold coverage grows (`playKintsugiBrushShimmer`)
 *   - Crisp stoneware thermal-stress fracture snap (`playCeramicFractureSnap`)
 *   - Resonant bronze-temple / stoneware harmonic bell chord on reaching Grade S (`playGradeSBronzeBell`)
 */

import { MAX_KILN_TEMP, MIN_KILN_TEMP } from '../engine/kilnPhysics';
import type { GlazeMineralId } from '../types/game';

/** D-Major luminous pentatonic shimmer scale (D5 -> F#6) */
export const KINTSUGI_SHIMMER_SCALE_HZ: readonly number[] = [
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.0, // A5
  987.77, // B5
  1174.66, // D6
  1318.51, // E6
  1479.98, // F#6
] as const;

export interface BellowsAcoustics {
  heatNorm: number;
  baseFreqHz: number;
  peakFreqHz: number;
  crackleCount: number;
  gainPeak: number;
}

export interface KintsugiShimmerParams {
  freqHz: number;
  harmonicHz: number;
  gain: number;
  decaySec: number;
}

export interface MinimalAudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createBiquadFilter(): BiquadFilterNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
}

export function computeBellowsAcoustics(tempC: number): BellowsAcoustics {
  const safeTemp = Number.isFinite(tempC) ? tempC : MIN_KILN_TEMP;
  const clamped = Math.max(MIN_KILN_TEMP, Math.min(MAX_KILN_TEMP, safeTemp));
  const heatNorm = Number(
    ((clamped - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP)).toFixed(3),
  );
  return {
    heatNorm,
    baseFreqHz: Math.round(145 + heatNorm * 95),
    peakFreqHz: Math.round(440 + heatNorm * 420),
    crackleCount: Math.round(3 + heatNorm * 6),
    gainPeak: Number((0.32 + heatNorm * 0.16).toFixed(3)),
  };
}

export function computeKintsugiShimmerParams(
  coveragePct: number,
  precisionPct: number,
): KintsugiShimmerParams {
  const safeCov = Number.isFinite(coveragePct) ? Math.max(0, Math.min(100, coveragePct)) : 0;
  const safePrec = Number.isFinite(precisionPct) ? Math.max(0, Math.min(100, precisionPct)) : 100;
  const idx = Math.min(
    KINTSUGI_SHIMMER_SCALE_HZ.length - 1,
    Math.floor((safeCov / 100) * KINTSUGI_SHIMMER_SCALE_HZ.length),
  );
  const freqHz = KINTSUGI_SHIMMER_SCALE_HZ[idx] ?? 587.33;
  // Slightly warmer harmonic overtone when player traces accurately on-seam
  const harmonicRatio = safePrec >= 70 ? 2.0 : 2.42;
  return {
    freqHz,
    harmonicHz: Number((freqHz * harmonicRatio).toFixed(2)),
    gain: Number((0.065 + (safeCov / 100) * 0.055).toFixed(3)),
    decaySec: Number((0.42 + (safeCov / 100) * 0.38).toFixed(3)),
  };
}

export class KilnFoleySynth {
  private lastShimmerTimeSec = -1;
  private readonly shimmerCooldownSec: number;

  constructor(shimmerCooldownSec = 0.065) {
    this.shimmerCooldownSec = Math.max(0.01, shimmerCooldownSec);
  }

  private isContextReady(ctx: MinimalAudioContextLike | null): ctx is MinimalAudioContextLike {
    return Boolean(ctx && ctx.state !== 'closed' && ctx.state !== 'suspended');
  }

  private createNoiseBuffer(
    ctx: MinimalAudioContextLike,
    durSec: number,
    brownianFactor: number,
  ): AudioBuffer {
    const sr = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0 ? ctx.sampleRate : 48000;
    const safeDur = Number.isFinite(durSec) && durSec > 0 ? durSec : 0.05;
    const length = Math.max(16, Math.floor(sr * safeDur));
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    let state = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (brownianFactor > 0) {
        state = (state + brownianFactor * white) / (1 + brownianFactor);
        data[i] = Math.max(-1, Math.min(1, state * 3.1));
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  /** Deep leather bellows air surge + wooden intake thump + temperature-scaled pine ember pops */
  public playBellowsStoke(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
    tempC: number,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;
    const ac = computeBellowsAcoustics(tempC);
    const dur = 0.62;

    // 1. Air rush through furnace tuyere
    const rushSrc = ctx.createBufferSource();
    rushSrc.buffer = this.createNoiseBuffer(ctx, dur, 0.045);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(ac.baseFreqHz, now);
    bp.frequency.exponentialRampToValueAtTime(ac.peakFreqHz, now + 0.2);
    bp.frequency.exponentialRampToValueAtTime(Math.max(95, ac.baseFreqHz * 0.72), now + dur);
    bp.Q.value = 1.45;

    const rushGain = ctx.createGain();
    rushGain.gain.setValueAtTime(0.001, now);
    rushGain.gain.linearRampToValueAtTime(ac.gainPeak, now + 0.13);
    rushGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    rushSrc.connect(bp);
    bp.connect(rushGain);
    rushGain.connect(dest);
    rushSrc.start(now);

    // 2. Low wooden bellows board resonance
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime(92, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(48, now + 0.18);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.001, now);
    thumpGain.gain.linearRampToValueAtTime(0.16, now + 0.025);
    thumpGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(dest);
    thumpOsc.start(now);
    thumpOsc.stop(now + 0.24);

    // 3. Burst of crackling pine embers stirred by the draft
    for (let i = 0; i < ac.crackleCount; i += 1) {
      const onset = now + 0.08 + i * (0.42 / Math.max(1, ac.crackleCount));
      const popSrc = ctx.createBufferSource();
      popSrc.buffer = this.createNoiseBuffer(ctx, 0.016, 0);

      const popBp = ctx.createBiquadFilter();
      popBp.type = 'bandpass';
      popBp.frequency.setValueAtTime(1600 + ((i * 571) % 2600), onset);
      popBp.Q.value = 3.8;

      const popGain = ctx.createGain();
      popGain.gain.setValueAtTime(0.065 + ac.heatNorm * 0.06, onset);
      popGain.gain.exponentialRampToValueAtTime(0.0006, onset + 0.016);

      popSrc.connect(popBp);
      popBp.connect(popGain);
      popGain.connect(dest);
      popSrc.start(onset);
    }

    return true;
  }

  /** Cast-iron flue damper clank + cooling draft hiss (opening) or muffled iron seal (closing) */
  public playFlueVent(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
    flueOpen: boolean,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;

    // 1. Cast-iron metallic damper strike (inharmonic iron partials)
    const partials = flueOpen ? [318, 694, 1280] : [242, 535, 960];
    partials.forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.96, now + 0.26);

      const g = ctx.createGain();
      const amp = (flueOpen ? 0.095 : 0.11) / (idx + 1);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0005, now + (0.28 - idx * 0.06));

      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.3);
    });

    // 2. Chimney air draft whoosh when venting open
    if (flueOpen) {
      const dur = 0.44;
      const draftSrc = ctx.createBufferSource();
      draftSrc.buffer = this.createNoiseBuffer(ctx, dur, 0.02);

      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(640, now);
      hp.frequency.exponentialRampToValueAtTime(1180, now + 0.16);
      hp.frequency.exponentialRampToValueAtTime(420, now + dur);
      hp.Q.value = 1.9;

      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.001, now);
      dg.gain.linearRampToValueAtTime(0.11, now + 0.06);
      dg.gain.exponentialRampToValueAtTime(0.0008, now + dur);

      draftSrc.connect(hp);
      hp.connect(dg);
      dg.connect(dest);
      draftSrc.start(now);
    }

    return true;
  }

  /** Mineral pigment tactile cue (dry mortar grind, liquid slip stir, or gold leaf flutter) */
  public playGlazeMix(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
    mineral: GlazeMineralId,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;

    const pitchMap: Record<GlazeMineralId, number> = {
      ash: 329.63,
      ochre: 392.0,
      cinnabar: 440.0,
      gold: 659.25,
    };
    const freq = pitchMap[mineral] ?? 392.0;

    const osc = ctx.createOscillator();
    osc.type = mineral === 'gold' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * (mineral === 'cinnabar' ? 1.12 : 1.01), now + 0.22);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.09, now + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.52);

    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.55);

    // Subtle mortar powder / slip brush noise texture
    const nDur = 0.14;
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = this.createNoiseBuffer(ctx, nDur, mineral === 'cinnabar' ? 0.05 : 0.01);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(mineral === 'gold' ? 3200 : mineral === 'cinnabar' ? 780 : 1650, now);
    filt.Q.value = 2.4;

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.045, now);
    ng.gain.exponentialRampToValueAtTime(0.0005, now + nDur);

    nSrc.connect(filt);
    filt.connect(ng);
    ng.connect(dest);
    nSrc.start(now);
    return true;
  }

  /**
   * Act IV live Kintsugi tracing shimmer: rate-limited crystalline 24k gold dust micro-chime
   * ascending along D-Major pentatonic scale as repair coverage grows from 0% -> 100%.
   */
  public playKintsugiBrushShimmer(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
    coveragePct: number,
    precisionPct: number,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;
    if (
      this.lastShimmerTimeSec >= 0 &&
      now >= this.lastShimmerTimeSec &&
      now - this.lastShimmerTimeSec < this.shimmerCooldownSec
    ) {
      return false;
    }
    this.lastShimmerTimeSec = now;

    const params = computeKintsugiShimmerParams(coveragePct, precisionPct);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(params.freqHz, now);

    const overtone = ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(params.harmonicHz, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0008, now);
    env.gain.linearRampToValueAtTime(params.gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0005, now + params.decaySec);

    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(params.gain * 0.28, now);
    overGain.gain.exponentialRampToValueAtTime(0.0004, now + params.decaySec * 0.65);

    osc.connect(env);
    overtone.connect(overGain);
    overGain.connect(env);
    env.connect(dest);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + params.decaySec + 0.03);
    overtone.stop(now + params.decaySec * 0.7);

    // Delicate gold-dust brush whisper
    const dustSrc = ctx.createBufferSource();
    dustSrc.buffer = this.createNoiseBuffer(ctx, 0.06, 0);
    const dustBp = ctx.createBiquadFilter();
    dustBp.type = 'bandpass';
    dustBp.frequency.setValueAtTime(3800 + params.freqHz * 0.5, now);
    dustBp.Q.value = 4.0;
    const dustGain = ctx.createGain();
    dustGain.gain.setValueAtTime(0.022, now);
    dustGain.gain.exponentialRampToValueAtTime(0.0004, now + 0.06);

    dustSrc.connect(dustBp);
    dustBp.connect(dustGain);
    dustGain.connect(dest);
    dustSrc.start(now);

    return true;
  }

  /** Crisp thermal stoneware fracture crack when the vessel opens its midnight stress seam */
  public playCeramicFractureSnap(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;

    const snapSrc = ctx.createBufferSource();
    snapSrc.buffer = this.createNoiseBuffer(ctx, 0.09, 0);
    const snapBp = ctx.createBiquadFilter();
    snapBp.type = 'bandpass';
    snapBp.frequency.setValueAtTime(3400, now);
    snapBp.Q.value = 2.6;

    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.24, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.085);

    snapSrc.connect(snapBp);
    snapBp.connect(snapGain);
    snapGain.connect(dest);
    snapSrc.start(now);

    // Resonant ceramic ring following the fissure
    for (const [hz, amp, dec] of [
      [2840, 0.075, 0.24],
      [4420, 0.045, 0.16],
      [210, 0.12, 0.14],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dec);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + dec + 0.02);
    }

    return true;
  }

  /** Celebratory warm bronze-temple & stoneware resonance chord when Kintsugi reaches Grade S */
  public playGradeSBronzeBell(
    ctx: MinimalAudioContextLike | null,
    dest: AudioNode | null,
  ): boolean {
    if (!this.isContextReady(ctx) || !dest) return false;
    const now = ctx.currentTime;

    const bellChord: ReadonlyArray<readonly [number, number, number, number]> = [
      [293.66, 0.14, 2.8, 0.0], // D4 bronze fundamental
      [440.0, 0.11, 2.4, 0.04], // A4 fifth
      [739.99, 0.09, 2.1, 0.09], // F#5 radiant Picardy third
      [1174.66, 0.06, 1.7, 0.14], // D6 golden crown overtone
    ];

    for (const [hz, amp, decay, delay] of bellChord) {
      const onset = now + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, onset);

      const shimmer = ctx.createOscillator();
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(hz * 2.004, onset);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0008, onset);
      env.gain.linearRampToValueAtTime(amp, onset + 0.022);
      env.gain.exponentialRampToValueAtTime(0.0005, onset + decay);

      const shimGain = ctx.createGain();
      shimGain.gain.setValueAtTime(amp * 0.24, onset);
      shimGain.gain.exponentialRampToValueAtTime(0.0004, onset + decay * 0.55);

      osc.connect(env);
      shimmer.connect(shimGain);
      shimGain.connect(env);
      env.connect(dest);

      osc.start(onset);
      shimmer.start(onset);
      osc.stop(onset + decay + 0.05);
      shimmer.stop(onset + decay * 0.6);
    }

    return true;
  }

  public resetCooldown(): void {
    this.lastShimmerTimeSec = -1;
  }
}
