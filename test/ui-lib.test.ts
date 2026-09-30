import { describe, expect, it } from "vitest";
import { BASE_CASE, validateInputs } from "../src/engine";
import { FIELDS, FIELD_BY_ID, sameValue, withField } from "../src/lib/fields";
import { ct, keur, meur, num, pct, ratio } from "../src/lib/format";
import { decodeInputs, encodeInputs } from "../src/lib/url-state";
import { en } from "../src/messages/en";

describe("fields", () => {
  it("every field has a label and reads the base case", () => {
    for (const f of FIELDS) {
      expect(en.fields[f.id]?.label ?? (f.opexCell ? "grid" : undefined), f.id).toBeTruthy();
      expect(f.get(BASE_CASE), f.id).not.toBeUndefined();
    }
  });

  it("set then get returns the value for every concrete field", () => {
    for (const f of FIELDS.filter((x) => !x.virtual)) {
      const v = f.get(BASE_CASE);
      const next =
        typeof v === "number"
          ? f.decimals === 0
            ? v + 1 // integer fields (turbines, years, months) round on set
            : v * 1.1 + 0.01
          : typeof v === "boolean"
            ? !v
            : f.kind === "month"
              ? "2027-02"
              : f.kind === "date"
                ? "2026-10-15"
                : (f.options?.find((o) => o !== v) ?? v);
      const changed = withField(BASE_CASE, f, next);
      expect(sameValue(f.get(changed), next), f.id).toBe(true);
      expect(sameValue(f.get(BASE_CASE), v), `${f.id} must not mutate the base case`).toBe(true);
    }
  });

  it("total capex rescales all items and keeps their proportions", () => {
    const f = FIELD_BY_ID.get("capexTotal")!;
    const doubled = withField(BASE_CASE, f, (f.get(BASE_CASE) as number) * 2);
    expect(f.get(doubled)).toBeCloseTo((f.get(BASE_CASE) as number) * 2, 6);
    expect(doubled.capex.items[0]!.eurPerKw / doubled.capex.items[1]!.eurPerKw).toBeCloseTo(
      BASE_CASE.capex.items[0]!.eurPerKw / BASE_CASE.capex.items[1]!.eurPerKw,
      9,
    );
  });
});

describe("url state", () => {
  it("writes nothing for the base case", () => {
    expect(encodeInputs(BASE_CASE, BASE_CASE)).toBe("");
  });

  it("round-trips changed inputs", () => {
    let i = withField(BASE_CASE, FIELD_BY_ID.get("award")!, 5.2);
    i = withField(i, FIELD_BY_ID.get("legalForm")!, "GmbH");
    i = withField(i, FIELD_BY_ID.get("twoSided")!, true);
    i = withField(i, FIELD_BY_ID.get("om2")!, 18);
    const q = encodeInputs(i, BASE_CASE);
    expect(q).toContain("award=5.2");
    expect(decodeInputs(q, BASE_CASE)).toEqual(i);
  });

  it("ignores unknown keys and values outside the allowed range", () => {
    expect(decodeInputs("foo=1&award=999&siteQuality=abc", BASE_CASE)).toBeNull();
  });

  it("ignores dates outside the model's range or not on the calendar", () => {
    // These links used to crash the calculator ("No price index for 10000/2026").
    expect(decodeInputs("fc=9999-12", BASE_CASE)).toBeNull();
    expect(decodeInputs("fc=1900-01", BASE_CASE)).toBeNull();
    expect(decodeInputs("fc=2027-13", BASE_CASE)).toBeNull();
    expect(decodeInputs("awardNotice=2026-02-30", BASE_CASE)).toBeNull();
    expect(decodeInputs("awardNotice=9999-01-01", BASE_CASE)).toBeNull();
    expect(decodeInputs("fc=2027-07", BASE_CASE)?.project.financialClose).toBe("2027-07-01");
    expect(decodeInputs("awardNotice=2026-10-01", BASE_CASE)?.revenue.awardNoticeDate).toBe("2026-10-01");
  });

  it("keeps every interface range inside the engine's limits", () => {
    // Anything the panel or a link accepts must pass the engine's own validation on its own.
    for (const f of FIELDS.filter((x) => !x.virtual && x.kind === "number")) {
      for (const shown of [f.min, f.max]) {
        if (shown === undefined) continue;
        const i = withField(BASE_CASE, f, shown / (f.scale ?? 1));
        const issues = validateInputs(i).filter((x) => !x.message.includes("grace") && !x.message.includes("repayment"));
        expect(issues, `${f.id} = ${shown}`).toEqual([]);
      }
    }
  });
});

describe("format (en-GB)", () => {
  it("formats the KPI types", () => {
    expect(pct(0.030124, 2)).toBe("3.01%");
    expect(meur(-16_044_536)).toBe("−€16.0m");
    expect(keur(21_509_505)).toBe("21,510");
    expect(ratio(1.3663)).toBe("1.37x");
    expect(ct(7.2524)).toBe("7.25 ct/kWh");
    expect(pct(null)).toBe("n/a");
  });

  it("prints negatives with a minus sign and never shows −0", () => {
    expect(pct(-0.030867, 2)).toBe("−3.09%");
    expect(ratio(-1.5)).toBe("−1.50x");
    expect(num(-0.004)).toBe("0");
    expect(keur(-400)).toBe("0");
    expect(keur(-1_265_000)).toBe("−1,265");
  });
});
