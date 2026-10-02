// The derived revenue library (model-spec §5): per-MW monthly aggregates of perfect-foresight day-ahead dispatch on a
// grid of technical nodes. Lookup interpolates linearly in usable hours and in the import fee; every other axis is an
// exact node. Outside the grid the lookup reports `unsupportedLibraryInput` instead of clamping.

export const FIELDS = ["salesUAH", "purchasesUAH", "salesEUR", "purchasesEUR", "importMWh", "exportMWh"] as const;
export type Field = (typeof FIELDS)[number];
export type Snapshot = "UA-2025" | "UA-LTM-2026-09";
export type Duration = 1 | 2 | 4;

export interface SnapshotMeta {
  from: string;
  to: string;
  days: number;
  hours: number;
  avgPriceUAH: number;
  avgPriceEUR: number;
  monthly: { month: number; days: number; avgPriceUAH: number; avgPriceEUR: number; avgFx: number }[];
}

export interface LibraryManifest {
  schema: string;
  version: number;
  attribution: string;
  axes: {
    snapshot: Snapshot[];
    durationHoursBoL: Duration[];
    usableHours: Record<string, number[]>;
    cycleCap: number[];
    rte: number[];
    importFeeUAH: number[];
  };
  fields: string[];
  months: number;
  /** Payload element type; v1 was float64, v2 float32 (half the transfer, precision far below the model's). */
  dtype?: "float64" | "float32";
  doublesPerNode: number;
  nodes: number;
  snapshots: Record<Snapshot, SnapshotMeta>;
}

export interface Library {
  manifest: LibraryManifest;
  data: Float64Array;
}

export interface LibraryKey {
  snapshot: Snapshot;
  duration: Duration;
  cycleCap: number;
  rte: number;
}

/** Twelve months × six fields, per MW, plus the peak daily purchases of the node set used. */
export interface LibraryValue {
  months: Float64Array;
  peakDayPurchasesUAH: number;
}

export class UnsupportedLibraryInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLibraryInput";
  }
}

export function parseLibrary(manifest: LibraryManifest, payload: ArrayBuffer): Library {
  const data = manifest.dtype === "float32" ? Float64Array.from(new Float32Array(payload)) : new Float64Array(payload);
  if (data.length !== manifest.nodes * manifest.doublesPerNode) throw new Error("library payload size mismatch");
  if (manifest.fields.join() !== FIELDS.join()) throw new Error("library field order mismatch");
  return { manifest, data };
}

const EPS = 1e-9;

function axisIndex(axis: number[], value: number, what: string): number {
  const i = axis.findIndex((v) => Math.abs(v - value) < EPS);
  if (i < 0) throw new UnsupportedLibraryInput(`${what} ${value} is not a library node`);
  return i;
}

/** Bracketing nodes and weight on the upper one; throws outside the axis. */
function bracket(axis: number[], value: number, what: string): [number, number, number] {
  const lo = axis[0]!;
  const hi = axis[axis.length - 1]!;
  if (value < lo - EPS || value > hi + EPS) {
    throw new UnsupportedLibraryInput(`${what} ${value.toFixed(4)} is outside the library range ${lo}–${hi}`);
  }
  const v = Math.min(Math.max(value, lo), hi);
  let k = 0;
  while (k < axis.length - 2 && v > axis[k + 1]! + EPS) k++;
  const span = axis[k + 1]! - axis[k]!;
  const w = span > 0 ? (v - axis[k]!) / span : 0;
  return [k, k + 1, Math.min(Math.max(w, 0), 1)];
}

function nodeOffset(lib: Library, key: LibraryKey, feeIdx: number, hIdx: number): number {
  const a = lib.manifest.axes;
  const perSnapshot = a.durationHoursBoL.reduce(
    (s, d) => s + a.cycleCap.length * a.rte.length * a.importFeeUAH.length * a.usableHours[String(d)]!.length,
    0,
  );
  const sIdx = a.snapshot.indexOf(key.snapshot);
  if (sIdx < 0) throw new UnsupportedLibraryInput(`snapshot ${key.snapshot}`);
  let offset = sIdx * perSnapshot;
  for (const d of a.durationHoursBoL) {
    if (d === key.duration) break;
    offset += a.cycleCap.length * a.rte.length * a.importFeeUAH.length * a.usableHours[String(d)]!.length;
  }
  const nH = a.usableHours[String(key.duration)]!.length;
  const cIdx = axisIndex(a.cycleCap, key.cycleCap, "cycle cap");
  const rIdx = axisIndex(a.rte, key.rte, "RTE node");
  return (offset + ((cIdx * a.rte.length + rIdx) * a.importFeeUAH.length + feeIdx) * nH + hIdx) * lib.manifest.doublesPerNode;
}

/** Values of one fee node, linearly interpolated on the usable-hours axis. */
function atFeeNode(lib: Library, key: LibraryKey, fi: number, h0: number, h1: number, wh: number): Float64Array {
  const n = lib.manifest.doublesPerNode;
  const out = new Float64Array(n);
  for (const [hi, w] of [[h0, 1 - wh], [h1, wh]] as [number, number][]) {
    if (w === 0) continue;
    const off = nodeOffset(lib, key, fi, hi);
    for (let j = 0; j < n; j++) out[j]! += w * lib.data[off + j]!;
  }
  return out;
}

/**
 * Library value at `usableHours` and `importFeeUAH` (base-period UAH/MWh). With `lowerNode` the usable-hours axis
 * takes the node at or below the value without interpolation — the lender case (model-spec §5).
 *
 * Fee axis: library v1 interpolates linearly. From v2 (S1.2) the value of a schedule is convex in the fee (a maximum
 * of affine functions), so a chord overstates it; instead, each month takes the better of the two adjacent fee nodes'
 * schedules evaluated at the actual fee. That is a feasible schedule, never above the optimum, and exact when the
 * regime changes once between the nodes.
 */
export function lookup(lib: Library, key: LibraryKey, usableHours: number, importFeeUAH: number, lowerNode = false): LibraryValue {
  const a = lib.manifest.axes;
  if (!a.snapshot.includes(key.snapshot)) throw new UnsupportedLibraryInput(`snapshot ${key.snapshot}`);
  const hAxis = a.usableHours[String(key.duration)];
  if (!hAxis) throw new UnsupportedLibraryInput(`duration ${key.duration} h`);
  let [h0, h1, wh] = bracket(hAxis, usableHours, "usable hours");
  if (lowerNode) {
    if (wh > 1 - EPS) h0 = h1;
    wh = 0;
    h1 = h0;
  }
  const [f0, f1, wf] = bracket(a.importFeeUAH, importFeeUAH, "import fee");
  const n = lib.manifest.doublesPerNode;
  const A = atFeeNode(lib, key, f0, h0, h1, wh);
  if (wf === 0) return { months: A.subarray(0, n - 1), peakDayPurchasesUAH: A[n - 1]! };
  const B = atFeeNode(lib, key, f1, h0, h1, wh);
  const out = new Float64Array(n);
  if (lib.manifest.version < 2) {
    for (let j = 0; j < n; j++) out[j] = (1 - wf) * A[j]! + wf * B[j]!;
    return { months: out.subarray(0, n - 1), peakDayPurchasesUAH: out[n - 1]! };
  }
  const F = FIELDS.length;
  const iS = FIELDS.indexOf("salesUAH");
  const iP = FIELDS.indexOf("purchasesUAH");
  const iI = FIELDS.indexOf("importMWh");
  for (let m = 0; m < 12; m++) {
    const b = m * F;
    const va = A[b + iS]! - A[b + iP]! - importFeeUAH * A[b + iI]!;
    const vb = B[b + iS]! - B[b + iP]! - importFeeUAH * B[b + iI]!;
    const src = vb > va ? B : A;
    for (let j = 0; j < F; j++) out[b + j] = src[b + j]!;
  }
  out[n - 1] = Math.max(A[n - 1]!, B[n - 1]!);
  return { months: out.subarray(0, n - 1), peakDayPurchasesUAH: out[n - 1]! };
}

/** One calendar month (1–12) of a library value as named fields. */
export function monthFields(v: LibraryValue, month: number): Record<Field, number> {
  const base = (month - 1) * FIELDS.length;
  const r = {} as Record<Field, number>;
  FIELDS.forEach((f, i) => (r[f] = v.months[base + i]!));
  return r;
}
