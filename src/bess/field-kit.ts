// Inputs of a battery calculator as the interface shows them, for any set of engine inputs (Ukraine, Germany). Values
// are stored in engine units; `scale` converts to the displayed unit (0.85 → 85 %). min, max and the "usual" range that
// bounds a slider are in displayed units. The URL carries only the fields that differ from the base case.

export type FieldKind = "number" | "select" | "switch";
export type FieldValue = number | string | boolean;

export interface FieldDef<I, G extends string = string> {
  /** Also the name of the URL parameter: short and never reused for something else. */
  id: string;
  group: G;
  kind: FieldKind;
  quick?: boolean;
  unit?: string;
  scale?: number;
  decimals?: number;
  min?: number;
  max?: number;
  usual?: [number, number];
  step?: number;
  options?: string[];
  /** Source ids of the calculator's source list, or "assumption". */
  sources?: string[];
  hidden?: (i: I) => boolean;
  /** The value this field has when left alone, if it follows other inputs (a preset follows the duration); otherwise
   *  the base case's. */
  follows?: (i: I) => FieldValue;
  get: (i: I) => FieldValue;
  set: (i: I, v: FieldValue) => I;
}

/** What a field counts as unchanged against: the value it follows, else the base case's. */
export function baseValue<I>(f: FieldDef<I>, inputs: I, base: I): FieldValue {
  return f.follows ? f.follows(inputs) : f.get(base);
}

export function toDisplay<I>(f: FieldDef<I>, v: FieldValue): FieldValue {
  return typeof v === "number" ? v * (f.scale ?? 1) : v;
}

export function fromDisplay<I>(f: FieldDef<I>, v: number): number {
  return v / (f.scale ?? 1);
}

export function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
}

function encodeValue(v: FieldValue): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return String(Number(v.toPrecision(10)));
  return v;
}

function decodeValue<I>(f: FieldDef<I>, raw: string): FieldValue | undefined {
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

export function encodeInputs<I>(fields: FieldDef<I>[], inputs: I, base: I): string {
  const params = new URLSearchParams();
  for (const f of fields) {
    const v = f.get(inputs);
    if (!sameValue(v, baseValue(f, inputs, base))) params.set(f.id, encodeValue(v));
  }
  return params.toString();
}

export function decodeInputs<I>(fields: FieldDef<I>[], query: string, base: I): I | null {
  const params = new URLSearchParams(query);
  let inputs = base;
  let changed = false;
  for (const f of fields) {
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
export function ignoredParams<I>(fields: FieldDef<I>[], query: string): string[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: string[] = [];
  for (const [key, raw] of new URLSearchParams(query)) {
    if (TRACKING.test(key)) continue;
    const f = byId.get(key);
    if (!f || decodeValue(f, raw) === undefined) out.push(`${key}=${raw}`);
  }
  return out;
}

export function linkHasInputs(query: string): boolean {
  return [...new URLSearchParams(query).keys()].some((key) => !TRACKING.test(key));
}

/** The calculator's own entry in the browser's storage, used only when the visitor asks to remember the inputs
 *  (Privacy names every key). */
export function inputStore(key: string) {
  return {
    save(query: string): void {
      try {
        window.localStorage.setItem(key, query);
      } catch {
        // storage unavailable (private mode, blocked site data) — the URL still carries the state
      }
    },
    clear(): void {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // nothing stored, or storage unavailable
      }
    },
    /** The stored inputs; "" when the visitor asked to remember the base case; null when nothing is stored. */
    load(): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
  };
}
