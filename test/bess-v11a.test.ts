// v1.1a reserve contract (spec v1.1 R2): analytical checks of §11 and end-to-end integrity of the retained scope.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESS_BASE, contractCmax, parseLibrary, runBess, type BessInputs, type ContractInputs, type LibraryManifest } from "@/bess/engine";
import { buildCalendar } from "@/bess/engine/calendar";
import { buildCapex } from "@/bess/engine/capex";
import { periodBudget } from "@/bess/engine/funding";
import { fxMonth } from "@/bess/engine/macro";
import { runOperations } from "@/bess/engine/operations";
import { CONTRACT_DEFAULTS, FINANCE, RESERVE } from "@/bess/engine/registry";
import { contractPlan, settlementHours } from "@/bess/engine/reserves";

const built = existsSync("public/bess/ua-library-v2.bin");
const load = () => {
  const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
  const bin = readFileSync("public/bess/ua-library-v2.bin");
  return parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
};
const withContract = (over: Partial<ContractInputs> = {}, inp: Partial<BessInputs> = {}): BessInputs & { contract: ContractInputs } =>
  ({ ...BESS_BASE, ...inp, contract: { ...CONTRACT_DEFAULTS, ...over } });

describe("v1.1a analytical checks", () => {
  it("settlement hours follow the Kyiv DST calendar (T02)", () => {
    expect(settlementHours(3, 31)).toBe(743);
    expect(settlementHours(10, 31)).toBe(745);
    expect(settlementHours(2, 29)).toBe(696);
  });

  it("signed debt budgets (R24, T17)", () => {
    expect(periodBudget(80, 100, 1.75)).toBeCloseTo(54.074074, 6); // C = 100, M = −20
    expect(periodBudget(80, -20, 1.75)).toBeCloseTo(37.142857, 6); // C = −20, M = 100
    expect(periodBudget(80, 80, 1.75)).toBeCloseTo(59.259259, 6); // C = 80, M = 0
    expect(periodBudget(80, 0, 1.75)).toBe(Math.max(0, 80) / 1.75); // no contract: v1 exactly
    expect(FINANCE.targetDscrContracted).toBe(1.35);
  });

  it("survival at the opening of the 60th month and after 60 transitions (T13)", () => {
    const cal = buildCalendar(0);
    const plan = contractPlan(withContract(), cal);
    const s = plan.effectiveStart;
    expect(plan.S[s]).toBe(1);
    expect(plan.S[s + 59]!).toBeCloseTo(0.7080968456, 9);
    const after = plan.S[s + 59]! - plan.hitLoss[s + 59]! - plan.otherLoss[s + 59]!;
    expect(after).toBeCloseTo(0.7039662807, 9);
    // repair mass still open after the last month of the award
    let open = 0;
    for (let k = s + 60 - 6; k < s + 60; k++) open += plan.hitLoss[k]!;
    expect(open).toBeCloseTo(0.0251497914, 9);
  });

  it("other loss releases the battery without a repair (R1-02)", () => {
    const cal = buildCalendar(0);
    const plan = contractPlan(withContract({ otherLossRate: 0.05 }, { lossRatio: 0 }), cal);
    for (let m = plan.effectiveStart; m <= plan.lastService; m++) {
      expect(plan.R[m]).toBe(0);
      expect(plan.S[m]! + plan.R[m]! + plan.released[m]!).toBeCloseTo(1, 12);
    }
  });

  it("dates: exclusive end 2033-03, deferral and cancellation (R1-01, T12)", () => {
    const cal = buildCalendar(0);
    const plan = contractPlan(withContract(), cal);
    expect(cal.months[plan.effectiveStart]!.year * 100 + cal.months[plan.effectiveStart]!.month).toBe(202803);
    expect(cal.months[plan.awards[0]!.endExclusive]!.year * 100 + cal.months[plan.awards[0]!.endExclusive]!.month).toBe(203303);
    const late = contractPlan(withContract({}, { codDelayMonths: 2 }), buildCalendar(2));
    expect(late.delay).toBe(2);
    expect(late.effectiveStart).toBe(plan.effectiveStart + 2);
    const cancelled = contractPlan(withContract({}, { codDelayMonths: 6 }), buildCalendar(6));
    expect(cancelled.cancelled).toBe(true);
  });
});

describe.runIf(built)("v1.1a end to end", () => {
  const lib = built ? load() : (null as never);

  it("the contract base case closes every check and the balance sheet (E01)", () => {
    const r = runBess(withContract(), lib);
    for (const c of r.checks.filter((c) => ["integrity", "physical", "funding", "data", "inputs"].includes(c.group))) {
      expect(c.status, `${c.id} ${c.value ?? ""} ${c.note ?? ""}`).toBe("pass");
    }
    expect(r.returnsMeaningful).toBe(true);
    expect(r.contract?.awards[0]?.eurPerMWHour).toBe(17);
  });

  it("availability fee of the first service month: C × p × fx × H × A (T02)", () => {
    const inp = withContract();
    const cal = buildCalendar(0);
    const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
    const plan = contractPlan(inp, cal);
    const ops = runOperations(inp, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1, plan });
    const i = plan.effectiveStart;
    const m = cal.months[i]!;
    const r = ops.months[i]!.reserve!;
    expect(r.capacityUah).toBeCloseTo(40 * 17 * fxMonth(m.year, m.month, false) * 743 * 0.95, 4);
  });

  it("within-hour netting keeps the signed difference; ν = 0 settles nothing (R1-05, T06)", () => {
    const cal = buildCalendar(0);
    const inp = withContract({ nettingShare: 0 });
    const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
    const ops = runOperations(inp, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1, plan: contractPlan(inp, cal) });
    const r = ops.months[contractPlan(inp, cal).effectiveStart + 1]!.reserve!;
    expect(r.U).toBeGreaterThan(0);
    expect(r.Uset).toBeCloseTo(0, 9);
    expect(r.Dset).toBeCloseTo(0, 9);
    const asym = withContract({ activationUp: 0.1, activationDown: 0.02 });
    const opsA = runOperations(asym, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1, plan: contractPlan(asym, cal) });
    const ra = opsA.months[contractPlan(asym, cal).effectiveStart + 1]!.reserve!;
    expect(ra.Uset - ra.Dset).toBeCloseTo(ra.U - ra.Dn, 6);
    expect(ra.B).toBeGreaterThan(0);
  });

  it("escrow on a two-month deferral: post G, top up 0.2 G, keep 0.6 G, refund 0.6 G (T12)", () => {
    const r = runBess(withContract({}, { codDelayMonths: 2 }), lib);
    expect(r.contract?.delay).toBe(2);
    for (const c of r.checks.filter((c) => c.group === "integrity")) expect(c.status, c.id).toBe("pass");
    const cancelled = runBess(withContract({}, { codDelayMonths: 6 }), lib);
    expect(cancelled.contract?.cancelled).toBe(true);
    expect(cancelled.checks.find((c) => c.id === "contractCancelled")?.status).toBe("warning");
  });

  it("suspension keeps the reserved share out of arbitrage and closes (W09)", () => {
    const r = runBess(withContract({ onHit: "suspended" }), lib);
    for (const c of r.checks.filter((c) => ["integrity", "physical"].includes(c.group))) expect(c.status, c.id).toBe("pass");
  });

  it("renewal changes the operating case but not the lender's debt (T19)", () => {
    const a1 = runBess(withContract(), lib);
    const a2 = runBess(withContract({ renewal: true, renewalPrice: 13, renewalTenorMonths: 60 }), lib);
    expect(a2.contract?.awards.length).toBe(2);
    expect(a2.funding.debtEur).toBeCloseTo(a1.funding.debtEur, 6);
    expect(a2.kpis.investorNpv!.value).not.toBeCloseTo(a1.kpis.investorNpv!.value!, 0);
  });

  it("the R1-06 counterexample fails the recovery envelope; C_max of the 2-hour default is 45 (T05)", () => {
    const r = runBess(withContract({ acceptedMW: 45, activationUp: 0, activationDown: 0.15 }, { durationH: 4 }), lib);
    expect(r.checks.find((c) => c.id === "recoveryEnvelopeExceeded")?.status).toBe("fail");
    expect(r.returnsMeaningful).toBe(false);
    expect(contractCmax(withContract(), lib)).toBe(45);
  });

  it("an unsupported input is a status, not zero income (T24)", () => {
    const r = runBess(withContract({ tenorMonths: 12 }), lib);
    expect(r.checks.find((c) => c.id === "contractInputs")?.status).toBe("fail");
    expect(r.returnsMeaningful).toBe(false);
    const cap = runBess(withContract({ eurPerMWHour: 30 }), lib);
    expect(cap.status.reasons).toEqual(["aboveAuctionCap"]);
    expect(RESERVE.auctionCapUah).toBe(1339.82);
  });
});
