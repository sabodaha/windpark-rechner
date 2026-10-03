// v1.1a acceptance export (spec v1.1 R3 §16): resolves every case of the fixtures' v11a-cases.json, runs it and writes
// one JSON document per case in the output contract (fixtures/v11a-output.schema.json), plus the resolved inputs of all
// cases. The documents are the engine side of gate 3; they are never shown to the independent reference before its own
// outputs are frozen.
// Usage: npx tsx scripts/bess/run-v11a.ts <fixturesDir> <outDir> [--resolved-only] [--only=E01,S06]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BESS_BASE, contractBreakEven, contractCmax, parseLibrary, runBess, type BessInputs, type BessResult, type ContractInputs, type LibraryManifest,
  type LockedFunding,
} from "../../src/bess/engine";
import { buildCalendar } from "../../src/bess/engine/calendar";
import { buildCapex } from "../../src/bess/engine/capex";
import { periodBudget } from "../../src/bess/engine/funding";
import { CONTRACT_DEFAULTS, CONTRACT_PRESET_MW } from "../../src/bess/engine/registry";
import { FLOW_KEYS } from "../../src/bess/engine/reserve-ledger";
import { recoveryHours } from "../../src/bess/engine/reserves";

const [fixturesDir, outDir] = process.argv.slice(2);
if (!fixturesDir || !outDir) throw new Error("usage: run-v11a.ts <fixturesDir> <outDir>");
const resolvedOnly = process.argv.includes("--resolved-only");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
const bin = readFileSync("public/bess/ua-library-v2.bin");
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const library = { version: manifest.version, binSha256: sha("public/bess/ua-library-v2.bin"), manifestSha256: sha("public/bess/ua-library-v2.json") };

interface CaseDef {
  id: string;
  reference?: string;
  funding?: string;
  lowerNode?: boolean;
  inputs?: Partial<BessInputs>;
  contract?: Record<string, unknown>;
  pStar?: boolean;
  expect: { primary: string; reasons?: string[]; pStarOutcome?: string };
}
const casesDoc = JSON.parse(readFileSync(join(fixturesDir, "v11a-cases.json"), "utf-8")) as { cases: CaseDef[] };

const cal0 = buildCalendar(0);
/** Month index 0 is the FC month 2027-02 in every calendar (a COD slip only lengthens it). */
const ym = (i: number) => `${2027 + Math.floor((1 + i) / 12)}-${String(((1 + i) % 12) + 1).padStart(2, "0")}`;
const indexOf = (s: string) => {
  const [y, mo] = s.split("-").map(Number) as [number, number];
  return (y - 2027) * 12 + (mo - 2);
};

// --- the resolver contract (fixtures, resolver): base, contract defaults, overrides
const V1_KEYS = Object.keys(BESS_BASE) as (keyof BessInputs)[];
function canonicalContract(engine: ContractInputs): Record<string, unknown> {
  return {
    enabled: engine.enabled, product: engine.product ?? "aFRR-symmetric", acceptedMW: engine.acceptedMW, eurPerMWHour: engine.eurPerMWHour,
    auctionMonth: ym(engine.auctionMonthOffset), originalStart: ym(cal0.plannedCodIndex + engine.startOffsetFromCod), tenorMonths: engine.tenorMonths,
    certificateDay: 15, sustainHours: engine.sustainHours, recoveryPowerShare: engine.recoveryPowerShare, peakDayFactor: engine.peakDayFactor,
    activationRate: [engine.activationUp, engine.activationDown], nettingShare: engine.nettingShare,
    balancingPremium: [engine.balancingPremiumUp, engine.balancingPremiumDown], settlementRegime: engine.settlementRegime,
    balancingLagMonths: engine.balancingLagMonths, balancingCollection: engine.balancingCollection, asPaymentLagMonths: engine.asPaymentLagMonths,
    liquidityDays: engine.liquidityDays, failureEvents: engine.failureEvents, penaltyHours: engine.penaltyHours, bsFeeShare: engine.bsFeeShare,
    contractOnHit: engine.onHit, otherLossRate: engine.otherLossRate, standingLoadShare: engine.standingLoadShare, deductibility: engine.deductible,
    renewal: engine.renewal, renewalPrice: engine.renewalPrice, renewalTenorMonths: engine.renewalTenorMonths,
  };
}
function engineContract(durationH: 1 | 2 | 4, over: Record<string, unknown>): ContractInputs {
  const c: ContractInputs = { ...CONTRACT_DEFAULTS, acceptedMW: CONTRACT_PRESET_MW[durationH] };
  // the registry's dependent default (spec §17): p_ren = p_c unless the case sets the renewal price itself (R3-03)
  if (!("renewalPrice" in over) && "eurPerMWHour" in over) c.renewalPrice = over.eurPerMWHour as number;
  const set = c as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    if (k === "activationRate") { const [u, d] = v as [number, number]; c.activationUp = u; c.activationDown = d; }
    else if (k === "balancingPremium") { const [u, d] = v as [number, number]; c.balancingPremiumUp = u; c.balancingPremiumDown = d; }
    else if (k === "contractOnHit") c.onHit = v as ContractInputs["onHit"];
    else if (k === "deductibility") c.deductible = v as boolean;
    else if (k === "auctionMonth") c.auctionMonthOffset = indexOf(v as string);
    else if (k === "originalStart") c.startOffsetFromCod = indexOf(v as string) - cal0.plannedCodIndex;
    else if (k === "sustainHours") c.sustainHours = v as number;
    else set[k] = v;
  }
  return c;
}
function resolve(d: CaseDef) {
  const v1 = { ...BESS_BASE, ...(d.inputs ?? {}) } as BessInputs;
  const enabled = d.contract?.enabled !== false;
  const engine: BessInputs = enabled ? { ...v1, contract: engineContract(v1.durationH, d.contract ?? {}) } : v1;
  const canonical = {
    v1: Object.fromEntries(V1_KEYS.map((k) => [k, v1[k]])),
    contract: enabled ? canonicalContract(engine.contract!) : null,
    run: { funding: d.funding ?? "sized", lowerNode: d.lowerNode ?? false, pStar: d.pStar ?? false },
  };
  return { canonical, engine };
}

// --- serialisation of one run
type Row = Record<string, unknown>;
function monthRows(r: BessResult): Row[] {
  const t = r.trace!;
  const plan = t.plan!;
  return t.ops.months.map((o) => {
    const m = t.cal.months[o.index]!;
    const rm = o.reserve;
    const z0 = (v: number | undefined) => v ?? 0;
    return {
      month: ym(o.index), phase: m.phase, award: plan.awardOf[o.index] ?? "", exitOrigin: plan.exitOrigin[o.index] ?? "",
      W: plan.window[o.index] ?? 0, H: z0(rm?.H), A: z0(rm?.A), fxUahPerEur: o.fx,
      S: plan.S[o.index] ?? 0, R: plan.R[o.index] ?? 0, released: plan.released[o.index] ?? 0, Zplus: plan.Zplus[o.index] ?? 0, Z: plan.Z[o.index] ?? 0,
      hitLoss: plan.hitLoss[o.index] ?? 0, otherLoss: plan.otherLoss[o.index] ?? 0, exitMass: plan.exitMass[o.index] ?? 0,
      sigmaP: z0(rm?.sigmaP), sigmaE: rm && Number.isFinite(rm.sigmaE) ? rm.sigmaE : null, sigmaStar: rm && Number.isFinite(rm.sigmaStar) ? rm.sigmaStar : null,
      sigma: z0(rm?.sigma), tau: z0(rm?.tau), sigmaA: rm ? rm.sigmaA : 1,
      usableHours: o.usableHours, sohInitial: o.sohInitial,
      daImportMWh: o.importMWh, daExportMWh: o.exportMWh, daSalesUah: o.salesUah, daPurchasesUah: o.purchasesUah, auxMWh: o.auxMWh,
      U: z0(rm?.U), Dn: z0(rm?.Dn), K: z0(rm?.K), Uset: z0(rm?.Uset), Dset: z0(rm?.Dset),
      Bfill: z0(rm?.Bfill), Broutine: z0(rm?.Broutine), Xroutine: z0(rm?.Xroutine), Xexit: z0(rm?.Xexit), B: z0(rm?.B), X: z0(rm?.X), J: z0(rm?.J),
      exitQueue: z0(rm?.exitQueue), Iopen: z0(rm?.Iopen), Iclose: z0(rm?.Iclose), standingMWh: z0(rm?.standingMWh),
      meterImportMWh: o.importMWh + o.auxMWh + z0(rm?.Dn) + z0(rm?.B) + z0(rm?.standingMWh), meterExportMWh: o.exportMWh + z0(rm?.U) + z0(rm?.X),
      // G3-05: Q is the battery's constant daily quota in every row
      quota: rm ? rm.quota : { Q: r.inputs.cycleCap * buildCapex(r.inputs.powerMW, r.inputs.durationH, r.inputs.connection, r.inputs.capexFactor).usableAcMWh, a: [0, 0], b: [0, 0], fill: [0, 0], exitQuota: [0, 0], exitPower: [0, 0] },
      energyPriceUah: z0(rm?.energyPriceUah), capacityUah: z0(rm?.capacityUah), upEnergyUah: z0(rm?.upEnergyUah), downEnergyUah: z0(rm?.downEnergyUah),
      restorationPurchaseUah: z0(rm?.restorationPurchaseUah), restorationSaleUah: z0(rm?.restorationSaleUah), fillPurchaseUah: z0(rm?.fillPurchaseUah),
      exitSaleUah: z0(rm?.exitSaleUah), basisAddUah: z0(rm?.basisAddUah), basisReleaseUah: z0(rm?.basisReleaseUah), basisWriteOffUah: z0(rm?.basisWriteOffUah),
      basisCloseUah: z0(rm?.basisCloseUah), penaltyAsUah: z0(rm?.penaltyAsUah), penaltyBsUah: z0(rm?.penaltyBsUah), standingLoadUah: z0(rm?.standingLoadUah),
      recertUah: z0(rm?.recertUah), moFeeUah: z0(rm?.moFeeUah), moFeeExitUah: z0(rm?.moFeeExitUah), levyUah: z0(rm?.levyUah), levyExitUah: z0(rm?.levyExitUah),
      levyUpUah: z0(rm?.levyUpUah), networkTotalUah: o.tariffUah, networkDaUah: rm ? rm.networkDaUah : o.tariffUah, networkServiceUah: rm ? rm.networkServiceUah : o.tariffUah,
      vatNetCUah: t.ledger.reserve!.vatNet.C[o.index]!, vatNetMUah: t.ledger.reserve!.vatNet.M[o.index]!,
    };
  });
}
function accountRows(r: BessResult): Row[] {
  const t = r.trace!;
  const rl = t.ledger.reserve!;
  return t.cal.months.map((m, i) => ({
    month: ym(i),
    ...Object.fromEntries(FLOW_KEYS.map((k) => [`${k}Uah`, rl.flows[k][i]!])),
    vatPaymentUah: rl.vatPayment[i]!, vatEntryCUah: rl.vatEntry.C[i]!, vatEntryMUah: rl.vatEntry.M[i]!,
    vatCreditWrittenOffUah: i === t.cal.months.length - 1 ? rl.vatCreditWrittenOff.C + rl.vatCreditWrittenOff.M : 0,
    equityCallUah: rl.equityCall[i]!, reserveOperatingCashUah: rl.cash[i]!, reservePnlUah: rl.pnl[i]!,
    balances: {
      escrowUah: rl.escrow[i]!, liquidityUah: rl.liquidity[i]!, arAsUah: rl.arAs[i]!, arBspUah: rl.arBsp[i]!, apAsUah: rl.apAs[i]!, apBspUah: rl.apBsp[i]!,
      vatPositionUah: rl.vat[i]!, inventoryBasisUah: rl.inventory[i]!, inventoryMWh: t.ops.months[i]!.reserve?.Iclose ?? 0,
    },
  }));
}
function bucketRows(r: BessResult): { monthly: Row[]; periods: Row[] } {
  const t = r.trace!;
  const rl = t.ledger.reserve!;
  const L = t.ledger;
  const monthly = t.cal.months.map((m, i) => {
    const company = L.monthly.opCashUah[i]! - L.monthly.taxPaidUah[i]!;
    const contract = L.contractCfadsUah[i]!;
    return {
      month: ym(i), fxUahPerEur: L.monthly.fx[i]!,
      contractLineCashUah: rl.lineCash.C[i]!, merchantLineCashUah: rl.lineCash.M[i]!, contractAllocationCashUah: rl.allocationCashC[i]!,
      contractTaxUah: rl.contractCash[i]! - contract, contractCfadsUah: contract, companyCfadsUah: company, merchantCfadsUah: company - contract,
      contractEbitdaUah: rl.contractEbitda[i]!, companyOperatingPnlUah: L.pnlMonthlyUah.operating[i]!, merchantEbitdaUah: L.pnlMonthlyUah.operating[i]! - rl.contractEbitda[i]!,
      sigmaZ: rl.sigmaZ[i]!,
    };
  });
  const periods = L.periods.map((p) => ({
    date: new Date(p.day * 86400000).toISOString().slice(0, 10), cfadsEur: p.cfadsEur, cfadsContractEur: p.cfadsContractEur,
    cfadsMerchantEur: p.cfadsEur - p.cfadsContractEur, budgetEur: periodBudget(p.cfadsEur, p.cfadsContractEur, r.inputs.targetDscr),
    debtServiceEur: p.debtServiceEur, dscr: p.dscr,
  }));
  return { monthly, periods };
}
function contractBlock(r: BessResult): Row | null {
  const t = r.trace!;
  const plan = t.plan;
  if (!plan) return null;
  const c = plan.c;
  return {
    delay: plan.delay, cancelled: plan.cancelled, originalStart: ym(plan.originalStart),
    effectiveStart: plan.cancelled ? null : ym(plan.effectiveStart), fillMonth: plan.cancelled ? null : ym(plan.fillIndex),
    lastService: plan.cancelled ? null : ym(plan.lastService), Send: plan.Send,
    awards: plan.awards.map((a) => ({ tag: a.tag, auctionMonth: ym(a.auctionIndex), start: ym(a.start), endExclusive: ym(a.endExclusive), eurPerMWHour: a.eurPerMWHour, capEur: a.capEur, bidUah: Math.round(a.eurPerMWHour * (1339.82 / a.capEur) * 100) / 100 })),
    recertMonths: plan.recertIndex.map(ym), recoveryHours: recoveryHours(c, r.inputs.rte),
    piHit: plan.piHit, outageDerate: plan.outageDerate,
    escrowUah: t.ledger.reserve!.flows.escrowPost.reduce((a, v) => a + v, 0),
    liquidityReserveUah: t.ledger.reserve!.flows.liquidityPost.reduce((a, v) => a + v, 0),
    vatCreditWrittenOffUah: t.ledger.reserve!.vatCreditWrittenOff,
  };
}
const kpiBlock = (r: BessResult) => ({
  ...Object.fromEntries(Object.entries(r.kpis).map(([k, m]) => [k, {
    value: m.value !== null && Number.isFinite(m.value) ? m.value : null, status: m.status,
    ...(/Irr/.test(k) && { roots: m.roots ?? [] }),
  }])),
  ...(r.contract && { bridge2029PerMW: r.contract.bridge2029PerMW, contractShare: r.contract.contractShare }),
});
/** Funding of the case (G3-03: a rejected case carries the not-run wrapper, never a financing result). */
const fundingBlock = (r: BessResult, mode: string) => (r.status.primary === "inputUnsupported" || r.status.primary === "physicallyUnsupported"
  ? { mode, sizingStatus: "noDebt", iterations: 0, debtEur: 0, dsraInitialEur: 0, liquidityReserveUah: 0, principalEur: [], unfunded: false }
  : {
    mode, sizingStatus: r.funding.sizingStatus, iterations: r.funding.iterations, debtEur: r.funding.debtEur, dsraInitialEur: r.funding.dsraInitialEur,
    liquidityReserveUah: r.funding.liquidityReserveUah, principalEur: r.funding.principalEur,
    unfunded: r.checks.some((c) => c.id === "cashNonNegative" && c.status === "fail"),
  });

// --- run every case in dependency order (locked funding needs its source first)
mkdirSync(outDir, { recursive: true });
const resolved: Record<string, unknown> = { base: { v1: Object.fromEntries(V1_KEYS.map((k) => [k, BESS_BASE[k]])), contractDefaults: canonicalContract({ ...CONTRACT_DEFAULTS }) } };
const fundingOf = new Map<string, LockedFunding>();
const summary: Row[] = [];
const needed = only ? new Set([...only, ...casesDoc.cases.filter((x) => only.includes(x.id) && x.funding?.startsWith("locked:")).map((x) => x.funding!.slice(7))]) : null;
const ordered = [...casesDoc.cases].sort((a, b) => Number((a.funding ?? "").startsWith("locked")) - Number((b.funding ?? "").startsWith("locked")));
for (const d of ordered) {
  const { canonical, engine } = resolve(d);
  resolved[d.id] = canonical;
  if (resolvedOnly || (needed && !needed.has(d.id))) continue;
  const mode = d.funding ?? "sized";
  const opts: Parameters<typeof runBess>[2] = { trace: true, detail: true, lowerNode: d.lowerNode ?? false };
  if (mode.startsWith("locked:")) {
    const src = fundingOf.get(mode.slice(7));
    if (!src) throw new Error(`${d.id}: funding source ${mode} not run yet`);
    opts.funding = src;
  }
  const t0 = Date.now();
  const r = runBess(engine, lib, opts);
  fundingOf.set(d.id, r.funding);
  const p = r.status.primary;
  const contractCase = !!engine.contract;
  const full = contractCase && (p === "ok" || p === "cancelled" || p === "calcError");
  const physical = contractCase && p === "physicallyUnsupported";
  let lender: Row | null = null;
  // the lender trace of every supported contract case that sizes a positive debt (the schema's presence rule)
  if ((p === "ok" || p === "cancelled") && contractCase && mode === "sized" && r.funding.debtEur > 0) {
    const lr = runBess({ ...r.trace!.lenderInputs, scenario: "low" }, lib, { trace: true, funding: r.funding, lowerNode: true });
    const gap = Math.max(...lr.periods.map((q, k) => Math.abs(q.cfadsEur - (r.lenderPeriods[k]?.cfadsEur ?? NaN))));
    // the lender case runs on the lower library node (G3-15: the metadata says so)
    lender = { inputs: resolve({ ...d, lowerNode: true, inputs: { ...(d.inputs ?? {}), scenario: "low" }, contract: { ...(d.contract ?? {}), renewal: false, balancingPremium: [0, 0] } }).canonical, consistencyWithSizingEur: gap, status: lr.status, months: monthRows(lr), accounts: accountRows(lr), buckets: bucketRows(lr) };
  }
  const doc = {
    schema: "v11a-output-R3.1", case: d.id, spec: "R3.1", library, resolvedInputs: canonical,
    status: {
      primary: p, reasons: r.status.reasons, returnsMeaningful: r.returnsMeaningful, funding: fundingBlock(r, mode),
      failedChecks: r.checks.filter((c) => c.status === "fail").map((c) => c.id),
      checks: r.checks.map((c) => ({ id: c.id, group: c.group, status: c.status, value: c.value === undefined || !Number.isFinite(c.value) ? null : c.value, ...(c.note && { note: c.note }) })),
    },
    contract: contractCase && p !== "inputUnsupported" ? contractBlock(r) : null,
    months: full || physical ? monthRows(r) : null,
    accounts: full ? accountRows(r) : null,
    buckets: full ? bucketRows(r) : null,
    kpis: p === "ok" || p === "cancelled" ? kpiBlock(r) : null,
    lender,
    pStar: d.pStar ? contractBreakEven(engine, lib) : null,
    info: d.id === "U02" ? { cMaxOfThisBattery: contractCmax(engine, lib), note: "reported beside the rejected award; it does not replace it" } : null,
  };
  writeFileSync(join(outDir, `${d.id}.json`), JSON.stringify(doc));
  const expectOk = d.expect.primary === p && (!d.expect.reasons || d.expect.reasons.every((x) => r.status.reasons.includes(x))) && (!d.expect.pStarOutcome || (doc.pStar as { outcome?: string } | null)?.outcome === d.expect.pStarOutcome);
  // the index derives from the serialized document: a rejected case shows no financing (gate 3, round 2)
  const docKpis = doc.kpis as Record<string, { value: number | null }> | null;
  summary.push({ id: d.id, primary: p, reasons: r.status.reasons, expectOk, ms: Date.now() - t0, investorNpv: docKpis?.investorNpv?.value ?? null, debtEur: (doc.status.funding as { debtEur: number }).debtEur, lenderGapEur: lender?.consistencyWithSizingEur ?? null, pStar: d.pStar ? (doc.pStar as { outcome: string; value: number | null }) : null });
  console.log(d.id.padEnd(8), p.padEnd(22), expectOk ? "as expected" : `EXPECTED ${d.expect.primary} ${d.expect.reasons ?? ""}`, `${Date.now() - t0} ms`);
}
writeFileSync(join(fixturesDir, "v11a-resolved-inputs.json"), JSON.stringify({ version: "resolved inputs of v11a-cases.json for spec R3.1", generatedBy: "site-bess scripts/bess/run-v11a.ts (resolver only; no results)", cases: resolved }, null, 1));
if (!resolvedOnly) writeFileSync(join(outDir, "_summary.json"), JSON.stringify(summary, null, 1));
console.log(resolvedOnly ? "resolved inputs written" : `${summary.length} cases; unexpected: ${summary.filter((s) => !s.expectOk).map((s) => s.id).join(", ") || "none"}`);
