/**
 * Interactive Kintsugi Fracture Repair Engine & 1300°C Ceramic Blackbody Thermal Radiation Shader.
 *
 * Strictly enforces our warm ceramic kiln palette (charcoal obsidian -> dark cherry red ->
 * cinnabar -> molten amber -> kiln gold -> white-gold incandescence; zero blue/cyan/teal/purple).
 */

import { MAX_KILN_TEMP, MIN_KILN_TEMP } from './engine/kilnPhysics';

export interface BlackbodyRadiation {
  tempC: number;
  normalizedHeat: number;
  coreHex: string;
  midHex: string;
  rimHex: string;
  glowRgba: string;
  stageLabel: string;
  flameTurbulence: number;
}

export interface KintsugiNode {
  id: number;
  branchIndex: number;
  /** Normalized vessel-stage X coordinate in [0..1] */
  x: number;
  /** Normalized vessel-stage Y coordinate in [0..1] */
  y: number;
  /** Lacquer & 24k gold deposition level in [0..1] */
  gilded: number;
}

export interface KintsugiBranch {
  branchIndex: number;
  nodeIds: number[];
}

export interface KintsugiSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface KintsugiSession {
  seed: number;
  nodes: KintsugiNode[];
  branches: KintsugiBranch[];
  strokeCount: number;
  onSeamSamples: number;
  offSeamSamples: number;
  coveragePct: number;
  precisionPct: number;
  sparks: KintsugiSpark[];
}

export type KintsugiGradeCode = 'S' | 'A' | 'B' | 'C';

export interface KintsugiCraftReport {
  grade: KintsugiGradeCode;
  gradeTitle: string;
  coveragePct: number;
  precisionPct: number;
  signature: string;
  curatorNote: string;
}

interface RgbStop {
  temp: number;
  r: number;
  g: number;
  b: number;
  stage: string;
}

/**
 * Physically inspired ceramic blackbody emission curve (600°C - 1300°C).
 * Every stop satisfies b <= g <= r (zero cool/blue/cyan/teal/purple contamination).
 */
const BLACKBODY_STOPS: readonly RgbStop[] = [
  { temp: 600, r: 34, g: 22, b: 18, stage: 'Charcoal Obsidian' },
  { temp: 760, r: 122, g: 34, b: 22, stage: 'Dark Cherry Ember' },
  { temp: 940, r: 199, g: 67, b: 37, stage: 'Cinnabar Bisque Glow' },
  { temp: 1100, r: 230, g: 98, b: 40, stage: 'Molten Amber Core' },
  { temp: 1220, r: 244, g: 194, b: 96, stage: 'Incandescent Kiln Gold' },
  { temp: 1300, r: 255, g: 244, b: 220, stage: 'White-Gold Vitrification' },
] as const;

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [c(r), c(g), c(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function sampleBlackbodyRgb(tempC: number): { r: number; g: number; b: number; stage: string } {
  const safeTemp = Number.isFinite(tempC) ? tempC : MIN_KILN_TEMP;
  const clamped = Math.max(MIN_KILN_TEMP, Math.min(MAX_KILN_TEMP, safeTemp));
  for (let i = 0; i < BLACKBODY_STOPS.length - 1; i += 1) {
    const a = BLACKBODY_STOPS[i]!;
    const b = BLACKBODY_STOPS[i + 1]!;
    if (clamped >= a.temp && clamped <= b.temp) {
      const u = (clamped - a.temp) / Math.max(1, b.temp - a.temp);
      return {
        r: a.r + (b.r - a.r) * u,
        g: a.g + (b.g - a.g) * u,
        b: a.b + (b.b - a.b) * u,
        stage: u >= 0.5 ? b.stage : a.stage,
      };
    }
  }
  const last = BLACKBODY_STOPS[BLACKBODY_STOPS.length - 1]!;
  return { r: last.r, g: last.g, b: last.b, stage: last.stage };
}

export function computeBlackbodyRadiation(tempC: number): BlackbodyRadiation {
  const safeTemp = Number.isFinite(tempC) ? tempC : MIN_KILN_TEMP;
  const clamped = Math.max(MIN_KILN_TEMP, Math.min(MAX_KILN_TEMP, safeTemp));
  const norm = (clamped - MIN_KILN_TEMP) / (MAX_KILN_TEMP - MIN_KILN_TEMP);

  const core = sampleBlackbodyRgb(Math.min(MAX_KILN_TEMP, clamped + 45));
  const mid = sampleBlackbodyRgb(clamped);
  const rim = sampleBlackbodyRgb(Math.max(MIN_KILN_TEMP, clamped - 140));

  const glowAlpha = Number((0.18 + norm * 0.62).toFixed(3));
  return {
    tempC: Number(clamped.toFixed(1)),
    normalizedHeat: Number(norm.toFixed(3)),
    coreHex: rgbToHex(core.r, core.g, core.b),
    midHex: rgbToHex(mid.r, mid.g, mid.b),
    rimHex: rgbToHex(rim.r, rim.g, rim.b),
    glowRgba: `rgba(${Math.round(mid.r)}, ${Math.round(mid.g)}, ${Math.round(mid.b)}, ${glowAlpha})`,
    stageLabel: mid.stage,
    flameTurbulence: Number((0.35 + norm * 1.15).toFixed(3)),
  };
}

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates a natural branching stoneware fracture skeleton centered over the vessel focal zone.
 * Coordinates are normalized to [0..1] of the full stage viewport so pointer hit-testing stays
 * resolution-independent across desktop and mobile viewports.
 */
export function generateKintsugiSkeleton(seedKey: string): KintsugiSession {
  const seed = hashSeed(seedKey);
  const rand = seededRand(seed);
  const nodes: KintsugiNode[] = [];
  const branches: KintsugiBranch[] = [];
  let nextId = 0;

  const jitter = (mag: number) => (rand() - 0.5) * mag;

  // 4 organic fracture polylines tightly anchored across the painted amphora body (x in 0.43..0.57, y in 0.31..0.62)
  const rawPolylines: Array<Array<[number, number]>> = [
    // Primary diagonal neck-collar-to-belly spine
    [
      [0.492 + jitter(0.01), 0.315],
      [0.478 + jitter(0.012), 0.385],
      [0.506 + jitter(0.012), 0.465],
      [0.486 + jitter(0.012), 0.545],
      [0.512 + jitter(0.012), 0.62],
    ],
    // Upper-left shoulder fork
    [
      [0.478 + jitter(0.008), 0.385],
      [0.452 + jitter(0.01), 0.425],
      [0.434 + jitter(0.01), 0.472],
    ],
    // Mid-right lightning branch across vessel belly
    [
      [0.506 + jitter(0.008), 0.465],
      [0.538 + jitter(0.01), 0.495],
      [0.562 + jitter(0.01), 0.545],
    ],
    // Lower-left hairline crack toward base foot
    [
      [0.486 + jitter(0.008), 0.545],
      [0.458 + jitter(0.01), 0.585],
      [0.442 + jitter(0.01), 0.62],
    ],
  ];

  // Subdivide each polyline into densely sampled nodes (~48 total) for silky smooth brush tracing
  rawPolylines.forEach((poly, branchIndex) => {
    const branchIds: number[] = [];
    for (let s = 0; s < poly.length - 1; s += 1) {
      const p0 = poly[s]!;
      const p1 = poly[s + 1]!;
      const steps = 4;
      for (let k = 0; k < steps; k += 1) {
        if (s > 0 && k === 0) continue;
        const u = k / steps;
        const id = nextId++;
        nodes.push({
          id,
          branchIndex,
          x: Number((p0[0] + (p1[0] - p0[0]) * u).toFixed(4)),
          y: Number((p0[1] + (p1[1] - p0[1]) * u).toFixed(4)),
          gilded: 0,
        });
        branchIds.push(id);
      }
    }
    const lastPt = poly[poly.length - 1]!;
    const endId = nextId++;
    nodes.push({
      id: endId,
      branchIndex,
      x: Number(lastPt[0].toFixed(4)),
      y: Number(lastPt[1].toFixed(4)),
      gilded: 0,
    });
    branchIds.push(endId);
    branches.push({ branchIndex, nodeIds: branchIds });
  });

  return {
    seed,
    nodes,
    branches,
    strokeCount: 0,
    onSeamSamples: 0,
    offSeamSamples: 0,
    coveragePct: 0,
    precisionPct: 100,
    sparks: [],
  };
}

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const KINTSUGI_BRUSH_RADIUS = 0.026;

function computeMetrics(
  nodes: KintsugiNode[],
  onSeamSamples: number,
  offSeamSamples: number,
): { coveragePct: number; precisionPct: number } {
  const totalGilded = nodes.reduce((acc, n) => acc + n.gilded, 0);
  const coveragePct =
    nodes.length > 0 ? Math.round((totalGilded / nodes.length) * 100) : 0;
  const totalSamples = onSeamSamples + offSeamSamples;
  const precisionPct =
    totalSamples > 0 ? Math.round((onSeamSamples / totalSamples) * 100) : 100;
  return { coveragePct, precisionPct };
}

/**
 * Applies a player urushi-lacquer & gold-dust brush stroke segment from (fromX, fromY) to (toX, toY).
 * Updates gilded coverage along nearby crack nodes, computes seam precision, and emits gold sparks.
 */
export function applyKintsugiStroke(
  session: KintsugiSession,
  toX: number,
  toY: number,
  fromX?: number,
  fromY?: number,
  brushRadius: number = KINTSUGI_BRUSH_RADIUS,
): KintsugiSession {
  if (!Number.isFinite(toX) || !Number.isFinite(toY)) {
    return session;
  }
  const ax = fromX !== undefined && Number.isFinite(fromX) ? fromX : toX;
  const ay = fromY !== undefined && Number.isFinite(fromY) ? fromY : toY;
  const safeRadius =
    Number.isFinite(brushRadius) && brushRadius > 0 ? Math.max(1e-4, brushRadius) : KINTSUGI_BRUSH_RADIUS;

  let hitAny = false;
  const newSparks: KintsugiSpark[] = [];
  const nextNodes = session.nodes.map((node) => {
    const dist = pointToSegmentDist(node.x, node.y, ax, ay, toX, toY);
    if (dist <= safeRadius) {
      hitAny = true;
      const falloff = 1 - dist / safeRadius;
      const deposit = Math.min(1, node.gilded + 0.55 + falloff * 0.55);
      if (deposit > node.gilded + 0.05 && newSparks.length < 6) {
        const angle = (node.id * 1.9 + session.strokeCount * 0.7) % (Math.PI * 2);
        newSparks.push({
          x: node.x,
          y: node.y,
          vx: Math.cos(angle) * 0.045,
          vy: Math.sin(angle) * 0.045 - 0.03,
          life: 0,
          maxLife: 0.9,
          size: 2.2 + falloff * 2.4,
        });
      }
      return { ...node, gilded: Number(deposit.toFixed(3)) };
    }
    return node;
  });

  const onSeamSamples = session.onSeamSamples + (hitAny ? 1 : 0);
  const offSeamSamples = session.offSeamSamples + (hitAny ? 0 : 1);
  const { coveragePct, precisionPct } = computeMetrics(nextNodes, onSeamSamples, offSeamSamples);

  return {
    ...session,
    nodes: nextNodes,
    strokeCount: session.strokeCount + 1,
    onSeamSamples,
    offSeamSamples,
    coveragePct,
    precisionPct,
    sparks: [...session.sparks.slice(-36), ...newSparks],
  };
}

/**
 * Keyboard-accessible craft action: traces the next un-gilded fracture branch smoothly
 * so keyboard-only and assistive-technology players experience the exact same Kintsugi repair loop.
 */
export function traceNextKintsugiBranch(session: KintsugiSession): KintsugiSession {
  const targetBranch = session.branches.find((b) =>
    b.nodeIds.some((id) => (session.nodes[id]?.gilded ?? 0) < 0.95),
  );
  if (!targetBranch) return session;

  let current = session;
  for (let i = 0; i < targetBranch.nodeIds.length; i += 1) {
    const node = current.nodes[targetBranch.nodeIds[i]!];
    const prev = i > 0 ? current.nodes[targetBranch.nodeIds[i - 1]!] : node;
    if (!node || !prev) continue;
    current = applyKintsugiStroke(current, node.x, node.y, prev.x, prev.y, 0.012);
  }
  return current;
}

export function stepKintsugiSparks(sparks: KintsugiSpark[], dtSec: number): KintsugiSpark[] {
  const safeDt = Number.isFinite(dtSec) ? dtSec : 0;
  const dt = Math.max(0, Math.min(0.05, safeDt));
  const out: KintsugiSpark[] = [];
  for (const sp of sparks) {
    if (!Number.isFinite(sp.maxLife) || sp.maxLife <= 0) continue;
    const nextLife = sp.life + dt;
    if (nextLife >= sp.maxLife) continue;
    out.push({
      ...sp,
      x: sp.x + sp.vx * dt,
      y: sp.y + sp.vy * dt,
      vy: sp.vy - 0.02 * dt,
      life: nextLife,
    });
  }
  return out;
}

export function computeKintsugiCraftReport(
  session: KintsugiSession,
  glazeBlendName: string,
  peakTempC: number,
): KintsugiCraftReport {
  const { coveragePct, precisionPct } = session;

  let grade: KintsugiGradeCode;
  let gradeTitle: string;
  let curatorNote: string;

  if (coveragePct >= 82 && precisionPct >= 68) {
    grade = 'S';
    gradeTitle = 'Masterwork Kintsugi';
    curatorNote = 'Unbroken rivers of 24k gold dust trace every hairline fault with master steadiness.';
  } else if (coveragePct >= 60) {
    grade = 'A';
    gradeTitle = 'Luminous Gold Seam';
    curatorNote = 'Warm urushi lacquer and gold leaf bind the primary stress fractures cleanly.';
  } else if (coveragePct >= 30) {
    grade = 'B';
    gradeTitle = 'Honest Lacquer Mend';
    curatorNote = 'Partial gold veins steady the shoulder while leaving raw kiln scars visible.';
  } else {
    grade = 'C';
    gradeTitle = 'Raw Stone Fracture';
    curatorNote = 'Left largely unmended; raw clay seams preserve the midnight firing tension untouched.';
  }

  const sigHash = hashSeed(
    `${session.seed}:${glazeBlendName}:${Math.round(peakTempC)}:${coveragePct}:${precisionPct}:${grade}`,
  )
    .toString(16)
    .toUpperCase()
    .padStart(8, '0')
    .slice(0, 4);

  return {
    grade,
    gradeTitle,
    coveragePct,
    precisionPct,
    signature: `EV-${grade}-${sigHash}`,
    curatorNote,
  };
}
