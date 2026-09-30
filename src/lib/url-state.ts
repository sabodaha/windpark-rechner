// Inputs <-> URL query: only fields that differ from the base case are written, in engine units.
import type { Inputs } from "@/engine";
import { FIELDS, type FieldDef, type FieldValue, sameValue, withField } from "./fields";

const STORAGE_KEY = "windpark-rechner:v1:inputs";

function encodeValue(v: FieldValue): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(Number(v.toPrecision(10)));
  return v;
}

function decodeValue(f: FieldDef, raw: string): FieldValue | undefined {
  switch (f.kind) {
    case "switch":
      return raw === "1" || raw === "true";
    case "select":
      return f.options?.includes(raw) ? raw : undefined;
    case "month":
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : undefined;
    default: {
      const x = Number(raw);
      if (!Number.isFinite(x)) return undefined;
      const scale = f.scale ?? 1;
      if (f.min !== undefined && x * scale < f.min - 1e-9) return undefined;
      if (f.max !== undefined && x * scale > f.max + 1e-9) return undefined;
      return x;
    }
  }
}

export function encodeInputs(inputs: Inputs, base: Inputs): string {
  const params = new URLSearchParams();
  for (const f of FIELDS) {
    if (f.virtual) continue;
    const v = f.get(inputs);
    if (!sameValue(v, f.get(base))) params.set(f.id, encodeValue(v));
  }
  return params.toString();
}

export function decodeInputs(query: string, base: Inputs): Inputs | null {
  const params = new URLSearchParams(query);
  let inputs = base;
  let changed = false;
  for (const f of FIELDS) {
    if (f.virtual) continue;
    const raw = params.get(f.id);
    if (raw === null) continue;
    const v = decodeValue(f, raw);
    if (v === undefined) continue;
    inputs = withField(inputs, f, v);
    changed = true;
  }
  return changed ? inputs : null;
}

export function saveToStorage(query: string): void {
  try {
    if (query) window.localStorage.setItem(STORAGE_KEY, query);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode, blocked site data) — the URL still carries the state
  }
}

export function loadFromStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
