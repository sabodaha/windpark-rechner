// The German pack (spec v1.2 R2.1): the engine's building blocks against the frozen analytical oracles, and end-to-end
// runs on a synthetic library of the real shape (no prices) for statuses, integrity and the locked-funding rules.
import { describe, expect, it } from "vitest";
import { buildDeCalendar } from "@/bess/de/calendar";
import { buildDeCapex } from "@/bess/de/capex";
import { bucketBudget } from "@/bess/de/funding";
import { kSolve, runDe, tStarSolve, withDeDuration, type NpvAt } from "@/bess/de/index";
import { liquidityReserve } from "@/bess/de/ledger";
import { contractCurve, effectiveFee } from "@/bess/de/operations";
import { DE_BASE, DE_VARIANTS, idxDE } from "@/bess/de/registry";
import { deTaxes } from "@/bess/de/tax";
import type { DeInputs } from "@/bess/de/types";
import { syntheticDeLibrary } from "../scripts/bess/de-synthetic";

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);

describe("German pack — analytical oracles", () => {
  it("effective fee: the §2.3 example, the high path and the axis (A-F01, A-F03, A-F05)", () => {
    close(effectiveFee(DE_BASE, 89.3217, 0.6, 2028).fee, 8.93217, 1e-9);
    close(effectiveFee(DE_BASE, 89.3217, 1.185, 2028).fee, -2.0917106962, 1e-9);
    const ltm = { ...DE_BASE, snapshot: "DE-LTM-2026-09" as const };
    close(effectiveFee(ltm, 104.045, 0.5 * 0.65 * (84737.51 / 97716.57), 2030).fee, 39.769256, 1e-5);
  });

  it("CAPEX lines and totals, 2 h and 4 h (A-K01, A-K02)", () => {
    close(buildDeCapex(DE_BASE).totalEur, 38_252_531.34, 0.01);
    close(buildDeCapex(withDeDuration(DE_BASE, 4)).totalEur, 51_205_062.68, 0.01);
    close(buildDeCapex(DE_BASE).insuredValue2026, 23_502_531.34, 0.01);
    const bkzLine = buildDeCapex({ ...DE_BASE, capexFactor: 1.11 }).lines.find((l) => l.id === "bkz")!;
    close(bkzLine.amount, 6_750_000, 1e-6);
  });

  it("taxes: separate pools, 70 % against 60 %, add-back threshold, no rounding (A-X01–A-X04)", () => {
    const a = deTaxes([{ year: 2027, ebt: -2e6, interest: 0, lease: 25_000 }, { year: 2028, ebt: 3e6, interest: 0, lease: 25_000 }, { year: 2029, ebt: 1.5e6, interest: 0, lease: 25_000 }], 4);
    close(a[1]!.kst + a[1]!.soli + a[1]!.gewSt, 287_700, 1e-6);
    close(a[2]!.kst + a[2]!.soli + a[2]!.gewSt, 415_725, 1e-6);
    const x4 = deTaxes([{ year: 2030, ebt: 1_234_567.89, interest: 0, lease: 0 }], 4)[0]!;
    close(x4.gewBase, 1_234_567.89, 1e-9);
    close(x4.gewSt, 1_234_567.89 * 0.14, 1e-6);
    for (const [interest, add] of [[150_000, 0], [187_500, 0], [1_000_000, 203_125]] as const) {
      close(deTaxes([{ year: 2030, ebt: 0, interest, lease: 25_000 }], 4)[0]!.addBack, add, 1e-9);
    }
  });

  it("bucket budgets (A-B01) and the liquidity reserve (A-L01)", () => {
    close(bucketBudget(1_150_000, 2_000_000, 1.15, 2), 2_000_000, 1e-6);
    close(bucketBudget(1_150_000, -300_000, 1.15, 2), 700_000, 1e-6);
    close(bucketBudget(-1_000_000, 1_000_000, 1.15, 2), 0, 1e-9);
    close(liquidityReserve(DE_BASE, 150_000, 1, 0, idxDE(2028), 0.8), 96_917.56893, 1e-5);
  });

  it("contracted capacity curve: 100 → 96.414927 → 85.168552 MWh (A-T07)", () => {
    const cal = buildDeCalendar(0, 20, 84, false);
    const curve = contractCurve(DE_BASE, cal, buildDeCapex(DE_BASE));
    close(curve.get(cal.codIndex)!, 100, 1e-9);
    close(curve.get(cal.codIndex + 12)!, 96.414927, 1e-6);
    close(curve.get(cal.codIndex + 83)!, 85.168552, 1e-6);
  });

  it("T* solver on synthetic functions (A-S01, A-S02, A-S05, A-S06, A-S07, A-S16)", () => {
    const lin = (slope: number, root: number, gap?: [number, number]): NpvAt => (t) =>
      gap && t >= gap[0] && t <= gap[1] ? { supported: false, funded: false, npv: null } : { supported: true, funded: true, npv: slope * (t - root) };
    const s1 = tStarSolve(lin(150, 230_000));
    expect(s1.outcome).toBe("found");
    close(s1.value!, 229_999.99523162842, 1e-9);
    expect(s1.brackets[0]!.divisions).toBe(20);
    const s2 = tStarSolve(lin(100, 250_000));
    expect([s2.outcome, s2.value, s2.roots[0]!.kind]).toEqual(["found", 250_000, "grid"]);
    expect(tStarSolve(lin(150, 230_000, [200_000, 250_000])).outcome).toBe("unresolvedPartialDomain");
    const step: NpvAt = (t) => ({ supported: true, funded: true, npv: t < 237_123.4567 ? -1000 : 1000 });
    const s6 = tStarSolve(step);
    expect([s6.outcome, s6.brackets[0]!.status]).toEqual(["refinementFailed", "stagnated"]);
    const s7 = tStarSolve(lin(150, 230_000, [229_000, 231_000]));
    expect([s7.outcome, s7.brackets[0]!.status, s7.brackets[0]!.divisions]).toEqual(["refinementFailed", "unsupportedMidpoint", 4]);
    const s16 = tStarSolve((t, fresh) => ({ supported: true, funded: true, npv: fresh && t === 250_000 ? 5 : t - 250_000 }));
    expect([s16.outcome, s16.roots.length, s16.brackets[0]!.status, s16.brackets[0]!.divisions]).toEqual(["refinementFailed", 0, "verificationFailed", 0]);
  });

  it("k search on synthetic functions (A-S11, A-S13, A-S15)", () => {
    const k1 = kSolve((k) => 1e6 * (k - 1.96));
    expect(k1.status).toBe("found");
    close(k1.value!, 1.9600006103515624, 1e-12);
    expect(kSolve((k) => (k < 0.95 ? null : 1e6 * (k - 0.5)))).toMatchObject({ status: "unsupportedBelow", supportedFrom: 1 });
    expect(kSolve((k) => (k > 1.45 && k < 1.75 ? null : 1e6 * (k - 1.6))).value).toBeCloseTo(1.6, 12);
  });

  it("calendar: liquidation dates for every delay (A-C01–A-C03, N05)", () => {
    const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
    expect(iso(buildDeCalendar(0, 20, 84, false).liquidationDay)).toBe("2044-04-30");
    expect(iso(buildDeCalendar(6, 20, 84, false).liquidationDay)).toBe("2044-10-31");
    expect(iso(buildDeCalendar(19, 20, 84, true).liquidationDay)).toBe("2045-11-30");
    expect(buildDeCalendar(19, 20, 84, true).grandfatheringApplied).toBe(false);
  });
});

describe("German pack — end to end on a synthetic library", () => {
  const lib = syntheticDeLibrary();
  const integrity = ["sourcesUses", "drawsEqualDebt", "balanceSheet", "bucketsReconcile", "taxReconcile", "sharesSumToOne", "tollFeeWithinContract", "fundingConverged", "gearingCap"];
  const base = runDe(DE_BASE, lib);

  it("runs the base case with every integrity check passed and the debt sized on the lender case", () => {
    expect(base.status.primary).toBe("ok");
    for (const id of integrity) expect(base.checks.find((c) => c.id === id)!.status, id).toBe("pass");
    expect(base.funding!.sizingStatus).toBe("converged");
    // the R2.4 list, plus the stack's two checks in the base with the stack (spec R3.1 §10.2)
    expect(base.checks).toHaveLength(23);
    expect(runDe({ ...DE_BASE, stackEnabled: false }, lib).checks).toHaveLength(21);
    for (const p of base.lender!.ledger.periods.filter((x) => x.debtServiceEur > 0.01)) {
      const budget = bucketBudget(p.cfadsCEur, p.cfadsMEur, 1.15, 2);
      expect(p.debtServiceEur).toBeLessThanOrEqual(budget + 0.01);
    }
  });

  it("rejects 1 h, merchant debt and a fee outside the axis before calculating", () => {
    expect(runDe({ ...DE_BASE, durationHours: 1 }, lib).status).toEqual({ primary: "inputUnsupported", reasons: ["notSupportedDuration"] });
    expect(runDe({ ...DE_BASE, ...DE_VARIANTS.merchant, debt: true }, lib).status.reasons).toEqual(["merchantDebtUnsupported"]);
    const off: DeInputs = { ...DE_BASE, ...DE_VARIANTS.merchant, snapshot: "DE-LTM-2026-09", spreadPath: "low", spreadMultiplierK: 0.5 };
    expect(runDe(off, lib).status).toEqual({ primary: "inputUnsupported", reasons: ["unsupportedLibraryInput"] });
  });

  it("keeps the locked debt in stresses (COD delay, CAPEX +11 %) and lets equity cover the gap", () => {
    for (const patch of [{ codDelayMonths: 6 }, { capexFactor: 1.11 }]) {
      const r = runDe({ ...DE_BASE, ...patch }, lib, { funding: base.funding! });
      expect(r.status.primary).toBe("ok");
      expect(r.funding!.debtEur).toBe(base.funding!.debtEur);
      expect(r.ledger!.maxBalanceErrorEur).toBeLessThan(0.01);
    }
  });

  it("equals the merchant variant when the toll share is zero (B01 ≡ D02)", () => {
    const merchant = runDe({ ...DE_BASE, ...DE_VARIANTS.merchant }, lib);
    const zeroShare = runDe({ ...DE_BASE, tollShare: 0, debt: false, equityHurdle: 0.15, projectDiscountRate: 0.1 }, lib);
    expect(zeroShare.kpis!.investorNpvEur!.value!).toBeCloseTo(merchant.kpis!.investorNpvEur!.value!, 6);
    expect(zeroShare.ledger!.liquidationPayoutEur).toBeCloseTo(merchant.ledger!.liquidationPayoutEur, 6);
  });

  it("reports an unpaid loan at closure without a liquidation payout (N03, B16)", () => {
    const r = runDe({ ...DE_BASE, tollPrice: 0 }, lib, { funding: base.funding! });
    expect(r.checks.find((c) => c.id === "debtRepaid")!.status).toBe("fail");
    expect(r.ledger!.liquidationPayoutEur).toBe(0);
    expect(r.status.primary).toBe("ok");
  });
});
