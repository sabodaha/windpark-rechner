// Gate 3 of the German pack: each engine finding of the comparison with the independent second implementation, kept as
// a regression test on the synthetic library.
import { describe, expect, it } from "vitest";
import { irrRoots } from "@/bess/engine/irr";
import { buildDeCalendar } from "@/bess/de/calendar";
import { buildDeCapex } from "@/bess/de/capex";
import { runDe } from "@/bess/de/index";
import { deIrrRoots } from "@/bess/de/irr";
import { deMonthFields, lookupDe } from "@/bess/de/library";
import { contractCurve } from "@/bess/de/operations";
import { DE_BASE } from "@/bess/de/registry";
import { xnpv, type DatedFlow } from "@/engine/finance";
import { syntheticDeLibrary } from "../scripts/bess/de-synthetic";

const lib = syntheticDeLibrary();

describe("German pack — gate 3 findings", () => {
  it("E1: a fee on a node reads that node alone, not the better of it and its lower neighbour", () => {
    const key = { snapshot: "DE-2025" as const, duration: 2, cycleCap: 1.5, rte: 0.85 };
    // synthetic export at 2.0 h, fee 0, January: 30 × 2 × 0.8 × (1 − 15/120) = 42 MWh; the −5 node holds 44
    expect(deMonthFields(lookupDe(lib, key, 2, 0), 1).exportMWh).toBeCloseTo(42, 4);
    expect(deMonthFields(lookupDe(lib, key, 2, -5), 1).exportMWh).toBeCloseTo(44, 4);
  });

  it("E2: the contract curve uses the base availability, whatever the case's availability", () => {
    const cal = buildDeCalendar(0, DE_BASE.repaymentCount, DE_BASE.tollMonths, false);
    const capex = buildDeCapex(DE_BASE);
    const base = contractCurve(DE_BASE, cal, capex);
    const low = contractCurve({ ...DE_BASE, availabilityYear1: 0, availability: 0.93 }, cal, capex);
    expect([...low.entries()]).toEqual([...base.entries()]);
  });

  it("E3: the LCOS rerun of a lower-node case reads the lower node too", () => {
    const low = { ...DE_BASE, spreadPath: "low" as const };
    const a = runDe(low, lib, { lowerNode: true }).kpis!.lcosEurPerMWh!.value!;
    const b = runDe(low, lib).kpis!.lcosEurPerMWh!.value!;
    expect(Math.abs(a - b)).toBeGreaterThan(1e-6);
  });

  it("E4: the project's own liquidity reserve is topped up after the toll and released in full", () => {
    const r = runDe(DE_BASE, lib);
    const { liquidityTargetCodEur: cod, liquidityTargetPostTollEur: post } = r.market!;
    const topUpDay = r.cal!.months[r.cal!.tollLast! + 1]!.last;
    const flows = r.ledger!.projectPreTax;
    expect(flows.some((f) => f.day === topUpDay && Math.abs(f.amount + (post! - cod)) < 1e-9)).toBe(true);
    expect(flows[flows.length - 1]!.amount).toBeCloseTo(post!, 9);
  });

  it("E5: the loan sized on the lender case equals the lender case run as a full case (D01 ≡ D14)", () => {
    const d01 = runDe(DE_BASE, lib).funding!.debtEur;
    const d14 = runDe({ ...DE_BASE, spreadPath: "low" }, lib, { lowerNode: true }).funding!.debtEur;
    expect(Math.abs(d01 - d14)).toBeLessThan(0.01);
  });

  it("K1′: a steep root at a deeply negative rate is kept; an ordinary root is found exactly as before", () => {
    const monthEnd = (i: number) => Date.UTC(2027 + Math.floor((1 + i) / 12), ((1 + i) % 12) + 1, 0) / 86_400_000;
    const build = (out: number): DatedFlow[] => [
      ...Array.from({ length: 12 }, (_v, i) => ({ day: monthEnd(i), amount: -3.2e6 })),
      ...Array.from({ length: 180 }, (_v, i) => ({ day: monthEnd(12 + i), amount: 1.3e5 })),
      ...(out > 0 ? [{ day: monthEnd(194), amount: -out }] : []),
    ];
    const steep = deIrrRoots(build(1e6));
    expect(steep).toHaveLength(2);
    expect(steep[0]!).toBeCloseTo(-0.703277, 5);
    expect(steep[1]!).toBeCloseTo(-0.06357, 5);
    const flows = build(1e6);
    const scale = (r: number) => flows.reduce((s, f) => s + Math.abs(f.amount) * Math.exp((-Math.log1p(r) * (f.day - flows[0]!.day)) / 365), 0);
    expect(Math.abs(xnpv(steep[0]!, flows, flows[0]!.day))).toBeLessThan(Math.max(1, 1e-12 * scale(steep[0]!)));
    const plain = build(0);
    expect(deIrrRoots(plain)).toEqual(irrRoots(plain));
  });
});
