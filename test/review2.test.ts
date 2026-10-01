// Cases found by the second external review (1 Oct 2026). Each was a real defect; each test pins its fix.
import { describe, expect, it } from "vitest";
import { BASE_CASE, runModel, solveAwardPrice, tornado, TORNADO_DRIVERS, type Inputs, type ModelResult } from "../src/engine";
import { decodeInputs } from "../src/lib/url-state";

const edit = (fn: (c: Inputs) => void, from: Inputs = BASE_CASE): Inputs => {
  const c = structuredClone(from);
  fn(c);
  return c;
};
const tryRun = (i: Inputs): ModelResult | null => {
  try {
    return runModel(i);
  } catch {
    return null;
  }
};
const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

describe("sculpted loan without dust (R01)", () => {
  // Opex and inflation at the top of their usual ranges: the lender's P90 cash flow turns negative in 2046.
  const query =
    "om1=22.4&om2=25.6&om3=28.16&mg1=6.4&mg2=8&mg3=8&in1=1.6&in2=1.6&in3=1.6&ot1=9.6&ot2=9.6&ot3=9.6&gridFee=4&repayment=sculpted&infLR=0.03";

  it("repays the loan before a year without cash for debt service, with no false check failure", () => {
    const r = runModel(decodeInputs(query, BASE_CASE)!);
    expect(r.validity.integrity).toBe("ok");
    expect(r.validity.returnsMeaningful).toBe(true);
    expect(r.sizing.binding).toBe("dscrP90");
    expect(r.sizing.minBankDscrP90).toBeCloseTo(1, 6);
    for (const a of r.annual) {
      expect(a.debtService === 0 || a.debtService >= 1, `${a.year}: debt service ${a.debtService}`).toBe(true);
      expect(a.debtClosing === 0 || a.debtClosing >= 0.01, `${a.year}: balance ${a.debtClosing}`).toBe(true);
    }
  });
});

describe("no payment by the owners at the end of life (R02, D01)", () => {
  it("a decommissioning gap in the final year is a shortfall: the case is not funded", () => {
    const r = runModel(
      edit((c) => {
        c.opex.decommissioningCostPerKw2026 = 100;
        c.opex.decommissioningReserveYears = 1;
      }),
    );
    const last = r.annual.at(-1)!;
    expect(last.distribution).toBe(0);
    expect(last.cashDeficit).toBeLessThan(-1);
    expect(r.validity.shortfall?.year).toBe(last.year);
    expect(r.validity.returnsMeaningful).toBe(false);
    expect(r.checks.find((c) => c.id === "closureFunded")).toMatchObject({ ok: false, severity: "error" });
    expect(Math.max(...r.annual.map((a) => Math.abs(a.balanceDifference)))).toBeLessThan(1);
  });
});

describe("validity in the tornado and the bid calculator (R03, R04)", () => {
  it("the tornado shows an equity IRR only for runs whose returns mean something", () => {
    const i = edit((c) => {
      c.revenue.twoSidedPremium = true;
      c.opex.gridFeePerKw2026 = 50;
    });
    expect(runModel(i).validity.returnsMeaningful).toBe(false);
    const bars = tornado(i, "equityIrr");
    expect(bars.every((b) => b.base === null)).toBe(true);
    for (const b of bars) {
      const d = TORNADO_DRIVERS.find((x) => x.id === b.id)!;
      for (const side of ["low", "high"] as const) {
        const v = side === "low" ? b.low : b.high;
        const run = tryRun(d.apply(i, side));
        if (v !== null) expect(run?.validity.returnsMeaningful, `${b.id} ${side}`).toBe(true);
        if (run && !run.validity.returnsMeaningful) expect(v, `${b.id} ${side}`).toBeNull();
      }
    }
  });

  it("a lapsed award (§ 36e) is not financeable at any price", () => {
    const i = edit((c) => {
      c.revenue.awardNoticeDate = "2023-01-01";
      c.revenue.ceilingPriceCt = 8;
    });
    expect(runModel(i).validity.scope).toBe("error");
    const bid = solveAwardPrice(i, 0.08);
    expect(bid.target).not.toBeNull();
    expect(bid.feasible).toBeNull();
    expect(bid.admissible).toBeNull();
  });
});

describe("the bid price in 0.01 ct steps (R05)", () => {
  it("is the lowest two-decimal price that reaches the target, with its own AW and IRR", () => {
    const i = edit((c) => {
      c.revenue.awardPriceCt = 6.5;
      c.tax.legalForm = "GmbH";
    });
    const f = solveAwardPrice(i, 0.08).feasible!;
    expect(f.awardPriceCt).toBe(7.54);
    expect(f.equityIrr!).toBeGreaterThanOrEqual(0.08);
    const at = (ct: number) => runModel(edit((c) => void (c.revenue.awardPriceCt = ct), i));
    expect(at(7.53).kpis.equityIrr!).toBeLessThan(0.08);
    expect(at(f.awardPriceCt).kpis.awCt).toBe(f.awCt);
  });

  it("the base case needs 7.41 ct/kWh for 8 %", () => {
    const f = solveAwardPrice(BASE_CASE, 0.08).feasible!;
    expect(f.awardPriceCt).toBe(7.41);
    expect(f.equityIrr!).toBeGreaterThanOrEqual(0.08);
  });

  it("is not reachable for an extreme target", () => {
    const bid = solveAwardPrice(BASE_CASE, 0.99);
    expect([bid.target, bid.feasible, bid.admissible]).toEqual([null, null, null]);
  });
});

describe("settlement lag in an annual model (R06)", () => {
  const run = (lag: number) =>
    runModel(
      edit((c) => {
        c.revenue.longTermBaseEurMwh2026 = 50;
        c.revenue.premiumTrueUpLagMonths = lag;
      }),
    );
  it("1–12 months pay the true-up in the next year; 13–24 months in the year after", () => {
    const l3 = run(3);
    const l12 = run(12);
    const l13 = run(13);
    const l24 = run(24);
    expect(l12.kpis.equityIrr).toBe(l3.kpis.equityIrr);
    expect(l13.kpis.equityIrr).not.toBe(l12.kpis.equityIrr);
    expect(l24.kpis.equityIrr).toBe(l13.kpis.equityIrr);
  });
});

describe("date boundaries (R07–R09)", () => {
  it("the LLCR counts the maturity year only until maturity", () => {
    const r = runModel(edit((c) => void (c.project.financialClose = "2027-07-01")));
    expect(r.timeline.loanMaturity).toBe("2047-06-30");
    const cod = day(r.timeline.cod);
    const maturity = day(r.timeline.loanMaturity);
    let pv = 0;
    for (const a of r.annual) {
      if (a.year > 2047) continue;
      const start = Math.max(cod, day(`${a.year}-01-01`));
      const end = day(`${a.year + 1}-01-01`);
      const share = a.year < 2047 ? 1 : (maturity + 1 - start) / (end - start);
      const at = Math.min(day(a.cashFlowDate), maturity);
      pv += (share * a.cfads) / Math.pow(1 + BASE_CASE.financing.interestRate, (at - cod) / 365);
    }
    expect(r.kpis.llcr!).toBeCloseTo(pv / r.kpis.debt, 9);
  });

  it("the DSRA at COD covers the first full repayment year", () => {
    const r = runModel(
      edit((c) => {
        c.project.constructionMonths = 12;
        c.financing.graceYears = 1;
      }),
    );
    expect(r.timeline.cod).toBe("2028-01-01");
    expect(r.timeline.firstInstalment).toBe("2028-03-31");
    const ds2028 = r.annual.find((a) => a.year === 2028)!.debtService;
    expect(r.sourcesUses.dsraInitial).toBeCloseTo((3 / 12) * ds2028, 6);
  });

  it("no December advance once the support period has ended", () => {
    const r = runModel(
      edit((c) => {
        c.revenue.awardPriceCt = 7;
        c.revenue.longTermBaseEurMwh2026 = 50;
      }),
    );
    expect(r.timeline.eegEnd).toBe("2049-10-07");
    const y = r.annual.find((a) => a.year === 2049)!;
    expect(y.premiumAdvance).toBeGreaterThan(0);
    expect(y.receivablesPremium).toBeCloseTo(y.revenuePremium - y.premiumAdvance + y.municipalRefund, 6);
  });
});
