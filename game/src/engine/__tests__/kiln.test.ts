import { describe, expect, it } from 'vitest';
import { AUDIO_MANIFEST_BY_ID, ELEVENLABS_AUDIO_MANIFEST } from '../../data/audioManifest';
import {
  CHOICE_ONE_OPTIONS,
  CHOICE_THREE_OPTIONS,
  CHOICE_TWO_OPTIONS,
  ENDINGS,
  SCENES,
} from '../../data/narrative';
import {
  CANONICAL_ENDING_PATHS,
  clampKilnTemp,
  computeGlazeBlend,
  createInitialKilnState,
  getKilnZoneLabel,
  getNextScene,
  GLAZE_MINERALS,
  MAX_KILN_TEMP,
  MIN_KILN_TEMP,
  resolveEnding,
  SCENE_ORDER,
  SHATTER_STRESS_LIMIT,
  stepKilnTemperature,
} from '../kilnPhysics';
import {
  computeBellowsAcoustics,
  computeKintsugiShimmerParams,
  KINTSUGI_SHIMMER_SCALE_HZ,
  KilnFoleySynth,
  type MinimalAudioContextLike,
} from '../../audio/kilnFoley';
import { KilnAudioEngine } from '../audioEngine';
import {
  applyKintsugiStroke,
  computeBlackbodyRadiation,
  computeKintsugiCraftReport,
  generateKintsugiSkeleton,
  stepKintsugiSparks,
  traceNextKintsugiBranch,
} from '../../kintsugi';
import type { EndingId, GlazeMineralId, SceneId } from '../../types/game';

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = Number.parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('Kiln thermal physics (600C - 1300C)', () => {
  it('clamps temperatures strictly within physical kiln limits', () => {
    expect(clampKilnTemp(120)).toBe(MIN_KILN_TEMP);
    expect(clampKilnTemp(1800)).toBe(MAX_KILN_TEMP);
    expect(clampKilnTemp(1050)).toBe(1050);
  });

  it('heats up when stoking bellows and cools when venting flue', () => {
    let state = createInitialKilnState();
    const startTemp = state.temperatureC;

    for (let i = 0; i < 4; i += 1) {
      const next = stepKilnTemperature(state, 0.85, 'stoke');
      state = { ...state, ...next };
    }
    expect(state.temperatureC).toBeGreaterThan(startTemp + 120);
    expect(state.bellowsStrokes).toBe(4);
    expect(state.peakTempC).toBeGreaterThanOrEqual(state.temperatureC);

    const peakedTemp = state.temperatureC;
    let vented = { ...state, flueOpen: true };
    for (let i = 0; i < 4; i += 1) {
      const next = stepKilnTemperature(vented, 0.8, 'vent');
      vented = { ...vented, ...next };
    }
    expect(vented.temperatureC).toBeLessThan(peakedTemp - 50);
  });

  it('accumulates thermal stress above 1235C and recovers below 1180C', () => {
    let hot = {
      ...createInitialKilnState(),
      temperatureC: 1275,
      peakTempC: 1275,
      thermalVelocity: 10,
      thermalStress: 0,
    };
    for (let i = 0; i < 4; i += 1) {
      const next = stepKilnTemperature(hot, 0.9, 'stoke');
      hot = { ...hot, ...next };
    }
    expect(hot.thermalStress).toBeGreaterThan(30);

    let cooled = { ...hot, temperatureC: 1040, thermalVelocity: 0 };
    const afterCool = stepKilnTemperature(cooled, 1.0, 'idle');
    expect(afterCool.thermalStress).toBeLessThan(hot.thermalStress);
  });

  it('classifies kiln thermal zones monotonically across 600C-1300C', () => {
    expect(getKilnZoneLabel(640).band).toBe('ember');
    expect(getKilnZoneLabel(840).band).toBe('bisque');
    expect(getKilnZoneLabel(1080).band).toBe('stoneware');
    expect(getKilnZoneLabel(1200).band).toBe('vitrification');
    expect(getKilnZoneLabel(1285).band).toBe('critical');
  });
});

describe('Mineral glaze combinations & warm palette discipline', () => {
  const minerals: GlazeMineralId[] = ['ash', 'ochre', 'cinnabar', 'gold'];

  it('produces valid blends across all 16 mineral pairs with zero blue/cyan/teal/purple bias', () => {
    for (const primary of minerals) {
      for (const secondary of minerals) {
        const blend = computeGlazeBlend(primary, secondary);
        expect(blend.blendName.length).toBeGreaterThan(4);
        expect(blend.sheen).toBeGreaterThan(0);
        expect(blend.sheen).toBeLessThanOrEqual(1);

        // Enforce strict warm earthy/terracotta/amber/olive palette: blue channel never exceeds red or green
        for (const hex of [blend.bodyHex, blend.lipHex, blend.veinHex]) {
          const [r, g, b] = parseHexRgb(hex);
          expect(b).toBeLessThanOrEqual(r);
          expect(b).toBeLessThanOrEqual(g);
        }
      }
    }

    for (const m of Object.values(GLAZE_MINERALS)) {
      const [r, g, b] = parseHexRgb(m.hex);
      expect(b).toBeLessThanOrEqual(r);
      expect(b).toBeLessThanOrEqual(g);
    }
  });
});

describe('Branching narrative graph & all 4 illustrated endings reachable', () => {
  it('links all 5 acts linearly from hearth to unsealing without orphan scenes', () => {
    expect(SCENE_ORDER).toEqual([
      'hearth',
      'glaze',
      'stoking',
      'vitrification',
      'unsealing',
    ]);
    let cursor: SceneId = 'hearth';
    const visited: SceneId[] = [cursor];
    while (true) {
      const next = getNextScene(cursor);
      if (!next) break;
      visited.push(next);
      cursor = next;
    }
    expect(visited).toEqual(SCENE_ORDER);

    for (const id of SCENE_ORDER) {
      expect(SCENES[id].openingLines.length).toBeGreaterThanOrEqual(3);
      expect(AUDIO_MANIFEST_BY_ID[SCENES[id].voiceCueId]).toBeDefined();
    }
  });

  it('reaches every one of the 4 distinct endings through canonical gameplay choices', () => {
    const reached = new Set<EndingId>();

    for (const path of CANONICAL_ENDING_PATHS) {
      const result = resolveEnding(path);
      expect(result).toBe(path.ending);
      expect(ENDINGS[result]).toBeDefined();
      expect(AUDIO_MANIFEST_BY_ID[ENDINGS[result].voiceCueId]).toBeDefined();
      reached.add(result);
    }

    expect(reached.size).toBe(4);
    expect([...reached].sort()).toEqual([
      'ash_witness_urn',
      'gilded_reliquary',
      'open_kiln_dawn',
      'singing_hearth_vessel',
    ]);
  });

  it('triggers open_kiln_dawn when thermal stress exceeds shatter threshold', () => {
    const overfired = resolveEnding({
      primaryGlaze: 'gold',
      secondaryGlaze: 'cinnabar',
      choiceOne: 'ledger',
      choiceTwo: 'lullaby',
      choiceThree: 'kintsugi',
      peakTempC: 1295,
      thermalStress: SHATTER_STRESS_LIMIT + 5,
    });
    expect(overfired).toBe('open_kiln_dawn');
  });

  it('verifies every choice and ending cue is registered in the ElevenLabs audio manifest', () => {
    const allChoiceCues = [
      ...CHOICE_ONE_OPTIONS.map((c) => c.voiceCueId),
      ...CHOICE_TWO_OPTIONS.map((c) => c.voiceCueId),
      ...CHOICE_THREE_OPTIONS.map((c) => c.voiceCueId),
    ];
    for (const cueId of allChoiceCues) {
      expect(AUDIO_MANIFEST_BY_ID[cueId]).toBeDefined();
    }
    expect(ELEVENLABS_AUDIO_MANIFEST.length).toBeGreaterThanOrEqual(16);
  });
});

describe('V4 Interactive Kintsugi fracture engine & 1300C blackbody thermal curve', () => {
  it('computes monotonic 600C-1300C ceramic blackbody radiance with strict zero blue/purple palette', () => {
    const temps = [600, 760, 940, 1100, 1220, 1300];
    let prevHeat = -1;
    let prevLum = -1;

    for (const temp of temps) {
      const rad = computeBlackbodyRadiation(temp);
      expect(rad.normalizedHeat).toBeGreaterThan(prevHeat);
      prevHeat = rad.normalizedHeat;

      for (const hex of [rad.coreHex, rad.midHex, rad.rimHex]) {
        const [r, g, b] = parseHexRgb(hex);
        expect(b).toBeLessThanOrEqual(g);
        expect(g).toBeLessThanOrEqual(r);
      }

      const [mr, mg, mb] = parseHexRgb(rad.midHex);
      const lum = mr * 0.299 + mg * 0.587 + mb * 0.114;
      expect(lum).toBeGreaterThan(prevLum);
      prevLum = lum;
    }

    expect(computeBlackbodyRadiation(1300).stageLabel).toBe('White-Gold Vitrification');
  });

  it('generates deterministic 4-branch stoneware fracture skeleton within vessel coordinates', () => {
    const a = generateKintsugiSkeleton('cinnabar+gold:1220');
    const b = generateKintsugiSkeleton('cinnabar+gold:1220');
    expect(a.seed).toBe(b.seed);
    expect(a.branches.length).toBe(4);
    expect(a.nodes.length).toBeGreaterThanOrEqual(32);
    expect(a.coveragePct).toBe(0);

    for (const node of a.nodes) {
      expect(node.x).toBeGreaterThan(0.2);
      expect(node.x).toBeLessThan(0.8);
      expect(node.y).toBeGreaterThan(0.15);
      expect(node.y).toBeLessThan(0.85);
    }
  });

  it('tracks accurate on-seam lacquer strokes, penalizes off-seam precision, and steps gold sparks', () => {
    let session = generateKintsugiSkeleton('ochre+cinnabar:1185');
    const target = session.nodes[0]!;
    const neighbor = session.nodes[1]!;

    session = applyKintsugiStroke(session, neighbor.x, neighbor.y, target.x, target.y);
    expect(session.onSeamSamples).toBe(1);
    expect(session.offSeamSamples).toBe(0);
    expect(session.coveragePct).toBeGreaterThan(0);
    expect(session.precisionPct).toBe(100);
    expect(session.sparks.length).toBeGreaterThan(0);

    // Wild off-vessel stroke reduces precision without adding false gold coverage
    const covBefore = session.coveragePct;
    session = applyKintsugiStroke(session, 0.05, 0.05, 0.05, 0.05);
    expect(session.offSeamSamples).toBe(1);
    expect(session.coveragePct).toBe(covBefore);
    expect(session.precisionPct).toBe(50);

    const aged = stepKintsugiSparks(session.sparks, 0.04);
    expect(aged.length).toBe(session.sparks.length);
    expect(aged[0]!.life).toBeCloseTo(0.04, 3);
  });

  it('traces all branches to 100% coverage and produces Masterwork Grade S & unique Relic Signature', () => {
    let session = generateKintsugiSkeleton('cinnabar+gold:1240');
    for (let i = 0; i < 4; i += 1) {
      session = traceNextKintsugiBranch(session);
    }
    expect(session.coveragePct).toBe(100);
    expect(session.precisionPct).toBe(100);

    const report = computeKintsugiCraftReport(session, 'Kintsugi Ember Lacquer', 1240);
    expect(report.grade).toBe('S');
    expect(report.gradeTitle).toBe('Masterwork Kintsugi');
    expect(report.signature).toMatch(/^EV-S-[0-9A-F]{4}$/);

    // Tracing again after 100% completion is a clean no-op
    const idempotent = traceNextKintsugiBranch(session);
    expect(idempotent.strokeCount).toBe(session.strokeCount);
  });

  it('guards NaN/out-of-range temperatures, zero-radius strokes, spark expiration, and all 4 craft grades', () => {
    // 1. Out-of-range & NaN blackbody inputs must never emit invalid hex or NaN heat
    for (const badTemp of [-200, 5000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rad = computeBlackbodyRadiation(badTemp);
      expect(rad.coreHex).toMatch(/^#[0-9A-F]{6}$/);
      expect(rad.midHex).toMatch(/^#[0-9A-F]{6}$/);
      expect(rad.rimHex).toMatch(/^#[0-9A-F]{6}$/);
      expect(Number.isFinite(rad.normalizedHeat)).toBe(true);
    }

    // 2. NaN coords are safely ignored; zero brushRadius never divides by zero
    let session = generateKintsugiSkeleton('boundary:1200');
    const ignored = applyKintsugiStroke(session, Number.NaN, 0.5);
    expect(ignored.strokeCount).toBe(0);
    expect(ignored.offSeamSamples).toBe(0);

    const n0 = session.nodes[0]!;
    const zeroRad = applyKintsugiStroke(session, n0.x, n0.y, n0.x, n0.y, 0);
    expect(Number.isFinite(zeroRad.coveragePct)).toBe(true);
    expect(zeroRad.coveragePct).toBeGreaterThan(0);

    // 3. Spark expiration removes aged sparks and ignores NaN dt
    const survived = stepKintsugiSparks(zeroRad.sparks, Number.NaN);
    expect(survived.length).toBe(zeroRad.sparks.length);
    let expiring = zeroRad.sparks;
    for (let i = 0; i < 25; i += 1) {
      expiring = stepKintsugiSparks(expiring, 0.05);
    }
    expect(expiring.length).toBe(0);

    // 4. All 4 craft grades (C -> B -> A -> S) plus precision gate (high coverage + low precision -> A, not S)
    expect(computeKintsugiCraftReport(session, 'Ash', 1100).grade).toBe('C');
    session = traceNextKintsugiBranch(session); // ~35-45% coverage
    expect(computeKintsugiCraftReport(session, 'Ash', 1100).grade).toBe('B');
    session = traceNextKintsugiBranch(session); // ~60-75% coverage
    expect(computeKintsugiCraftReport(session, 'Ash', 1100).grade).toBe('A');
    session = traceNextKintsugiBranch(session);
    session = traceNextKintsugiBranch(session); // 100% coverage
    const sloppyHighCoverage = { ...session, precisionPct: 50 };
    expect(computeKintsugiCraftReport(sloppyHighCoverage, 'Ash', 1100).grade).toBe('A');
  });
});

function createRecordingAudioContext(initialState: 'running' | 'suspended' | 'closed' = 'running') {
  let now = 1.0;
  const startedOscFreqs: number[] = [];
  const bufferStarts: number[] = [];
  const makeParam = (recordFreq = false) => ({
    value: 0,
    setValueAtTime: (val: number) => {
      if (recordFreq) startedOscFreqs.push(val);
    },
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
    setTargetAtTime: () => {},
  });

  const ctx: MinimalAudioContextLike & { advanceTime: (dt: number) => void } = {
    get state() {
      return initialState;
    },
    get currentTime() {
      return now;
    },
    sampleRate: 48000,
    advanceTime(dt: number) {
      now += dt;
    },
    createBuffer(_ch: number, length: number) {
      const arr = new Float32Array(length);
      return { getChannelData: () => arr } as unknown as AudioBuffer;
    },
    createBufferSource() {
      return {
        buffer: null,
        connect: () => {},
        start: (when = 0) => {
          bufferStarts.push(when);
        },
      } as unknown as AudioBufferSourceNode;
    },
    createBiquadFilter() {
      return {
        type: 'bandpass',
        frequency: makeParam(false),
        Q: { value: 1 },
        connect: () => {},
      } as unknown as BiquadFilterNode;
    },
    createGain() {
      return {
        gain: makeParam(false),
        connect: () => {},
      } as unknown as GainNode;
    },
    createOscillator() {
      return {
        type: 'sine',
        frequency: makeParam(true),
        connect: () => {},
        start: () => {},
        stop: () => {},
      } as unknown as OscillatorNode;
    },
  };

  return {
    ctx,
    dest: {} as AudioNode,
    startedOscFreqs,
    bufferStarts,
  };
}

describe('V5 Procedural Ceramic & Wood-Kiln Foley Engine (kilnFoley.ts)', () => {
  it('scales wooden bellows frequency, crackle density, and gain monotonically from 600C to 1300C with NaN safety', () => {
    const cool = computeBellowsAcoustics(600);
    const hot = computeBellowsAcoustics(1280);
    const bad = computeBellowsAcoustics(Number.NaN);

    expect(hot.heatNorm).toBeGreaterThan(cool.heatNorm);
    expect(hot.peakFreqHz).toBeGreaterThan(cool.peakFreqHz);
    expect(hot.crackleCount).toBeGreaterThan(cool.crackleCount);
    expect(hot.gainPeak).toBeGreaterThan(cool.gainPeak);
    expect(bad.heatNorm).toBe(0);
    expect(Number.isFinite(bad.peakFreqHz)).toBe(true);
  });

  it('ascends Kintsugi 24k gold shimmer pitch along D-Major pentatonic scale as coverage rises 0% -> 100%', () => {
    const low = computeKintsugiShimmerParams(5, 100);
    const mid = computeKintsugiShimmerParams(50, 95);
    const full = computeKintsugiShimmerParams(100, 100);
    const nanSafe = computeKintsugiShimmerParams(Number.NaN, Number.NaN);

    expect(low.freqHz).toBe(KINTSUGI_SHIMMER_SCALE_HZ[0]);
    expect(mid.freqHz).toBeGreaterThan(low.freqHz);
    expect(full.freqHz).toBe(KINTSUGI_SHIMMER_SCALE_HZ[KINTSUGI_SHIMMER_SCALE_HZ.length - 1]);
    expect(full.decaySec).toBeGreaterThan(low.decaySec);
    expect(nanSafe.freqHz).toBe(KINTSUGI_SHIMMER_SCALE_HZ[0]);
  });

  it('remains strictly autoplay-safe when AudioContext is null, suspended, or closed', () => {
    const synth = new KilnFoleySynth();
    const suspended = createRecordingAudioContext('suspended');
    const closed = createRecordingAudioContext('closed');

    expect(synth.playBellowsStoke(null, null, 950)).toBe(false);
    expect(synth.playBellowsStoke(suspended.ctx, suspended.dest, 1100)).toBe(false);
    expect(synth.playFlueVent(closed.ctx, closed.dest, true)).toBe(false);
    expect(synth.playKintsugiBrushShimmer(suspended.ctx, suspended.dest, 60, 100)).toBe(false);
    expect(synth.playGradeSBronzeBell(suspended.ctx, suspended.dest)).toBe(false);
    expect(suspended.startedOscFreqs.length).toBe(0);
    expect(suspended.bufferStarts.length).toBe(0);
  });

  it('schedules bellows draft + ember crackles, cast-iron flue damper, and mineral glaze Foley nodes', () => {
    const synth = new KilnFoleySynth();
    const rec = createRecordingAudioContext('running');

    expect(synth.playBellowsStoke(rec.ctx, rec.dest, 1220)).toBe(true);
    expect(rec.bufferStarts.length).toBeGreaterThanOrEqual(8); // air rush + >=7 ember pops

    const prevOsc = rec.startedOscFreqs.length;
    expect(synth.playFlueVent(rec.ctx, rec.dest, true)).toBe(true);
    expect(synth.playFlueVent(rec.ctx, rec.dest, false)).toBe(true);
    expect(rec.startedOscFreqs.length).toBeGreaterThanOrEqual(prevOsc + 6);

    for (const mineral of ['ash', 'ochre', 'cinnabar', 'gold'] as const) {
      expect(synth.playGlazeMix(rec.ctx, rec.dest, mineral)).toBe(true);
    }
  });

  it('rate-limits Act IV Kintsugi shimmer bursts during fast drags and fires Grade S bronze bell chord', () => {
    const synth = new KilnFoleySynth(0.08);
    const rec = createRecordingAudioContext('running');

    expect(synth.playKintsugiBrushShimmer(rec.ctx, rec.dest, 20, 100)).toBe(true);
    // Immediate drag frame inside 80ms cooldown is cleanly skipped to avoid clipping
    rec.ctx.advanceTime(0.02);
    expect(synth.playKintsugiBrushShimmer(rec.ctx, rec.dest, 25, 100)).toBe(false);

    // After cooldown expires, next shimmer plays at higher pitch
    rec.ctx.advanceTime(0.1);
    expect(synth.playKintsugiBrushShimmer(rec.ctx, rec.dest, 80, 100)).toBe(true);

    const beforeBell = rec.startedOscFreqs.length;
    expect(synth.playCeramicFractureSnap(rec.ctx, rec.dest)).toBe(true);
    expect(synth.playGradeSBronzeBell(rec.ctx, rec.dest)).toBe(true);
    // Fracture snap (3 modes) + Grade S bell (4 fundamental + 4 shimmer overtones = 8)
    expect(rec.startedOscFreqs.length - beforeBell).toBe(11);
  });

  it('gates all KilnAudioEngine Foley triggers cleanly behind the top-bar audio toggle', () => {
    const engine = new KilnAudioEngine();
    expect(engine.isEnabled()).toBe(false);
    expect(engine.playBellowsWhoosh(1100)).toBe(false);
    expect(engine.playFlueDamper(true)).toBe(false);
    expect(engine.playGlazeFoley('gold')).toBe(false);
    expect(engine.playKintsugiGoldDust(75, 100)).toBe(false);
    expect(engine.playCeramicFracture()).toBe(false);
    expect(engine.playGradeSBell()).toBe(false);
    engine.dispose();
  });
});
