// Golden values of the base case. They were reconciled on 30 Sep 2026 against an independent
// spreadsheet rebuild calculated by Microsoft Excel (all KPIs within 1e-6, every annual line item
// to the cent). A change here must be deliberate: re-run the reconciliation and update both.
import { describe, expect, it } from "vitest";
import { BASE_CASE, runScenarios } from "../src/engine";

const s = runScenarios(BASE_CASE);
const k = s.base.kpis;

describe("golden base case (reconciled with Excel)", () => {
  it("returns", () => {
    expect(k.equityIrr!).toBeCloseTo(0.0301246620, 9);
    expect(k.projectIrrPostTax!).toBeCloseTo(0.0366998819, 9);
    expect(k.projectIrrPreTax!).toBeCloseTo(0.0404391530, 9);
    expect(k.npvEquity).toBeCloseTo(-16_044_536.945, 2);
    expect(k.npvProject).toBeCloseTo(-11_144_795.813, 2);
  });

  it("cost and coverage", () => {
    expect(k.lcoeRealCt).toBeCloseTo(7.252370355, 8);
    expect(k.lcoeNominalCt).toBeCloseTo(9.222530553, 8);
    expect(k.minDscr!).toBeCloseTo(1.366256124, 8);
    expect(k.avgDscr!).toBeCloseTo(2.178330208, 8);
    expect(k.llcr!).toBeCloseTo(1.953392527, 8);
    expect(k.paybackYears!).toBeCloseTo(18.99131255, 6);
  });

  it("funding", () => {
    expect(k.debt).toBeCloseTo(21_509_505.162, 2);
    expect(k.equity).toBeCloseTo(37_058_089.203, 2);
    expect(k.totalUses).toBeCloseTo(58_567_594.365, 2);
    expect(k.capex).toBeCloseTo(57_135_645, 2);
  });

  it("scenarios", () => {
    expect(s.p90.kpis.equityIrr!).toBeCloseTo(0.0048371691, 9);
    expect(s.p90.kpis.minDscr!).toBeCloseTo(1.081547907, 8);
    expect(s.downside.kpis.equityIrr!).toBeCloseTo(-0.0308676521, 9);
    expect(s.downside.kpis.minDscr!).toBeCloseTo(1.119940631, 8);
  });
});
