// Battery inputs <-> URL query: only fields that differ from the base case are written, in engine units. Same rules
// as the wind calculator (lib/url-state.ts), with its own fields and its own storage entry.
import type { BessInputs } from "./engine";
import { BESS_FIELDS, baseValue, type BessFieldDef, type BessFieldValue, sameValue } from "./fields";

/** Where the battery calculator keeps the inputs when the visitor asks it to remember them (Privacy names this key). */
export const BESS_STORAGE_KEY = "battery-storage-calculator:v1:inputs";

function encodeValue(v: BessFieldValue): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(Number(v.toPrecision(10)));
  return v;
}

function decodeValue(f: BessFieldDef, raw: string): BessFieldValue | undefined {
  switch (f.kind) {
    case "switch":
      return raw === "1" || raw === "true" ? true : raw === "0" || raw === "false" ? false : undefined;
    case "select":
      return f.options?.includes(raw) ? raw : undefined;
    default: {
      const x = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(x)) return undefined;
      const scale = f.scale ?? 1;
      if (f.min !== undefined && x * scale < f.min - 1e-9) return undefined;
      if (f.max !== undefined && x * scale > f.max + 1e-9) return undefined;
      return x;
    }
  }
}

export function encodeBessInputs(inputs: BessInputs, base: BessInputs): string {
  const params = new URLSearchParams();
  for (const f of BESS_FIELDS) {
    const v = f.get(inputs);
    if (!sameValue(v, baseValue(f, inputs, base))) params.set(f.id, encodeValue(v));
  }
  return params.toString();
}

export function decodeBessInputs(query: string, base: BessInputs): BessInputs | null {
  const params = new URLSearchParams(query);
  let inputs = base;
  let changed = false;
  for (const f of BESS_FIELDS) {
    const raw = params.get(f.id);
    if (raw === null) continue;
    const v = decodeValue(f, raw);
    if (v === undefined) continue;
    inputs = f.set(inputs, v);
    changed = true;
  }
  return changed ? inputs : null;
}

/** Parameters that platforms add to shared links; they are not inputs and not worth a notice. */
const TRACKING = /^(utm_\w+|fbclid|gclid|msclkid|trk|trkInfo|li_fat_id|mc_cid|mc_eid|igshid|ref|si)$/;

/** Parameters of a link that were not applied: a value outside a field's range or options, or an unknown name. */
export function ignoredBessParams(query: string): string[] {
  const byId = new Map(BESS_FIELDS.map((f) => [f.id, f]));
  const out: string[] = [];
  for (const [key, raw] of new URLSearchParams(query)) {
    if (TRACKING.test(key)) continue;
    const f = byId.get(key);
    if (!f || decodeValue(f, raw) === undefined) out.push(`${key}=${raw}`);
  }
  return out;
}

export function bessLinkHasInputs(query: string): boolean {
  return [...new URLSearchParams(query).keys()].some((key) => !TRACKING.test(key));
}

export function saveBessInputs(query: string): void {
  try {
    window.localStorage.setItem(BESS_STORAGE_KEY, query);
  } catch {
    // storage unavailable (private mode, blocked site data) — the URL still carries the state
  }
}

export function clearBessInputs(): void {
  try {
    window.localStorage.removeItem(BESS_STORAGE_KEY);
  } catch {
    // nothing stored, or storage unavailable
  }
}

/** The stored inputs; "" when the visitor asked to remember the base case; null when nothing is stored. */
export function loadBessInputs(): string | null {
  try {
    return window.localStorage.getItem(BESS_STORAGE_KEY);
  } catch {
    return null;
  }
}
