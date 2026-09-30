import { describe, expect, it } from "vitest";
import { BASE_CASE, InvalidInputsError, runModel, runScenarios, solveAwardPrice, tornado } from "../src/engine";
import type { Inputs, ModelResult } from "../src/engine";
import { profileWeights } from "../src/engine/model";

const edit = (fn: (c: Inputs) => void): Inputs => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return c;
};
const errors = (r: ModelResult) => r.checks.filter((c) => !c.ok && c.severity === "error").map((c) => c.id);
const year = (r: ModelResult, y: number) => r.annual.find((a) => a.year === y)!;
const base = runModel(BASE_CASE);

describe("base case integrity", () => {
  it("passes every error check and is valid", () => {
    expect(errors(base)).toEqual([]);
    expect(base.validity).toMatchObject({ integrity: "ok", funding: "ok", covenant: "ok", returnsMeaningful: true });
  });

  it("balances sources and uses to the cent", () => {
    const su = base.sourcesUses;
    expect(su.totalSources).toBeCloseTo(su.totalUses, 6);
    const parts =
      su.capex + su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest + su.dsraInitial + su.workingCapitalInitial;
    expect(parts).toBeCloseTo(su.totalUses, 4);
  });

  it("balances the balance sheet at every year end", () => {
    for (const a of base.annual) expect(Math.abs(a.balanceDifference)).toBeLessThan(0.01);
  });

  it("draws exactly the loan during construction and repays it by maturity", () => {
    expect(base.construction.at(-1)!.debtBalance).toBeCloseTo(base.kpis.debt, 4);
    const repaid = base.annual.reduce((s, a) => s + a.principal, 0);
    expect(repaid).toBeCloseTo(base.kpis.debt, 4);
    expect(year(base, 2046).debtClosing).toBeCloseTo(0, 6);
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
      graceEnd: "2030-01-01",
      firstInstalment: "2030-03-31",
      awardNotice: "2026-09-17",
      awardLapse: "2029-09-17",
    });
    expect(base.annual[0]!.operatingFraction).toBeCloseTo(184 / 366, 12);
  });
});

describe("input validation (G-F12)", () => {
  it("rejects dates the model does not cover instead of crashing", () => {
    for (const fc of ["9999-12-01", "1900-01-01", "2027-02-30", "2027-07-15"]) {
      expect(() => runModel(edit((c) => (c.project.financialClose = fc))), fc).toThrow(InvalidInputsError);
    }
  });

  it("rejects instalments during construction and a grace period as long as the loan", () => {
    const early = () => runModel(edit((c) => (c.financing.graceYears = 1))); // 18-month build
    expect(early).toThrow(/at least 2 grace years/);
    expect(() => runModel(edit((c) => (c.financing.tenorYearsFromClose = 3)))).toThrow(InvalidInputsError);
  });

  it("lists every problem", () => {
    try {
      runModel(edit((c) => {
        c.project.turbines = 0;
        c.energy.siteQuality = Number.NaN;
      }));
      expect.unreachable();
    } catch (e) {
      expect((e as InvalidInputsError).issues.map((i) => i.path)).toEqual(["project.turbines", "energy.siteQuality"]);
    }
  });
});

describe("EEG quantities and calendar", () => {
  it("rounds the AW to two decimals (G-F07)", () => {
    expect(base.kpis.awCt).toBeCloseTo(6.3, 12);
    expect(base.annual[0]!.awEurKwh).toBeCloseTo(0.063, 12);
  });

  it("counts § 51a periods in the commissioning year and the 19 calendar years after it (G-F08)", () => {
    // 1 Jul 2028 – 31 Dec 2047 = 7,123 days × 6.5 % = 462.995 → 463 days after 1 Jul 2048.
    expect(base.timeline.eegEnd).toBe("2049-10-07");
    const january = runModel(edit((c) => (c.project.financialClose = "2026-07-01"))); // COD 1 Jan 2028
    // A full 20-year window: 7,305 days × 6.5 % = 474.8 → 475 days.
    expect(january.timeline.eegEnd).toBe("2049-04-20");
  });

  it("flags the § 36e lapse and the § 55 penalty from the award announcement", () => {
    const late = runModel(edit((c) => (c.project.financialClose = "2028-03-01"))); // COD 1 Sep 2029
    expect(late.checks.find((c) => c.id === "awardValid")!.ok).toBe(true);
    expect(late.checks.find((c) => c.id === "noPenalty")!.ok).toBe(false);
    const lapsed = runModel(edit((c) => (c.project.financialClose = "2028-06-01"))); // COD 1 Dec 2029
    expect(lapsed.checks.find((c) => c.id === "awardValid")!.ok).toBe(false);
    expect(lapsed.validity.scope).toBe("error");
  });

  it("pays a PPA on the output delivered (G-F06)", () => {
    const ppa = runModel(edit((c) => (c.revenue.postEeg = "ppa")));
    const a = year(ppa, 2051);
    expect(a.eegShare).toBe(0);
    const price = (60 * (ppa.annual.find((x) => x.year === 2051)!.baseEurMwh / (75 * 1))) / 1000; // indexed like the base price
    expect(a.revenuePostEeg / a.energySoldKwh).toBeCloseTo(price, 9);
  });
});

describe("loan calendar (G-F04, O4)", () => {
  it("repays in 68 equal quarterly instalments from the end of the grace period", () => {
    const perQuarter = base.kpis.debt / 68;
    expect(year(base, 2029).principal).toBe(0);
    expect(year(base, 2030).principal).toBeCloseTo(4 * perQuarter, 4);
    expect(year(base, 2046).principal).toBeCloseTo(4 * perQuarter, 4);
    // Interest falls within the year as each quarter's instalment is paid.
    const y = year(base, 2031);
    const r = BASE_CASE.financing.interestRate;
    expect(y.interest).toBeCloseTo((r / 12) * (12 * y.debtOpening - 18 * perQuarter), 4);
  });

  it("anchors the dates to the financial-close date, not its year", () => {
    const july = runModel(edit((c) => (c.project.financialClose = "2027-07-01")));
    expect(july.timeline.loanMaturity).toBe("2047-06-30");
    expect(july.timeline.firstInstalment).toBe("2030-09-30");
    expect(year(july, 2030).principal).toBeCloseTo((2 * july.kpis.debt) / 68, 4);
    expect(errors(july)).toEqual([]);
  });

  it("gives two grace years their own schedule", () => {
    const two = runModel(edit((c) => (c.financing.graceYears = 2)));
    expect(two.timeline.firstInstalment).toBe("2029-03-31");
    expect(year(two, 2029).principal).toBeCloseTo((4 * two.kpis.debt) / 72, 4);
    expect(two.kpis.debt).not.toBeCloseTo(base.kpis.debt, 0);
  });

  it("funds the DSRA at COD to the first repayment year and averages the DSCR over repayment years (O10)", () => {
    expect(base.sourcesUses.dsraInitial).toBeCloseTo((3 / 12) * year(base, 2030).debtService, 6);
    expect(year(base, 2028).dsraBalance).toBeCloseTo(base.sourcesUses.dsraInitial, 6);
    const repaying = base.annual.filter((a) => a.principal > 0).map((a) => a.dscr!);
    expect(base.kpis.avgDscr).toBeCloseTo(repaying.reduce((a, b) => a + b, 0) / repaying.length, 12);
  });
});

describe("cash collection", () => {
  it("counts the first year's receivables on the actual operating days (G-F09)", () => {
    const a = year(base, 2028);
    // July–December 2028: 184 days; 30 receivable days of the part-year revenue.
    expect(a.receivablesMarket).toBeCloseTo((a.revenueMarket / 184) * 30, 4);
    expect(a.receivablesMarket).toBeCloseTo(498_049, -1);
  });

  it("funds the first year's receivables at COD as start-up liquidity", () => {
    expect(base.sourcesUses.workingCapitalInitial).toBeCloseTo(year(base, 2028).receivables, 6);
    expect(year(base, 2028).deltaWorkingCapital).toBeCloseTo(0, 6);
  });

  it("pays the premium of the first year below the AW only after the year (§ 26 lag, O1)", () => {
    const low = runModel(edit((c) => (c.revenue.longTermBaseEurMwh2026 = 50)));
    const onset = year(low, 2030);
    expect(onset.revenuePremium).toBeGreaterThan(1_000_000);
    expect(onset.premiumAdvance).toBe(0); // 2029 market value is still above the AW
    expect(onset.receivablesPremium).toBeCloseTo(onset.revenuePremium + onset.municipalRefund, 4);
    // The lender's case sees the same lag, so the loan is sized to survive it.
    expect(low.validity).toMatchObject({ funding: "ok", covenant: "ok", integrity: "ok" });
    expect(low.sizing.lenderCase.dscrP90[low.sizing.lenderCase.years.indexOf(2030)]).toBeCloseTo(1, 4);
    // From the next year the advances follow and only December's advance is open at the year end.
    const next = year(low, 2032);
    expect(next.premiumAdvance).toBeGreaterThan(0);
    expect(next.receivablesPremium).toBeCloseTo(
      next.revenuePremium - next.premiumAdvance + next.premiumAdvance / 12 + next.municipalRefund,
      4,
    );
  });

  it("never pays a negative advance under the two-sided stress (O2)", () => {
    const two = runModel(edit((c) => (c.revenue.twoSidedPremium = true)));
    const first = year(two, 2028);
    expect(first.revenuePremium).toBeLessThan(0);
    expect(first.premiumAdvance).toBe(0);
    expect(first.receivablesPremium).toBeCloseTo(first.revenuePremium, 4); // a payable, settled next year
    for (const a of two.annual) expect(a.premiumAdvance).toBeGreaterThanOrEqual(0);
    expect(two.kpis.equityIrr!).toBeLessThan(base.kpis.equityIrr!);
  });

  it("delays the true-up by a year when the settlement lag passes twelve months", () => {
    const slow = runModel(edit((c) => {
      c.revenue.longTermBaseEurMwh2026 = 50;
      c.revenue.premiumTrueUpLagMonths = 15;
    }));
    const fast = runModel(edit((c) => (c.revenue.longTermBaseEurMwh2026 = 50)));
    expect(year(slow, 2031).receivablesPremium).toBeGreaterThan(year(fast, 2031).receivablesPremium + 1_000_000);
  });

  it("refunds at most 0.2 ct/kWh of the municipal payment (G-F14)", () => {
    const low = runModel(edit((c) => {
      c.revenue.longTermBaseEurMwh2026 = 50;
      c.revenue.municipalCtKwh = 0.5;
    }));
    const a = year(low, 2031);
    expect(a.municipal).toBeCloseTo((0.5 / 100) * a.energyKwh, 4);
    expect(a.municipalRefund).toBeCloseTo((0.2 / 100) * a.energySoldKwh * a.eegShare, 4);
  });
});

describe("debt sizing", () => {
  it("is bound by the P90 target in the lender's floor case and meets both targets", () => {
    expect(base.sizing.binding).toBe("dscrP90");
    expect(base.sizing.minBankDscrP90).toBeCloseTo(BASE_CASE.financing.targetDscrP90, 4);
    expect(base.sizing.minBankDscrP50!).toBeGreaterThanOrEqual(BASE_CASE.financing.targetDscrP50 - 1e-6);
    expect(base.checks.find((c) => c.id === "lenderTargets")!.ok).toBe(true);
  });

  it("uses one CFADS for sizing and the covenant (G-F01)", () => {
    const L = base.sizing.lenderCase;
    const i = L.years.indexOf(2031);
    expect(L.debtService[i]).toBeCloseTo(year(base, 2031).debtService, 6);
    // The operating case earns at least the lender's floor, so its DSCR is at least the lender's.
    for (let k = 0; k < L.years.length; k++) {
      const op = year(base, L.years[k]!).dscr;
      if (op !== null && L.dscrP50[k] !== null) expect(op).toBeGreaterThanOrEqual(L.dscrP50[k]! - 1e-9);
    }
  });

  it("lends more on base prices than on the floor", () => {
    const onBase = runModel(edit((c) => (c.revenue.bankPriceBasis = "base")));
    expect(onBase.kpis.debt).toBeGreaterThan(base.kpis.debt);
    expect(errors(onBase)).toEqual([]);
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
    const L = sc.sizing.lenderCase;
    const f = BASE_CASE.financing;
    L.years.forEach((y, k) => {
      if (year(sc, y).principal <= 0 || y === 2046) return;
      const binding = Math.min(L.dscrP50[k]! / f.targetDscrP50, L.dscrP90[k]! / f.targetDscrP90);
      expect(binding, String(y)).toBeCloseTo(1, 6);
    });
    expect(sc.kpis.debt).toBeGreaterThan(base.kpis.debt);
  });

  it("annuity repayment pays equal quarterly amounts", () => {
    const an = runModel(edit((c) => (c.financing.repayment = "annuity")));
    expect(errors(an)).toEqual([]);
    const ds = an.annual.filter((a) => a.year >= 2031 && a.year <= 2046).map((a) => a.debtService);
    for (const v of ds) expect(v).toBeCloseTo(ds[0]!, 2);
  });

  it("equity-first funding uses only equity in the first month", () => {
    const ef = runModel(edit((c) => (c.financing.equityFirst = true)));
    expect(ef.construction[0]!.debtDraw).toBe(0);
    expect(errors(ef)).toEqual([]);
  });
});

describe("reserves, lock-up and funding", () => {
  const ds = (r: ModelResult, y: number) => r.annual.find((a) => a.year === y)?.debtService ?? 0;

  it("keeps the DSRA at 3 months of next year's debt service and releases it at maturity", () => {
    for (const a of base.annual) {
      const next = Math.max(a.year + 1, 2030);
      const target = a.year < 2046 ? (3 / 12) * ds(base, next) : 0;
      expect(a.dsraBalance, String(a.year)).toBeCloseTo(target, 4);
    }
  });

  it("draws the DSRA and traps cash when the DSCR falls below the lock-up", () => {
    // Same loan, 25 % less wind: some years miss the 1.10 lock-up and even the debt service.
    const weak = runModel(BASE_CASE, { scenario: { energyScale: 0.75 }, lockedDebt: base.lockedDebt });
    const lockYears = weak.annual.filter((a) => a.dscr !== null && a.dscr < BASE_CASE.financing.lockupDscr);
    expect(lockYears.length).toBeGreaterThan(0);
    expect(weak.validity.lockUpYears).toEqual(lockYears.map((a) => a.year));
    for (const a of lockYears) expect(a.distribution).toBeLessThanOrEqual(1e-6);
    for (const a of weak.annual) expect(Math.abs(a.balanceDifference)).toBeLessThan(0.01);
  });

  it("uses cash held back under the lock-up before the DSRA and before a shortfall (O3)", () => {
    const stress = runModel(BASE_CASE, {
      scenario: { energyScale: 0.74, priceScale: 0.8 },
      lockedDebt: base.lockedDebt,
    });
    for (const a of stress.annual) {
      expect(a.cashDeficit < -1 && a.trappedCash > 1, String(a.year)).toBe(false);
      expect(Math.abs(a.balanceDifference)).toBeLessThan(0.01);
    }
  });

  it("marks the returns as not meaningful when the company runs out of cash (D01)", () => {
    const broke = runModel(BASE_CASE, { scenario: { energyScale: 0.6, priceScale: 0.7 }, lockedDebt: base.lockedDebt });
    expect(broke.validity.funding).toBe("error");
    expect(broke.validity.returnsMeaningful).toBe(false);
    expect(broke.validity.shortfall).not.toBeNull();
  });

  it("builds the decommissioning reserve in the last years and pays the cost at the end", () => {
    const last = base.annual.at(-1)!;
    // 50 €/kW in 2026 prices, indexed 2027 +2.7 %, 2028 +1.9 %, then +2 % a year to 2053.
    const index = 1.027 * 1.019 * Math.pow(1.02, 2053 - 2028);
    expect(last.decommissioningPaid).toBeCloseTo(50 * 31_500 * index, 2);
    expect(base.annual.at(-2)!.decommissioningReserve).toBeGreaterThan(0.5 * last.decommissioningPaid);
    expect(last.decommissioningReserve).toBe(0);
    expect(year(base, 2040).decommissioningReserve).toBe(0);
  });

  it("flags negative book equity as a limit on distributions (O7)", () => {
    const check = base.checks.find((c) => c.id === "bookEquity")!;
    expect(check.ok).toBe(false);
    expect(check.group).toBe("scope");
    expect(Math.min(...base.annual.map((a) => a.bookEquity))).toBeLessThan(0);
    expect(base.annual.at(-1)!.bookEquity).toBeCloseTo(0, 2);
  });
});

describe("scenarios", () => {
  const s = runScenarios(BASE_CASE);

  it("keeps the base-case loan and start-up liquidity in every stress", () => {
    for (const k of ["p90", "resource", "downside"] as const) {
      expect(s[k].kpis.debt).toBe(s.base.kpis.debt);
      expect(s[k].sizing.binding).toBe("locked");
      expect(s[k].sourcesUses.workingCapitalInitial).toBe(s.base.sourcesUses.workingCapitalInitial);
      expect(s[k].annual.map((a) => a.principal)).toEqual(s.base.annual.map((a) => a.principal));
    }
  });

  it("the ten-year P90 is milder than the one-year lender stress", () => {
    expect(s.p90.annual[1]!.energyKwh).toBeLessThan(s.resource.annual[1]!.energyKwh);
    expect(s.resource.kpis.equityIrr!).toBeGreaterThan(s.p90.kpis.equityIrr!);
    expect(s.resource.kpis.equityIrr!).toBeLessThan(s.base.kpis.equityIrr!);
  });

  it("applies the § 36h review in the multi-year stresses only (F05, D03)", () => {
    expect(s.base.awPeriods).toHaveLength(1);
    expect(s.p90.awPeriods).toHaveLength(1);
    // 68 % × (1 − 1.2816 × 10.3 %) = 59.0 % → below 60 % the factor is 1.42: 4.79 × 1.42 = 6.80 ct.
    expect(s.resource.awPeriods.map((p) => p.start)).toEqual(["2028-07-01", "2033-07-01", "2038-07-01", "2043-07-01"]);
    expect(s.resource.awPeriods[1]!.awCt).toBeCloseTo(6.8, 12);
    expect(s.downside.awPeriods[1]!.siteQuality).toBeCloseTo(0.68 * (1 - 1.2816 * 0.103), 12);
    // The first five years are settled at the new AW in the year of the review, with prices 20 % lower.
    expect(s.downside.annual.find((a) => a.year === 2033)!.siteQualitySettlement).toBeGreaterThan(0);
    expect(s.downside.annual.filter((a) => a.siteQualitySettlement !== 0).map((a) => a.year)).toEqual([2033]);
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

  it("declining-balance depreciation needs completion from 1 Jul 2025 to 31 Dec 2027 (G-F12)", () => {
    const late = runModel(edit((c) => (c.tax.degressive = true)));
    expect(late.checks.find((c) => c.id === "degressiveEligible")!.ok).toBe(false);
    const inWindow = runModel(
      edit((c) => {
        c.tax.degressive = true;
        c.project.financialClose = "2026-04-01";
        c.revenue.awardNoticeDate = "2026-01-15";
        c.financing.graceYears = 2;
      }),
    );
    expect(inWindow.checks.find((c) => c.id === "degressiveEligible")!.ok).toBe(true);
    expect(inWindow.annual[1]!.depreciation).toBeGreaterThan(inWindow.kpis.capex / 16);
    const tooEarly = runModel(
      edit((c) => {
        c.tax.degressive = true;
        c.project.financialClose = "2025-01-01";
        c.project.constructionMonths = 3; // COD 1 Apr 2025, before the window opens
        c.revenue.awardNoticeDate = "2024-06-01";
      }),
    );
    expect(tooEarly.checks.find((c) => c.id === "degressiveEligible")!.ok).toBe(false);
  });

  it("does not discount the provision in the last twelve months (G-F10)", () => {
    const beforeLast = base.annual.at(-2)!; // 31 Dec 2052, six months before the end of life
    const cost = 50 * 31_500 * 1.027 * 1.019 * Math.pow(1.02, 2052 - 2028);
    const elapsed = (Date.UTC(2053, 0, 1) - Date.UTC(2028, 6, 1)) / (Date.UTC(2053, 6, 1) - Date.UTC(2028, 6, 1));
    expect(beforeLast.provision).toBeCloseTo(cost * elapsed, 2);
  });

  it("writes off the remaining book value when the farm is dismantled (G-F11)", () => {
    const long = runModel(edit((c) => (c.tax.depreciationYears = 30)));
    const capitalized = long.sourcesUses.totalUses - long.sourcesUses.dsraInitial - long.sourcesUses.workingCapitalInitial;
    expect(long.annual.reduce((s, a) => s + a.depreciation, 0)).toBeCloseTo(capitalized, 2);
    expect(errors(long)).toEqual([]);
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
  const bars = tornado(BASE_CASE, "equityIrr");

  it("ranks the long-term power price as the largest driver of equity IRR", () => {
    expect(bars[0]!.id).toBe("longTermPrice");
    for (let i = 1; i < bars.length; i++) expect(bars[i - 1]!.range).toBeGreaterThanOrEqual(bars[i]!.range);
  });

  it("more output at negative prices lowers the return (O6)", () => {
    const neg = bars.find((b) => b.id === "negativePrices")!;
    expect(neg.high!).toBeLessThan(neg.low!);
  });

  it("finds the award price that reaches the target return and checks it", () => {
    const bid = solveAwardPrice(BASE_CASE, 0.08);
    expect(bid.target).not.toBeNull();
    expect(bid.feasible).not.toBeNull();
    expect(bid.feasible!.equityIrr!).toBeGreaterThanOrEqual(0.08);
    expect(bid.admissible).toBe(false); // above the 7.25 ct ceiling of the inputs
    expect(bid.ceilingCt).toBe(BASE_CASE.revenue.ceilingPriceCt);
    const below = runModel(edit((c) => (c.revenue.awardPriceCt = bid.target!.awardPriceCt - 0.01)));
    expect(below.kpis.equityIrr!).toBeLessThan(0.08);
  });

  it("uses the ceiling of the inputs (O10)", () => {
    const high = solveAwardPrice(edit((c) => (c.revenue.ceilingPriceCt = 9)), 0.08);
    expect(high.admissible).toBe(true);
  });

  it("separates the return target from a financeable price (G-F03)", () => {
    // A strict covenant: returns may be reached at prices where the loan breaches it.
    const strict = edit((c) => {
      c.revenue.bankPriceBasis = "base";
      c.financing.repayment = "sculpted";
      c.financing.covenantDscr = 1.3;
    });
    const bid = solveAwardPrice(strict, 0.08);
    expect(bid.target).not.toBeNull();
    if (bid.feasible) {
      expect(bid.feasible.awardPriceCt).toBeGreaterThanOrEqual(bid.target!.awardPriceCt);
      const r = runModel(edit((c) => {
        Object.assign(c, structuredClone(strict));
        c.revenue.awardPriceCt = bid.feasible!.awardPriceCt;
      }));
      expect(r.validity.covenant).not.toBe("error");
      expect(r.validity.funding).not.toBe("error");
    }
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
    expect(perRun).toBeLessThan(25);
  });
});
