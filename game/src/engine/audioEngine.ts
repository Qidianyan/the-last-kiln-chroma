import { KilnFoleySynth } from '../audio/kilnFoley';
import { AUDIO_MANIFEST_BY_ID } from '../data/audioManifest';
import type { GlazeMineralId, VoiceCueSpec } from '../types/game';

/**
 * V5 Studio Voiceover + Procedural WebAudio Ambient Cello & Kiln Foley Engine.
 * Plays bundled Zyphra/ZONOS3-Mini studio English MP3 narrations (`./audio/shot1_valley.mp3`..
 * `./audio/shot4_kintsugi_dawn.mp3`) alongside procedural wood-kiln bellows, cast-iron flue
 * damper, mineral glaze, and live Act IV Kintsugi gold-leaf shimmer Foley (`KilnFoleySynth`).
 */
export class KilnAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private droneOscA: OscillatorNode | null = null;
  private droneOscB: OscillatorNode | null = null;
  private crackleTimer: number | null = null;
  private enabled = false;
  private currentTempC = 645;
  private activeVoiceAudio: HTMLAudioElement | null = null;
  private lastPlayedPath = '';
  private activeCue: VoiceCueSpec | null = null;
  private readonly foley = new KilnFoleySynth();

  public isEnabled(): boolean {
    return this.enabled;
  }

  public getActiveCue(): VoiceCueSpec | null {
    return this.activeCue;
  }

  public toggle(): boolean {
    if (this.enabled) {
      this.disable();
      return false;
    }
    this.enable();
    return true;
  }

  public enable(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.0001;
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.28;
      this.ambientGain.connect(this.masterGain);

      this.droneFilter = this.ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.value = 230;
      this.droneFilter.Q.value = 2.0;
      this.droneFilter.connect(this.ambientGain);

      // Warm D2 + A2 chamber cello hearth drone
      this.droneOscA = this.ctx.createOscillator();
      this.droneOscA.type = 'sawtooth';
      this.droneOscA.frequency.value = 73.42;
      const gainA = this.ctx.createGain();
      gainA.gain.value = 0.14;
      this.droneOscA.connect(gainA);
      gainA.connect(this.droneFilter);

      this.droneOscB = this.ctx.createOscillator();
      this.droneOscB.type = 'triangle';
      this.droneOscB.frequency.value = 110.0;
      const gainB = this.ctx.createGain();
      gainB.gain.value = 0.12;
      this.droneOscB.connect(gainB);
      gainB.connect(this.droneFilter);

      this.droneOscA.start();
      this.droneOscB.start();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.35);
    }

    this.enabled = true;
    this.startCrackleLoop();
    this.updateTemperature(this.currentTempC);
  }

  public disable(): void {
    this.enabled = false;
    this.stopCrackleLoop();
    this.foley.resetCooldown();
    if (this.activeVoiceAudio) {
      this.activeVoiceAudio.pause();
      this.activeVoiceAudio = null;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    }
  }

  public updateTemperature(tempC: number): void {
    this.currentTempC = tempC;
    if (!this.enabled || !this.ctx || !this.droneFilter || !this.droneOscB) return;
    const norm = Math.max(0, Math.min(1, (tempC - 600) / 700));
    this.droneFilter.frequency.setTargetAtTime(175 + norm * 410, this.ctx.currentTime, 0.25);
    this.droneOscB.frequency.setTargetAtTime(110 + norm * 2.2, this.ctx.currentTime, 0.4);
  }

  private ensureResumed(): void {
    if (this.enabled && this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public playBellowsWhoosh(tempC?: number): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playBellowsStoke(this.ctx, this.masterGain, tempC ?? this.currentTempC);
  }

  public playFlueDamper(flueOpen: boolean): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playFlueVent(this.ctx, this.masterGain, flueOpen);
  }

  public playGlazeFoley(mineral: GlazeMineralId): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playGlazeMix(this.ctx, this.masterGain, mineral);
  }

  public playKintsugiGoldDust(coveragePct: number, precisionPct: number): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playKintsugiBrushShimmer(this.ctx, this.masterGain, coveragePct, precisionPct);
  }

  public playCeramicFracture(): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playCeramicFractureSnap(this.ctx, this.masterGain);
  }

  public playGradeSBell(): boolean {
    if (!this.enabled) return false;
    this.ensureResumed();
    return this.foley.playGradeSBronzeBell(this.ctx, this.masterGain);
  }

  public playCeramicChime(stepIndex = 0): void {
    if (!this.enabled || !this.ctx || !this.masterGain) return;
    const scaleHz = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 659.25];
    const freq = scaleHz[Math.abs(stepIndex) % scaleHz.length] ?? 440;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    const overtone = this.ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2.756, now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.14, now + 0.018);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 1.55);

    const overGain = this.ctx.createGain();
    overGain.gain.setValueAtTime(0.03, now);
    overGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.42);

    osc.connect(env);
    overtone.connect(overGain);
    overGain.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + 1.6);
    overtone.stop(now + 0.45);
  }

  public triggerVoiceCue(cueId: string, forceReplay = false): VoiceCueSpec | null {
    const spec = AUDIO_MANIFEST_BY_ID[cueId] ?? null;
    this.activeCue = spec;
    if (!spec || !this.enabled) return spec;

    this.playCeramicChime(cueId.length);

    if (
      !forceReplay &&
      this.activeVoiceAudio &&
      !this.activeVoiceAudio.paused &&
      this.lastPlayedPath === spec.audioPath
    ) {
      return spec;
    }

    if (this.activeVoiceAudio) {
      this.activeVoiceAudio.pause();
      this.activeVoiceAudio = null;
    }

    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      const audio = new Audio(spec.audioPath);
      audio.volume = 0.94;
      audio.addEventListener('playing', () => {
        this.duckAmbient(true);
      });
      audio.addEventListener('ended', () => {
        this.duckAmbient(false);
      });
      audio.addEventListener('error', () => {
        this.duckAmbient(false);
      });
      this.activeVoiceAudio = audio;
      this.lastPlayedPath = spec.audioPath;
      void audio.play().catch(() => {
        this.duckAmbient(false);
      });
    }

    return spec;
  }

  private duckAmbient(duck: boolean): void {
    if (!this.ambientGain || !this.ctx) return;
    this.ambientGain.gain.setTargetAtTime(duck ? 0.11 : 0.28, this.ctx.currentTime, 0.25);
  }

  private startCrackleLoop(): void {
    if (typeof window === 'undefined' || this.crackleTimer !== null) return;
    const scheduleNext = () => {
      if (!this.enabled) return;
      const heatFactor = Math.max(0.2, Math.min(1, (this.currentTempC - 600) / 650));
      const delayMs = 260 + Math.random() * (980 - heatFactor * 520);
      this.crackleTimer = window.setTimeout(() => {
        this.emitEmberTick(heatFactor);
        scheduleNext();
      }, delayMs);
    };
    scheduleNext();
  }

  private stopCrackleLoop(): void {
    if (typeof window !== 'undefined' && this.crackleTimer !== null) {
      window.clearTimeout(this.crackleTimer);
      this.crackleTimer = null;
    }
  }

  private emitEmberTick(heatFactor: number): void {
    if (!this.enabled || !this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const samples = Math.floor(this.ctx.sampleRate * 0.018);
    const buffer = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) {
      const env = Math.exp(-i / (samples * 0.25));
      ch[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 2600;
    bp.Q.value = 3.5;

    const gain = this.ctx.createGain();
    gain.gain.value = (0.035 + heatFactor * 0.08) * (0.5 + Math.random() * 0.6);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.ambientGain);
    src.start(now);
  }

  public dispose(): void {
    this.disable();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
