// The battery calculator's inputs and link format: every field is labelled, sourced and within its own range, and a
// link carries exactly the inputs that differ from the base case.
import { describe, expect, it } from "vitest";
import { BESS_BASE } from "../src/bess/engine";
import { BESS_FIELDS, BESS_GROUPS, type BessFieldDef, type BessFieldValue, sameValue, toDisplay } from "../src/bess/fields";
import { bessEn } from "../src/bess/messages";
import { BESS_SOURCES } from "../src/bess/sources";
import { BESS_STORAGE_KEY, decodeBessInputs, encodeBessInputs, ignoredBessParams } from "../src/bess/url-state";
import { STORAGE_KEY } from "../src/lib/url-state";

/** A value of the field other than the base one, as the interface would set it. */
function otherValue(f: BessFieldDef): BessFieldValue {
  const base = f.get(BESS_BASE);
  if (f.kind === "switch") return !base;
  if (f.kind === "select") return f.options!.find((o) => o !== base)!;
  const shown = toDisplay(f, base) as number;
  const target = f.usual ? (shown < f.usual[1] ? f.usual[1] : f.usual[0]) : (f.max ?? shown + 1);
  return target / (f.scale ?? 1);
}

describe("battery calculator fields", () => {
  it("are unique, grouped, labelled, explained and sourced", () => {
    expect(new Set(BESS_FIELDS.map((f) => f.id)).size).toBe(BESS_FIELDS.length);
    for (const f of BESS_FIELDS) {
      expect(BESS_GROUPS, f.id).toContain(f.group);
      expect(bessEn.fields[f.id]?.label, f.id).toBeTruthy();
      expect(bessEn.fields[f.id]?.hint, f.id).toBeTruthy();
      expect(f.sources?.length, f.id).toBeGreaterThan(0);
      for (const s of f.sources ?? []) if (s !== "assumption") expect(BESS_SOURCES[s], `${f.id}: ${s}`).toBeDefined();
    }
  });

  it("start from base values inside their own ranges and options", () => {
    for (const f of BESS_FIELDS) {
      const v = f.get(BESS_BASE);
      if (f.kind === "select") {
        expect(f.options, f.id).toContain(v);
        for (const o of f.options!) expect(bessEn.options[f.id]?.[o], `${f.id}=${o}`).toBeTruthy();
      } else if (f.kind === "number") {
        const shown = toDisplay(f, v) as number;
        expect(shown, f.id).toBeGreaterThanOrEqual(f.min!);
        expect(shown, f.id).toBeLessThanOrEqual(f.max!);
        if (f.usual) expect(f.usual[0] <= shown && shown <= f.usual[1], `${f.id} base inside usual range`).toBe(true);
      }
    }
  });

  it("set one input without touching the others", () => {
    for (const f of BESS_FIELDS) {
      const next = f.set(BESS_BASE, otherValue(f));
      expect(sameValue(f.get(next), f.get(BESS_BASE)), f.id).toBe(false);
      for (const g of BESS_FIELDS) if (g !== f) expect(sameValue(g.get(next), g.get(BESS_BASE)), `${f.id} → ${g.id}`).toBe(true);
    }
  });
});

describe("battery calculator links", () => {
  it("the base case has an empty query", () => {
    expect(encodeBessInputs(BESS_BASE, BESS_BASE)).toBe("");
    expect(decodeBessInputs("", BESS_BASE)).toBeNull();
  });

  it("every input survives the round trip through the link", () => {
    for (const f of BESS_FIELDS) {
      const changed = f.set(BESS_BASE, otherValue(f));
      const query = encodeBessInputs(changed, BESS_BASE);
      expect(query.startsWith(`${f.id}=`), f.id).toBe(true);
      const back = decodeBessInputs(query, BESS_BASE)!;
      for (const g of BESS_FIELDS) expect(sameValue(g.get(back), g.get(changed)), `${f.id} → ${g.id}`).toBe(true);
    }
  });

  it("lists what a link could not apply, and ignores tracking tags", () => {
    expect(ignoredBessParams("dur=3&capt=2&nope=1&utm_source=x&scn=high")).toEqual(["dur=3", "capt=2", "nope=1"]);
    const applied = decodeBessInputs("dur=3&scn=high", BESS_BASE)!;
    expect(applied.scenario).toBe("high");
    expect(applied.durationH).toBe(BESS_BASE.durationH);
  });

  it("keeps its own storage entry", () => {
    expect(BESS_STORAGE_KEY).not.toBe(STORAGE_KEY);
  });
});
