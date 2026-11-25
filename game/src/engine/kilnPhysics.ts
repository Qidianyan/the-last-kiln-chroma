import type {
  ChoiceOneId,
  ChoiceThreeId,
  ChoiceTwoId,
  EndingId,
  GlazeBlend,
  GlazeMineral,
  GlazeMineralId,
  KilnAction,
  KilnState,
  SceneId,
} from '../types/game';

export const MIN_KILN_TEMP = 600;
export const MAX_KILN_TEMP = 1300;
export const STRESS_THRESHOLD_TEMP = 1235;
export const SHATTER_STRESS_LIMIT = 85;

export const SCENE_ORDER: readonly SceneId[] = [
  'hearth',
  'glaze',
  'stoking',
  'vitrification',
  'unsealing',
] as const;

export const GLAZE_MINERALS: Record<GlazeMineralId, GlazeMineral> = {
  ash: {
    id: 'ash',
    name: 'Pine Wood Ash',
    origin: 'Swept from seven winters of orchard prunings',
    hex: '#8F887A',
    accentHex: '#4A5D3F',
    luster: 0.28,
    crackleBias: 0.35,
    description: 'Matte bone-ash finish with dark olive kiln freckles.',
  },
  ochre: {
    id: 'ochre',
    name: 'Riverbank Ochre',
    origin: 'Washed iron clay dug below the old mill sluice',
    hex: '#C68B3C',
    accentHex: '#F2E8DA',
    luster: 0.52,
    crackleBias: 0.48,
    description: 'Honeyed earthenware warmth that hums when tapped.',
  },
  cinnabar: {
    id: 'cinnabar',
    name: 'Red Cinnabar',
    origin: 'Crushed vermilion stone traded down the high pass',
    hex: '#C74325',
    accentHex: '#E65A28',
    luster: 0.64,
    crackleBias: 0.62,
    description: 'Deep ember slip that darkens to smoked lacquer under reduction.',
  },
  gold: {
    id: 'gold',
    name: 'Hammered Gold Leaf',
    origin: 'Final folded sheets from Master Orin’s lacquer box',
    hex: '#DBA13C',
    accentHex: '#F7DDA0',
    luster: 0.92,
    crackleBias: 0.78,
    description: 'Liquid amber-gold seams that drink light inside hairline fractures.',
  },
};

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function blendHex(a: string, b: string, weightB: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex({
    r: ca.r * (1 - w) + cb.r * w,
    g: ca.g * (1 - w) + cb.g * w,
    b: ca.b * (1 - w) + cb.b * w,
  });
}

const BLEND_TITLES: Record<string, { name: string; note: string }> = {
  'ash+ash': {
    name: 'Monastic Wood-Ash',
    note: 'Dry stoneware grain carrying the quiet smoke of pine needles.',
  },
  'ash+ochre': {
    name: 'Terrace Moss & Silt',
    note: 'Charred olive mineral speckles suspended in warm riverbank honey.',
  },
  'ash+cinnabar': {
    name: 'Smoked Ember Slip',
    note: 'Ash-veiled terracotta glowing beneath a dry soot crust.',
  },
  'ash+gold': {
    name: 'Ash-Gilded Tenmoku',
    note: 'Matte charcoal parchment cracked open by thin rivers of gold.',
  },
  'ochre+ochre': {
    name: 'Sunbaked Mill Ochre',
    note: 'Thick autumn honey glaze with soft apricot kiln-blush.',
  },
  'ochre+cinnabar': {
    name: 'Hearthstone Terracotta',
    note: 'Singing iron-red and warm ochre swirling like slow ember honey.',
  },
  'ochre+gold': {
    name: 'Harvest Amber Leaf',
    note: 'Luminous golden ochre echoing late sunlight across orchard stone.',
  },
  'cinnabar+cinnabar': {
    name: 'Molten Vermilion Reduction',
    note: 'Rich kiln-blood glaze shimmering with copper-ember fire.',
  },
  'cinnabar+gold': {
    name: 'Kintsugi Ember Lacquer',
    note: 'Fiery cinnabar fused with molten gold leaf along every ridge.',
  },
  'gold+gold': {
    name: 'Pure Imperial Kiln Gold',
    note: 'Mirrored warm brass-gold that holds candlelight long after dusk.',
  },
};

export function computeGlazeBlend(
  primary: GlazeMineralId,
  secondary: GlazeMineralId,
): GlazeBlend {
  const p = GLAZE_MINERALS[primary];
  const s = GLAZE_MINERALS[secondary];
  const ordered = [primary, secondary].sort((a, b) => {
    const order: Record<GlazeMineralId, number> = {
      ash: 0,
      ochre: 1,
      cinnabar: 2,
      gold: 3,
    };
    return order[a] - order[b];
  });
  const key = `${ordered[0]}+${ordered[1]}`;
  const meta = BLEND_TITLES[key] ?? {
    name: `${p.name} over ${s.name}`,
    note: 'Hand-ground valley minerals balanced for wood-kiln reduction.',
  };

  return {
    primary,
    secondary,
    blendName: meta.name,
    bodyHex: blendHex(p.hex, s.hex, 0.42),
    lipHex: blendHex(s.accentHex, p.hex, 0.35),
    veinHex:
      primary === 'gold' || secondary === 'gold'
        ? '#F2C96B'
        : blendHex(s.accentHex, '#E65A28', 0.45),
    sheen: Number(((p.luster * 0.55 + s.luster * 0.45)).toFixed(2)),
    crackleIntensity: Number(((p.crackleBias + s.crackleBias) / 2).toFixed(2)),
    characterNote: meta.note,
  };
}

export function clampKilnTemp(tempC: number): number {
  return Math.max(MIN_KILN_TEMP, Math.min(MAX_KILN_TEMP, tempC));
}

export interface ThermalStepResult {
  temperatureC: number;
  peakTempC: number;
  thermalVelocity: number;
  thermalStress: number;
  bellowsStrokes: number;
}

export function stepKilnTemperature(
  state: Pick<
    KilnState,
    'temperatureC' | 'peakTempC' | 'thermalVelocity' | 'thermalStress' | 'bellowsStrokes' | 'flueOpen'
  >,
  dtSeconds: number,
  action: KilnAction = 'idle',
): ThermalStepResult {
  const dt = Math.max(0.01, Math.min(1.5, dtSeconds));
  let velocity = state.thermalVelocity;
  let strokes = state.bellowsStrokes;

  // Ambient radiative cooling pulls gently toward 600C, stronger when flue is open
  const aboveFloor = Math.max(0, state.temperatureC - MIN_KILN_TEMP);
  const coolingRate = state.flueOpen ? 0.095 : 0.032;
  const ambientDrift = -aboveFloor * coolingRate;

  if (action === 'stoke') {
    velocity += 68;
    strokes += 1;
  } else if (action === 'vent') {
    velocity -= 54;
  } else if (action === 'damp') {
    velocity *= 0.62;
  }

  // Smooth thermal inertia damping
  velocity = velocity * Math.pow(0.45, dt) + ambientDrift * dt;
  const nextTemp = clampKilnTemp(state.temperatureC + velocity * dt);
  const nextPeak = Math.max(state.peakTempC, nextTemp);

  let nextStress = state.thermalStress;
  if (nextTemp >= STRESS_THRESHOLD_TEMP) {
    const excessRatio = (nextTemp - STRESS_THRESHOLD_TEMP) / (MAX_KILN_TEMP - STRESS_THRESHOLD_TEMP);
    nextStress = Math.min(100, nextStress + (10 + excessRatio * 26) * dt);
  } else if (nextTemp < 1180) {
    nextStress = Math.max(0, nextStress - 4.5 * dt);
  }

  return {
    temperatureC: Number(nextTemp.toFixed(1)),
    peakTempC: Number(nextPeak.toFixed(1)),
    thermalVelocity: Number(velocity.toFixed(2)),
    thermalStress: Number(nextStress.toFixed(1)),
    bellowsStrokes: strokes,
  };
}

export function getKilnZoneLabel(tempC: number): {
  band: 'ember' | 'bisque' | 'stoneware' | 'vitrification' | 'critical';
  label: string;
} {
  if (tempC < 760) return { band: 'ember', label: 'Smoldering Bed' };
  if (tempC < 960) return { band: 'bisque', label: 'Bisque Awakening' };
  if (tempC < 1150) return { band: 'stoneware', label: 'Stoneware Heart' };
  if (tempC < 1245) return { band: 'vitrification', label: 'Vitrification Glow' };
  return { band: 'critical', label: 'White-Amber Overfire' };
}

export function resolveEnding(
  state: Pick<
    KilnState,
    | 'primaryGlaze'
    | 'secondaryGlaze'
    | 'choiceOne'
    | 'choiceTwo'
    | 'choiceThree'
    | 'peakTempC'
    | 'thermalStress'
  >,
): EndingId {
  // Path 4: Cracking the kiln door early to warm the valley OR thermal shatter overfire
  if (state.choiceThree === 'open_door' || state.thermalStress >= SHATTER_STRESS_LIMIT) {
    return 'open_kiln_dawn';
  }

  const hasGold = state.primaryGlaze === 'gold' || state.secondaryGlaze === 'gold';
  const hasAsh = state.primaryGlaze === 'ash' || state.secondaryGlaze === 'ash';
  const hasWarmVoiceGlaze =
    state.primaryGlaze === 'ochre' ||
    state.secondaryGlaze === 'ochre' ||
    state.primaryGlaze === 'cinnabar' ||
    state.secondaryGlaze === 'cinnabar';

  // Path 1: Gilded Reliquary — pouring gold leaf into the seams (unless purely intimate lullaby-harvest at soft heat)
  if (state.choiceThree === 'kintsugi') {
    if (
      hasGold ||
      state.choiceOne === 'ledger' ||
      state.choiceTwo === 'warning' ||
      state.peakTempC >= 1140
    ) {
      return 'gilded_reliquary';
    }
    return 'singing_hearth_vessel';
  }

  // Path 3: Ash-Witness Urn — unmended vessel carrying hard truth or stark ash craft
  if (state.choiceThree === 'unmended') {
    if (
      state.choiceTwo === 'warning' ||
      (hasAsh && state.choiceOne === 'ledger')
    ) {
      return 'ash_witness_urn';
    }
    if (hasWarmVoiceGlaze || state.choiceTwo === 'lullaby') {
      return 'singing_hearth_vessel';
    }
    return 'ash_witness_urn';
  }

  // Fallback for previewing before choice three
  if (hasGold && state.peakTempC >= 1120) return 'gilded_reliquary';
  if (state.choiceTwo === 'warning') return 'ash_witness_urn';
  return 'singing_hearth_vessel';
}

export function createInitialKilnState(): KilnState {
  return {
    scene: 'hearth',
    lineIndex: 0,
    temperatureC: 645,
    peakTempC: 645,
    thermalVelocity: 0,
    thermalStress: 0,
    bellowsStrokes: 0,
    flueOpen: false,
    primaryGlaze: 'ochre',
    secondaryGlaze: 'cinnabar',
    glazeMixed: false,
    choiceOne: null,
    choiceTwo: null,
    choiceThree: null,
    echoListened: {
      hearth: false,
      glaze: false,
      stoking: false,
      vitrification: false,
      unsealing: false,
    },
    tempHistory: [
      { step: 0, scene: 'hearth', tempC: 645, stress: 0 },
    ],
    ending: null,
  };
}

export function getNextScene(current: SceneId): SceneId | null {
  const idx = SCENE_ORDER.indexOf(current);
  if (idx < 0 || idx >= SCENE_ORDER.length - 1) return null;
  return SCENE_ORDER[idx + 1] ?? null;
}

export interface EndingPathPreset {
  ending: EndingId;
  primaryGlaze: GlazeMineralId;
  secondaryGlaze: GlazeMineralId;
  choiceOne: ChoiceOneId;
  choiceTwo: ChoiceTwoId;
  choiceThree: ChoiceThreeId;
  peakTempC: number;
  thermalStress: number;
}

export const CANONICAL_ENDING_PATHS: readonly EndingPathPreset[] = [
  {
    ending: 'gilded_reliquary',
    primaryGlaze: 'cinnabar',
    secondaryGlaze: 'gold',
    choiceOne: 'ledger',
    choiceTwo: 'lullaby',
    choiceThree: 'kintsugi',
    peakTempC: 1205,
    thermalStress: 24,
  },
  {
    ending: 'singing_hearth_vessel',
    primaryGlaze: 'ochre',
    secondaryGlaze: 'cinnabar',
    choiceOne: 'harvest',
    choiceTwo: 'lullaby',
    choiceThree: 'unmended',
    peakTempC: 1085,
    thermalStress: 8,
  },
  {
    ending: 'ash_witness_urn',
    primaryGlaze: 'ash',
    secondaryGlaze: 'ochre',
    choiceOne: 'ledger',
    choiceTwo: 'warning',
    choiceThree: 'unmended',
    peakTempC: 1125,
    thermalStress: 14,
  },
  {
    ending: 'open_kiln_dawn',
    primaryGlaze: 'ash',
    secondaryGlaze: 'cinnabar',
    choiceOne: 'harvest',
    choiceTwo: 'warning',
    choiceThree: 'open_door',
    peakTempC: 1190,
    thermalStress: 38,
  },
] as const;
