// Input validation before any run, whatever the origin (interface, shared link, stored session, export).
// The limits are sanity bounds of the engine; the interface uses narrower ranges inside them.
import { addMonths, addYears, isIsoDate, toDay } from "./dates";
import type { Inputs } from "./types";

export interface InputIssue {
  /** Path of the input, e.g. "project.financialClose". */
  path: string;
  message: string;
}

export class InvalidInputsError extends Error {
  readonly issues: InputIssue[];
  constructor(issues: InputIssue[]) {
    super(`Invalid inputs: ${issues.map((i) => `${i.path} — ${i.message}`).join("; ")}`);
    this.name = "InvalidInputsError";
    this.issues = issues;
  }
}

/** Dates the model covers: financial close from 2025 to 2032, the award announcement from 2023. */
export const DATE_LIMITS = {
  financialCloseMin: "2025-01-01",
  financialCloseMax: "2032-12-01",
  awardNoticeMin: "2023-01-01",
  awardNoticeMax: "2032-12-31",
} as const;

type Rule = [path: string, get: (i: Inputs) => number, min: number, max: number, integer?: boolean];

const RULES: Rule[] = [
  ["project.turbines", (i) => i.project.turbines, 1, 100, true],
  ["project.turbineMw", (i) => i.project.turbineMw, 0.5, 20],
  ["project.hubHeightM", (i) => i.project.hubHeightM, 50, 300],
  ["project.rotorDiameterM", (i) => i.project.rotorDiameterM, 50, 300],
  ["project.constructionMonths", (i) => i.project.constructionMonths, 3, 48, true],
  ["project.lifetimeYears", (i) => i.project.lifetimeYears, 10, 40, true],
  ["energy.referenceYieldHours", (i) => i.energy.referenceYieldHours, 1000, 6000],
  ["energy.siteQuality", (i) => i.energy.siteQuality, 0.3, 2],
  ["energy.availability", (i) => i.energy.availability, 0.5, 1],
  ["energy.otherExtraLosses", (i) => i.energy.otherExtraLosses, 0, 0.5],
  ["energy.degradationPerYear", (i) => i.energy.degradationPerYear, 0, 0.05],
  ["energy.sigma1y", (i) => i.energy.sigma1y, 0.01, 0.5],
  ["energy.sigma10y", (i) => i.energy.sigma10y, 0.01, 0.5],
  ["energy.negativePriceOutputShare", (i) => i.energy.negativePriceOutputShare, 0, 0.5],
  ["energy.negativePriceTimeShare", (i) => i.energy.negativePriceTimeShare, 0, 0.5],
  ["revenue.awardPriceCt", (i) => i.revenue.awardPriceCt, 0.1, 30],
  ["revenue.ceilingPriceCt", (i) => i.revenue.ceilingPriceCt, 0.1, 30],
  ["revenue.longTermBaseEurMwh2026", (i) => i.revenue.longTermBaseEurMwh2026, 0, 500],
  ["revenue.captureFactor", (i) => i.revenue.captureFactor, 0.1, 2],
  ["revenue.directMarketingCtKwh2026", (i) => i.revenue.directMarketingCtKwh2026, 0, 5],
  ["revenue.ppaEurMwh2026", (i) => i.revenue.ppaEurMwh2026, 0, 500],
  ["revenue.receivableDays", (i) => i.revenue.receivableDays, 0, 365],
  ["revenue.premiumTrueUpLagMonths", (i) => i.revenue.premiumTrueUpLagMonths, 0, 36, true],
  ["revenue.municipalCtKwh", (i) => i.revenue.municipalCtKwh, 0, 2],
  ["capex.contingencyPct", (i) => i.capex.contingencyPct, 0, 1],
  ["capex.vatRate", (i) => i.capex.vatRate, 0, 0.5],
  ["capex.vatRefundLagMonths", (i) => i.capex.vatRefundLagMonths, 0, 24, true],
  ["opex.leaseShareOfRevenue", (i) => i.opex.leaseShareOfRevenue, 0, 0.5],
  ["opex.leaseMinPerTurbine2026", (i) => i.opex.leaseMinPerTurbine2026, 0, 2_000_000],
  ["opex.decommissioningBondPerMeterHub", (i) => i.opex.decommissioningBondPerMeterHub, 0, 100_000],
  ["opex.guaranteeFeeRate", (i) => i.opex.guaranteeFeeRate, 0, 0.2],
  ["opex.decommissioningCostPerKw2026", (i) => i.opex.decommissioningCostPerKw2026, 0, 1000],
  ["opex.decommissioningReserveYears", (i) => i.opex.decommissioningReserveYears, 1, 20, true],
  ["opex.gridFeePerKw2026", (i) => i.opex.gridFeePerKw2026, 0, 100],
  ["financing.interestRate", (i) => i.financing.interestRate, 0, 0.3],
  ["financing.tenorYearsFromClose", (i) => i.financing.tenorYearsFromClose, 1, 40, true],
  ["financing.graceYears", (i) => i.financing.graceYears, 0, 20, true],
  ["financing.targetDscrP50", (i) => i.financing.targetDscrP50, 0.5, 5],
  ["financing.targetDscrP90", (i) => i.financing.targetDscrP90, 0.3, 5],
  ["financing.covenantDscr", (i) => i.financing.covenantDscr, 0.3, 5],
  ["financing.lockupDscr", (i) => i.financing.lockupDscr, 0.3, 5],
  ["financing.maxGearing", (i) => i.financing.maxGearing, 0, 1],
  ["financing.upfrontFeePct", (i) => i.financing.upfrontFeePct, 0, 0.1],
  ["financing.commitmentFeePerMonth", (i) => i.financing.commitmentFeePerMonth, 0, 0.05],
  ["financing.commitmentFeeStartMonth", (i) => i.financing.commitmentFeeStartMonth, 1, 48, true],
  ["financing.dsraMonths", (i) => i.financing.dsraMonths, 0, 24],
  ["financing.vatFacilitySpread", (i) => i.financing.vatFacilitySpread, 0, 0.1],
  ["tax.hebesatz", (i) => i.tax.hebesatz, 1, 10],
  ["tax.depreciationYears", (i) => i.tax.depreciationYears, 1, 50, true],
  ["macro.longRunInflation", (i) => i.macro.longRunInflation, -0.05, 0.2],
  ["macro.costOfEquity", (i) => i.macro.costOfEquity, -0.1, 0.5],
  ["macro.waccNominal", (i) => i.macro.waccNominal, -0.1, 0.5],
  ["macro.waccReal", (i) => i.macro.waccReal, -0.1, 0.5],
];

function checkNumber(issues: InputIssue[], path: string, v: unknown, min: number, max: number, integer = false) {
  if (typeof v !== "number" || !Number.isFinite(v)) issues.push({ path, message: "is not a number" });
  else if (integer && !Number.isInteger(v)) issues.push({ path, message: "must be a whole number" });
  else if (v < min - 1e-12 || v > max + 1e-12) issues.push({ path, message: `must lie between ${min} and ${max}` });
}

function checkDate(issues: InputIssue[], path: string, v: unknown, min: string, max: string, firstOfMonth = false) {
  if (typeof v !== "string" || !isIsoDate(v)) {
    issues.push({ path, message: "is not a valid date (YYYY-MM-DD)" });
    return false;
  }
  if (firstOfMonth && !v.endsWith("-01")) issues.push({ path, message: "must be the first day of a month" });
  if (v < min || v > max) issues.push({ path, message: `must lie between ${min} and ${max}` });
  return true;
}

/** All problems that stop a run. An empty list means the inputs can be calculated. */
export function validateInputs(i: Inputs): InputIssue[] {
  const issues: InputIssue[] = [];
  for (const [path, get, min, max, integer] of RULES) {
    let v: number;
    try {
      v = get(i);
    } catch {
      issues.push({ path, message: "is missing" });
      continue;
    }
    checkNumber(issues, path, v, min, max, integer);
  }
  const fcOk = checkDate(
    issues,
    "project.financialClose",
    i.project?.financialClose,
    DATE_LIMITS.financialCloseMin,
    DATE_LIMITS.financialCloseMax,
    true,
  );
  checkDate(issues, "revenue.awardNoticeDate", i.revenue?.awardNoticeDate, DATE_LIMITS.awardNoticeMin, DATE_LIMITS.awardNoticeMax);

  const list = <T,>(path: string, items: T[] | undefined, fn: (item: T, k: number) => void) => {
    if (!Array.isArray(items)) issues.push({ path, message: "is missing" });
    else items.forEach(fn);
  };
  list("capex.items", i.capex?.items, (it, k) => checkNumber(issues, `capex.items[${k}].eurPerKw`, it.eurPerKw, 0, 10_000));
  list("revenue.futuresEurMwh", i.revenue?.futuresEurMwh, (f, k) => {
    checkNumber(issues, `revenue.futuresEurMwh[${k}].year`, f.year, 2020, 2060, true);
    checkNumber(issues, `revenue.futuresEurMwh[${k}].value`, f.value, 0, 1000);
  });
  list("macro.inflation", i.macro?.inflation, (f, k) => {
    checkNumber(issues, `macro.inflation[${k}].year`, f.year, 2001, 2100, true);
    checkNumber(issues, `macro.inflation[${k}].value`, f.value, -0.1, 0.3);
  });
  for (const key of ["maintenancePerKw", "managementPerKw", "insurancePerKw", "otherPerKw"] as const) {
    const t = i.opex?.[key];
    if (!Array.isArray(t) || t.length !== 3) issues.push({ path: `opex.${key}`, message: "needs three values" });
    else t.forEach((v, k) => checkNumber(issues, `opex.${key}[${k}]`, v, 0, 500));
  }
  if (issues.length > 0) return issues;

  // Cross-field rules.
  const f = i.financing;
  if (f.graceYears >= f.tenorYearsFromClose) {
    issues.push({ path: "financing.graceYears", message: "the grace period must be shorter than the loan term" });
  }
  if (fcOk) {
    const fc = toDay(i.project.financialClose);
    const cod = addMonths(fc, i.project.constructionMonths);
    if (addYears(fc, f.graceYears) < cod) {
      const needed = Math.ceil(i.project.constructionMonths / 12);
      issues.push({
        path: "financing.graceYears",
        message: `repayment would start before commissioning; instalments during construction are not modelled — use at least ${needed} grace years`,
      });
    }
  }
  return issues;
}
