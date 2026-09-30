// Input fields as the interface shows them. Values are stored in engine units; `scale` converts to the
// displayed unit (0.68 → 68 %). "Usual" ranges bound the sliders; typing may go wider within min/max.
import type { Inputs } from "@/engine";

export type GroupId = "project" | "energy" | "revenue" | "capex" | "opex" | "financing" | "tax" | "valuation";
export type FieldKind = "number" | "select" | "switch" | "month";
export type FieldValue = number | string | boolean;

export interface FieldDef {
  id: string;
  group: GroupId;
  kind: FieldKind;
  quick?: boolean;
  unit?: string;
  scale?: number;
  decimals?: number;
  min?: number;
  max?: number;
  usual?: [number, number];
  step?: number;
  options?: string[];
  optionsKey?: string;
  /** Derived field (e.g. total capex): editing it rescales the underlying items; not written to the URL. */
  virtual?: boolean;
  /** Shown in the opex grid (item × decade) instead of as a single row. */
  opexCell?: { item: "om" | "mg" | "in" | "ot"; decade: 0 | 1 | 2 };
  sources?: string[];
  hidden?: (i: Inputs) => boolean;
  get: (i: Inputs) => FieldValue;
  set: (i: Inputs, v: FieldValue) => void;
}

const n = (v: FieldValue) => Number(v);

const capexItem = (key: string) => ({
  get: (i: Inputs) => i.capex.items.find((it) => it.key === key)?.eurPerKw ?? 0,
  set: (i: Inputs, v: FieldValue) => {
    const it = i.capex.items.find((x) => x.key === key);
    if (it) it.eurPerKw = n(v);
  },
});

const future = (year: number) => ({
  get: (i: Inputs) => i.revenue.futuresEurMwh.find((f) => f.year === year)?.value ?? 0,
  set: (i: Inputs, v: FieldValue) => {
    const f = i.revenue.futuresEurMwh.find((x) => x.year === year);
    if (f) f.value = n(v);
    else i.revenue.futuresEurMwh.push({ year, value: n(v) });
  },
});

const inflation = (year: number) => ({
  get: (i: Inputs) => i.macro.inflation.find((f) => f.year === year)?.value ?? i.macro.longRunInflation,
  set: (i: Inputs, v: FieldValue) => {
    const f = i.macro.inflation.find((x) => x.year === year);
    if (f) f.value = n(v);
    else i.macro.inflation.push({ year, value: n(v) });
  },
});

type OpexKey = "maintenancePerKw" | "managementPerKw" | "insurancePerKw" | "otherPerKw";
const OPEX_KEYS: Record<"om" | "mg" | "in" | "ot", OpexKey> = {
  om: "maintenancePerKw",
  mg: "managementPerKw",
  in: "insurancePerKw",
  ot: "otherPerKw",
};

const opexCells: FieldDef[] = (["om", "mg", "in", "ot"] as const).flatMap((item) =>
  ([0, 1, 2] as const).map((decade) => ({
    id: `${item}${decade + 1}`,
    group: "opex" as const,
    kind: "number" as const,
    unit: "€/kW/yr",
    decimals: 1,
    min: 0,
    max: 100,
    step: 0.5,
    opexCell: { item, decade },
    sources: decade === 2 ? ["windguardCost2025", "assumption"] : ["windguardCost2025"],
    get: (i: Inputs) => i.opex[OPEX_KEYS[item]][decade],
    set: (i: Inputs, v: FieldValue) => {
      i.opex[OPEX_KEYS[item]][decade] = n(v);
    },
  })),
);

const capexTotal = (i: Inputs) => i.capex.items.reduce((s, it) => s + it.eurPerKw, 0) * (1 + i.capex.contingencyPct);
const opexTotal = (i: Inputs) =>
  i.opex.maintenancePerKw[0] + i.opex.managementPerKw[0] + i.opex.insurancePerKw[0] + i.opex.otherPerKw[0];

export const FIELDS: FieldDef[] = [
  // Project & timeline
  { id: "turbines", group: "project", kind: "number", quick: true, decimals: 0, min: 1, max: 30, usual: [2, 12], step: 1, sources: ["assumption"],
    get: (i) => i.project.turbines, set: (i, v) => void (i.project.turbines = Math.round(n(v))) },
  { id: "turbineMw", group: "project", kind: "number", quick: true, unit: "MW", decimals: 1, min: 1, max: 10, usual: [4.5, 7.5], step: 0.1, sources: ["windguardCost2025", "fawsStatusH1"],
    get: (i) => i.project.turbineMw, set: (i, v) => void (i.project.turbineMw = n(v)) },
  { id: "lifetime", group: "project", kind: "number", quick: true, unit: "years", decimals: 0, min: 15, max: 35, usual: [20, 30], step: 1, sources: ["ise2024", "windguardCost2025"],
    get: (i) => i.project.lifetimeYears, set: (i, v) => void (i.project.lifetimeYears = Math.round(n(v))) },
  { id: "fc", group: "project", kind: "month", sources: ["assumption"],
    get: (i) => i.project.financialClose.slice(0, 7), set: (i, v) => void (i.project.financialClose = `${String(v)}-01`) },
  { id: "construction", group: "project", kind: "number", unit: "months", decimals: 0, min: 6, max: 36, usual: [12, 24], step: 1, sources: ["fawsStatusH1"],
    get: (i) => i.project.constructionMonths, set: (i, v) => void (i.project.constructionMonths = Math.round(n(v))) },
  { id: "hub", group: "project", kind: "number", unit: "m", decimals: 0, min: 80, max: 220, usual: [140, 180], step: 1, sources: ["windguardCost2025", "hessenSecurity"],
    get: (i) => i.project.hubHeightM, set: (i, v) => void (i.project.hubHeightM = n(v)) },

  // Energy yield
  { id: "siteQuality", group: "energy", kind: "number", quick: true, unit: "%", scale: 100, decimals: 0, min: 40, max: 160, usual: [55, 95], step: 1, sources: ["fawsSiteQuality"],
    get: (i) => i.energy.siteQuality, set: (i, v) => void (i.energy.siteQuality = n(v)) },
  { id: "refYield", group: "energy", kind: "number", unit: "h/yr", decimals: 0, min: 2000, max: 5000, usual: [3300, 3900], step: 10, sources: ["windguardCost2025"],
    get: (i) => i.energy.referenceYieldHours, set: (i, v) => void (i.energy.referenceYieldHours = n(v)) },
  { id: "availability", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 80, max: 100, usual: [95, 99], step: 0.5, sources: ["leeFullLoad"],
    get: (i) => i.energy.availability, set: (i, v) => void (i.energy.availability = n(v)) },
  { id: "otherLoss", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [0, 5], step: 0.5, sources: ["assumption"],
    get: (i) => i.energy.otherExtraLosses, set: (i, v) => void (i.energy.otherExtraLosses = n(v)) },
  { id: "degradation", group: "energy", kind: "number", unit: "%/yr", scale: 100, decimals: 2, min: 0, max: 3, usual: [0, 0.6], step: 0.05, sources: ["degradation"],
    get: (i) => i.energy.degradationPerYear, set: (i, v) => void (i.energy.degradationPerYear = n(v)) },
  { id: "sigma1", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 2, max: 30, usual: [10, 16], step: 0.1, sources: ["uncertainty", "assumption"],
    get: (i) => i.energy.sigma1y, set: (i, v) => void (i.energy.sigma1y = n(v)) },
  { id: "sigma10", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 2, max: 30, usual: [7, 13], step: 0.1, sources: ["uncertainty", "assumption"],
    get: (i) => i.energy.sigma10y, set: (i, v) => void (i.energy.sigma10y = n(v)) },
  { id: "negOutput", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [3, 9], step: 0.5, sources: ["smard", "assumption"],
    get: (i) => i.energy.negativePriceOutputShare, set: (i, v) => void (i.energy.negativePriceOutputShare = n(v)) },
  { id: "negTime", group: "energy", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [3, 9], step: 0.5, sources: ["smard"],
    get: (i) => i.energy.negativePriceTimeShare, set: (i, v) => void (i.energy.negativePriceTimeShare = n(v)) },
  { id: "south", group: "energy", kind: "switch", sources: ["eeg"],
    get: (i) => i.energy.southRegion, set: (i, v) => void (i.energy.southRegion = Boolean(v)) },

  // Revenue
  { id: "award", group: "revenue", kind: "number", quick: true, unit: "ct/kWh", decimals: 2, min: 0.5, max: 15, usual: [4.0, 7.5], step: 0.01, sources: ["bnetza2608"],
    get: (i) => i.revenue.awardPriceCt, set: (i, v) => void (i.revenue.awardPriceCt = n(v)) },
  { id: "ltPrice", group: "revenue", kind: "number", quick: true, unit: "€/MWh", decimals: 0, min: 10, max: 250, usual: [50, 110], step: 1, sources: ["priceScenarios", "assumption"],
    get: (i) => i.revenue.longTermBaseEurMwh2026, set: (i, v) => void (i.revenue.longTermBaseEurMwh2026 = n(v)) },
  { id: "f2027", group: "revenue", kind: "number", unit: "€/MWh", decimals: 2, min: 0, max: 500, step: 0.5, sources: ["futures"], ...future(2027) },
  { id: "f2028", group: "revenue", kind: "number", unit: "€/MWh", decimals: 2, min: 0, max: 500, step: 0.5, sources: ["futures"], ...future(2028) },
  { id: "f2029", group: "revenue", kind: "number", unit: "€/MWh", decimals: 2, min: 0, max: 500, step: 0.5, sources: ["futures"], ...future(2029) },
  { id: "capture", group: "revenue", kind: "number", decimals: 2, min: 0.3, max: 1.2, usual: [0.7, 0.9], step: 0.01, sources: ["netztransparenzMarketValues", "assumption"],
    get: (i) => i.revenue.captureFactor, set: (i, v) => void (i.revenue.captureFactor = n(v)) },
  { id: "dv", group: "revenue", kind: "number", unit: "ct/kWh", decimals: 2, min: 0, max: 2, usual: [0.1, 0.4], step: 0.01, sources: ["windguardCost2025", "directMarketing", "assumption"],
    get: (i) => i.revenue.directMarketingCtKwh2026, set: (i, v) => void (i.revenue.directMarketingCtKwh2026 = n(v)) },
  { id: "postEeg", group: "revenue", kind: "select", options: ["market", "ppa"], optionsKey: "postEeg", sources: ["ppa"],
    get: (i) => i.revenue.postEeg, set: (i, v) => void (i.revenue.postEeg = String(v) === "ppa" ? "ppa" : "market") },
  { id: "ppa", group: "revenue", kind: "number", unit: "€/MWh", decimals: 0, min: 0, max: 250, usual: [40, 80], step: 1, sources: ["ppa"],
    hidden: (i) => i.revenue.postEeg !== "ppa",
    get: (i) => i.revenue.ppaEurMwh2026, set: (i, v) => void (i.revenue.ppaEurMwh2026 = n(v)) },
  { id: "twoSided", group: "revenue", kind: "switch", sources: ["eeg2027Draft"],
    get: (i) => i.revenue.twoSidedPremium, set: (i, v) => void (i.revenue.twoSidedPremium = Boolean(v)) },
  { id: "receivableDays", group: "revenue", kind: "number", unit: "days", decimals: 0, min: 0, max: 180, usual: [15, 60], step: 1, sources: ["eeg", "assumption"],
    get: (i) => i.revenue.receivableDays, set: (i, v) => void (i.revenue.receivableDays = n(v)) },
  { id: "municipal", group: "revenue", kind: "number", unit: "ct/kWh", decimals: 2, min: 0, max: 1, usual: [0, 0.3], step: 0.05, sources: ["eeg"],
    get: (i) => i.revenue.municipalCtKwh, set: (i, v) => void (i.revenue.municipalCtKwh = n(v)) },
  { id: "municipalAfter", group: "revenue", kind: "switch", sources: ["assumption"],
    get: (i) => i.revenue.municipalAfterEeg, set: (i, v) => void (i.revenue.municipalAfterEeg = Boolean(v)) },
  { id: "ceiling", group: "revenue", kind: "number", unit: "ct/kWh", decimals: 2, min: 1, max: 20, step: 0.01, sources: ["bnetzaCeiling2026"],
    get: (i) => i.revenue.ceilingPriceCt, set: (i, v) => void (i.revenue.ceilingPriceCt = n(v)) },

  // Capex
  { id: "capexTotal", group: "capex", kind: "number", quick: true, virtual: true, unit: "€/kW", decimals: 0, min: 500, max: 4000, usual: [1400, 2300], step: 5,
    sources: ["windguardCost2025", "ise2024"],
    get: (i) => capexTotal(i),
    set: (i, v) => {
      const cur = capexTotal(i);
      if (cur <= 0) return;
      const k = n(v) / cur;
      i.capex.items = i.capex.items.map((it) => ({ ...it, eurPerKw: it.eurPerKw * k }));
    } },
  ...["turbine", "foundation", "infrastructure", "gridConnection", "development", "compensation", "other"].map(
    (key): FieldDef => ({
      id: `cx_${key}`, group: "capex", kind: "number", unit: "€/kW", decimals: 0, min: 0, max: 3000, step: 1,
      sources: key === "other" ? ["windguardCost2025", "assumption"] : ["windguardCost2025"],
      ...capexItem(key),
    }),
  ),
  { id: "contingency", group: "capex", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 30, usual: [0, 6], step: 0.5, sources: ["assumption"],
    get: (i) => i.capex.contingencyPct, set: (i, v) => void (i.capex.contingencyPct = n(v)) },
  { id: "vatLag", group: "capex", kind: "number", unit: "months", decimals: 0, min: 0, max: 12, usual: [1, 3], step: 1, sources: ["ustg", "assumption"],
    get: (i) => i.capex.vatRefundLagMonths, set: (i, v) => void (i.capex.vatRefundLagMonths = Math.round(n(v))) },

  // Opex
  { id: "opexTotal", group: "opex", kind: "number", quick: true, virtual: true, unit: "€/kW/yr", decimals: 1, min: 1, max: 150, usual: [15, 40], step: 0.5,
    sources: ["windguardCost2025"],
    get: (i) => opexTotal(i),
    set: (i, v) => {
      const cur = opexTotal(i);
      if (cur <= 0) return;
      const k = n(v) / cur;
      for (const key of Object.values(OPEX_KEYS)) {
        const t = i.opex[key];
        i.opex[key] = [t[0] * k, t[1] * k, t[2] * k];
      }
    } },
  ...opexCells,
  { id: "lease", group: "opex", kind: "number", quick: true, unit: "% of revenue", scale: 100, decimals: 1, min: 0, max: 30, usual: [5, 15], step: 0.5,
    sources: ["leaseMarket", "windguardCost2025", "assumption"],
    get: (i) => i.opex.leaseShareOfRevenue, set: (i, v) => void (i.opex.leaseShareOfRevenue = n(v)) },
  { id: "leaseMin", group: "opex", kind: "number", unit: "€ per turbine", decimals: 0, min: 0, max: 500000, usual: [0, 150000], step: 1000, sources: ["leaseMarket", "assumption"],
    get: (i) => i.opex.leaseMinPerTurbine2026, set: (i, v) => void (i.opex.leaseMinPerTurbine2026 = n(v)) },
  { id: "gridFee", group: "opex", kind: "number", unit: "€/kW/yr", decimals: 1, min: 0, max: 30, usual: [0, 7], step: 0.5, sources: ["agnes"],
    get: (i) => i.opex.gridFeePerKw2026, set: (i, v) => void (i.opex.gridFeePerKw2026 = n(v)) },
  { id: "decomCost", group: "opex", kind: "number", unit: "€/kW", decimals: 0, min: 0, max: 300, usual: [35, 80], step: 1, sources: ["decommissioning", "assumption"],
    get: (i) => i.opex.decommissioningCostPerKw2026, set: (i, v) => void (i.opex.decommissioningCostPerKw2026 = n(v)) },
  { id: "guaranteeFee", group: "opex", kind: "number", unit: "% p.a.", scale: 100, decimals: 2, min: 0, max: 5, usual: [0.5, 2], step: 0.05, sources: ["prospectuses", "assumption"],
    get: (i) => i.opex.guaranteeFeeRate, set: (i, v) => void (i.opex.guaranteeFeeRate = n(v)) },

  // Financing
  { id: "rate", group: "financing", kind: "number", quick: true, unit: "%", scale: 100, decimals: 2, min: 0, max: 15, usual: [3.5, 7], step: 0.05, sources: ["kfw270"],
    get: (i) => i.financing.interestRate, set: (i, v) => void (i.financing.interestRate = n(v)) },
  { id: "dscrP50", group: "financing", kind: "number", quick: true, unit: "x", decimals: 2, min: 0.8, max: 3, usual: [1.05, 1.4], step: 0.01, sources: ["prospectuses", "assumption"],
    get: (i) => i.financing.targetDscrP50, set: (i, v) => void (i.financing.targetDscrP50 = n(v)) },
  { id: "dscrP90", group: "financing", kind: "number", unit: "x", decimals: 2, min: 0.5, max: 3, usual: [0.95, 1.25], step: 0.01, sources: ["assumption"],
    get: (i) => i.financing.targetDscrP90, set: (i, v) => void (i.financing.targetDscrP90 = n(v)) },
  { id: "tenor", group: "financing", kind: "number", unit: "years", decimals: 0, min: 3, max: 30, usual: [15, 20], step: 1, sources: ["kfw270", "windguardCost2025"],
    get: (i) => i.financing.tenorYearsFromClose, set: (i, v) => void (i.financing.tenorYearsFromClose = Math.round(n(v))) },
  { id: "grace", group: "financing", kind: "number", unit: "years", decimals: 0, min: 0, max: 10, usual: [1, 3], step: 1, sources: ["kfw270"],
    get: (i) => i.financing.graceYears, set: (i, v) => void (i.financing.graceYears = Math.round(n(v))) },
  { id: "repayment", group: "financing", kind: "select", options: ["linear", "annuity", "sculpted"], optionsKey: "repayment", sources: ["kfw270"],
    get: (i) => i.financing.repayment,
    set: (i, v) => void (i.financing.repayment = v === "annuity" ? "annuity" : v === "sculpted" ? "sculpted" : "linear") },
  { id: "maxGearing", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 0, min: 0, max: 100, usual: [60, 90], step: 1, sources: ["gearing", "windguardCost2025"],
    get: (i) => i.financing.maxGearing, set: (i, v) => void (i.financing.maxGearing = n(v)) },
  { id: "bankBasis", group: "financing", kind: "select", options: ["floor", "base"], optionsKey: "bankBasis", sources: ["bankLetter", "assumption"],
    get: (i) => i.revenue.bankPriceBasis, set: (i, v) => void (i.revenue.bankPriceBasis = v === "base" ? "base" : "floor") },
  { id: "lockup", group: "financing", kind: "number", unit: "x", decimals: 2, min: 0.5, max: 3, usual: [1.05, 1.2], step: 0.01, sources: ["assumption"],
    get: (i) => i.financing.lockupDscr, set: (i, v) => void (i.financing.lockupDscr = n(v)) },
  { id: "covenant", group: "financing", kind: "number", unit: "x", decimals: 2, min: 0.5, max: 3, usual: [1.0, 1.15], step: 0.01, sources: ["assumption"],
    get: (i) => i.financing.covenantDscr, set: (i, v) => void (i.financing.covenantDscr = n(v)) },
  { id: "dsra", group: "financing", kind: "number", unit: "months", decimals: 0, min: 0, max: 12, usual: [3, 6], step: 1, sources: ["prospectuses"],
    get: (i) => i.financing.dsraMonths, set: (i, v) => void (i.financing.dsraMonths = n(v)) },
  { id: "upfront", group: "financing", kind: "number", unit: "%", scale: 100, decimals: 2, min: 0, max: 5, usual: [0.5, 1.5], step: 0.05, sources: ["prospectuses", "assumption"],
    get: (i) => i.financing.upfrontFeePct, set: (i, v) => void (i.financing.upfrontFeePct = n(v)) },
  { id: "commitment", group: "financing", kind: "number", unit: "% / month", scale: 100, decimals: 2, min: 0, max: 1, step: 0.01, sources: ["kfw270"],
    get: (i) => i.financing.commitmentFeePerMonth, set: (i, v) => void (i.financing.commitmentFeePerMonth = n(v)) },
  { id: "equityFirst", group: "financing", kind: "switch", sources: ["assumption"],
    get: (i) => i.financing.equityFirst, set: (i, v) => void (i.financing.equityFirst = Boolean(v)) },

  // Tax
  { id: "legalForm", group: "tax", kind: "select", quick: true, options: ["KG", "GmbH"], optionsKey: "legalForm", sources: ["gewstg", "kstg"],
    get: (i) => i.tax.legalForm, set: (i, v) => void (i.tax.legalForm = v === "GmbH" ? "GmbH" : "KG") },
  { id: "hebesatz", group: "tax", kind: "number", quick: true, unit: "%", scale: 100, decimals: 0, min: 200, max: 900, usual: [300, 500], step: 5, sources: ["gewstg", "assumption"],
    get: (i) => i.tax.hebesatz, set: (i, v) => void (i.tax.hebesatz = n(v)) },
  { id: "depYears", group: "tax", kind: "number", unit: "years", decimals: 0, min: 5, max: 30, usual: [16, 20], step: 1, sources: ["bfhWindPark"],
    get: (i) => i.tax.depreciationYears, set: (i, v) => void (i.tax.depreciationYears = Math.round(n(v))) },
  { id: "degressive", group: "tax", kind: "switch", sources: ["estg"],
    get: (i) => i.tax.degressive, set: (i, v) => void (i.tax.degressive = Boolean(v)) },

  // Valuation & inflation
  { id: "coe", group: "valuation", kind: "number", quick: true, unit: "%", scale: 100, decimals: 1, min: 0, max: 25, usual: [5, 12], step: 0.1, sources: ["windguardCost2025", "ise2024"],
    get: (i) => i.macro.costOfEquity, set: (i, v) => void (i.macro.costOfEquity = n(v)) },
  { id: "inf2026", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: -5, max: 15, step: 0.1, sources: ["bundesbank"], ...inflation(2026) },
  { id: "inf2027", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: -5, max: 15, step: 0.1, sources: ["bundesbank"], ...inflation(2027) },
  { id: "inf2028", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: -5, max: 15, step: 0.1, sources: ["bundesbank"], ...inflation(2028) },
  { id: "infLR", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: -2, max: 10, usual: [1, 3], step: 0.1, sources: ["ecb"],
    get: (i) => i.macro.longRunInflation, set: (i, v) => void (i.macro.longRunInflation = n(v)) },
  { id: "waccReal", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 15, step: 0.1, sources: ["ise2024"],
    get: (i) => i.macro.waccReal, set: (i, v) => void (i.macro.waccReal = n(v)) },
  { id: "waccNominal", group: "valuation", kind: "number", unit: "%", scale: 100, decimals: 1, min: 0, max: 20, step: 0.1, sources: ["ise2024"],
    get: (i) => i.macro.waccNominal, set: (i, v) => void (i.macro.waccNominal = n(v)) },
];

export const GROUPS: GroupId[] = ["project", "energy", "revenue", "capex", "opex", "financing", "tax", "valuation"];
export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

/** Display value (e.g. 68 for a stored 0.68). */
export function toDisplay(f: FieldDef, v: FieldValue): FieldValue {
  return typeof v === "number" ? v * (f.scale ?? 1) : v;
}

/** Stored value from a displayed number. */
export function fromDisplay(f: FieldDef, v: number): number {
  return v / (f.scale ?? 1);
}

/** Returns a new Inputs object with one field changed; the original is not touched. */
export function withField(inputs: Inputs, f: FieldDef, v: FieldValue): Inputs {
  const copy = structuredClone(inputs);
  f.set(copy, v);
  return copy;
}

export function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
}
