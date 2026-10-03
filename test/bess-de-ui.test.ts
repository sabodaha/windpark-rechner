// The German battery calculator's inputs and link format: every field is labelled, sourced and within its own range,
// a link carries exactly the inputs that differ from the base case, and the toll switch takes along what follows it.
import { describe, expect, it } from "vitest";
import { DE_FIELDS, DE_GROUPS, type DeFieldDef } from "../src/bess/de/fields";
import { deEn } from "../src/bess/de/messages";
import { DE_BASE, DE_VARIANTS } from "../src/bess/de/registry";
import { DE_SOURCES } from "../src/bess/de/sources";
import { DE_STORAGE_KEY, decodeDeInputs, encodeDeInputs, ignoredDeParams } from "../src/bess/de/url-state";
import { baseValue, type FieldValue, sameValue, toDisplay } from "../src/bess/field-kit";
import { BESS_STORAGE_KEY } from "../src/bess/url-state";

/** A value of the field other than the base one, as the interface would set it. */
function otherValue(f: DeFieldDef): FieldValue {
  const base = f.get(DE_BASE);
  if (f.kind === "switch") return !base;
  if (f.kind === "select") return f.options!.find((o) => o !== base)!;
  const shown = toDisplay(f, base) as number;
  const target = f.usual ? (shown < f.usual[1] ? f.usual[1] : f.usual[0]) : (f.max ?? shown + 1);
  return target / (f.scale ?? 1);
}

const field = (id: string) => DE_FIELDS.find((f) => f.id === id)!;

describe("German calculator fields", () => {
  it("are unique, grouped, labelled, explained and sourced", () => {
    expect(new Set(DE_FIELDS.map((f) => f.id)).size).toBe(DE_FIELDS.length);
    for (const f of DE_FIELDS) {
      expect(DE_GROUPS, f.id).toContain(f.group);
      expect(deEn.groups[f.group], f.group).toBeTruthy();
      expect(deEn.fields[f.id]?.label, f.id).toBeTruthy();
      expect(deEn.fields[f.id]?.hint, f.id).toBeTruthy();
      expect(f.sources?.length, f.id).toBeGreaterThan(0);
      for (const s of f.sources ?? []) if (s !== "assumption") expect(DE_SOURCES[s], `${f.id}: ${s}`).toBeDefined();
    }
  });

  it("start from base values inside their own ranges and options", () => {
    for (const f of DE_FIELDS) {
      const v = f.get(DE_BASE);
      if (f.kind === "select") {
        expect(f.options, f.id).toContain(v);
        for (const o of f.options!) expect(deEn.options[f.id]?.[o], `${f.id}=${o}`).toBeTruthy();
      } else if (f.kind === "number") {
        const shown = toDisplay(f, v) as number;
        expect(shown, f.id).toBeGreaterThanOrEqual(f.min!);
        expect(shown, f.id).toBeLessThanOrEqual(f.max!);
        if (f.usual) expect(f.usual[0] <= shown && shown <= f.usual[1], `${f.id} base inside usual range`).toBe(true);
        if (f.unit) expect(deEn.units[f.unit] ?? f.unit, f.id).toBeTruthy();
      }
    }
  });

  it("set one input without touching the others", () => {
    // a field that follows another input (a preset follows the duration; the loan and the rates follow the toll) stays
    // at what it follows
    for (const f of DE_FIELDS) {
      const next = f.set(DE_BASE, otherValue(f));
      expect(sameValue(f.get(next), f.get(DE_BASE)), f.id).toBe(false);
      for (const g of DE_FIELDS) if (g !== f) expect(sameValue(g.get(next), baseValue(g, next, DE_BASE)), `${f.id} → ${g.id}`).toBe(true);
    }
  });

  it("switching the toll off takes the loan and the merchant rates along, unless they were set", () => {
    const off = field("toll").set(DE_BASE, false);
    expect(off.debt).toBe(false);
    expect(off.equityHurdle).toBe(DE_VARIANTS.merchant.equityHurdle);
    expect(off.projectDiscountRate).toBe(DE_VARIANTS.merchant.projectDiscountRate);
    const on = field("toll").set(off, true);
    expect(on).toEqual(DE_BASE);
    const own = field("toll").set(field("hurdle").set(DE_BASE, 0.13), false);
    expect(own.equityHurdle).toBe(0.13);
  });

  it("a 4-hour battery brings its own toll price and O&M", () => {
    const four = field("dur").set(DE_BASE, "4");
    expect(four.durationHours).toBe(4);
    expect(four.tollPrice).toBe(150_000);
    expect(encodeDeInputs(four, DE_BASE)).toBe("dur=4");
  });
});

describe("German calculator links", () => {
  it("the base case has an empty query", () => {
    expect(encodeDeInputs(DE_BASE, DE_BASE)).toBe("");
    expect(decodeDeInputs("", DE_BASE)).toBeNull();
  });

  it("every input survives the round trip through the link", () => {
    for (const f of DE_FIELDS) {
      const changed = f.set(DE_BASE, otherValue(f));
      const query = encodeDeInputs(changed, DE_BASE);
      expect(query.startsWith(`${f.id}=`), f.id).toBe(true);
      const back = decodeDeInputs(query, DE_BASE)!;
      for (const g of DE_FIELDS) expect(sameValue(g.get(back), g.get(changed)), `${f.id} → ${g.id}`).toBe(true);
    }
  });

  it("lists what a link could not apply, and ignores tracking tags", () => {
    expect(ignoredDeParams("dur=3&capt=2&nope=1&utm_source=x&path=high")).toEqual(["dur=3", "capt=2", "nope=1"]);
    const applied = decodeDeInputs("dur=3&path=high", DE_BASE)!;
    expect(applied.spreadPath).toBe("high");
    expect(applied.durationHours).toBe(DE_BASE.durationHours);
  });

  it("keeps its own storage entry", () => {
    expect(DE_STORAGE_KEY).not.toBe(BESS_STORAGE_KEY);
  });
});
