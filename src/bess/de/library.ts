// The German revenue library (spec v1.2 R2 §13, K21): per-MW monthly aggregates of perfect-foresight day-ahead dispatch
// in EUR, algorithm version 2. The lookup rules are those of the Ukrainian library v2 (model-spec §5): linear on usable
// hours, on the signed fee axis the better of the two adjacent node schedules per month. Outside the grid it throws
// `UnsupportedLibraryInput` instead of clamping. The manifest is checked before any calculation.
import { UnsupportedLibraryInput } from "../engine/library";
import type { DeSnapshot } from "./types";

export { UnsupportedLibraryInput };

export const DE_FIELDS = ["salesEUR", "purchasesEUR", "importMWh", "exportMWh"] as const;
export type DeField = (typeof DE_FIELDS)[number];

export interface DeSnapshotMeta {
  from: string;
  to: string;
  days: number;
  hours: number;
  /** L̄: the mean hourly price of the snapshot (spec §2.2). */
  avgPriceEUR: number;
  tb2EurPerMw: number;
  monthly: { month: number; days: number; hours: number; avgPriceEUR: number }[];
}

export interface DeLibraryManifest {
  schema: string;
  market: string;
  currency: string;
  priceBase: number;
  version: number;
  algorithmVersion: number;
  attribution: string;
  license: string;
  axes: {
    snapshot: DeSnapshot[];
    durationHoursBoL: number[];
    usableHours: Record<string, number[]>;
    cycleCap: number[];
    rte: number[];
    importFeeEUR: number[];
  };
  nodeOrder: string[];
  fields: string[];
  months: number;
  dtype: "float32";
  doublesPerNode: number;
  nodes: number;
  snapshots: Record<DeSnapshot, DeSnapshotMeta>;
  releaseGate: { passed: boolean };
}

export interface DeLibrary {
  manifest: DeLibraryManifest;
  data: Float64Array;
}

export interface DeLibraryKey {
  snapshot: DeSnapshot;
  duration: number;
  cycleCap: number;
  rte: number;
}

/** Twelve months × four fields, per MW, plus the peak daily purchases of the node set used. */
export interface DeLibraryValue {
  months: Float64Array;
  peakDayPurchasesEUR: number;
}

const NODE_ORDER = ["snapshot", "durationHoursBoL", "cycleCap", "rte", "importFeeEUR", "usableHours"];

/** Rejects a foreign market, schema, unit or algorithm before calculation (spec §13). */
export function parseDeLibrary(manifest: DeLibraryManifest, payload: ArrayBuffer): DeLibrary {
  if (manifest.schema !== "bess-de-library" || manifest.market !== "DE" || manifest.currency !== "EUR" || manifest.priceBase !== 2025) {
    throw new Error("not a German EUR library with 2025 prices");
  }
  if (manifest.algorithmVersion !== 2) throw new Error("German library needs algorithm version 2");
  if (manifest.fields.join() !== DE_FIELDS.join()) throw new Error("library field order mismatch");
  if (manifest.nodeOrder.join() !== NODE_ORDER.join()) throw new Error("library node order mismatch");
  if (manifest.dtype !== "float32") throw new Error("library dtype mismatch");
  if (!manifest.releaseGate?.passed) throw new Error("library release gate not passed");
  const data = Float64Array.from(new Float32Array(payload));
  if (data.length !== manifest.nodes * manifest.doublesPerNode) throw new Error("library payload size mismatch");
  return { manifest, data };
}

const EPS = 1e-9;

function axisIndex(axis: number[], value: number, what: string): number {
  const i = axis.findIndex((v) => Math.abs(v - value) < EPS);
  if (i < 0) throw new UnsupportedLibraryInput(`${what} ${value} is not a library node`);
  return i;
}

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

function nodeOffset(lib: DeLibrary, key: DeLibraryKey, feeIdx: number, hIdx: number): number {
  const a = lib.manifest.axes;
  const block = (d: number) => a.cycleCap.length * a.rte.length * a.importFeeEUR.length * a.usableHours[String(d)]!.length;
  const perSnapshot = a.durationHoursBoL.reduce((s, d) => s + block(d), 0);
  const sIdx = a.snapshot.indexOf(key.snapshot);
  if (sIdx < 0) throw new UnsupportedLibraryInput(`snapshot ${key.snapshot}`);
  let offset = sIdx * perSnapshot;
  for (const d of a.durationHoursBoL) {
    if (d === key.duration) break;
    offset += block(d);
  }
  const nH = a.usableHours[String(key.duration)]!.length;
  const cIdx = axisIndex(a.cycleCap, key.cycleCap, "cycle cap");
  const rIdx = axisIndex(a.rte, key.rte, "RTE node");
  return (offset + ((cIdx * a.rte.length + rIdx) * a.importFeeEUR.length + feeIdx) * nH + hIdx) * lib.manifest.doublesPerNode;
}

function atFeeNode(lib: DeLibrary, key: DeLibraryKey, fi: number, h0: number, h1: number, wh: number): Float64Array {
  const n = lib.manifest.doublesPerNode;
  const out = new Float64Array(n);
  for (const [hi, w] of [[h0, 1 - wh], [h1, wh]] as [number, number][]) {
    if (w === 0) continue;
    const off = nodeOffset(lib, key, fi, hi);
    for (let j = 0; j < n; j++) out[j]! += w * lib.data[off + j]!;
  }
  return out;
}

/** Library value at `usableHours` and the signed effective fee `importFeeEUR` (real 2025 €/MWh). With `lowerNode` the
 *  usable-hours axis takes the node at or below the value (the lender case). */
export function lookupDe(lib: DeLibrary, key: DeLibraryKey, usableHours: number, importFeeEUR: number, lowerNode = false): DeLibraryValue {
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
  let [f0, f1, wf] = bracket(a.importFeeEUR, importFeeEUR, "import fee");
  // a fee on a node reads that node alone (spec §13): at 0 on the reference path the bracket is [−5, 0] with weight 1
  if (wf > 1 - EPS) [f0, wf] = [f1, 0];
  else if (wf < EPS) wf = 0;
  const n = lib.manifest.doublesPerNode;
  const A = atFeeNode(lib, key, f0, h0, h1, wh);
  if (wf === 0) return { months: A.subarray(0, n - 1), peakDayPurchasesEUR: A[n - 1]! };
  const B = atFeeNode(lib, key, f1, h0, h1, wh);
  const out = new Float64Array(n);
  const F = DE_FIELDS.length;
  for (let m = 0; m < 12; m++) {
    const b = m * F;
    const va = A[b]! - A[b + 1]! - importFeeEUR * A[b + 2]!;
    const vb = B[b]! - B[b + 1]! - importFeeEUR * B[b + 2]!;
    const src = vb > va ? B : A;
    for (let j = 0; j < F; j++) out[b + j] = src[b + j]!;
  }
  out[n - 1] = Math.max(A[n - 1]!, B[n - 1]!);
  return { months: out.subarray(0, n - 1), peakDayPurchasesEUR: out[n - 1]! };
}

export function deMonthFields(v: DeLibraryValue, month: number): Record<DeField, number> {
  const base = (month - 1) * DE_FIELDS.length;
  return { salesEUR: v.months[base]!, purchasesEUR: v.months[base + 1]!, importMWh: v.months[base + 2]!, exportMWh: v.months[base + 3]! };
}
