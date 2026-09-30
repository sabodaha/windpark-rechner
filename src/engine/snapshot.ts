// One immutable snapshot of a calculation: the inputs, every scenario with its full trace, the engine version and
// a hash of the inputs. The calculator, the Excel workbook and the PDF report all read from such a snapshot.
import { DATA_AS_OF } from "./defaults";
import { runScenarios, type ScenarioName } from "./scenarios";
import type { Inputs, ModelResult } from "./types";

/**
 * Version of the engine's economics. Any change to a result bumps it, together with the golden values.
 * 1.0.0 — first engine (30 Sep 2026). 2.0.0 — corrected after two external reviews (phase 1 of the joint plan).
 */
export const ENGINE_VERSION = "2.0.0";

export interface ModelSnapshot {
  engineVersion: string;
  dataAsOf: string;
  /** Hash of the inputs, independent of key order: the same inputs always give the same hash. */
  inputHash: string;
  inputs: Inputs;
  scenarios: Record<ScenarioName, ModelResult>;
}

/** JSON with object keys sorted, so equal objects give equal text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** 64-bit hash (two independent 32-bit FNV-1a lanes) of the inputs, as 16 hex digits. Not a security hash. */
export function hashInputs(inputs: Inputs): string {
  const text = stableStringify(inputs);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 15)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** Runs every scenario with its trace and freezes the result. */
export function buildSnapshot(inputs: Inputs): ModelSnapshot {
  const copy = structuredClone(inputs);
  return deepFreeze({
    engineVersion: ENGINE_VERSION,
    dataAsOf: DATA_AS_OF,
    inputHash: hashInputs(copy),
    inputs: copy,
    scenarios: runScenarios(copy, { trace: true }),
  });
}
