import { describe, expect, it } from "vitest";
import { BASE_CASE, runModel, runScenarios, solveAwardPrice, tornado } from "../src/engine";
import type { Inputs, ModelResult } from "../src/engine";
import { profileWeights } from "../src/engine/model";

const edit = (fn: (c: Inputs) => void): Inputs => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return c;
};
const errors = (r: ModelResult) => r.checks.filter((c) => !c.ok && c.severity === "error").map((c) => c.id);
const base = runModel(BASE_CASE);

describe("base case integrity", () => {
  it("passes every error check", () => {
    expect(errors(base)).toEqual([]);
  });

  it("balances sources and uses to the cent", () => {
    const su = base.sourcesUses;
    expect(su.totalSources).toBeCloseTo(su.totalUses, 6);
    const parts = su.capex + su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest + su.dsraInitial;
    expect(parts).toBeCloseTo(su.totalUses, 4);
  });

  it("balances the balance sheet at every year end", () => {
    for (const a of base.annual) expect(Math.abs(a.balanceDifference)).toBeLessThan(0.01);
  });

  it("draws exactly the loan during construction and repays it by maturity", () => {
    expect(base.construction.at(-1)!.debtBalance).toBeCloseTo(base.kpis.debt, 4);
    const repaid = base.annual.reduce((s, a) => s + a.principal, 0);
    expect(repaid).toBeCloseTo(base.kpis.debt, 4);
    expect(base.annual.find((a) => a.year === 2046)!.debtClosing).toBeCloseTo(0, 6);
  });

  it("is deterministic", () => {
    expect(runModel(BASE_CASE)).toEqual(base);
  });

  it("uses the agreed timeline", () => {
    expect(base.timeline).toMatchObject({
      financialClose: "2027-01-01",
      cod: "2028-07-01",
      endOfLife: "2053-07-01",
      loanMaturity: "2046-12-31",
    });
    // § 51a: 20 years plus 6.5 % of that time, rounded up to whole days.
    expect(base.timeline.eegEnd).toBe("2049-10-19");
    expect(base.annual[0]!.operatingFraction).toBeCloseTo(184 / 366, 12);
  });
});

describe("energy and revenue", () => {
  it("derives P50 from site quality and the reference yield", () => {
    expect(base.kpis.fullLoadHoursP50).toBeCloseTo(0.68 * 3623 * (0.97 / 0.98), 9);
    const y2029 = base.annual.find((a) => a.year === 2029)!;
    expect(y2029.energyKwh).toBeCloseTo(31_500 * base.kpis.fullLoadHoursP50 * 0.998, 3);
  });

  it("pays no premium while the market value is above the anzulegender Wert", () => {
    for (const a of base.annual) {
      if (a.marketValueEurKwh >= a.awEurKwh) expect(a.revenuePremium).toBe(0);
    }
  });

  it("the floor pays out when prices fall", () => {
    const low = runModel(edit((c) => (c.revenue.longTermBaseEurMwh2026 = 50)));
    const paid = low.annual.filter((a) => a.revenuePremium > 0).length;
    expect(paid).toBeGreaterThan(5);
  });

  it("the two-sided premium (EEG 2027 draft) claws back market upside", () => {
    const two = runModel(edit((c) => (c.revenue.twoSidedPremium = true)));
    expect(two.kpis.equityIrr!).toBeLessThan(base.kpis.equityIrr!);
    expect(two.annual.some((a) => a.revenuePremium < 0)).toBe(true);
  });
});

describe("debt sizing", () => {
  it("is bound by the P90 target in the lender's floor case", () => {
    expect(base.sizing.binding).toBe("dscrP90");
    expect(base.sizing.minBankDscrP90).toBeCloseTo(BASE_CASE.financing.targetDscrP90, 4);
    expect(base.sizing.minBankDscrP50!).toBeGreaterThanOrEqual(BASE_CASE.financing.targetDscrP50 - 1e-6);
  });

  it("lends more on base prices than on the floor", () => {
    const onBase = runModel(edit((c) => (c.revenue.bankPriceBasis = "base")));
    expect(onBase.kpis.debt).toBeGreaterThan(base.kpis.debt);
  });

  it("respects the gearing cap", () => {
    const capped = runModel(edit((c) => (c.financing.maxGearing = 0.3)));
    expect(capped.kpis.gearing).toBeCloseTo(0.3, 6);
    expect(capped.sizing.binding).toBe("gearing");
    expect(errors(capped)).toEqual([]);
  });

  it("sculpted repayment holds the binding DSCR in every repayment year", () => {
    const sc = runModel(edit((c) => (c.financing.repayment = "sculpted")));
    expect(errors(sc)).toEqual([]);
    expect(sc.sizing.minBankDscrP90).toBeCloseTo(1.0, 3);
    expect(sc.kpis.debt).toBeGreaterThan(base.kpis.debt);
  });

  it("annuity repayment repays the loan", () => {
    const an = runModel(edit((c) => (c.financing.repayment = "annuity")));
    expect(errors(an)).toEqual([]);
    const ds = an.annual.filter((a) => a.year >= 2030 && a.year <= 2046).map((a) => a.debtService);
    for (const v of ds) expect(v).toBeCloseTo(ds[0]!, 4);
  });

  it("equity-first funding uses only equity in the first month", () => {
    const ef = runModel(edit((c) => (c.financing.equityFirst = true)));
    expect(ef.construction[0]!.debtDraw).toBe(0);
    expect(errors(ef)).toEqual([]);
  });
});

describe("reserves and lock-up", () => {
  const ds = (r: ModelResult, year: number) => r.annual.find((a) => a.year === year)?.debtService ?? 0;

  it("funds the DSRA at COD with 3 months of the next year's debt service", () => {
    expect(base.sourcesUses.dsraInitial).toBeCloseTo((3 / 12) * ds(base, 2029), 6);
  });

  it("keeps the DSRA at 3 months of next year's debt service and releases it at maturity", () => {
    for (const a of base.annual) {
      const target = a.year <= 2046 ? (3 / 12) * ds(base, a.year + 1) : 0;
      expect(a.dsraBalance).toBeCloseTo(target, 4);
    }
  });

  it("draws the DSRA and traps cash when the DSCR falls below the lock-up", () => {
    // Same loan, 25 % less wind: some years miss the 1.10 lock-up and even the debt service.
    const weak = runModel(BASE_CASE, { scenario: { energyScale: 0.75 }, lockedDebt: base.lockedDebt });
    const lockYears = weak.annual.filter((a) => a.dscr !== null && a.dscr < BASE_CASE.financing.lockupDscr);
    expect(lockYears.length).toBeGreaterThan(0);
    for (const a of lockYears) expect(a.distribution).toBeLessThanOrEqual(1e-6);
    const drawn = weak.annual.some((a) => a.dscr !== null && a.dscr < 1 && a.dsraBalance < (3 / 12) * ds(weak, a.year + 1) - 1);
    expect(drawn).toBe(true);
    for (const a of weak.annual) expect(Math.abs(a.balanceDifference)).toBeLessThan(0.01);
  });

  it("builds the decommissioning reserve in the last years and pays the cost at the end", () => {
    const last = base.annual.at(-1)!;
    // 50 €/kW in 2026 prices, indexed 2027 +2.7 %, 2028 +1.9 %, then +2 % a year to 2053.
    const index = 1.027 * 1.019 * Math.pow(1.02, 2053 - 2028);
    expect(last.decommissioningPaid).toBeCloseTo(50 * 31_500 * index, 2);
    const before = base.annual.at(-2)!.decommissioningReserve;
    expect(before).toBeGreaterThan(0.5 * last.decommissioningPaid);
    expect(last.decommissioningReserve).toBe(0);
    const early = base.annual.find((a) => a.year === 2040)!;
    expect(early.decommissioningReserve).toBe(0);
  });
});

describe("scenarios", () => {
  const s = runScenarios(BASE_CASE);

  it("keeps the base-case loan in P90 and downside", () => {
    expect(s.p90.kpis.debt).toBe(s.base.kpis.debt);
    expect(s.downside.kpis.debt).toBe(s.base.kpis.debt);
    expect(s.p90.sizing.binding).toBe("locked");
  });

  it("P90 produces less energy and a lower return", () => {
    expect(s.p90.annual[1]!.energyKwh).toBeLessThan(s.base.annual[1]!.energyKwh);
    expect(s.p90.kpis.equityIrr!).toBeLessThan(s.base.kpis.equityIrr!);
  });

  it("the downside capex overrun is paid by the owners", () => {
    expect(s.downside.kpis.equity).toBeGreaterThan(s.base.kpis.equity);
    expect(errors(s.downside)).toEqual([]);
  });
});

describe("tax options", () => {
  it("a GmbH pays corporate tax, a KG does not", () => {
    const gmbh = runModel(edit((c) => (c.tax.legalForm = "GmbH")));
    expect(gmbh.annual.some((a) => a.corporateTax > 0)).toBe(true);
    expect(base.annual.every((a) => a.corporateTax === 0)).toBe(true);
  });

  it("declining-balance depreciation needs completion in 2027", () => {
    const late = runModel(edit((c) => (c.tax.degressive = true)));
    expect(late.checks.find((c) => c.id === "degressiveEligible")!.ok).toBe(false);
    const early = runModel(
      edit((c) => {
        c.tax.degressive = true;
        c.project.financialClose = "2026-04-01";
      }),
    );
    expect(early.checks.find((c) => c.id === "degressiveEligible")!.ok).toBe(true);
    expect(early.annual[1]!.depreciation).toBeGreaterThan(early.kpis.capex / 16);
  });
});

describe("properties", () => {
  it("more capex lowers the project return", () => {
    const hi = runModel(edit((c) => (c.capex.items = c.capex.items.map((it) => ({ ...it, eurPerKw: it.eurPerKw * 1.1 })))));
    expect(hi.kpis.projectIrrPostTax!).toBeLessThan(base.kpis.projectIrrPostTax!);
  });

  it("a better site yields more energy but a lower anzulegender Wert", () => {
    const good = runModel(edit((c) => (c.energy.siteQuality = 0.8)));
    expect(good.kpis.fullLoadHoursP50).toBeGreaterThan(base.kpis.fullLoadHoursP50);
    expect(good.kpis.awCt).toBeLessThan(base.kpis.awCt);
  });

  it("an award above the ceiling raises a warning", () => {
    const r = runModel(edit((c) => (c.revenue.awardPriceCt = 8)));
    expect(r.checks.find((c) => c.id === "awardWithinCeiling")!.ok).toBe(false);
  });
});

describe("tornado and bid calculator", () => {
  it("ranks the long-term power price as the largest driver of equity IRR", () => {
    const bars = tornado(BASE_CASE, "equityIrr");
    expect(bars[0]!.id).toBe("longTermPrice");
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1]!.range).toBeGreaterThanOrEqual(bars[i]!.range);
  });

  it("finds the award price that reaches the target return", () => {
    const bid = solveAwardPrice(BASE_CASE, 0.08);
    expect(bid.awardPriceCt).not.toBeNull();
    expect(bid.equityIrr!).toBeGreaterThanOrEqual(0.08);
    const below = runModel(edit((c) => (c.revenue.awardPriceCt = bid.awardPriceCt! - 0.01)));
    expect(below.kpis.equityIrr!).toBeLessThan(0.08);
  });
});

describe("payment profiles", () => {
  it("every profile sums to one", () => {
    for (const p of ["atStart", "linear", "thirds", "turbine"] as const) {
      for (const m of [6, 12, 18, 24]) {
        expect(profileWeights(p, m).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    }
  });
});

describe("performance", () => {
  it("one full run takes a few milliseconds", () => {
    runModel(BASE_CASE);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) runModel(BASE_CASE);
    const perRun = (performance.now() - t0) / 20;
    expect(perRun).toBeLessThan(20);
  });
});
