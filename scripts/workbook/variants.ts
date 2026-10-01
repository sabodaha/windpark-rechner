// The input sets in which Microsoft Excel recalculates the formula workbook (scripts/workbook/verify.ts), and the
// edits made in the file after a download. VERIFIED_VARIANTS (src/lib/workbook/verification.ts) quotes their number.
import { BASE_CASE, type Inputs } from "../../src/engine";
import { decodeInputs } from "../../src/lib/url-state";

const edit = (fn: (c: Inputs) => void): Inputs => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return c;
};

/** Switch variants: every value of every switch at least once, and the cases the reviews asked for. */
export const VARIANTS: Record<string, Inputs> = {
  base: BASE_CASE,
  gmbh: edit((c) => (c.tax.legalForm = "GmbH")),
  annuity: edit((c) => (c.financing.repayment = "annuity")),
  sculpted: edit((c) => (c.financing.repayment = "sculpted")),
  bankBase: edit((c) => (c.revenue.bankPriceBasis = "base")),
  twoSided: edit((c) => (c.revenue.twoSidedPremium = true)),
  ppa: edit((c) => (c.revenue.postEeg = "ppa")),
  noMunicipalAfter: edit((c) => (c.revenue.municipalAfterEeg = false)),
  equityFirst: edit((c) => (c.financing.equityFirst = true)),
  degressive: edit((c) => {
    c.tax.degressive = true;
    c.project.financialClose = "2026-04-01";
    c.revenue.awardNoticeDate = "2026-01-15";
    c.financing.graceYears = 2;
  }),
  south: edit((c) => {
    c.energy.southRegion = true;
    c.energy.siteQuality = 0.55;
  }),
  lowPrice: edit((c) => (c.revenue.longTermBaseEurMwh2026 = 50)),
  lockup: edit((c) => {
    c.revenue.longTermBaseEurMwh2026 = 55;
    c.financing.lockupDscr = 1.6;
  }),
  gearingCap: edit((c) => (c.financing.maxGearing = 0.3)),
  grace2: edit((c) => (c.financing.graceYears = 2)),
  fcJuly: edit((c) => (c.project.financialClose = "2027-07-01")),
  construction12: edit((c) => {
    c.project.constructionMonths = 12;
    c.financing.graceYears = 1;
  }),
  construction24: edit((c) => (c.project.constructionMonths = 24)),
  life30: edit((c) => (c.project.lifetimeYears = 30)),
  vatLag0: edit((c) => (c.capex.vatRefundLagMonths = 0)),
  vatLag6: edit((c) => (c.capex.vatRefundLagMonths = 6)),
  dsra6: edit((c) => (c.financing.dsraMonths = 6)),
  lag15: edit((c) => {
    c.revenue.premiumTrueUpLagMonths = 15;
    c.revenue.longTermBaseEurMwh2026 = 50;
  }),
  depYears30: edit((c) => (c.tax.depreciationYears = 30)),
  mixed: edit((c) => {
    c.tax.legalForm = "GmbH";
    c.financing.repayment = "sculpted";
    c.revenue.bankPriceBasis = "base";
    c.revenue.postEeg = "ppa";
    c.financing.equityFirst = true;
    c.revenue.municipalCtKwh = 0.5;
    c.opex.gridFeePerKw2026 = 5.5;
  }),
  // Second review (1 Oct 2026): no loan, no cash, negative returns, edges of the loan and of the model's scope.
  gmbhSculpted: edit((c) => {
    c.tax.legalForm = "GmbH";
    c.financing.repayment = "sculpted";
  }),
  zeroDebt: edit((c) => (c.financing.maxGearing = 0)),
  noCashDebt: edit((c) => {
    c.revenue.longTermBaseEurMwh2026 = 20;
    c.revenue.awardPriceCt = 2;
  }),
  closureGap: edit((c) => {
    c.opex.decommissioningCostPerKw2026 = 100;
    c.opex.decommissioningReserveYears = 1;
  }),
  unfundedTwoSided: edit((c) => {
    c.revenue.twoSidedPremium = true;
    c.opex.gridFeePerKw2026 = 50;
  }),
  negativeIrr: edit((c) => {
    c.revenue.awardPriceCt = 4.2;
    c.revenue.longTermBaseEurMwh2026 = 45;
    c.financing.maxGearing = 0.5;
  }),
  sculptedEdge: decodeInputs(
    "om1=22.4&om2=25.6&om3=28.16&mg1=6.4&mg2=8&mg3=8&in1=1.6&in2=1.6&in3=1.6&ot1=9.6&ot2=9.6&ot3=9.6&gridFee=4&repayment=sculpted&infLR=0.03",
    BASE_CASE,
  )!,
  lapsed: edit((c) => {
    c.revenue.awardNoticeDate = "2023-01-01";
    c.revenue.ceilingPriceCt = 8;
  }),
  unusual: edit((c) => {
    c.revenue.awardPriceCt = 7.6;
    c.revenue.awardNoticeDate = "2027-02-01";
    c.tax.hebesatz = 2.5;
    c.tax.degressive = true;
    c.financing.tenorYearsFromClose = 10;
    c.financing.graceYears = 3;
  }),
  penaltyLong: edit((c) => {
    c.revenue.awardNoticeDate = "2025-12-01";
    c.financing.tenorYearsFromClose = 26;
  }),
  interestBarrier: edit((c) => {
    c.revenue.awardPriceCt = 9.5;
    c.revenue.ceilingPriceCt = 10;
    c.financing.interestRate = 0.075;
    c.financing.maxGearing = 0.9;
    c.financing.targetDscrP50 = 1.1;
    c.financing.targetDscrP90 = 1;
    c.financing.covenantDscr = 1;
    c.financing.lockupDscr = 1.05;
    c.financing.repayment = "annuity";
    c.financing.tenorYearsFromClose = 20;
  }),
  construction40: edit((c) => {
    c.project.constructionMonths = 40;
    c.financing.graceYears = 4;
    c.financing.tenorYearsFromClose = 22;
  }),
  coe9: edit((c) => (c.macro.costOfEquity = 0.09)),
};

/**
 * Edits made in the file after the download: the base workbook with one input changed. "same": a valuation-only
 * edit, so every formula must give what the engine gives for the edited inputs (that variant's manifest). Without
 * it, the edit moves the loan: no formula may show an error, and the Checks sheet must ask for a re-solve.
 */
export const USER_EDITS: Record<string, { id: string; value: number; same?: string }> = {
  editCoe: { id: "in.coe", value: 0.09, same: "coe9" },
  editAward: { id: "in.award", value: 5.5 },
};
