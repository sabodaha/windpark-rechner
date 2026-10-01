// Workbook sheets: Inputs, Timing and Construction.
import { CORRECTION_FACTOR_TABLE, DOWNSIDE, P90_Z, TAX, type ModelResult } from "@/engine";
import { toDay, toIso } from "@/engine/dates";
import {
  AWARD_LAPSE_MONTHS,
  AWARD_PENALTY_MONTHS,
  MUNICIPAL_REFUND_CAP_CT,
  NEGATIVE_PRICE_COUNT_YEARS,
  SITE_REVIEW_THRESHOLD,
  SITE_REVIEW_YEARS,
  SUPPORT_YEARS,
} from "@/engine/eeg";
import { AVAILABILITY_IN_SITE_YIELD, KFW_DRAWDOWN_MAX_MONTHS, KFW_VARIANTS, MIN_DEBT_SERVICE, profileWeights } from "@/engine/model";
import { corporateTaxRate } from "@/engine/tax";
import { addMonthsDay, addYearsDay, COLS_PERIOD, cumulative, MONEY, xd, type Env } from "./common";
import { blank, period, scalar, text, type Ctx, type Row, type SheetDef } from "./grid";
import type { CellValue, Fmt } from "./ooxml";

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

export function inputsSheet(e: Env): SheetDef {
  const i = e.i;
  const g = e.grid;
  const b = e.base;
  const rows: Row[] = [];
  const inp = (id: string, label: string, v: CellValue, unit: string, fmt: Fmt = "general", note?: string, list?: string[]) =>
    rows.push(scalar(`in.${id}`, label, undefined, v, { unit, fmt, role: "input", note, list }));
  const BOOL = ["TRUE", "FALSE"];
  const k = (id: string, label: string, v: CellValue, unit: string, fmt: Fmt = "general", note?: string) =>
    rows.push(scalar(`k.${id}`, label, undefined, v, { unit, fmt, role: "calc", note }));
  const S = "structure: changing it needs a new download";

  rows.push(text("Project"));
  inp("turbines", "Number of turbines", i.project.turbines, "", "int");
  inp("turbineMw", "Turbine rating", i.project.turbineMw, "MW", "dec2");
  inp("hub", "Hub height", i.project.hubHeightM, "m", "int");
  inp("rotor", "Rotor diameter", i.project.rotorDiameterM, "m", "int");
  inp("fc", "Financial close", xd(i.project.financialClose), "date", "date", S);
  inp("construction", "Construction period", i.project.constructionMonths, "months", "int", S);
  inp("lifetime", "Operating life", i.project.lifetimeYears, "years", "int", S);
  rows.push(blank(), text("Energy yield"));
  inp("refYield", "Reference yield (100 % site)", i.energy.referenceYieldHours, "h/yr", "int");
  inp("siteQuality", "Site quality (Gütefaktor)", i.energy.siteQuality, "%", "pct1");
  inp("south", "Site in the EEG Südregion", i.energy.southRegion, "TRUE/FALSE", "general", undefined, BOOL);
  inp("availability", "Availability", i.energy.availability, "%", "pct1");
  inp("otherLoss", "Other extra losses", i.energy.otherExtraLosses, "%", "pct1");
  inp("degradation", "Degradation per year", i.energy.degradationPerYear, "%", "pct2");
  inp("sigma1", "Yield uncertainty, 1 year (σ)", i.energy.sigma1y, "%", "pct1");
  inp("sigma10", "Yield uncertainty, 10 years (σ)", i.energy.sigma10y, "%", "pct1");
  inp("negOutput", "Output at negative prices", i.energy.negativePriceOutputShare, "%", "pct1");
  inp("negTime", "Time with negative prices (§ 51a)", i.energy.negativePriceTimeShare, "%", "pct1");
  rows.push(blank(), text("Revenue"));
  inp("award", "Award price (Zuschlagswert)", i.revenue.awardPriceCt, "ct/kWh", "dec2");
  inp("ceiling", "Tender ceiling (Höchstwert)", i.revenue.ceilingPriceCt, "ct/kWh", "dec2");
  inp("awardNotice", "Award announced", xd(i.revenue.awardNoticeDate), "date", "date");
  inp("ltPrice", "Long-term baseload price (2026 money)", i.revenue.longTermBaseEurMwh2026, "€/MWh", "dec2");
  inp("capture", "Wind capture factor", i.revenue.captureFactor, "", "dec3");
  inp("dv", "Direct-marketing fee (2026 money)", i.revenue.directMarketingCtKwh2026, "ct/kWh", "dec3");
  inp("postEeg", "After the EEG period", i.revenue.postEeg, "market / ppa", "general", undefined, ["market", "ppa"]);
  inp("ppa", "PPA price (2026 money)", i.revenue.ppaEurMwh2026, "€/MWh", "dec2");
  inp("twoSided", "Two-sided premium (simplified stress)", i.revenue.twoSidedPremium, "TRUE/FALSE", "general", undefined, BOOL);
  inp("receivableDays", "Receivable days (market sales)", i.revenue.receivableDays, "days", "int");
  inp("lag", "Premium settlement lag after the year end", i.revenue.premiumTrueUpLagMonths, "months", "int");
  inp("municipal", "Municipal payment (§ 6)", i.revenue.municipalCtKwh, "ct/kWh", "dec2");
  inp("municipalAfter", "Continue the municipal payment after the EEG", i.revenue.municipalAfterEeg, "TRUE/FALSE", "general", undefined, BOOL);
  inp("bankBasis", "Revenue the lender counts on", i.revenue.bankPriceBasis, "floor / base", "general", undefined, ["floor", "base"]);
  rows.push({
    kind: "table",
    id: "tab.futures",
    head: ["Power futures (baseload)", "€/MWh"],
    rows: i.revenue.futuresEurMwh.map((f) => [
      { v: f.year, fmt: "year", role: "input" },
      { v: f.value, fmt: "dec2", role: "input" },
    ]),
  });
  rows.push(blank(), text("Capex (net of VAT)"));
  rows.push({
    kind: "table",
    id: "tab.capex",
    head: ["Item", "Payment profile", "€/kW"],
    rows: i.capex.items.map((it) => [
      { v: it.key, role: "text" },
      { v: it.profile, role: "input" },
      { v: it.eurPerKw, fmt: "dec2", role: "input" },
    ]),
  });
  inp("contingency", "Contingency on all items", i.capex.contingencyPct, "%", "pct1");
  inp("vatRate", "VAT rate", i.capex.vatRate, "%", "pct1");
  inp("vatLag", "VAT refund lag", i.capex.vatRefundLagMonths, "months", "int");
  rows.push(blank(), text("Opex (€/kW a year, 2025 money)"));
  const opexItems: [string, [number, number, number]][] = [
    ["Maintenance", i.opex.maintenancePerKw],
    ["Management", i.opex.managementPerKw],
    ["Insurance", i.opex.insurancePerKw],
    ["Other", i.opex.otherPerKw],
  ];
  rows.push({
    kind: "table",
    id: "tab.opex",
    head: ["Item", "Years 1–10", "Years 11–20", "Years 21+"],
    rows: opexItems.map(([label, v]) => [
      { v: label, role: "text" },
      ...v.map((x) => ({ v: x, fmt: "dec2" as Fmt, role: "input" as const })),
    ]),
  });
  inp("leaseShare", "Land lease, share of revenue", i.opex.leaseShareOfRevenue, "%", "pct1");
  inp("leaseMin", "Minimum lease per turbine (2026 money)", i.opex.leaseMinPerTurbine2026, "€", "int");
  inp("bondPerM", "Decommissioning security per metre of hub height", i.opex.decommissioningBondPerMeterHub, "€", "int");
  inp("guaranteeFee", "Guarantee fee on the security", i.opex.guaranteeFeeRate, "% p.a.", "pct2");
  inp("decomCost", "Decommissioning cost (2026 money)", i.opex.decommissioningCostPerKw2026, "€/kW", "dec2");
  inp("reserveYears", "Decommissioning reserve built over the last", i.opex.decommissioningReserveYears, "years", "int");
  inp("gridFee", "Generator grid fee (2026 money)", i.opex.gridFeePerKw2026, "€/kW/yr", "dec2");
  rows.push(blank(), text("Financing"));
  inp("rate", "Interest rate", i.financing.interestRate, "%", "pct2");
  inp("tenor", "Loan term from financial close", i.financing.tenorYearsFromClose, "years", "int", S);
  inp("grace", "Grace years", i.financing.graceYears, "years", "int", S);
  inp("repayment", "Repayment", i.financing.repayment, "linear / annuity / sculpted", "general", S, ["linear", "annuity", "sculpted"]);
  inp("t50", "Target DSCR, P50", i.financing.targetDscrP50, "x", "ratio");
  inp("t90", "Target DSCR, P90 1-year", i.financing.targetDscrP90, "x", "ratio");
  inp("covenant", "Covenant DSCR", i.financing.covenantDscr, "x", "ratio");
  inp("lockup", "Lock-up DSCR", i.financing.lockupDscr, "x", "ratio");
  inp("maxGearing", "Maximum gearing", i.financing.maxGearing, "%", "pct1");
  inp("upfront", "Upfront fee", i.financing.upfrontFeePct, "%", "pct2");
  inp("commitment", "Commitment fee on the undrawn loan", i.financing.commitmentFeePerMonth, "% / month", "pct3");
  inp("commitmentStart", "Commitment fee from construction month", i.financing.commitmentFeeStartMonth, "", "int");
  inp("dsraMonths", "Debt service reserve", i.financing.dsraMonths, "months", "dec2");
  inp("vatSpread", "VAT bridge loan spread", i.financing.vatFacilitySpread, "%", "pct2");
  inp("equityFirst", "Equity first", i.financing.equityFirst, "TRUE/FALSE", "general", undefined, BOOL);
  rows.push(blank(), text("Tax"));
  inp("legalForm", "Legal form", i.tax.legalForm, "KG / GmbH", "general", undefined, ["KG", "GmbH"]);
  inp("hebesatz", "Trade-tax multiplier (Hebesatz)", i.tax.hebesatz, "%", "pct1");
  inp("depYears", "Depreciation period", i.tax.depreciationYears, "years", "int");
  inp("degressive", "Declining-balance depreciation", i.tax.degressive, "TRUE/FALSE", "general", undefined, BOOL);
  rows.push(blank(), text("Valuation and inflation"));
  rows.push({
    kind: "table",
    id: "tab.inflation",
    head: ["Inflation (CPI change in the year)", "%"],
    rows: i.macro.inflation.map((x) => [
      { v: x.year, fmt: "year", role: "input" },
      { v: x.value, fmt: "pct2", role: "input" },
    ]),
  });
  inp("inflLR", "Inflation in all other years", i.macro.longRunInflation, "%", "pct2");
  inp("coe", "Cost of equity", i.macro.costOfEquity, "%", "pct2");
  inp("waccNominal", "Nominal WACC (project NPV, nominal LCOE)", i.macro.waccNominal, "%", "pct2");
  inp("waccReal", "Real WACC (LCOE)", i.macro.waccReal, "%", "pct2");

  rows.push(blank(), text("Scenarios (the loan of the base case is kept)"));
  rows.push(
    scalar("sc.p90.energy", "P90 1-yr: output factor", (c) => `1-${c.k("k.z")}*${c.k("in.sigma1")}`, 1 - P90_Z * i.energy.sigma1y, { fmt: "dec4" }),
    scalar("sc.res.energy", "P90 10-yr and downside: output factor", (c) => `1-${c.k("k.z")}*${c.k("in.sigma10")}`, 1 - P90_Z * i.energy.sigma10y, { fmt: "dec4" }),
  );
  inp("downPrice", "Downside: power prices", DOWNSIDE.priceScale, "factor", "dec2");
  inp("downOpex", "Downside: fixed opex and grid fee", DOWNSIDE.opexScale, "factor", "dec2");
  inp("downCapex", "Downside: capex", DOWNSIDE.capexScale, "factor", "dec2");

  rows.push(blank(), text("Statutory constants and conventions"));
  k("tradeRate", "Trade tax base rate (§ 11 (2) GewStG)", TAX.tradeTaxBaseRate, "%", "pct2");
  k("allowanceKG", "Trade-tax allowance of a partnership (§ 11 (1) GewStG)", TAX.tradeTaxAllowancePartnership, "€", "int");
  k("addBackShare", "Add-back share (§ 8 Nr. 1 GewStG)", TAX.addBackShare, "%", "pct1");
  k("addBackAllowance", "Add-back allowance", TAX.addBackAllowance, "€", "int");
  k("leaseAddBack", "Land lease counted in the add-back", TAX.immovableLeaseShare, "%", "pct1");
  k("lossFull", "Loss offset in full (§ 10a GewStG, § 10d EStG)", TAX.lossOffsetFull, "€", "int");
  k("tradeLossShare", "Trade tax: share of profit above that", TAX.tradeTaxLossShare, "%", "pct1");
  k("corpLossEarly", "Corporate tax: share above that until 2027", 0.7, "%", "pct1");
  k("corpLossLate", "Corporate tax: share above that from 2028", 0.6, "%", "pct1");
  k("corpLossSwitch", "Last year with the higher share", 2027, "", "year");
  k("kstHigh", "Corporate tax rate until 2027 (§ 23 KStG)", corporateTaxRate(2027), "%", "pct1");
  k("kstLow", "Corporate tax rate from 2032", corporateTaxRate(2032), "%", "pct1");
  k("kstStep", "Annual step 2028–2031", 0.01, "%", "pct1");
  k("kstStepFrom", "First year of the step", 2027, "", "year");
  k("soli", "Solidarity surcharge", TAX.soli, "%", "pct2");
  k("minHebesatz", "Minimum multiplier from 2027 (§ 16 (4) GewStG)", TAX.minHebesatzFrom2027, "%", "pct1");
  k("provisionRate", "Discount rate of the tax provision (§ 6 EStG)", TAX.provisionDiscountRate, "%", "pct1");
  k("interestBarrier", "Interest-barrier threshold (§ 4h EStG)", TAX.interestBarrierThreshold, "€", "int");
  k("degMultiple", "Declining balance: multiple of straight-line", TAX.degressiveMultiple, "x", "dec2");
  k("degCap", "Declining balance: maximum rate", TAX.degressiveCap, "%", "pct1");
  k("degStart", "Declining balance: completion from", xd(TAX.degressiveWindowStart), "date", "date");
  k("degEnd", "Declining balance: completion until", xd(TAX.degressiveWindowEnd), "date", "date");
  k("availSite", "Availability already in the site yield (Anlage 2 EEG)", AVAILABILITY_IN_SITE_YIELD, "%", "pct1");
  k("z", "z-value of the one-sided 90 % quantile", P90_Z, "", "dec4");
  k("supportYears", "EEG support period (§ 25)", SUPPORT_YEARS, "years", "int");
  k("countYears", "§ 51a count: commissioning year and the years after, in total", NEGATIVE_PRICE_COUNT_YEARS, "years", "int");
  k("review1", "§ 36h (2) review: start of year 6", SITE_REVIEW_YEARS[0], "years after COD", "int");
  k("review2", "§ 36h (2) review: start of year 11", SITE_REVIEW_YEARS[1], "years after COD", "int");
  k("review3", "§ 36h (2) review: start of year 16", SITE_REVIEW_YEARS[2], "years after COD", "int");
  k("reviewThreshold", "§ 36h (2) settlement threshold", SITE_REVIEW_THRESHOLD, "points", "pct1");
  k("refundCap", "§ 6 payment refunded at most", MUNICIPAL_REFUND_CAP_CT, "ct/kWh", "dec2");
  k("lapseMonths", "§ 36e: award lapses after", AWARD_LAPSE_MONTHS, "months", "int");
  k("penaltyMonths", "§ 55: penalty after", AWARD_PENALTY_MONTHS, "months", "int");
  k("daysPerYear", "Day count (Act/365)", 365, "days", "int");
  k("paybackYear", "Days per year for the payback period", 365.25, "days", "dec2");
  k("decade2", "Opex decade 2 from operating year", 10, "", "int");
  k("decade3", "Opex decade 3 from operating year", 20, "", "int");
  k("turbineDown", "Turbine: down payment at close", 0.1, "%", "pct1");
  k("turbineDelivery", "Turbine: on delivery 4–2 months before COD", 0.7, "%", "pct1");
  k("turbineFinal", "Turbine: at commissioning", 0.2, "%", "pct1");
  k("deliveryMonths", "Turbine: delivery instalments", 3, "", "int");
  k("thirdsShare", "Thirds profile: first and second third", 0.4, "%", "pct1");
  k("thirdsLast", "Thirds profile: last third", 0.2, "%", "pct1");
  k("tiny", "Numerical zero", 1e-6, "", "general");
  k("dsMin", "Debt service counted for a DSCR from", MIN_DEBT_SERVICE, "€", "int");
  k("debtTol", "Tolerance of the pasted loan and uses (as the website's solver)", 0.5, "€", "dec2");
  k("irrEps", "An XIRR result counts as an IRR when the NPV changes sign within ± this of the rate", 1e-6, "", "general");
  k("guessStep", "XIRR: the second and third tries start this far below and above the website's result", 0.01, "%", "pct1");
  k("guessLow", "XIRR start value, fourth try", -0.05, "%", "pct1");
  k("guessHigh", "XIRR start value, fifth try", 0.1, "%", "pct1");
  k("minHebesatzFrom", "Minimum trade-tax multiplier applies from", 2027, "", "year");
  k("priceYear", "Price basis of the inputs in “2026 money”", 2026, "", "year");
  k("kfwDrawdownMax", "KfW 270: longest drawdown period (12 months, extendable by up to 24)", KFW_DRAWDOWN_MAX_MONTHS, "months", "int");
  rows.push({
    kind: "table",
    id: "tab.kfw",
    head: ["KfW 270 variant: loan term up to (years)", "Grace years at most"],
    rows: KFW_VARIANTS.map(([term, grace]) => [
      { v: term, fmt: "int" },
      { v: grace, fmt: "int" },
    ]),
  });
  rows.push({
    kind: "table",
    id: "tab.kf",
    head: ["Correction factor (§ 36h (1) EEG): site quality %", "Factor"],
    rows: CORRECTION_FACTOR_TABLE.map(([q, f]) => [
      { v: q, fmt: "int" },
      { v: f, fmt: "dec2" },
    ]),
  });
  k("kfFloor", "Factor below 60 % outside the Südregion", 1.42, "", "dec2");
  k("kfSouthFloor", "Factor at or below 50 % in the Südregion", 1.55, "", "dec2");
  k("kfTop", "Factor from 150 %", 0.79, "", "dec2");
  k("kfSouthLow", "Lowest table point in the Südregion", 50, "%", "int");
  k("kfLow", "Lowest table point elsewhere", 60, "%", "int");
  k("kfHigh", "Highest table point", 150, "%", "int");

  rows.push(blank(), text("Solved on the website — pasted values, do not edit"));
  const s = (id: string, label: string, v: CellValue, unit: string, fmt: Fmt) =>
    rows.push(scalar(`sol.${id}`, label, undefined, v, { unit, fmt, role: "solver", note: "re-solve on the website if the checks fail" }));
  s("debt", "Senior loan", b.kpis.debt, "€", "dec2");
  s("usesBase", "Total uses (base, P90 1-yr, P90 10-yr)", b.sourcesUses.totalUses, "€", "dec2");
  s("usesDown", "Total uses (downside: capex overrun)", e.runs.downside.sourcesUses.totalUses, "€", "dec2");
  s("fc", "Financial close at download", xd(i.project.financialClose), "date", "date");
  s("construction", "Construction months at download", i.project.constructionMonths, "months", "int");
  s("lifetime", "Operating life at download", i.project.lifetimeYears, "years", "int");
  s("tenor", "Loan term at download", i.financing.tenorYearsFromClose, "years", "int");
  s("grace", "Grace years at download", i.financing.graceYears, "years", "int");
  s("repayment", "Repayment at download", i.financing.repayment, "", "general");
  void g;
  return { name: "Inputs", rows, widths: [52, 16, 16, 40], freeze: { rows: 4, cols: 1 }, tabColor: "FFFFC000" };
}

// ---------------------------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------------------------

export function timingSheet(e: Env): SheetDef {
  const { N, i, base } = e;
  const t = base.trace!.timing;
  const tl = base.timeline;
  const rows: Row[] = [];
  const cod = xd(tl.cod);
  const end = xd(tl.endOfLife);
  const eegEnd = xd(tl.eegEnd);
  const supportEnd = xd(toIso(addYearsDay(e.cod, SUPPORT_YEARS)));
  const countEnd = Math.min(supportEnd, xd(`${new Date(e.cod * 86_400_000).getUTCFullYear() + NEGATIVE_PRICE_COUNT_YEARS}-01-01`));
  const reviews = SITE_REVIEW_YEARS.map((n) => xd(toIso(addYearsDay(e.cod, n))));
  const codYear = e.years[0]!;
  const lastYear = e.years[N - 1]!;
  const fcDay = toDay(i.project.financialClose);
  const graceMonths = 12 * i.financing.graceYears;
  const firstInstalment = xd(toIso(addMonthsDay(fcDay, graceMonths + 3) - 1));
  const maturity = xd(tl.loanMaturity);
  const infl = (y: number) => i.macro.inflation.find((x) => x.year === y)?.value ?? i.macro.longRunInflation;

  rows.push(text("Dates"));
  rows.push(
    scalar("t.fc", "Financial close", (c) => c.k("in.fc"), xd(i.project.financialClose), { fmt: "date", role: "link" }),
    scalar("t.cod", "Commissioning (COD)", (c) => `EDATE(${c.k("t.fc")},${c.k("in.construction")})`, cod, { fmt: "date" }),
    scalar("t.end", "End of life", (c) => `EDATE(${c.k("t.cod")},12*${c.k("in.lifetime")})`, end, { fmt: "date" }),
    scalar("t.supportEnd", "EEG support: 20 years from COD", (c) => `EDATE(${c.k("t.cod")},12*${c.k("k.supportYears")})`, supportEnd, { fmt: "date" }),
    scalar(
      "t.countEnd",
      "§ 51a: end of the count (COD year + 19 calendar years)",
      (c) => `MIN(${c.k("t.supportEnd")},DATE(YEAR(${c.k("t.cod")})+${c.k("k.countYears")},1,1))`,
      countEnd,
      { fmt: "date" },
    ),
    scalar(
      "t.eegEnd",
      "EEG support ends (§ 51a extension, whole days)",
      (c) => `${c.k("t.supportEnd")}+ROUNDUP(${c.k("in.negTime")}*(${c.k("t.countEnd")}-${c.k("t.cod")}),0)`,
      eegEnd,
      { fmt: "date" },
    ),
    scalar("t.review1", "§ 36h review from", (c) => `EDATE(${c.k("t.cod")},12*${c.k("k.review1")})`, reviews[0]!, { fmt: "date" }),
    scalar("t.review2", "§ 36h review from", (c) => `EDATE(${c.k("t.cod")},12*${c.k("k.review2")})`, reviews[1]!, { fmt: "date" }),
    scalar("t.review3", "§ 36h review from", (c) => `EDATE(${c.k("t.cod")},12*${c.k("k.review3")})`, reviews[2]!, { fmt: "date" }),
    scalar("t.codYear", "Year of COD", (c) => `YEAR(${c.k("t.cod")})`, codYear, { fmt: "year" }),
    scalar(
      "t.firstFullYear",
      "First full operating year",
      (c) => `IF(${c.k("t.cod")}=DATE(YEAR(${c.k("t.cod")}),1,1),YEAR(${c.k("t.cod")}),YEAR(${c.k("t.cod")})+1)`,
      toIso(toDay(tl.cod)).endsWith("-01-01") ? codYear : codYear + 1,
      { fmt: "year" },
    ),
    scalar("t.lastYear", "Last operating year", (c) => `YEAR(${c.k("t.end")}-1)`, lastYear, { fmt: "year" }),
    scalar("t.awardLapse", "Award lapses (§ 36e)", (c) => `EDATE(${c.k("in.awardNotice")},${c.k("k.lapseMonths")})`, xd(tl.awardLapse), { fmt: "date" }),
    scalar(
      "t.penaltyDate",
      "Penalty for later commissioning (§ 55)",
      (c) => `EDATE(${c.k("in.awardNotice")},${c.k("k.penaltyMonths")})`,
      xd(toIso(addMonthsDay(toDay(i.revenue.awardNoticeDate), AWARD_PENALTY_MONTHS))),
      { fmt: "date" },
    ),
    scalar("t.graceEnd", "Grace period ends", (c) => `EDATE(${c.k("t.fc")},12*${c.k("in.grace")})`, xd(tl.graceEnd), { fmt: "date" }),
    scalar(
      "t.firstInstalment",
      "First instalment",
      (c) => `EDATE(${c.k("t.fc")},12*${c.k("in.grace")}+3)-1`,
      firstInstalment,
      { fmt: "date" },
    ),
    scalar("t.maturity", "Last instalment", (c) => `EDATE(${c.k("t.fc")},12*${c.k("in.tenor")})-1`, maturity, { fmt: "date" }),
    scalar("t.maturityYear", "Year of the last instalment", (c) => `YEAR(${c.k("t.maturity")})`, new Date(toDay(tl.loanMaturity) * 86_400_000).getUTCFullYear(), { fmt: "year" }),
    scalar("t.firstRepYear", "First repayment year", (c) => `YEAR(${c.k("t.firstInstalment")})`, new Date((firstInstalment - 25569) * 86_400_000).getUTCFullYear(), { fmt: "year" }),
    scalar("t.nInstalments", "Quarterly instalments", (c) => `4*(${c.k("in.tenor")}-${c.k("in.grace")})`, 4 * (i.financing.tenorYearsFromClose - i.financing.graceYears), { fmt: "int" }),
    blank(),
    text("Farm and price basis"),
    scalar("t.capacityKw", "Capacity", (c) => `${c.k("in.turbines")}*${c.k("in.turbineMw")}*1000`, base.kpis.capacityMw * 1000, { unit: "kW", fmt: "int" }),
    scalar(
      "t.hoursP50",
      "Full-load hours P50, net",
      (c) => `${c.k("in.siteQuality")}*${c.k("in.refYield")}*MIN(1,${c.k("in.availability")}/${c.k("k.availSite")})*(1-${c.k("in.otherLoss")})`,
      base.kpis.fullLoadHoursP50,
      { unit: "h/yr", fmt: "dec2" },
    ),
    scalar(
      "t.idx2026",
      "Price index 2026 (2025 = 1)",
      (c) =>
        `1+IF(COUNTIF(${c.table("tab.inflation", 0)},${c.k("k.priceYear")})>0,SUMIFS(${c.table("tab.inflation", 1)},${c.table("tab.inflation", 0)},${c.k("k.priceYear")}),${c.k("in.inflLR")})`,
      1 + infl(2026),
      { fmt: "dec6" },
    ),
    scalar("t.lagYears", "Premium true-up collected after … years", (c) => `IF(${c.k("in.lag")}>0,ROUNDUP(${c.k("in.lag")}/12,0),0)`, i.revenue.premiumTrueUpLagMonths > 0 ? Math.ceil(i.revenue.premiumTrueUpLagMonths / 12) : 0, { fmt: "int" }),
    scalar("t.refundRate", "§ 6 refund per kWh", (c) => `MIN(${c.k("in.municipal")},${c.k("k.refundCap")})/100`, Math.min(i.revenue.municipalCtKwh, MUNICIPAL_REFUND_CAP_CT) / 100, { unit: "€/kWh", fmt: "dec6" }),
    scalar(
      "t.bond",
      "Decommissioning security",
      (c) => `${c.k("in.hub")}*${c.k("in.bondPerM")}*${c.k("in.turbines")}`,
      i.project.hubHeightM * i.opex.decommissioningBondPerMeterHub * i.project.turbines,
      { unit: "€", fmt: MONEY },
    ),
    scalar(
      "t.decomCost",
      "Decommissioning cost at the end of life",
      (c) => `${c.k("in.decomCost")}*${c.k("t.capacityKw")}*INDEX(${c.range("t.index2026")},MATCH(${c.k("t.lastYear")},${c.range("t.year")},0))`,
      base.annual[N - 1]!.decommissioningPaid,
      { unit: "€", fmt: MONEY },
    ),
    scalar(
      "t.degAllowed",
      "Declining-balance depreciation allowed (1 = yes)",
      (c) => `IF(AND(${c.k("in.degressive")},${c.k("t.cod")}>=${c.k("k.degStart")},${c.k("t.cod")}<=${c.k("k.degEnd")}),1,0)`,
      i.tax.degressive && e.cod >= toDay(TAX.degressiveWindowStart) && e.cod <= toDay(TAX.degressiveWindowEnd) ? 1 : 0,
      { fmt: "int" },
    ),
    scalar("t.degRate", "Declining-balance rate", (c) => `MIN(${c.k("k.degMultiple")}/${c.k("in.depYears")},${c.k("k.degCap")})`, Math.min(TAX.degressiveMultiple / i.tax.depreciationYears, TAX.degressiveCap), { fmt: "pct2" }),
    scalar("t.provisionCost", "Decommissioning cost in 2026 money", (c) => `${c.k("in.decomCost")}*${c.k("t.capacityKw")}`, i.opex.decommissioningCostPerKw2026 * base.kpis.capacityMw * 1000, { unit: "€", fmt: MONEY }),
    blank(),
  );

  // Price index before the operating years (2025 = 1), for the year before COD and the construction months.
  const helperYears = Array.from({ length: 16 }, (_, k) => 2025 + k);
  const helperIndex: number[] = [];
  helperYears.forEach((y, k) => helperIndex.push(k === 0 ? 1 : helperIndex[k - 1]! * (1 + infl(y))));
  rows.push({
    kind: "table",
    id: "tab.index",
    head: ["Year", "Price index (2025 = 1)"],
    rows: helperYears.map((y, k) => [
      k === 0 ? { v: y, fmt: "year" } : { v: y, fmt: "year", f: () => `${e.grid.tableCell("Timing", "tab.index", k - 1, 0)}+1` },
      k === 0
        ? { v: 1, fmt: "dec6" }
        : {
            v: helperIndex[k]!,
            fmt: "dec6",
            f: (c: Ctx) =>
              `${e.grid.tableCell("Timing", "tab.index", k - 1, 1)}*(1+IF(COUNTIF(${c.table("tab.inflation", 0)},${e.grid.tableCell("Timing", "tab.index", k, 0)})>0,` +
              `SUMIFS(${c.table("tab.inflation", 1)},${c.table("tab.inflation", 0)},${e.grid.tableCell("Timing", "tab.index", k, 0)}),${c.k("in.inflLR")}))`,
          },
    ]),
  });
  rows.push(blank(), text("Operating years"));

  const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], o: Parameters<typeof period>[5] = {}) =>
    rows.push(period(id, label, N, f, values, o));
  const yStart = e.years.map((y) => xd(`${y}-01-01`));
  const yNext = e.years.map((y) => xd(`${y + 1}-01-01`));
  rows.push(period("t.period", "Operating period", N, undefined, e.years.map((_, k) => k + 1), { fmt: "int", role: "calc" }));
  P("t.year", "Calendar year", (c) => `${c.k("t.codYear")}+${c.r("t.period")}-1`, e.years, { fmt: "year" });
  P("t.yStart", "Year starts", (c) => `DATE(${c.r("t.year")},1,1)`, yStart, { fmt: "date" });
  P("t.yNext", "Next year starts", (c) => `DATE(${c.r("t.year")}+1,1,1)`, yNext, { fmt: "date" });
  P("t.opStart", "Operation from", (c) => `MAX(${c.k("t.cod")},${c.r("t.yStart")})`, t.start.map(xd), { fmt: "date" });
  P("t.opEnd", "Operation until (exclusive)", (c) => `MIN(${c.k("t.end")},${c.r("t.yNext")})`, t.end.map(xd), { fmt: "date" });
  P("t.opDays", "Operating days", (c) => `${c.r("t.opEnd")}-${c.r("t.opStart")}`, t.opDays, { unit: "days", fmt: "int" });
  P("t.daysInYear", "Days in the year", (c) => `${c.r("t.yNext")}-${c.r("t.yStart")}`, t.daysInYear, { unit: "days", fmt: "int" });
  P("t.fraction", "Share of the year in operation", (c) => `${c.r("t.opDays")}/${c.r("t.daysInYear")}`, t.fraction, { fmt: "dec6" });
  P(
    "t.opMonths",
    "Operating months",
    (c) => `(YEAR(${c.r("t.opEnd")})-YEAR(${c.r("t.opStart")}))*12+MONTH(${c.r("t.opEnd")})-MONTH(${c.r("t.opStart")})`,
    t.opMonths,
    { unit: "months", fmt: "int" },
  );
  const eegDays = t.eegShare.map((s, k) => s * t.opDays[k]!);
  P(
    "t.eegDays",
    "Days with EEG support",
    (c) => `MAX(0,MIN(${c.r("t.opEnd")},${c.k("t.eegEnd")})-MAX(${c.r("t.opStart")},${c.k("t.cod")}))`,
    eegDays,
    { unit: "days", fmt: "int" },
  );
  P("t.eegShare", "Support share of the operating days", (c) => `IF(${c.r("t.opDays")}>0,${c.r("t.eegDays")}/${c.r("t.opDays")},0)`, t.eegShare, { fmt: "dec6" });
  P("t.opYear", "Full years since COD", (c) => `${c.r("t.year")}-${c.k("t.codYear")}`, t.operatingYear, { fmt: "int" });
  P(
    "t.decade",
    "Opex decade (0, 1, 2)",
    (c) => `IF(${c.r("t.opYear")}<${c.k("k.decade2")},0,IF(${c.r("t.opYear")}<${c.k("k.decade3")},1,2))`,
    t.decade,
    { fmt: "int" },
  );
  P("t.isLast", "Last operating year (1 = yes)", (c) => `IF(${c.r("t.year")}=${c.k("t.lastYear")},1,0)`, t.isLast.map((x) => (x ? 1 : 0)), { fmt: "int" });
  P("t.degFactor", "Degradation factor", (c) => `(1-${c.k("in.degradation")})^${c.r("t.opYear")}`, t.operatingYear.map((n) => Math.pow(1 - i.energy.degradationPerYear, n)), { fmt: "dec6" });
  P(
    "t.infl",
    "Inflation in the year",
    (c) => `IF(COUNTIF(${c.table("tab.inflation", 0)},${c.r("t.year")})>0,SUMIFS(${c.table("tab.inflation", 1)},${c.table("tab.inflation", 0)},${c.r("t.year")}),${c.k("in.inflLR")})`,
    e.years.map(infl),
    { fmt: "pct2" },
  );
  const indexBefore = helperIndex[helperYears.indexOf(codYear - 1)]!;
  rows.push(
    period("t.index2025", "Price index (2025 = 1)", N, (c) => `${c.p("t.index2025")}*(1+${c.r("t.infl")})`, t.index2025, {
      fmt: "dec6",
      open: {
        f: (c) => `INDEX(${c.table("tab.index", 1)},MATCH(${c.k("t.codYear")}-1,${c.table("tab.index", 0)},0))`,
        v: indexBefore,
      },
    }),
  );
  rows.push(
    period("t.index2026", "Price index (2026 = 1)", N, (c) => `${c.r("t.index2025")}/${c.k("t.idx2026")}`, t.index2026, {
      fmt: "dec6",
      open: { f: (c) => `${c.p("t.index2025")}/${c.k("t.idx2026")}`, v: indexBefore / (1 + infl(2026)) },
    }),
  );
  // Support days in the four AW periods: [COD, review 1), [review 1, review 2), [review 2, review 3), [review 3, EEG end).
  const bounds = [e.cod, ...SITE_REVIEW_YEARS.map((n) => addYearsDay(e.cod, n)), e.eegEnd];
  const bRef = ["t.cod", "t.review1", "t.review2", "t.review3", "t.eegEnd"];
  for (let k = 0; k < 4; k++) {
    const vals = t.start.map((s, y) => {
      const a = toDay(s);
      const b = toDay(t.end[y]!);
      const days = eegDays[y]!;
      return days > 0 ? Math.max(0, Math.min(b, bounds[k + 1]!) - Math.max(a, bounds[k]!)) / days : 0;
    });
    P(
      `t.w${k}`,
      `Share of support days in AW period ${k + 1}`,
      (c) => `IF(${c.r("t.eegDays")}>0,MAX(0,MIN(${c.r("t.opEnd")},${c.k(bRef[k + 1]!)})-MAX(${c.r("t.opStart")},${c.k(bRef[k]!)}))/${c.r("t.eegDays")},0)`,
      vals,
      { fmt: "dec6" },
    );
  }
  P(
    "t.reserveWindow",
    "Decommissioning reserve window (1 = yes)",
    (c) => `IF(${c.k("t.end")}-${c.r("t.opEnd")}<${c.k("in.reserveYears")}*${c.k("k.daysPerYear")},1,0)`,
    t.reserveWindow.map((x) => (x ? 1 : 0)),
    { fmt: "int" },
  );
  P("t.cfDate", "Cash-flow date", (c) => `${c.r("t.opEnd")}-1`, base.annual.map((a) => xd(a.cashFlowDate)), { fmt: "date" });
  const maturityDay = toDay(tl.loanMaturity);
  const maturityYear = Number(tl.loanMaturity.slice(0, 4));
  P(
    "t.loanShare",
    "Share of the year's cash flow within the loan term (for the LLCR)",
    (c) =>
      `IF(${c.r("t.year")}<${c.k("t.maturityYear")},1,IF(${c.r("t.year")}>${c.k("t.maturityYear")},0,` +
      `MIN(1,MAX(0,(${c.k("t.maturity")}+1-${c.r("t.opStart")})/MAX(1,${c.r("t.opEnd")}-${c.r("t.opStart")})))))`,
    e.years.map((y, k) =>
      y < maturityYear ? 1 : y > maturityYear ? 0 : Math.min(1, Math.max(0, (maturityDay + 1 - toDay(t.start[k]!)) / Math.max(1, toDay(t.end[k]!) - toDay(t.start[k]!)))),
    ),
    { fmt: "dec6" },
  );
  P(
    "t.llcrDate",
    "LLCR discount date: the cash-flow date, at the latest the loan maturity",
    (c) => `MIN(${c.r("t.cfDate")},${c.k("t.maturity")})`,
    base.annual.map((a) => Math.min(xd(a.cashFlowDate), xd(tl.loanMaturity))),
    { fmt: "date" },
  );
  P(
    "t.loanMonths",
    "Loan months in the year",
    (c) => `COUNTIFS(${c.table("tab.loan", 2)},${c.r("t.year")})`,
    t.loanMonths,
    { fmt: "int" },
  );
  P(
    "t.instalments",
    "Instalments in the year",
    (c) => `COUNTIFS(${c.table("tab.loan", 2)},${c.r("t.year")},${c.table("tab.loan", 3)},">=0")`,
    t.instalments,
    { fmt: "int" },
  );
  P(
    "t.depMonths",
    "Depreciation months (first year: 12 less the months before COD)",
    (c) => `IF(${c.r("t.period")}=1,12-(MONTH(${c.k("t.cod")})-1),12)`,
    e.years.map((_, k) => (k === 0 ? 13 - (new Date(e.cod * 86_400_000).getUTCMonth() + 1) : 12)),
    { fmt: "int" },
  );
  return {
    name: "Timing",
    rows,
    widths: COLS_PERIOD(N),
    freeze: { rows: 4, cols: 5 },
    periods: e.years,
    tabColor: "FF808080",
  };
}


// ---------------------------------------------------------------------------------------------
// Construction (monthly)
// ---------------------------------------------------------------------------------------------

export function constructionSheet(e: Env): SheetDef {
  const { M, i } = e;
  const rows: Row[] = [];
  const P = (id: string, label: string, f: ((c: Ctx) => string) | undefined, values: CellValue[], o: Parameters<typeof period>[5] = {}) =>
    rows.push(period(id, label, M, f, values, o));
  const months = Array.from({ length: M }, (_, k) => k + 1);
  const a = Math.max(1, Math.floor(M / 3));
  rows.push(text("Timeline"));
  rows.push(period("c.month", "Construction month", M, undefined, months, { fmt: "int", role: "calc" }));
  P("c.date", "Month end", (c) => `EDATE(${c.k("t.fc")},${c.r("c.month")})-1`, e.base.construction.map((m) => xd(m.date)), { fmt: "date" });
  rows.push(text("Payment profiles (share of an item paid in the month)"));
  rows.push(scalar("c.third", "Months in a third of construction", (c) => `MAX(1,INT(${c.k("in.construction")}/3))`, a, { fmt: "int" }));
  const w = {
    atStart: profileWeights("atStart", M),
    linear: profileWeights("linear", M),
    thirds: profileWeights("thirds", M),
    turbine: profileWeights("turbine", M),
  };
  P("c.wAtStart", "At financial close", (c) => `IF(${c.r("c.month")}=1,1,0)`, w.atStart, { fmt: "dec6" });
  P("c.wLinear", "Evenly over construction", (c) => `1/${c.k("in.construction")}`, w.linear, { fmt: "dec6" });
  P(
    "c.wThirds",
    "40 / 40 / 20 % over the thirds",
    (c) =>
      `IF(${c.r("c.month")}<=2*${c.k("c.third")},${c.k("k.thirdsShare")}/${c.k("c.third")},${c.k("k.thirdsLast")}/(${c.k("in.construction")}-2*${c.k("c.third")}))`,
    w.thirds,
    { fmt: "dec6" },
  );
  P(
    "c.wTurbine",
    "Turbine: 10 % at close, 70 % on delivery, 20 % at COD",
    (c) => {
      const m0 = `${c.r("c.month")}-1`;
      const Mx = c.k("in.construction");
      return (
        `IF(${c.r("c.month")}=1,${c.k("k.turbineDown")},0)+${c.k("k.turbineDelivery")}/${c.k("k.deliveryMonths")}*(` +
        `IF(${m0}=MAX(0,${Mx}-4),1,0)+IF(${m0}=MAX(0,${Mx}-3),1,0)+IF(${m0}=MAX(0,${Mx}-2),1,0))+IF(${c.r("c.month")}=${Mx},${c.k("k.turbineFinal")},0)`
      );
    },
    w.turbine,
    { fmt: "dec6" },
  );

  const blocks: { key: "base" | "down"; label: string; run: ModelResult; scale: string }[] = [
    { key: "base", label: "Base, P90 1-yr and P90 10-yr (same capex)", run: e.runs.base, scale: "1" },
    { key: "down", label: "Downside (capex overrun paid by the owners)", run: e.runs.downside, scale: "in.downCapex" },
  ];
  const D = e.base.kpis.debt;
  for (const blk of blocks) {
    const cm = blk.run.construction;
    const tr = blk.run.trace!.construction;
    const pre = `c.${blk.key}`;
    const scale = (c: Ctx) => (blk.scale === "1" ? "1" : c.k(blk.scale));
    const uses = blk.key === "base" ? "sol.usesBase" : "sol.usesDown";
    rows.push(blank(), text(blk.label, "section"));
    rows.push(scalar(`${pre}.share`, "Loan share of each month's need (pasted loan ÷ pasted uses)", (c) => `${c.k("sol.debt")}/${c.k(uses)}`, D / blk.run.sourcesUses.totalUses, { fmt: "dec6" }));
    rows.push(scalar(`${pre}.equityTotal`, "Equity to be paid in (pasted uses − loan)", (c) => `${c.k(uses)}-${c.k("sol.debt")}`, blk.run.sourcesUses.totalUses - D, { unit: "€", fmt: MONEY }));
    i.capex.items.forEach((it, k) => {
      P(
        `${pre}.item${k}`,
        `Capex: ${it.key}`,
        (c) =>
          `IF(${e.grid.tableCell("Construction", "tab.capex", k, 1)}="turbine",${c.r("c.wTurbine")},IF(${e.grid.tableCell("Construction", "tab.capex", k, 1)}="thirds",${c.r("c.wThirds")},` +
          `IF(${e.grid.tableCell("Construction", "tab.capex", k, 1)}="atStart",${c.r("c.wAtStart")},${c.r("c.wLinear")})))*${e.grid.tableCell("Construction", "tab.capex", k, 2)}*${c.k("t.capacityKw")}*${scale(c)}`,
        tr.capexByItem[it.key]!,
        { unit: "€", fmt: MONEY },
      );
    });
    P(
      `${pre}.contingency`,
      "Capex: contingency",
      (c) => `${c.r("c.wLinear")}*SUM(${c.table("tab.capex", 2)})*${c.k("in.contingency")}*${c.k("t.capacityKw")}*${scale(c)}`,
      tr.capexByItem.contingency!,
      { unit: "€", fmt: MONEY },
    );
    P(
      `${pre}.capex`,
      "Capex",
      (c) => `SUM(${i.capex.items.map((_, k) => c.r(`${pre}.item${k}`)).join(",")},${c.r(`${pre}.contingency`)})`,
      cm.map((m) => m.capex),
      { unit: "€", fmt: MONEY, role: "total" },
    );
    P(`${pre}.vat`, "VAT paid", (c) => `${c.r(`${pre}.capex`)}*${c.k("in.vatRate")}`, cm.map((m) => m.vat), { unit: "€", fmt: MONEY });
    P(
      `${pre}.refund`,
      "VAT refunded",
      (c) => `IF(${c.r("c.month")}-${c.k("in.vatLag")}>=1,INDEX(${c.range(`${pre}.vat`)},${c.r("c.month")}-${c.k("in.vatLag")}),0)`,
      cm.map((m) => m.vatRefund),
      { unit: "€", fmt: MONEY },
    );
    rows.push(
      period(`${pre}.vatBal`, "VAT bridge loan at month end", M, (c) => `${c.p(`${pre}.vatBal`)}+${c.r(`${pre}.vat`)}-${c.r(`${pre}.refund`)}`, cm.map((m) => m.vatFacilityBalance), {
        unit: "€",
        fmt: MONEY,
        open: { v: 0 },
      }),
    );
    const vatRate = (c: Ctx) => `(${c.k("in.rate")}+${c.k("in.vatSpread")})/12`;
    const lag = i.capex.vatRefundLagMonths;
    P(`${pre}.tailWeight`, "Months each VAT payment is still open after COD", (c) => `MAX(0,${c.r("c.month")}-${c.k("in.construction")}+${c.k("in.vatLag")})`, months.map((m) => Math.max(0, m - M + lag)), { fmt: "int" });
    const vr = (i.financing.interestRate + i.financing.vatFacilitySpread) / 12;
    const tail = cm[M - 1]!.vatInterest - (M > 1 ? cm[M - 2]!.vatFacilityBalance : 0) * vr;
    rows.push(
      scalar(
        `${pre}.tail`,
        "VAT loan interest after COD, funded at COD",
        (c) => `${vatRate(c)}*SUMPRODUCT(${c.range(`${pre}.vat`)},${c.range(`${pre}.tailWeight`)})`,
        tail,
        { unit: "€", fmt: MONEY },
      ),
    );
    P(
      `${pre}.vatInterest`,
      "VAT loan interest",
      (c) => `${c.p(`${pre}.vatBal`)}*${vatRate(c)}+IF(${c.r("c.month")}=${c.k("in.construction")},${c.k(`${pre}.tail`)},0)`,
      cm.map((m) => m.vatInterest),
      { unit: "€", fmt: MONEY },
    );
    P(`${pre}.upfront`, "Upfront fee", (c) => `IF(${c.r("c.month")}=1,${c.k("in.upfront")}*${c.k("sol.debt")},0)`, cm.map((m) => m.upfrontFee), { unit: "€", fmt: MONEY });
    P(
      `${pre}.commitment`,
      "Commitment fee",
      (c) => `IF(${c.r("c.month")}>=${c.k("in.commitmentStart")},${c.k("in.commitment")}*MAX(0,${c.k("sol.debt")}-${c.p(`${pre}.cumDebt`)}),0)`,
      cm.map((m) => m.commitmentFee),
      { unit: "€", fmt: MONEY },
    );
    P(`${pre}.idc`, "Interest during construction", (c) => `${c.p(`${pre}.cumDebt`)}*${c.k("in.rate")}/12`, cm.map((m) => m.interestDuringConstruction), { unit: "€", fmt: MONEY });
    P(`${pre}.dsra`, "Debt service reserve funded at COD", (c) => `IF(${c.r("c.month")}=${c.k("in.construction")},${c.k("d.dsra0")},0)`, cm.map((m) => m.dsraFunding), { unit: "€", fmt: MONEY });
    P(`${pre}.wc`, "Start-up liquidity funded at COD", (c) => `IF(${c.r("c.month")}=${c.k("in.construction")},${c.k("o.base.wc0")},0)`, cm.map((m) => m.workingCapitalFunding), { unit: "€", fmt: MONEY });
    P(
      `${pre}.need`,
      "Funding need",
      (c) =>
        `${c.r(`${pre}.capex`)}+${c.r(`${pre}.upfront`)}+${c.r(`${pre}.commitment`)}+${c.r(`${pre}.idc`)}+${c.r(`${pre}.vatInterest`)}+${c.r(`${pre}.dsra`)}+${c.r(`${pre}.wc`)}`,
      cm.map((m) => m.need),
      { unit: "€", fmt: MONEY, role: "total" },
    );
    P(
      `${pre}.debtDraw`,
      "Loan drawn",
      (c) =>
        `IF(${c.k("in.equityFirst")},${c.r(`${pre}.need`)}-MIN(${c.r(`${pre}.need`)},MAX(0,${c.k(`${pre}.equityTotal`)}-${c.p(`${pre}.cumEquity`)})),${c.k(`${pre}.share`)}*${c.r(`${pre}.need`)})`,
      cm.map((m) => m.debtDraw),
      { unit: "€", fmt: MONEY },
    );
    P(`${pre}.equityDraw`, "Equity paid in", (c) => `${c.r(`${pre}.need`)}-${c.r(`${pre}.debtDraw`)}`, cm.map((m) => m.equityDraw), { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.cumDebt`, "Loan drawn to date", M, (c) => `${c.p(`${pre}.cumDebt`)}+${c.r(`${pre}.debtDraw`)}`, cm.map((m) => m.debtBalance), { unit: "€", fmt: MONEY, open: { v: 0 } }),
      period(`${pre}.cumEquity`, "Equity paid in to date", M, (c) => `${c.p(`${pre}.cumEquity`)}+${c.r(`${pre}.equityDraw`)}`, cumulative(cm.map((m) => m.equityDraw)), { unit: "€", fmt: MONEY, open: { v: 0 } }),
    );
    const su = blk.run.sourcesUses;
    rows.push(
      scalar(`${pre}.uses`, "Total uses (sum of the funding need)", (c) => `SUM(${c.range(`${pre}.need`)})`, su.totalUses, { unit: "€", fmt: MONEY, role: "total" }),
      scalar(`${pre}.capexNet`, "Capex", (c) => `SUM(${c.range(`${pre}.capex`)})`, su.capex, { unit: "€", fmt: MONEY }),
      scalar(`${pre}.equity`, "Equity paid in", (c) => `SUM(${c.range(`${pre}.equityDraw`)})`, su.equity, { unit: "€", fmt: MONEY }),
      scalar(`${pre}.debt`, "Loan drawn", (c) => `SUM(${c.range(`${pre}.debtDraw`)})`, su.debt, { unit: "€", fmt: MONEY }),
      scalar(`${pre}.fees`, "Financing costs (fees, interest, VAT loan interest)", (c) => `SUM(${c.range(`${pre}.upfront`)},${c.range(`${pre}.commitment`)},${c.range(`${pre}.idc`)},${c.range(`${pre}.vatInterest`)})`, su.upfrontFee + su.commitmentFee + su.interestDuringConstruction + su.vatInterest, { unit: "€", fmt: MONEY }),
      scalar(
        `${pre}.capitalized`,
        "Depreciable base (uses − DSRA − start-up liquidity)",
        (c) => `${c.k(`${pre}.uses`)}-${c.k("d.dsra0")}-${c.k("o.base.wc0")}`,
        su.totalUses - su.dsraInitial - su.workingCapitalInitial,
        { unit: "€", fmt: MONEY },
      ),
    );
  }
  return {
    name: "Construction",
    rows,
    widths: COLS_PERIOD(M),
    freeze: { rows: 4, cols: 5 },
    periods: months,
    periodFmt: "int",
    tabColor: "FF808080",
  };
}

