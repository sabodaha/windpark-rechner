// A seeded sweep over the usual input ranges, adapted from a reviewer's probe (30 Sep 2026). It found the
// covenant breaches of the old engine: sizing without working capital, the § 26 premium lag and the negative
// advance of the two-sided switch. With the one-sided premium, the base scenario must now stay funded, meet its
// covenant and pass every calculation check in every case.
import { describe, expect, it } from "vitest";
import { BASE_CASE, runScenarios } from "../src/engine";
import type { Inputs } from "../src/engine";
import { FIELD_BY_ID, FIELDS } from "../src/lib/fields";

function sampler(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInputs(rnd: () => number): Inputs {
  const inp: Inputs = structuredClone(BASE_CASE);
  for (const f of FIELDS) {
    if (f.virtual || rnd() > 0.35) continue;
    if (f.kind === "number" && !f.usual) continue;
    if (f.kind === "date") continue;
    let v: number | string | boolean;
    if (f.kind === "switch") v = rnd() < 0.5;
    else if (f.kind === "select") v = f.options![Math.floor(rnd() * f.options!.length)]!;
    else if (f.kind === "month") v = `${2025 + Math.floor(rnd() * 6)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}`;
    else {
      const [lo, hi] = f.usual!;
      const shown = lo + rnd() * (hi - lo);
      v = (f.decimals === 0 ? Math.round(shown) : shown) / (f.scale ?? 1);
    }
    f.set(inp, v);
  }
  inp.revenue.twoSidedPremium = false;
  // Supported scope: the grace period lasts until commissioning.
  inp.financing.graceYears = Math.max(inp.financing.graceYears, Math.ceil(inp.project.constructionMonths / 12));
  if (inp.financing.graceYears >= inp.financing.tenorYearsFromClose) inp.financing.tenorYearsFromClose = inp.financing.graceYears + 5;
  return inp;
}

describe("seeded sweep of 500 input sets", () => {
  it("base scenario: funded, covenant met, every calculation check green", { timeout: 300_000 }, () => {
    const rnd = sampler(20260930);
    const failures: string[] = [];
    let stressBreaches = 0;
    for (let n = 0; n < 500; n++) {
      const inputs = randomInputs(rnd);
      const s = runScenarios(inputs);
      const v = s.base.validity;
      if (v.integrity === "error" || v.funding === "error" || v.covenant === "error") {
        const failed = s.base.checks.filter((c) => !c.ok && c.severity === "error").map((c) => `${c.id}=${c.value}`);
        failures.push(`case ${n}: ${failed.join(", ")}`);
      }
      for (const k of ["p90", "resource", "downside"] as const) {
        expect(s[k].validity.integrity, `case ${n} ${k}`).not.toBe("error");
        if (s[k].validity.covenant === "error") stressBreaches++;
      }
      for (const k of ["base", "p90", "resource", "downside"] as const) {
        const dust = s[k].annual.find((a) => a.debtService > 0 && a.debtService < 1);
        expect(dust, `case ${n} ${k}: debt service of ${dust?.debtService} in ${dust?.year}`).toBeUndefined();
      }
    }
    expect(failures).toEqual([]);
    // The stresses are meant to bite: some of them breach the covenant of the base-case loan.
    expect(stressBreaches).toBeGreaterThan(0);
  });
});

/**
 * Wider than the acceptance sweep (second review, 1 Oct 2026): it also moves total capex and opex, the futures,
 * the inflation of 2026–2028 and the two-sided switch, which the usual-range sweep never touches. Stress outcomes
 * — a shortfall, a covenant breach — are allowed here; a failed calculation check or debt-service dust is not.
 */
describe("wide sweep of 1,000 input sets", () => {
  it("every scenario passes the calculation checks; returns are n.m. exactly when cash runs short", { timeout: 300_000 }, () => {
    const rnd = sampler(20261001);
    const set = (id: string, v: number | string | boolean, inp: Inputs) => FIELD_BY_ID.get(id)!.set(inp, v);
    const failures: string[] = [];
    // What the sweep reaches: each path must occur, or the sweep proves nothing about it.
    const reached = { baseLockUp: 0, shortfall: 0, sculpted: 0, twoSided: 0, covenantBreach: 0 };
    for (let n = 0; n < 1000; n++) {
      const inp = randomInputs(rnd);
      const pick = (lo: number, hi: number) => lo + rnd() * (hi - lo);
      if (rnd() < 0.5) set("capexTotal", pick(1400, 2300), inp);
      if (rnd() < 0.5) set("opexTotal", pick(15, 40), inp);
      for (const id of ["f2027", "f2028", "f2029"]) if (rnd() < 0.4) set(id, pick(50, 160), inp);
      for (const id of ["inf2026", "inf2027", "inf2028"]) if (rnd() < 0.4) set(id, pick(0, 0.05), inp);
      if (rnd() < 0.3) inp.revenue.twoSidedPremium = true;
      if (rnd() < 0.3) inp.financing.repayment = "sculpted";
      const s = runScenarios(inp);
      if (s.base.validity.lockUpYears.length > 0) reached.baseLockUp++;
      if (inp.financing.repayment === "sculpted") reached.sculpted++;
      if (inp.revenue.twoSidedPremium) reached.twoSided++;
      if (Object.values(s).some((r) => r.validity.shortfall)) reached.shortfall++;
      if (Object.values(s).some((r) => r.validity.covenantBreach)) reached.covenantBreach++;
      for (const k of ["base", "p90", "resource", "downside"] as const) {
        const r = s[k];
        if (r.validity.integrity === "error") {
          const failed = r.checks.filter((c) => c.group === "integrity" && !c.ok && c.severity === "error").map((c) => `${c.id}=${c.value}`);
          failures.push(`case ${n} ${k}: ${failed.join(", ")}`);
        }
        const dust = r.annual.find((a) => a.debtService > 0 && a.debtService < 1);
        if (dust) failures.push(`case ${n} ${k}: debt service of ${dust.debtService} in ${dust.year}`);
        if (r.validity.returnsMeaningful !== (r.validity.shortfall === null && r.validity.integrity !== "error"))
          failures.push(`case ${n} ${k}: returnsMeaningful ${r.validity.returnsMeaningful} with shortfall ${JSON.stringify(r.validity.shortfall)}`);
      }
    }
    expect(failures).toEqual([]);
    for (const [path, count] of Object.entries(reached)) expect(count, path).toBeGreaterThan(0);
  });
});
