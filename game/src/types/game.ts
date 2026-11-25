export type SceneId =
  | 'hearth'
  | 'glaze'
  | 'stoking'
  | 'vitrification'
  | 'unsealing';

export type GlazeMineralId = 'ash' | 'ochre' | 'cinnabar' | 'gold';

export type ChoiceOneId = 'harvest' | 'ledger';
export type ChoiceTwoId = 'lullaby' | 'warning';
export type ChoiceThreeId = 'kintsugi' | 'unmended' | 'open_door';

export type EndingId =
  | 'gilded_reliquary'
  | 'singing_hearth_vessel'
  | 'ash_witness_urn'
  | 'open_kiln_dawn';

export type KilnAction = 'idle' | 'stoke' | 'vent' | 'damp';

export interface TempSample {
  step: number;
  scene: SceneId;
  tempC: number;
  stress: number;
}

export interface GlazeMineral {
  id: GlazeMineralId;
  name: string;
  origin: string;
  hex: string;
  accentHex: string;
  luster: number;
  crackleBias: number;
  description: string;
}

export interface GlazeBlend {
  primary: GlazeMineralId;
  secondary: GlazeMineralId;
  blendName: string;
  bodyHex: string;
  lipHex: string;
  veinHex: string;
  sheen: number;
  crackleIntensity: number;
  characterNote: string;
}

export interface NarrativeChoice<T extends string = string> {
  id: T;
  label: string;
  memoryTag: string;
  detail: string;
  voiceCueId: string;
}

export interface SceneDefinition {
  id: SceneId;
  index: number;
  actLabel: string;
  title: string;
  location: string;
  targetTempRange: [number, number];
  openingLines: string[];
  memoryEcho: string;
  voiceCueId: string;
  interactiveHint: string;
}

export interface EndingDefinition {
  id: EndingId;
  title: string;
  subtitle: string;
  epigraph: string;
  body: string[];
  relicClassification: string;
  sealMark: string;
  voiceCueId: string;
  primaryTint: string;
  accentTint: string;
}

export interface KilnState {
  scene: SceneId;
  lineIndex: number;
  temperatureC: number;
  peakTempC: number;
  thermalVelocity: number;
  thermalStress: number;
  bellowsStrokes: number;
  flueOpen: boolean;
  primaryGlaze: GlazeMineralId;
  secondaryGlaze: GlazeMineralId;
  glazeMixed: boolean;
  choiceOne: ChoiceOneId | null;
  choiceTwo: ChoiceTwoId | null;
  choiceThree: ChoiceThreeId | null;
  echoListened: Record<SceneId, boolean>;
  tempHistory: TempSample[];
  ending: EndingId | null;
}

export interface VoiceCueSpec {
  id: string;
  scene: SceneId | 'ending';
  speaker: string;
  text: string;
  audioPath: string;
  elevenLabsVoiceName: string;
  elevenLabsModel: string;
  stability: number;
  similarityBoost: number;
  style: number;
  ambientDuckDb: number;
}
