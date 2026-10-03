// v1.1a reserve contract, spec R3: the corrections of review round R2 (R2-01 – R2-05) as executable checks — the
// inventory event split, the transition days and the joint power budget, the operating-VAT subledger, the case statuses
// and the p* solver contract on synthetic functions.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESS_BASE, parseLibrary, runBess, solvePStar, type BessInputs, type ContractInputs, type LibraryManifest, type PStarPoint } from "@/bess/engine";
import { buildCalendar } from "@/bess/engine/calendar";
import { buildCapex } from "@/bess/engine/capex";
import { liquidityReserveUah } from "@/bess/engine/funding";
import { runLedger } from "@/bess/engine/ledger";
import { runOperations } from "@/bess/engine/operations";
import { CONTRACT_DEFAULTS, RESERVE } from "@/bess/engine/registry";
import { settleOperatingVat } from "@/bess/engine/reserve-ledger";
import { contractPlan, contractUnsupported, recoveryHours } from "@/bess/engine/reserves";

const built = existsSync("public/bess/ua-library-v2.bin");
const load = () => {
  const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
  const bin = readFileSync("public/bess/ua-library-v2.bin");
  return parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
};
const withContract = (over: Partial<ContractInputs> = {}, inp: Partial<BessInputs> = {}): BessInputs & { contract: ContractInputs } =>
  ({ ...BESS_BASE, ...inp, contract: { ...CONTRACT_DEFAULTS, ...over } });

describe("R3 analytical oracles", () => {
  it("recovery time after a full command uses the round-trip efficiency (R2-02)", () => {
    const h = recoveryHours(CONTRACT_DEFAULTS, 0.85);
    expect(h.up).toBeCloseTo(11.764705882, 8);
    expect(h.down).toBeCloseTo(8.5, 12);
  });

  it("routine restoration and the exit sale are separate transactions (R2-01 example)", () => {
    // last service month, no losses, C = 40, h = 1, RTE 0.85, H = 720, A = 0.97, α = 0.05 both ways
    const U = 0.05 * 40 * 720 * 0.97;
    expect(U).toBeCloseTo(1396.8, 9);
    const Broutine = Math.max(U / 0.85 - U, 0);
    expect(Broutine).toBeCloseTo(246.494117647059, 9);
    // commodity cash at 100 UAH/MWh: the routine purchase in the last month, the 40 MWh stock sold on the exit day
    expect(-Broutine * 100).toBeCloseTo(-24649.4117647059, 6);
    expect(40 * 100 - Broutine * 100).toBeCloseTo(-20649.411765, 5);
  });

  it("a carried credit returns to the bucket that paid the input VAT (R2-04 example)", () => {
    const v = settleOperatingVat({ C: [-20, 0, 0], M: [0, 30, 0] });
    expect(v.payment).toEqual([0, 0, 10]);
    expect(v.entry.C).toEqual([0, 0, 20]);
    expect(v.entry.M).toEqual([0, 0, -30]);
    expect(v.writtenOff).toEqual({ C: 0, M: 0 });
  });

  it("a zero-residual BSP month: the down input credit of C covers the up output VAT of M (R2-04)", () => {
    const v = settleOperatingVat({ C: [-200, 0], M: [200, 0] });
    expect(v.payment[1]).toBe(0);
    expect(v.entry.C[1]).toBe(200);
    expect(v.entry.M[1]).toBe(-200);
  });

  it("older credits first, the month's own credits after them; within a month C before M", () => {
    const v = settleOperatingVat({ C: [0, -5, 0], M: [-10, 12, 0] });
    // t = 2 settles month 1: liabilities 12 drawn from M's month-0 credit (10), then C's month-1 credit (2)
    expect(v.payment[2]).toBe(0);
    expect(v.entry.C[2]).toBe(2);
    expect(v.entry.M[2]).toBe(-2);
    expect(v.writtenOff).toEqual({ C: 3, M: 0 });
    expect(v.pool[2]).toBe(0);
  });

  it("an unused credit is written off at the end, at its owner's cost", () => {
    const v = settleOperatingVat({ C: [-50, 0, 0], M: [0, 0, 0] });
    expect(v.payment).toEqual([0, 0, 0]);
    expect(v.writtenOff).toEqual({ C: 50, M: 0 });
    expect(v.pool[2]).toBe(0);
  });

  it("input domain: ρ = 0 and an award whose exit day falls after the last operating month are rejected", () => {
    const cal = buildCalendar(0);
    expect(contractUnsupported(withContract({ recoveryPowerShare: 0 }), cal)?.code).toBe("recoveryPowerShare");
    // start 2038-02, 60 months: the exclusive end 2043-02 is the first month after operations
    const offset = cal.months.findIndex((m) => m.year === 2038 && m.month === 2) - cal.plannedCodIndex;
    expect(contractUnsupported(withContract({ startOffsetFromCod: offset, auctionMonthOffset: cal.plannedCodIndex + offset - 36 }), cal)?.code).toBe("exitOutsideOperations");
    expect(contractUnsupported(withContract({ startOffsetFromCod: offset - 1, auctionMonthOffset: cal.plannedCodIndex + offset - 37 }), cal)).toBeNull();
  });
});

describe.runIf(built)("R3 model checks", () => {
  const lib = built ? load() : (null as never);
  const cal = buildCalendar(0);
  const opsOf = (inp: BessInputs & { contract: ContractInputs }) => {
    const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
    const plan = contractPlan(inp, cal);
    return { plan, ops: runOperations(inp, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1, plan }) };
  };

  it("fill day, constant stock in service, exit day after the last award; every unit leaves once (R2-01, R2-02)", () => {
    const { plan, ops } = opsOf(withContract());
    const unit = 40;
    const f = ops.months[plan.fillIndex]!.reserve!;
    expect(f.Bfill).toBeCloseTo(unit / 0.85, 12);
    expect(f.Iclose).toBeCloseTo(unit, 12);
    expect(f.tau).toBeCloseTo(f.sigmaStar / 29, 12); // February 2028 has 29 days
    const L = ops.months[plan.lastService]!.reserve!;
    expect(L.Broutine).toBeCloseTo(Math.max(L.U / 0.85 - L.Dn, 0), 9);
    expect(L.Xroutine).toBeCloseTo(Math.max(0.85 * L.Dn - L.U, 0), 9);
    expect(L.exitQueue).toBeCloseTo(unit * (plan.S[plan.lastService]! - plan.hitLoss[plan.lastService]!), 9);
    expect(L.Iclose).toBeCloseTo(L.exitQueue, 9);
    const E = ops.months[plan.lastService + 1]!.reserve!;
    expect(E.window).toBe(0);
    expect(E.Xexit).toBeCloseTo(L.exitQueue, 9);
    expect(E.Iclose).toBeCloseTo(0, 9);
    expect(E.exitSaleUah).toBeCloseTo(E.Xexit * E.energyPriceUah, 6);
    expect(E.basisReleaseUah).toBeCloseTo(E.Xexit * (f.fillPurchaseUah / unit), 6);
    expect(E.basisCloseUah).toBeCloseTo(0, 6);
    expect(E.tau).toBeGreaterThan(0);
    let out = 0;
    for (const o of ops.months) out += (o.reserve?.Xexit ?? 0) + (o.reserve?.J ?? 0);
    expect(out).toBeCloseTo(unit, 9);
    expect(ops.reserveChecks.energyBalance).toBeLessThan(1e-9);
    expect(ops.reserveChecks.lifecycle).toBeLessThan(1e-9);
  });

  it("other loss: the departing mass sells its stock on the next month's exit day", () => {
    const { plan, ops } = opsOf(withContract({ otherLossRate: 0.05 }));
    const m = plan.effectiveStart + 10;
    const r = ops.months[m + 1]!.reserve!;
    expect(r.Xexit).toBeCloseTo(40 * plan.otherLoss[m]!, 12);
    expect(r.exitOrigin).toBe("A1");
  });

  it("the standing load and the site's auxiliary stress are reserved in σ_P (R2-02 example)", () => {
    const { ops, plan } = opsOf(withContract({ standingLoadShare: 0.005 }));
    expect(ops.months[plan.effectiveStart]!.reserve!.sigmaP).toBeCloseTo((40 * 1.105) / 50, 12);
    // α_up = 0.0425, α_down = 0: the restoration purchase of the peak day uses the whole recovery allowance, and the import
    // budget 40 + 4 + 0.2 = 44.2 MW is reserved
    const g = opsOf(withContract({ standingLoadShare: 0.005, activationUp: 0.0425, activationDown: 0 }));
    const q = g.ops.months[g.plan.effectiveStart]!.reserve!;
    expect(q.quota.b[0]).toBeCloseTo(100, 9);
    expect(q.quota.b[1]).toBeCloseTo(100, 9);
    expect(q.sigmaP * 50).toBeCloseTo(44.2, 9);
  });

  it("primary statuses: ok, cancelled, physically unsupported, input unsupported (R2-06)", () => {
    expect(runBess(withContract(), lib).status).toEqual({ primary: "ok", reasons: [] });
    expect(runBess(withContract({}, { codDelayMonths: 6 }), lib).status.primary).toBe("cancelled");
    const s02 = runBess(withContract({ activationUp: 0.05, activationDown: 0.1 }), lib);
    expect(s02.status.primary).toBe("physicallyUnsupported");
    expect(s02.status.reasons).toContain("warrantyQuotaExceeded");
    const s03 = runBess(withContract({ activationUp: 0.1, activationDown: 0.02 }), lib);
    expect(s03.status.reasons).toEqual(expect.arrayContaining(["warrantyQuotaExceeded", "recoveryEnvelopeExceeded"]));
    const s14 = runBess(withContract({ sustainHours: 1.5 }), lib);
    expect(s14.status.reasons).toContain("reserveOverAllocated");
    const u02 = runBess(withContract({ acceptedMW: 46 }), lib);
    expect(u02.status.primary).toBe("physicallyUnsupported");
    expect(u02.status.reasons).toContain("reserveOverAllocated");
    expect(runBess(withContract({ tenorMonths: 12 }), lib).status).toEqual({ primary: "inputUnsupported", reasons: ["tenorMonths"] });
    // every broken input rule is a reason, by its canonical code and order (G3-01)
    expect(runBess(withContract({ tenorMonths: 12, failureEvents: 13, balancingLagMonths: 30 }), lib).status.reasons).toEqual(["tenorMonths", "penaltyInputs", "paymentLag"]);
    // a screen failing on both the case's and the lender's path is one reason, by its §14 name
    expect(runBess(withContract({ acceptedMW: 45, activationUp: 0, activationDown: 0.15 }, { durationH: 4 }), lib).status.reasons).toEqual(["recoveryEnvelopeExceeded"]);
  });

  it("total equity includes the reserve's sponsor calls (G3-07)", () => {
    const e01 = runBess(withContract(), lib, { trace: true });
    const led = e01.trace!.ledger;
    const calls = led.reserve!.equityCall.reduce((sum, v, i) => sum + v / led.monthly.fx[i]!, 0);
    expect(calls).toBeGreaterThan(1_000_000); // escrow, LIQ and the fill with VAT
    expect(e01.kpis.equityEur!.value!).toBeCloseTo(led.equityEur + calls, 6);
  });

  it("passing restoration cases: a routine export and a routine purchase inside the envelope", () => {
    const x = runBess(withContract({ activationUp: 0.03, activationDown: 0.05 }), lib);
    expect(x.status.primary).toBe("ok");
    const b = runBess(withContract({ activationUp: 0.06, activationDown: 0.03 }), lib);
    expect(b.status.primary).toBe("ok");
  });

  it("the VAT subledger and the buckets reconcile in the settlement stresses", () => {
    for (const over of [{}, { settlementRegime: "noOffset" as const }, { settlementRegime: "noOffset" as const, balancingCollection: 0.9, balancingLagMonths: 24 },
      { asPaymentLagMonths: 4 }, { renewal: true, renewalPrice: 13 }, { onHit: "suspended" as const, renewal: true, renewalPrice: 13 }]) {
      const r = runBess(withContract(over), lib);
      for (const id of ["vatReconcile", "bucketsReconcile", "receivablesReconcile", "escrowRollForward", "inventoryClosed", "inventoryCostClosed", "noDoubleSale", "balanceSheet"]) {
        expect(r.checks.find((c) => c.id === id)?.status, `${JSON.stringify(over)} ${id}`).toBe("pass");
      }
    }
  });

  it("partial collection with a long lag leaves a positive residual and writes off its uncollected share (S06)", () => {
    const inp = withContract({ settlementRegime: "noOffset", balancingCollection: 0.9, balancingLagMonths: 24 });
    const r = runBess(inp, lib);
    expect(r.status.primary).toBe("ok");
    const capex = buildCapex(inp.powerMW, inp.durationH, inp.connection, inp.capexFactor);
    const plan = contractPlan(inp, cal);
    const ops = runOperations(inp, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1, plan });
    const led = runLedger(inp, ops, capex, cal, r.funding, liquidityReserveUah(inp, lib, cal), plan);
    const rl = led.reserve!;
    let claims = 0;
    for (const o of ops.months) claims += (o.reserve?.upEnergyUah ?? 0) * 1.2;
    const lost = rl.badDebt.reduce((a, v) => a + v, 0);
    expect(claims).toBeGreaterThan(0);
    expect(lost).toBeCloseTo(0.1 * claims, 2);
  });
});

describe("p* solver contract on synthetic functions (R2-05)", () => {
  const point = (f: (p: number) => number | null, funded: (p: number) => boolean = () => true) => (p: number): PStarPoint => {
    const v = f(p);
    return v === null ? { price: p, supported: false, npv: null, funded: null, debtEur: null, reason: "synthetic" } : { price: p, supported: true, npv: v, funded: funded(p), debtEur: 0 };
  };

  it("a supported jump never converges: refinementFailed, not found", () => {
    const s = solvePStar(point((p) => (p < 10.5 ? -100 : 100)), 25);
    expect(s.outcome).toBe("refinementFailed");
    expect(s.roots).toEqual([]);
    expect(s.brackets).toHaveLength(1);
    expect(["stagnated", "iterationCap"]).toContain(s.brackets[0]!.status);
    expect(s.brackets[0]!.iterations).toBeLessThanOrEqual(RESERVE.pStarMaxBisections);
    expect(s.admissibility).toBe("notApplicable");
  });

  it("several crossings are all reported; the smallest is the headline", () => {
    const s = solvePStar(point((p) => (p - 5.5) * (p - 20.25) * (p - 30.75)), 25);
    expect(s.outcome).toBe("found");
    // each root lies within the 0.001 bracket of the true crossing
    expect(s.roots).toHaveLength(3);
    [5.5, 20.25, 30.75].forEach((x, k) => expect(Math.abs(s.roots[k]!.price - x)).toBeLessThanOrEqual(RESERVE.pStarBracket));
    expect(Math.abs(s.value! - 5.5)).toBeLessThanOrEqual(RESERVE.pStarBracket);
    // converged brackets only: the final bracket is narrow and holds its root
    for (const b of s.brackets) {
      expect(b.status).toBe("converged");
      expect(b.finalHi - b.finalLo).toBeLessThanOrEqual(RESERVE.pStarBracket);
      expect(b.finalLo <= b.root! && b.root! <= b.finalHi).toBe(true);
    }
    expect(s.admissibility).toBe("admissible");
    for (const r of s.roots) expect(Math.abs(r.verifiedNpv)).toBeLessThan(1);
  });

  it("an exact grid root counts once and needs no bisection", () => {
    const s = solvePStar(point((p) => 100 * (p - 12)), 25);
    expect(s.outcome).toBe("found");
    expect(s.roots).toHaveLength(1);
    expect(s.roots[0]).toMatchObject({ price: 12, source: "grid" });
    expect(s.brackets).toHaveLength(0);
  });

  it("an unsupported midpoint stops the bracket; without another root the outcome is refinementFailed", () => {
    const s = solvePStar(point((p) => (p > 7.2 && p < 7.6 ? null : 100 * (p - 7.3))), 25);
    expect(s.brackets[0]!.status).toBe("unsupportedMidpoint");
    // a failed bracket keeps its actual endpoints: no width requirement
    expect([s.brackets[0]!.finalLo, s.brackets[0]!.finalHi]).toEqual([7, 8]);
    expect(s.outcome).toBe("refinementFailed");
    expect(s.coverage).toBe("complete");
  });

  it("viable at zero is a boundary, not a bid", () => {
    const s = solvePStar(point((p) => 50 + p), 25);
    expect(s.outcome).toBe("viableAtZero");
    expect(s.value).toBe(0);
    expect(s.admissibility).toBe("zeroPriceNotBid");
    const z = solvePStar(point((p) => 100 * p), 25);
    expect(z.outcome).toBe("viableAtZero");
    expect(z.roots).toHaveLength(1);
  });

  it("a positive first point after an unsupported gap is not a crossing", () => {
    const s = solvePStar(point((p) => (p < 10 ? null : 10 + p)), 25);
    expect(s.outcome).toBe("unresolvedPartialDomain");
    expect(s.coverage).toBe("partial");
    expect(s.admissibility).toBe("notApplicable");
  });

  it("no crossing on a complete domain; no supported candidate at all", () => {
    const s = solvePStar(point((p) => -100 - p), 25);
    expect(s.outcome).toBe("noCrossingInDomain");
    expect(s.sign).toBe("allNegative");
    const none = solvePStar(point(() => null), 25);
    expect(none.outcome).toBe("noSupportedCandidate");
    expect(none.coverage).toBe("partial");
  });

  it("an unfunded root stands with its mark; above the cap it is not admissible", () => {
    const s = solvePStar(point((p) => 100 * (p - 30.5), (p) => p < 18), 25);
    expect(s.outcome).toBe("found");
    expect(Math.abs(s.value! - 30.5)).toBeLessThanOrEqual(RESERVE.pStarBracket);
    expect(s.fundedAtValue).toBe(false);
    expect(s.admissibility).toBe("aboveAuctionCap");
  });

  it("a zero-price candidate that is short of cash is not viableAtZero", () => {
    const s = solvePStar(point((p) => 100 + p, (p) => p > 0), 25);
    expect(s.outcome).toBe("noCrossingInDomain");
    expect(s.sign).toBe("allPositive");
  });
});

describe("income-tax reversals keep the original assessment weights (spec §11, gate-3 finding)", () => {
  it("a Q4 reversal turns the year's earlier assessments into credits, oldest first, each with its own quarter", async () => {
    const { taxSchedule } = await import("@/bess/engine/ledger");
    const { TAX } = await import("@/bess/engine/registry");
    const cal = buildCalendar(0);
    const n = cal.months.length;
    const pbt = new Array(n).fill(0) as number[];
    const revenue = new Array(n).fill(0) as number[];
    const idx = (y: number, m: number) => cal.months.findIndex((x) => x.year === y && x.month === m);
    revenue[idx(2028, 6)] = 10 * TAX.annualFilerRevenueThresholdUah; // 2029 files quarterly
    revenue[idx(2029, 6)] = 10 * TAX.annualFilerRevenueThresholdUah; // and so does 2030
    pbt[idx(2029, 1)] = 1000; // Q1 assessment
    pbt[idx(2029, 4)] = 500; // Q2 assessment
    pbt[idx(2029, 10)] = -1200; // Q4 reversal of 1200 x rate
    pbt[idx(2030, 2)] = 5000; // a later due that uses the credits
    const t = taxSchedule(cal, pbt, revenue);
    const use = t.events.find((e) => e.y === 2030 && e.q === 1)!.uses;
    const r = TAX.citRate;
    expect(use.map((u) => [u.y, u.q])).toEqual([[2029, 1], [2029, 2]]);
    expect(use[0]!.amount).toBeCloseTo(1000 * r, 9);
    expect(use[1]!.amount).toBeCloseTo((1500 - 300) * r - 1000 * r, 9);
  });
});
