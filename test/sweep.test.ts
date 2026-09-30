// A seeded sweep over the usual input ranges, adapted from a reviewer's probe (30 Sep 2026). It found the
// covenant breaches of the old engine: sizing without working capital, the § 26 premium lag and the negative
// advance of the two-sided switch. With the one-sided premium, the base scenario must now stay funded, meet its
// covenant and pass every calculation check in every case.
import { describe, expect, it } from "vitest";
import { BASE_CASE, runScenarios } from "../src/engine";
import type { Inputs } from "../src/engine";
import { FIELDS } from "../src/lib/fields";

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
    }
    expect(failures).toEqual([]);
    // The stresses are meant to bite: some of them breach the covenant of the base-case loan.
    expect(stressBreaches).toBeGreaterThan(0);
  });
});
