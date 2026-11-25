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
