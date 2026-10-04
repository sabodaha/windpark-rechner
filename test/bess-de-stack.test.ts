// Spec R3.1, the revenue stack, on the synthetic library: without the stack the run and its document are R2.4's; one
// switch; shares; the start of aFRR; the annual opportunity rule; the identities of a month; the loan without the stack
// (gate 1c); the lower bound of day-ahead only (gate 1b); the cycle budget; the two output contracts.
import { describe, expect, it } from "vitest";
import { toDeOutput } from "@/bess/de/export";
import { contractualFunding, runDe, type DeResult } from "@/bess/de/index";
import { reserveMultiplier } from "@/bess/de/operations";
import { DE_BASE, DE_STACK, DE_STACK_INPUTS, DE_VARIANTS, idxDE } from "@/bess/de/registry";
import type { DeInputs } from "@/bess/de/types";
import { computeDePath, computeDePaths, DE_PATH_ORDER, type DeBreakEvenResult } from "@/bess/de/view";
import { syntheticDeLibrary } from "../scripts/bess/de-synthetic";

const lib = syntheticDeLibrary();
const dayAhead: DeInputs = { ...DE_BASE, stackEnabled: false };
/** Stack inputs away from the base, all inside the domain (case S02). */
const odd = {
  afrrShare: 0.25, intradayUplift: 0.4, activationShare: 0.1, reservePath: "fast", reservePriceWindow: "ltm-2026-09", reservePriceFactor: 1.7, reserveRealisation: 0.6,
} as const;
const r24 = (inp: DeInputs) => Object.fromEntries(Object.entries(inp).filter(([key]) => !(DE_STACK_INPUTS as readonly string[]).includes(key)));
const doc = (r: DeResult, inputs: object) =>
  JSON.stringify(toDeOutput(r, { caseId: "X", resolvedInputs: inputs as Record<string, unknown>, library: { artifact: "synthetic" } }));
const lifetime = (r: DeResult) => r.ops!.months.reduce((s, o) => s + o.marketNetEur, 0);
const ym = (r: DeResult, i: number) => `${r.cal!.months[i]!.year}-${String(r.cal!.months[i]!.month).padStart(2, "0")}`;

describe("German pack — revenue stack (spec R3.1)", () => {
  const base = runDe(DE_BASE, lib);

  it("without the stack its inputs change nothing and the case writes the R2.4 document (S02 ≡ D01)", () => {
    const a = runDe(dayAhead, lib);
    const b = runDe({ ...dayAhead, ...odd }, lib);
    const legacy = runDe(r24(DE_BASE) as unknown as DeInputs, lib);
    const d = doc(a, dayAhead);
    expect(doc(b, { ...dayAhead, ...odd })).toBe(d);
    expect(doc(legacy, r24(DE_BASE))).toBe(d);
    const out = JSON.parse(d);
    expect([out.schema, out.spec]).toEqual(["de-output-v1", "R2.4"]);
    expect(Object.keys(out.resolvedInputs)).toEqual(Object.keys(r24(DE_BASE)));
    expect(out.months[20]).not.toHaveProperty("capRevAfrrEur");
    expect(out).not.toHaveProperty("lcosRun");
  });

  it("the lender case as a full case has no stack and writes the R2.4 document (S16 ≡ D14)", () => {
    const d14 = runDe({ ...dayAhead, spreadPath: "low" }, lib, { lowerNode: true });
    const s16 = runDe({ ...DE_BASE, spreadPath: "low" }, lib, { lowerNode: true });
    expect(s16.stackOn).toBe(false);
    expect(doc(s16, { ...DE_BASE, spreadPath: "low" })).toBe(doc(d14, { ...dayAhead, spreadPath: "low" }));
  });

  it("splits the merchant slice into wholesale and aFRR from COD + 3 months, shifted by a delay", () => {
    expect(base.stackOn).toBe(true);
    expect(ym(base, base.stack!.reserveStartIndex)).toBe("2028-05");
    const first = base.ops!.months.find((o) => o.afrrSliceShare > 0)!;
    expect(ym(base, first.index)).toBe("2028-05");
    for (const o of base.ops!.months) {
      if (base.cal!.months[o.index]!.phase !== "operation") continue;
      expect(Math.abs(o.s + o.wholesaleShare + o.afrrSliceShare - 1)).toBeLessThanOrEqual(1e-12);
      // the intraday uplift from the COD, aFRR only from the start month
      expect(o.stackOn).toBe(true);
      if (o.index < base.stack!.reserveStartIndex) expect(o.afrrSliceShare).toBe(0);
    }
    expect(base.checks.find((c) => c.id === "sharesSumToOne")!.status).toBe("pass");
    const late = runDe({ ...DE_BASE, codDelayMonths: 6 }, lib, { funding: base.funding! });
    expect(ym(late, late.stack!.reserveStartIndex)).toBe("2028-11");
    expect(ym(late, late.ops!.months.find((o) => o.afrrSliceShare > 0)!.index)).toBe("2028-11");
  });

  it("holds aFRR in a year when a(y) ≥ w(y) on the LCOS run, whatever the toll", () => {
    for (const y of base.stack!.years) expect(y.held, String(y.year)).toBe(y.activeMonths > 0 && y.oppReserveEurPerMw >= y.oppWholesaleEurPerMw);
    expect(base.stack!.years.find((y) => y.year === 2027)!.held).toBe(false);
    for (const patch of [{ tollPrice: 0 }, { tollPrice: 250_000 }, { tollShare: 1 }, { tollEnabled: false, debt: false }]) {
      expect(runDe({ ...DE_BASE, ...patch }, lib).stack!.years).toEqual(base.stack!.years);
    }
    // price stress 0 (S19): aFRR earns nothing, so it is held in no year with a positive wholesale value
    const zero = runDe({ ...DE_BASE, reservePriceFactor: 0 }, lib);
    for (const y of zero.stack!.years) if (y.oppWholesaleEurPerMw > 0) expect(y.held).toBe(false);
    expect(zero.ops!.months.every((o) => o.capRevAfrrEur === 0 && o.afrrMw === 0)).toBe(true);
  });

  it("keeps the identities of a month: offer, capacity revenue, activation, uplift, fee, market revenue, discharge", () => {
    const P = DE_BASE.powerMW;
    const pr = DE_STACK.prices["ytd-2026"];
    let held = 0;
    for (const o of base.ops!.months) {
      const m = base.cal!.months[o.index]!;
      if (m.phase !== "operation") continue;
      const hours = 24 * m.days;
      const mw = o.afrrSliceShare * P * Math.min(1, o.usableHours! / 2);
      expect(o.afrrMw).toBeCloseTo(mw, 9);
      const cap = mw * (pr.pos + pr.neg) * reserveMultiplier("central", m.year) * 0.9 * hours * o.availability! * (idxDE(m.year) / idxDE(2026));
      expect(o.capRevAfrrEur).toBeCloseTo(cap, 6);
      expect(o.activationDischargeMWh).toBeCloseTo(mw * 0.05 * hours * o.availability!, 9);
      expect(o.activationChargeMWh).toBe(o.activationDischargeMWh);
      expect(o.intradayUpliftEur).toBeCloseTo(0.15 * Math.max(o.capturedEur, 0), 6);
      expect(o.optimiserFeeEur).toBeCloseTo(0.1 * (Math.max(o.capturedEur, 0) + o.intradayUpliftEur + o.capRevAfrrEur), 6);
      expect(o.marketNetEur).toBeCloseTo(o.capturedEur + o.intradayUpliftEur + o.capRevAfrrEur - o.optimiserFeeEur, 6);
      expect(o.dischargeMWh).toBeCloseTo(o.marketDischargeMWh + o.tollerDischargeMWh + o.activationDischargeMWh, 9);
      if (o.afrrSliceShare > 0) held += 1;
    }
    expect(held).toBeGreaterThan(12);
    expect(base.checks.find((c) => c.id === "stackRevenueReconcile")!.status).toBe("pass");
    const b = base.stack!.revenue2029Bridge;
    expect(b.tollEur + b.dayAheadEur + b.intradayEur + b.afrrEur + b.feeEur).toBeCloseTo(base.kpis!.revenue2029PerMwEur!.value!, 6);
    expect(b.feeEur).toBeLessThan(0);
  });

  it("gate 1c: a fresh loan with the stack equals the loan without it, whatever the stack inputs", () => {
    const f0 = runDe(dayAhead, lib).funding!;
    for (const inp of [DE_BASE, { ...DE_BASE, ...odd }, { ...DE_BASE, reservePath: "slow" as const, afrrShare: 0.5, activationShare: 0.2 }]) {
      const f = runDe(inp, lib).funding!;
      expect(f.debtEur).toBe(f0.debtEur);
      expect(f.principalEur).toEqual(f0.principalEur);
      expect(f.dsraInitialEur).toBe(f0.dsraInitialEur);
    }
  });

  it("gate 1b: over the case's life the stack keeps at least 0.99 of day-ahead only, on every path and both variants", () => {
    for (const v of [{}, DE_VARIANTS.merchant, { durationHours: 4 }, { intradayUplift: 0 }]) {
      const da = lifetime(runDe({ ...dayAhead, ...v }, lib));
      for (const path of ["central", "fast", "slow"] as const) {
        expect(lifetime(runDe({ ...DE_BASE, ...v, reservePath: path }, lib)), `${JSON.stringify(v)} ${path}`).toBeGreaterThanOrEqual(0.99 * da);
      }
    }
  });

  it("checks the cycle budget of the aFRR slice: a warning above the cap, not applicable without a slice (S08)", () => {
    expect(base.checks.find((c) => c.id === "afrrCycleBudget")!.status).toBe("pass");
    expect(runDe({ ...DE_BASE, activationShare: 0.2 }, lib).checks.find((c) => c.id === "afrrCycleBudget")!.status).toBe("warn");
    expect(runDe({ ...DE_BASE, afrrShare: 0 }, lib).checks.find((c) => c.id === "afrrCycleBudget")!.status).toBe("notApplicable");
  });

  it("holds R(y) outside the table and checks the stack's inputs only with the stack on", () => {
    expect(reserveMultiplier("central", 2045)).toBe(0.23);
    expect(reserveMultiplier("slow", 2026)).toBe(0.875);
    expect(reserveMultiplier("fast", 2030)).toBe(0.05);
    expect(runDe({ ...DE_BASE, afrrShare: 0.6 }, lib).status).toEqual({ primary: "inputUnsupported", reasons: ["inputOutOfDomain"] });
    expect(runDe({ ...DE_BASE, reservePriceFactor: 2.5 }, lib).status.primary).toBe("inputUnsupported");
    expect(runDe({ ...dayAhead, afrrShare: 0.6 }, lib).status.primary).toBe("ok");
  });

  it("writes the v2 document with the stack's fields, the years summed from the months and the LCOS run", () => {
    const out = toDeOutput(base, { caseId: "S01", resolvedInputs: DE_BASE as unknown as Record<string, unknown>, library: { artifact: "synthetic" } }) as Record<string, any>;
    expect([out.schema, out.spec]).toEqual(["de-output-v2", "R3.1"]);
    expect(out.resolvedInputs.stackEnabled).toBe(true);
    expect(out.calendar.reserveStartMonth).toBe("2028-05");
    expect(out.status.checks.map((c: { id: string }) => c.id).slice(-2)).toEqual(["afrrCycleBudget", "stackRevenueReconcile"]);
    expect(out.lcosRun.months).toHaveLength(out.months.length);
    expect(out.kpis.revenue2029Bridge).toBeDefined();
    for (const y of out.years) {
      const ms = out.months.filter((m: { year: number }) => m.year === y.year);
      const sum = (f: string) => ms.reduce((s: number, m: Record<string, number>) => s + m[f]!, 0);
      expect(y.capRevAfrrEur).toBeCloseTo(sum("capRevAfrrEur"), 4);
      expect(y.activationDischargeMWh).toBeCloseTo(sum("activationDischargeMWh"), 6);
      expect(y.operatingHours).toBe(ms.filter((m: { phase: string }) => m.phase === "operation").reduce((s: number, m: { days: number }) => s + 24 * m.days, 0));
      const rule = base.stack!.years.find((s) => s.year === y.year)!;
      expect([y.reserveHeld, y.reserveMultiplier]).toEqual([rule.held, rule.multiplier]);
    }
  });

  it("the first screen's paths: one run per path on its own loan, the selected path keeps the break-even found", () => {
    const own = { tStar: { outcome: "found", value: 1, coverage: null, candidates: [], roots: [], brackets: [] }, k: null } as unknown as DeBreakEvenResult;
    const p = computeDePath(DE_BASE, lib, DE_BASE.reservePath, own);
    const fresh = runDe(DE_BASE, lib, { funding: contractualFunding(DE_BASE, lib) });
    expect(p.path).toBe(DE_BASE.reservePath);
    expect(p.tStar).toBe(own.tStar);
    expect(p.investorIrr).toEqual(fresh.kpis!.investorIrr);
    expect(p.investorNpv).toBe(fresh.kpis!.investorNpvEur!.value);
    expect(DE_PATH_ORDER).toEqual(["central", "fast", "slow"]);
    expect(computeDePaths(dayAhead, lib, own)).toBeNull();
  });
});
