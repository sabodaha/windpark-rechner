// Golden values of the base case. A change here must be deliberate and explained in the changelog.
//
// History: the first engine (30 Sep 2026) was reconciled against an independent spreadsheet rebuild calculated by
// Microsoft Excel. After two external reviews the same day, the engine was corrected (phase 1 of the joint plan):
// AW rounded to 0.01 ct, § 51a window by calendar years, KfW quarterly instalments from the financial-close date,
// one CFADS with working capital and the § 26 premium lag for sizing and covenant, the lender's floor with the § 6
// refund only in premium years, the DSRA at the first repayment level, start-up liquidity for the first year's
// receivables. The formula workbook of phase 3 reconciles these values again.
import { describe, expect, it } from "vitest";
import { BASE_CASE, runScenarios } from "../src/engine";

const s = runScenarios(BASE_CASE);
const k = s.base.kpis;

describe("golden base case", () => {
  it("returns", () => {
    expect(k.equityIrr!).toBeCloseTo(0.0309439335, 9);
    expect(k.projectIrrPostTax!).toBeCloseTo(0.0366738344, 9);
    expect(k.projectIrrPreTax!).toBeCloseTo(0.040410876, 9);
    expect(k.npvEquity).toBeCloseTo(-16_063_857.823, 2);
    expect(k.npvProject).toBeCloseTo(-11_169_473.679, 2);
  });

  it("cost and coverage", () => {
    expect(k.lcoeRealCt).toBeCloseTo(7.252370355, 8);
    expect(k.lcoeNominalCt).toBeCloseTo(9.222530553, 8);
    expect(k.minDscr!).toBeCloseTo(1.439465139, 8);
    expect(k.avgDscr!).toBeCloseTo(2.195867256, 8);
    expect(k.llcr!).toBeCloseTo(2.05929593, 8);
    expect(k.paybackYears!).toBeCloseTo(18.75791981, 6);
  });

  it("funding", () => {
    expect(k.debt).toBeCloseTo(20_632_341.683, 2);
    expect(k.equity).toBeCloseTo(38_671_265.023, 2);
    expect(k.totalUses).toBeCloseTo(59_303_606.706, 2);
    expect(k.capex).toBeCloseTo(57_135_645, 2);
    expect(s.base.sourcesUses.dsraInitial).toBeCloseTo(573_287.06, 2);
    // Receivables of July–December 2028 on 184 operating days — the figure one reviewer computed by hand.
    expect(s.base.sourcesUses.workingCapitalInitial).toBeCloseTo(498_049.001, 2);
  });

  it("scenarios", () => {
    expect(s.p90.kpis.equityIrr!).toBeCloseTo(0.0060548965, 9);
    expect(s.p90.kpis.minDscr!).toBeCloseTo(1.139501212, 8);
    expect(s.resource.kpis.equityIrr!).toBeCloseTo(0.0116184414, 9);
    expect(s.resource.kpis.minDscr!).toBeCloseTo(1.198087916, 8);
    expect(s.downside.kpis.equityIrr!).toBeCloseTo(-0.0211761879, 9);
    expect(s.downside.kpis.minDscr!).toBeCloseTo(1.182699235, 8);
  });
});
