import { describe, expect, it } from "vitest";
import {
  BASE_CASE,
  buildSnapshot,
  ENGINE_VERSION,
  hashInputs,
  runScenarios,
  SCENARIOS,
  stableStringify,
  TAX,
  xirr,
} from "../src/engine";
import type { Inputs, ModelResult } from "../src/engine";
import { toDay } from "../src/engine/dates";

const edit = (fn: (c: Inputs) => void): Inputs => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return c;
};
const without = (r: ModelResult) => {
  const { trace: _trace, ...rest } = r;
  return rest;
};
const close = (a: number[], b: number[], digits = 6) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(v, `index ${i}`).toBeCloseTo(b[i]!, digits));
};

const CASES: [string, Inputs][] = [
  ["base", BASE_CASE],
  ["low prices, GmbH, sculpted", edit((c) => {
    c.revenue.longTermBaseEurMwh2026 = 50;
    c.tax.legalForm = "GmbH";
    c.financing.repayment = "sculpted";
  })],
  ["annuity, PPA, two-sided", edit((c) => {
    c.financing.repayment = "annuity";
    c.revenue.postEeg = "ppa";
    c.revenue.twoSidedPremium = true;
  })],
];

describe("engine trace", () => {
  it("does not change any result", () => {
    for (const [name, inputs] of CASES) {
      const plain = runScenarios(inputs);
      const traced = runScenarios(inputs, { trace: true });
      for (const s of SCENARIOS) {
        expect(traced[s].trace, `${name} ${s}`).toBeDefined();
        expect(plain[s].trace).toBeUndefined();
        expect(without(traced[s]), `${name} ${s}`).toEqual(plain[s]);
      }
    }
  });

  for (const [name, inputs] of CASES) {
    describe(name, () => {
      const all = runScenarios(inputs, { trace: true });
      for (const s of SCENARIOS) {
        const r = all[s];
        const t = r.trace!;
        const a = r.annual;

        it(`${s}: operations and taxes match the annual rows`, () => {
          close(t.operations.revenue, a.map((x) => x.revenue));
          close(t.operations.ebitda, a.map((x) => x.ebitda));
          close(t.operations.deltaWorkingCapital, a.map((x) => x.deltaWorkingCapital));
          close(t.tax.taxes, a.map((x) => x.taxes));
          close(t.tax.depreciation, a.map((x) => x.depreciation));
          close(t.tax.cfads, a.map((x) => x.cfads));
          close(t.taxUnlevered.taxes, a.map((x) => x.taxesUnlevered));
          // The detail lines rebuild the taxes.
          const hebesatz = inputs.tax.hebesatz;
          close(t.tax.tradeTax, t.tax.tradeBase.map((b) => b * TAX.tradeTaxBaseRate * hebesatz));
          close(t.tax.soli, t.tax.corporateTax.map((k) => k * TAX.soli));
          close(
            t.operations.lease,
            t.operations.leaseOnRevenue.map((v, i) => Math.max(v, t.operations.leaseMinimum[i]!)),
          );
          close(
            t.operations.receivablesPremium,
            t.operations.decemberAdvance.map((v, i) => v + t.operations.openSettlements[i]!),
          );
        });

        it(`${s}: the monthly loan adds up to the annual schedule`, () => {
          const interest = new Map<number, number>();
          const principal = new Map<number, number>();
          for (const m of t.loanMonths) {
            interest.set(m.year, (interest.get(m.year) ?? 0) + m.interest);
            principal.set(m.year, (principal.get(m.year) ?? 0) + m.principal);
            expect(m.closing).toBeCloseTo(m.opening - m.principal, 6);
          }
          close(a.map((x) => interest.get(x.year) ?? 0), a.map((x) => x.interest));
          close(a.map((x) => principal.get(x.year) ?? 0), a.map((x) => x.principal));
        });

        it(`${s}: waterfall and balance sheet match`, () => {
          close(t.waterfall.distribution, a.map((x) => x.distribution));
          close(t.waterfall.dsraClose, a.map((x) => x.dsraBalance));
          close(t.waterfall.trappedClose, a.map((x) => x.trappedCash));
          close(t.waterfall.reserveClose, a.map((x) => x.decommissioningReserve));
          for (const d of t.statements.difference) expect(Math.abs(d)).toBeLessThan(0.01);
          close(t.statements.bookEquity, a.map((x) => x.bookEquity));
          expect(t.statements.equityContributed).toBeCloseTo(r.sourcesUses.equity, 6);
        });

        it(`${s}: the lender's case and the construction trace match`, () => {
          close(t.taxLenderP50.cfads, r.sizing.lenderCase.cfadsP50);
          close(t.taxLenderP90.cfads, r.sizing.lenderCase.cfadsP90);
          r.construction.forEach((m, i) => {
            const byItem = Object.values(t.construction.capexByItem).reduce((sum, v) => sum + v[i]!, 0);
            expect(byItem).toBeCloseTo(m.capex, 4);
          });
          t.timing.awWeights.forEach((w, i) => {
            if (t.timing.eegShare[i]! > 0) expect(w.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
          });
        });

        it(`${s}: the dated flows give the reported returns`, () => {
          const flows = t.flows.equity.map((f) => ({ day: toDay(f.date), amount: f.amount }));
          expect(xirr(flows).rate).toBe(r.kpis.equityIrr);
          const post = t.flows.projectPostTax.map((f) => ({ day: toDay(f.date), amount: f.amount }));
          expect(xirr(post).rate).toBe(r.kpis.projectIrrPostTax);
        });
      }
    });
  }
});

describe("model snapshot", () => {
  const snap = buildSnapshot(BASE_CASE);

  it("carries the engine version, the data date and all scenarios with their trace", () => {
    expect(snap.engineVersion).toBe(ENGINE_VERSION);
    expect(snap.dataAsOf).toBe("2026-09-30");
    for (const s of SCENARIOS) expect(snap.scenarios[s].trace).toBeDefined();
    expect(snap.scenarios.base.kpis).toEqual(runScenarios(BASE_CASE).base.kpis);
  });

  it("is frozen and independent of the inputs it was built from", () => {
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.scenarios.base.annual[0])).toBe(true);
    expect(() => {
      (snap.inputs.project as { turbines: number }).turbines = 9;
    }).toThrow();
    expect(BASE_CASE.project.turbines).toBe(5);
  });

  it("hashes the inputs stably, whatever the key order", () => {
    expect(hashInputs(BASE_CASE)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashInputs(structuredClone(BASE_CASE))).toBe(hashInputs(BASE_CASE));
    const reordered = JSON.parse(stableStringify(BASE_CASE)) as Inputs;
    expect(hashInputs(reordered)).toBe(hashInputs(BASE_CASE));
    expect(snap.inputHash).toBe(hashInputs(BASE_CASE));
    expect(hashInputs(edit((c) => (c.revenue.awardPriceCt = 4.8)))).not.toBe(hashInputs(BASE_CASE));
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});
