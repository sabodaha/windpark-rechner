// Unit tests of the BESS engine parts that do not need the revenue library (model-spec §18).
import { describe, expect, it } from "vitest";
import { toDay, toIso } from "@/engine/dates";
import { buildCalendar } from "@/bess/engine/calendar";
import { buildCapex } from "@/bess/engine/capex";
import { periodRates, sculpt } from "@/bess/engine/funding";
import { taxSchedule } from "@/bess/engine/ledger";
import { fxMonth, hicpIndex, uaCpiIndex } from "@/bess/engine/macro";
import { soh } from "@/bess/engine/operations";
import { TECH } from "@/bess/engine/registry";

describe("technical definitions (spec §3, registry TECH)", () => {
  it("nameplate factor is 1 / (0.90 × √0.88)", () => {
    expect(TECH.nameplateFactor).toBeCloseTo(1.18445, 5);
  });

  it("reproduces the B-T08 check points at 1.3 AC cycles a day (= 1.17 EFC)", () => {
    const efcPerYear = 1.3 * 0.9 * 365;
    const expected: [number, number][] = [[1, 0.966], [5, 0.886], [10, 0.806], [15, 0.734], [20, 0.668]];
    for (const [y, v] of expected) expect(soh(y, efcPerYear * y, 1)).toBeCloseTo(v, 3);
  });

  it("falls below 80 % only in year 11", () => {
    const efcPerYear = 1.3 * 0.9 * 365;
    expect(soh(10, efcPerYear * 10, 1)).toBeGreaterThan(0.8);
    expect(soh(11, efcPerYear * 11, 1)).toBeLessThan(0.8);
  });
});

describe("calendar (spec §2, §4, §11)", () => {
  const cal = buildCalendar(0);
  it("FC 01.02.2027, COD 01.02.2028, 15 years, 3 settlement months", () => {
    expect(toIso(cal.fcDay)).toBe("2027-02-01");
    expect(toIso(cal.codDay)).toBe("2028-02-01");
    expect(cal.eolIndex - cal.codIndex).toBe(180);
    expect(cal.months.length).toBe(12 + 180 + 3);
  });
  it("18 semi-annual debt dates from 01.08.2028 to 01.02.2037", () => {
    expect(cal.periods.length).toBe(18);
    expect(toIso(cal.periods[0]!.day)).toBe("2028-08-01");
    expect(toIso(cal.periods[17]!.day)).toBe("2037-02-01");
  });
  it("a three-month delay moves COD past the cohort cut-off", () => {
    const late = buildCalendar(3);
    expect(toIso(late.codDay)).toBe("2028-05-01");
    expect(late.codDay > toDay("2028-04-30")).toBe(true);
  });
});

describe("CAPEX from drivers (spec §8)", () => {
  it("all-in 17.26 / 23.10 / 34.76 € m for 1 / 2 / 4 h", () => {
    expect(buildCapex(50, 1, "dso110kV", 1).allInEur / 1e6).toBeCloseTo(17.26, 2);
    expect(buildCapex(50, 2, "dso110kV", 1).allInEur / 1e6).toBeCloseTo(23.10, 2);
    expect(buildCapex(50, 4, "dso110kV", 1).allInEur / 1e6).toBeCloseTo(34.76, 2);
  });
  it("payment profiles sum to one", () => {
    for (const l of buildCapex(50, 2, "dso110kV", 1).lines) expect(l.profile.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 12);
  });
});

describe("macro paths (spec §4, §13)", () => {
  it("indices start at 1 in 2025", () => {
    expect(hicpIndex(2025)).toBe(1);
    expect(hicpIndex(2028)).toBeCloseTo(1.03 * 1.025 * 1.021, 12);
    expect(uaCpiIndex(2028)).toBeCloseTo(1.082 * 1.083 * 1.056, 12);
  });
  it("mid-year months sit near the annual averages and the stress adds 10 % from 2028", () => {
    expect(fxMonth(2028, 7, false)).toBeGreaterThan(57.0);
    expect(fxMonth(2028, 6, false)).toBeLessThan(57.0);
    expect(fxMonth(2029, 1, true) / fxMonth(2029, 1, false)).toBeCloseTo(1.1, 12);
  });
});

describe("debt sculpting (spec §11)", () => {
  it("equals the present value of the budgets when they decline", () => {
    const { opening } = sculpt([10, 10, 10], [0.05, 0.05, 0.05]);
    expect(opening).toBeCloseTo(10 / 1.05 + 10 / 1.05 ** 2 + 10 / 1.05 ** 3, 10);
  });
  it("never lets the balance grow: an early budget below interest caps the loan", () => {
    const { opening, closing } = sculpt([1, 50, 50], [0.05, 0.05, 0.05]);
    const balances = [opening, ...closing];
    for (let k = 1; k < balances.length; k++) expect(balances[k]!).toBeLessThanOrEqual(balances[k - 1]! + 1e-9);
    expect(opening).toBeCloseTo(20, 10);
  });
  it("uses the actual months of each period", () => {
    const r = periodRates(buildCalendar(0), 0.08);
    expect(r[0]).toBeCloseTo(0.04, 12);
    expect(r.every((v) => Math.abs(v - 0.04) < 1e-12)).toBe(true);
  });
});

describe("corporate tax schedule (spec §12)", () => {
  const cal = buildCalendar(0);
  const n = cal.months.length;
  it("2028 is an annual period paid in March 2029; a 2027 loss is carried forward", () => {
    const pbt = new Array(n).fill(0) as number[];
    const revenue = new Array(n).fill(0) as number[];
    const idx = (y: number, m: number) => cal.months.findIndex((x) => x.year === y && x.month === m);
    pbt[idx(2027, 6)] = -1_000_000;
    pbt[idx(2028, 6)] = 3_000_000;
    revenue[idx(2028, 6)] = 50_000_000;
    const t = taxSchedule(cal, pbt, revenue);
    expect(t.pay[idx(2029, 3)]).toBeCloseTo(0.18 * 2_000_000, 6);
    expect(t.pay.reduce((s, v) => s + v, 0)).toBeCloseTo(0.18 * 2_000_000, 6);
  });
  it("from 2029 a quarterly filer pays 50 days after each quarter; an overpayment is credited", () => {
    const pbt = new Array(n).fill(0) as number[];
    const revenue = new Array(n).fill(0) as number[];
    const idx = (y: number, m: number) => cal.months.findIndex((x) => x.year === y && x.month === m);
    revenue[idx(2028, 6)] = 50_000_000;
    pbt[idx(2029, 2)] = 1_000_000;
    pbt[idx(2029, 5)] = -400_000;
    pbt[idx(2029, 8)] = 400_000;
    const t = taxSchedule(cal, pbt, revenue);
    expect(t.pay[idx(2029, 5)]).toBeCloseTo(180_000, 6);
    expect(t.pay[idx(2029, 8)]).toBeCloseTo(0, 6);
    expect(t.pay[idx(2029, 11)]).toBeCloseTo(0, 6);
    expect(t.pay.reduce((s, v) => s + v, 0)).toBeCloseTo(0.18 * 1_000_000, 6);
  });
});

// Hand-checkable fixtures from the independent reference model (three mini-cases).
describe("independent finance mini-cases (spec §18.5)", () => {
  it("(a) a 5-year annuity at 10 % has an IRR of 10 %", async () => {
    const { xirr } = await import("@/engine/finance");
    const a = (1000 * 0.1) / (1 - 1.1 ** -5);
    const flows = [{ day: 0, amount: -1000 }, ...[1, 2, 3, 4, 5].map((k) => ({ day: 365 * k, amount: a }))];
    expect(xirr(flows).rate!).toBeCloseTo(0.1, 9);
  });

  it("(b) profits −100 / 60 / 80 give tax 0 / 0 / 7.2 with full loss carry-forward", () => {
    const cal = buildCalendar(0);
    const n = cal.months.length;
    const pbt = new Array(n).fill(0) as number[];
    const revenue = new Array(n).fill(0) as number[];
    const idx = (y: number, m: number) => cal.months.findIndex((x) => x.year === y && x.month === m);
    pbt[idx(2027, 6)] = -100;
    pbt[idx(2028, 6)] = 60;
    pbt[idx(2029, 6)] = 80;
    const t = taxSchedule(cal, pbt, revenue);
    expect(t.taxable.get(2027)).toBe(0);
    expect(t.taxable.get(2028)).toBe(0);
    expect(t.taxable.get(2029)).toBeCloseTo(40, 12);
    expect(t.pay.reduce((s, v) => s + v, 0)).toBeCloseTo(7.2, 12);
  });

  it("(c) four half-years of CFADS 175,000 at DSCR 1.75 and 4 % per period carry 362,989.52 of debt", () => {
    const { opening, closing } = sculpt([100_000, 100_000, 100_000, 100_000], [0.04, 0.04, 0.04, 0.04]);
    expect(opening).toBeCloseTo(362_989.5224256857, 6);
    const balances = [opening, ...closing];
    const ds = closing.map((cl, k) => balances[k]! * 1.04 - cl);
    for (const v of ds) expect(v).toBeCloseTo(100_000, 6);
    expect(closing[3]).toBeCloseTo(0, 6);
  });
});
