// The German texts: complete, typeset, and saying what the English texts say for every message the engine produces.
import { describe, expect, it } from "vitest";
import { formatMetric, settingLabel } from "../src/lib/tornado";
import { BASE_CASE, SOURCES, TORNADO_DRIVERS, validateInputs, type Inputs, type IssueCode } from "../src/engine";
import { FIELDS } from "../src/lib/fields";
import { FORMAT } from "../src/lib/format";
import { nbsp, typeset } from "../src/lib/typography";
import { de } from "../src/messages/de";
import { en } from "../src/messages/en";

/** Every string of a dictionary with its path; functions are left out (their results are checked below). */
function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v !== null && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

const edit = (fn: (i: Inputs) => void): Inputs => {
  const copy = structuredClone(BASE_CASE);
  fn(copy);
  return copy;
};

/** Inputs that produce each kind of validation issue. */
const BROKEN: Record<IssueCode, Inputs | null> = {
  notNumber: edit((i) => void (i.energy.siteQuality = Number.NaN)),
  notInteger: edit((i) => void (i.project.turbines = 4.5)),
  outOfRange: edit((i) => void (i.macro.inflation[0]!.value = -0.5)),
  notDate: edit((i) => void (i.revenue.awardNoticeDate = "2026-13-45")),
  notFirstOfMonth: edit((i) => void (i.project.financialClose = "2027-03-15")),
  missing: edit((i) => void ((i.capex as { items?: unknown }).items = undefined)),
  needsThreeValues: edit((i) => void (i.opex.maintenancePerKw = [20, 25] as unknown as [number, number, number])),
  graceNotShorterThanTenor: edit((i) => void ((i.financing.graceYears = 10), (i.financing.tenorYearsFromClose = 10))),
  repaymentBeforeCommissioning: edit((i) => void ((i.financing.graceYears = 0), (i.project.constructionMonths = 18))),
  error: null,
};

describe("German dictionary", () => {
  it("has a German title for every source, and only for sources", () => {
    expect(Object.keys(de.sourceTitles).sort()).toEqual(Object.keys(SOURCES).sort());
  });

  it("has a label for every input field and a unit for every English unit word", () => {
    for (const f of FIELDS) if (!f.opexCell) expect(de.fields[f.id]?.label, f.id).toBeTruthy();
    const units = new Set(FIELDS.map((f) => f.unit).filter((u): u is string => !!u));
    for (const u of units) if (/[a-z]{2,}/.test(u) && !/^(ct\/kWh|MW|m|h)$/.test(u)) expect(de.units[u], u).toBeTruthy();
  });

  it("keeps numbers with their units and section signs with their numbers (no-break spaces)", () => {
    expect(strings(de).length).toBeGreaterThan(300);
    for (const [path, s] of strings(de)) {
      expect(s, path).not.toMatch(/\d (%|€|ct\b|MW\b|kWh\b|Mio\.|Tsd\.|Jahre)/);
      expect(s, path).not.toMatch(/§§? \d/);
    }
    expect(de.validity.lockUp(2)).toBe("Ausschüttungen in 2 Jahren zurückgehalten (Ausschüttungssperre)");
    expect(nbsp("§ 36h EEG, 68 % und 25 Jahre")).toBe("§ 36h EEG, 68 % und 25 Jahre");
    expect(typeset({ a: ["5 MW"], f: (n: number) => `${n} %` }).f(3)).toBe("3 %");
  });

  it("leaves the disclaimer word for word", () => {
    expect(de.header.disclaimer).toBe("Beispielrechnung – keine Anlage-, Steuer- oder Rechtsberatung. Der Windpark ist fiktiv.");
  });
});

describe("validation issues in both languages", () => {
  for (const [code, inputs] of Object.entries(BROKEN) as [IssueCode, Inputs | null][]) {
    if (!inputs) continue;
    it(code, () => {
      const issues = validateInputs(inputs).filter((i) => i.code === code);
      expect(issues.length, code).toBeGreaterThan(0);
      for (const issue of issues) {
        // The English text is the engine's own message; the German one says it in German.
        expect(en.invalid.issue[code](issue)).toBe(issue.message);
        const german = de.invalid.issue[code](issue);
        expect(german).not.toBe(issue.message);
        expect(german).not.toMatch(/undefined|NaN/);
      }
    });
  }

  it("German bounds use German numbers and dates", () => {
    const [range] = validateInputs(BROKEN.outOfRange!).filter((i) => i.code === "outOfRange");
    expect(de.invalid.issue.outOfRange(range!)).toBe("muss zwischen −0,1 und 0,3 liegen");
    const date = { path: "x", code: "outOfRange" as const, params: { min: "2025-01-01", max: "2032-12-01" }, message: "" };
    expect(de.invalid.issue.outOfRange(date)).toBe("muss zwischen 01.01.2025 und 01.12.2032 liegen");
  });
});

describe("tornado settings", () => {
  it("the English labels of the report and workbook are the settings in English format", () => {
    for (const d of TORNADO_DRIVERS) {
      expect(settingLabel(d.setting, "low", FORMAT.en, en.sensitivity.units), d.id).toBe(d.lowLabel);
      expect(settingLabel(d.setting, "high", FORMAT.en, en.sensitivity.units), d.id).toBe(d.highLabel);
    }
  });

  it("German labels use German numbers and words", () => {
    const label = (id: string, side: "low" | "high") =>
      settingLabel(TORNADO_DRIVERS.find((d) => d.id === id)!.setting, side, FORMAT.de, de.sensitivity.units);
    expect(label("siteQuality", "low")).toBe("60 %");
    expect(label("interestRate", "high")).toBe("6,05 %");
    expect(label("capex", "high")).toBe("+10 %");
    expect(label("inflation", "low")).toBe("−0,5 Pp.");
    expect(label("captureFactor", "low")).toBe("0,72");
    expect(label("lifetime", "high")).toBe("30 Jahre");
    expect(formatMetric("lcoeRealCt", 5.234, FORMAT.de)).toBe("5,23 ct/kWh");
  });

  it("each driver applies the setting it shows", () => {
    const read: Record<string, (i: Inputs) => number> = {
      siteQuality: (i) => i.energy.siteQuality,
      longTermPrice: (i) => i.revenue.longTermBaseEurMwh2026,
      captureFactor: (i) => i.revenue.captureFactor,
      awardPrice: (i) => i.revenue.awardPriceCt,
      interestRate: (i) => i.financing.interestRate,
      negativePrices: (i) => i.energy.negativePriceOutputShare,
      lease: (i) => i.opex.leaseShareOfRevenue,
      hebesatz: (i) => i.tax.hebesatz,
      lifetime: (i) => i.project.lifetimeYears,
      capex: (i) => i.capex.items[0]!.eurPerKw / BASE_CASE.capex.items[0]!.eurPerKw - 1,
      opex: (i) => i.opex.maintenancePerKw[0] / BASE_CASE.opex.maintenancePerKw[0] - 1,
      inflation: (i) => i.macro.longRunInflation - BASE_CASE.macro.longRunInflation,
    };
    for (const d of TORNADO_DRIVERS) {
      for (const side of ["low", "high"] as const) {
        expect(read[d.id]!(d.apply(BASE_CASE, side)), `${d.id} ${side}`).toBeCloseTo(d.setting[side], 9);
      }
    }
  });
});
