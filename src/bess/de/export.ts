// The acceptance document of the German pack (fixtures/de-output.schema.json, de-output-v1): one per case, built from a
// run's operations and ledger. Model months are 1-based in the document (1 = 2027-02, the FC month).
import { toIso } from "@/engine/dates";
import type { DeResult, KResult, TStarResult } from "./index";
import { idxDE } from "./registry";

const ym = (i: number) => `${2027 + Math.floor((1 + i) / 12)}-${String(((1 + i) % 12) + 1).padStart(2, "0")}`;

export interface DeOutputExtras {
  caseId: string;
  resolvedInputs: Record<string, unknown>;
  library: Record<string, unknown>;
  tStar?: TStarResult | null;
  kSearch?: KResult | null;
}

/** Floating-point residue (|v| < 1e-6, at or below every tolerance) is written as 0, so sign constraints of the schema
 *  hold for amounts that are zero in exact arithmetic. */
function clean(v: unknown): unknown {
  if (typeof v === "number") return Math.abs(v) < 1e-6 ? 0 : v;
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, clean(val)]));
  return v;
}

export function toDeOutput(r: DeResult, x: DeOutputExtras): Record<string, unknown> {
  return clean(buildDeOutput(r, x)) as Record<string, unknown>;
}

function buildDeOutput(r: DeResult, x: DeOutputExtras): Record<string, unknown> {
  const status = {
    primary: r.status.primary,
    reasons: r.status.reasons,
    checks: r.checks.map((c) => ({ id: c.id, group: c.group, status: c.status, value: c.value ?? null })),
    failedChecks: r.checks.filter((c) => c.status === "fail").map((c) => c.id),
    funding: r.funding ? { mode: r.lender ? "sized" : r.funding.sizingStatus === "noDebt" ? "noDebt" : "locked", converged: r.funding.sizingStatus !== "failed", iterations: r.funding.iterations } : undefined,
  };
  const head = { schema: "de-output-v1", case: x.caseId, spec: "R2.4", library: x.library, resolvedInputs: x.resolvedInputs, status };
  if (r.status.primary === "inputUnsupported" || !r.cal || !r.ops || !r.ledger) return head;
  const cal = r.cal;
  const ops = r.ops.months;
  const led = r.ledger;
  const months = cal.months.map((m, i) => {
    const o = ops[i]!;
    const l = led.months[i]!;
    return {
      month: ym(i), index: i + 1, year: m.year, days: m.days, phase: m.phase, idx: idxDE(m.year),
      s: o.s, availability: o.availability, usableMWhOpen: o.usableMWhOpen, usableHours: o.usableHours, contractUsableMWh: o.contractUsableMWh,
      sohInitial: o.sohInitial, sohAugmentation: o.sohAugmentation, spreadM: o.spreadM, levelShiftA: o.levelShiftA, importFee: o.importFee,
      libraryHoursNodeLow: null, marketChargeMWh: o.marketChargeMWh, marketDischargeMWh: o.marketDischargeMWh, tollerDischargeMWh: o.tollerDischargeMWh,
      dischargeMWh: o.dischargeMWh, efcInitial: o.efcInitial, efcAugmentation: o.efcAugmentation,
      salesEur: o.salesEur, purchasesEur: o.purchasesEur, marginEur: o.marginEur, capturedEur: o.capturedEur, optimiserFeeEur: o.optimiserFeeEur,
      marketNetEur: o.marketNetEur, availabilityFactor: o.availabilityFactor, capacityFactor: o.capacityFactor, tollFeeAccruedEur: o.tollFeeAccruedEur,
      tollReceiptsEur: l.tollReceiptsEur, arTollCloseEur: l.arTollCloseEur,
      omEur: o.omEur, insuranceEur: o.insuranceEur, leaseEur: o.leaseEur, meteringEur: o.meteringEur, adminEur: o.adminEur, avalEur: o.avalEur,
      auxChargesEur: o.auxChargesEur, agnesEur: o.agnesEur, opexTotalEur: o.opexTotalEur,
      augmentationEur: o.augmentationEur, pcsOverhaulEur: o.pcsOverhaulEur, decommissioningEur: o.decommissioningEur,
      capexDcEur: l.capexDcEur, capexPcsEur: l.capexPcsEur, capexBopEur: l.capexBopEur, capexSubstationEur: l.capexSubstationEur,
      capexBkzEur: l.capexBkzEur, capexDevelopmentEur: l.capexDevelopmentEur, capexContingencyEur: l.capexContingencyEur, capexTotalEur: l.capexTotalEur,
      vatPaidEur: l.vatPaidEur, vatRefundEur: l.vatRefundEur, vatReceivableCloseEur: l.vatReceivableCloseEur,
      revenueEur: l.revenueEur, ebitdaEur: l.ebitdaEur, afaEur: l.afaEur, interestExpenseEur: l.interestExpenseEur, ebtEur: l.ebtEur,
      taxExpenseEur: l.taxExpenseEur, netIncomeEur: l.netIncomeEur,
      kstPaidEur: l.kstPaidEur, soliPaidEur: l.soliPaidEur, gewPaidEur: l.gewPaidEur,
      kstPayableCloseEur: l.kstPayableCloseEur, soliPayableCloseEur: l.soliPayableCloseEur, gewPayableCloseEur: l.gewPayableCloseEur,
      equityEur: l.equityEur, drawdownEur: l.drawdownEur, idcEur: l.idcEur, upfrontFeeEur: l.upfrontFeeEur, commitmentFeeEur: l.commitmentFeeEur,
      interestDueEur: l.interestDueEur, principalDueEur: l.principalDueEur, interestPaidEur: l.interestPaidEur, principalPaidEur: l.principalPaidEur,
      capitalisedInterestEur: l.capitalisedInterestEur, dsraDrawStartEur: l.dsraDrawStartEur, dsraToCashStartEur: l.dsraToCashStartEur,
      cashToDsraStartEur: l.cashToDsraStartEur, finalInterestDueEur: l.finalInterestDueEur, finalPrincipalDueEur: l.finalPrincipalDueEur,
      finalInterestPaidEur: l.finalInterestPaidEur, finalPrincipalPaidEur: l.finalPrincipalPaidEur, finalCapitalisedInterestEur: l.finalCapitalisedInterestEur,
      debtCloseEur: l.debtCloseEur, scheduledDebtCloseEur: l.scheduledDebtCloseEur,
      interestPayableCloseEur: l.interestPayableCloseEur, dsraPostEur: l.dsraPostEur, dsraReleaseEur: l.dsraReleaseEur, dsraCloseEur: l.dsraCloseEur,
      liquidityPostEur: l.liquidityPostEur, liquidityReleaseEur: l.liquidityReleaseEur, liquidityCloseEur: l.liquidityCloseEur,
      cfadsEur: l.cfadsEur, bucketCEur: l.bucketCEur, bucketMEur: l.bucketMEur, distributionEur: l.distributionEur, cashCloseEur: l.cashCloseEur,
      fixedAssetsNetCloseEur: l.fixedAssetsNetCloseEur, capitalReserveCloseEur: l.capitalReserveCloseEur,
      retainedEarningsCloseEur: l.retainedEarningsCloseEur, bookNetAssetsCloseEur: l.bookNetAssetsCloseEur,
    };
  });
  const calendar = {
    fc: ym(0), contractualCod: ym(cal.plannedCodIndex), actualCod: ym(cal.codIndex),
    tollFirstMonth: cal.tollFirst === null ? null : ym(cal.tollFirst), tollLastMonth: cal.tollLast === null ? null : ym(cal.tollLast),
    lastTollReceiptMonth: cal.tollLast === null ? null : ym(cal.tollLast + 1), augmentationMonth: ym(cal.augmentationIndex),
    pcsOverhaulMonth: ym(cal.pcsOverhaulIndex), lastOperatingMonth: ym(cal.eolIndex - 1), lastSettlementMonth: ym(cal.months.length - 1),
    liquidationPaymentDate: toIso(cal.liquidationDay), grandfatheringApplied: cal.grandfatheringApplied,
    liquidityReserveTopUpMonth: cal.tollLast === null ? null : ym(cal.tollLast + 1),
  };
  const period = (p: (typeof led.periods)[number], budget: number | null) => ({
    paymentDate: toIso(p.day), openingEur: p.openingEur, interestDueEur: p.interestDueEur, scheduledPrincipalEur: p.scheduledPrincipalEur,
    scheduledInterestEur: p.scheduledInterestEur, paidInterestEur: p.paidInterestEur, paidPrincipalEur: p.paidPrincipalEur, shortfallEur: p.shortfallEur,
    closingEur: p.closingEur,
    cfadsEur: p.cfadsEur, cfadsCEur: p.cfadsCEur, cfadsMEur: p.cfadsMEur, debtServiceEur: p.debtServiceEur, dscr: p.dscr, budgetEur: budget,
    dsraTargetEur: p.dsraTargetEur,
  });
  const inp = r.inputs;
  const budget = (c: number, m: number) => Math.max(0, Math.max(c, 0) / inp.targetDscrContracted + Math.max(m, 0) / inp.targetDscrMerchant - Math.max(-c, 0) - Math.max(-m, 0));
  const D = r.funding?.debtEur ?? 0;
  const k = r.kpis!;
  const v = (name: string) => k[name]?.value ?? null;
  const irr = (name: string) => ({ value: k[name]!.value, status: k[name]!.status, roots: k[name]!.roots ?? [] });
  return {
    ...head,
    market: r.market,
    calendar,
    months,
    years: led.years,
    assets: led.assets.map((a) => ({
      id: a.id, class: a.class, directEur: a.directEur, allocatedEur: a.allocatedEur, baseEur: a.baseEur, startMonth: ym(a.startIndex),
      lifeYears: a.lifeYears, monthlyEur: a.monthlyEur, afaByYear: Object.fromEntries(Object.entries(a.afaByYear).map(([y, val]) => [String(y), val])),
      residualWriteOffEur: a.residualWriteOffEur, residualMonth: ym(a.residualIndex),
    })),
    debt: D > 0
      ? { amountEur: D, usesExVatEur: led.usesExVatEur, initialDsraEur: r.funding!.dsraInitialEur, periods: led.periods.map((p) => period(p, null)) }
      : null,
    lender: r.lender ? { periods: r.lender.ledger.periods.map((p) => period(p, budget(p.cfadsCEur, p.cfadsMEur))) } : null,
    investorFlows: led.investorFlows.map((f) => ({ date: toIso(f.day), amountEur: f.amount, kind: f.kind })),
    distributions: led.distributions.map((d) => ({
      date: toIso(d.day), freeCashEur: d.freeCashEur, bookNetAssetsEur: d.bookNetAssetsEur, section30CapacityEur: d.section30CapacityEur,
      paidEur: d.paidEur, debtEur: d.debtEur, scheduledDebtEur: d.scheduledDebtEur, completedPeriods: d.completedPeriods, lastTwoDscr: d.lastTwoDscr,
      dsraEur: d.dsraEur, dsraTargetEur: d.dsraTargetEur, liquidityEur: d.liquidityEur, liquidityTargetEur: d.liquidityTargetEur,
      forecastHoldbackEur: d.forecastHoldbackEur, cappedBy: d.cappedBy,
    })),
    kpis: {
      investorIrr: irr("investorIrr"), investorNpvEur: v("investorNpvEur"), investorNpvComparisonEur: v("investorNpvComparisonEur"),
      projectIrrPreTax: irr("projectIrrPreTax"), projectIrrPostTax: irr("projectIrrPostTax"), projectNpvPostTaxEur: v("projectNpvPostTaxEur"),
      dscrMin: v("dscrMin"), dscrAvg: v("dscrAvg"), lenderDscrMin: v("lenderDscrMin"), llcr: v("llcr"), debtEur: v("debtEur"), gearing: v("gearing"),
      lcosEurPerMWh: v("lcosEurPerMWh"), revenue2029PerMwEur: v("revenue2029PerMwEur"), paybackYears: v("paybackYears"),
      liquidationPayoutEur: v("liquidationPayoutEur"),
    },
    tStar: x.tStar ?? null,
    kSearch: x.kSearch ?? null,
  };
}
