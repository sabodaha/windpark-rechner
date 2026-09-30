// Base case "Windpark Musterhöhe" (fictional). Every value comes from a public source, checked on
// 30 Sep 2026, or is a documented assumption. Keys of SOURCES are referenced from INPUT_SOURCES.
import type { Inputs } from "./types";

export const DATA_AS_OF = "2026-09-30";

export const BASE_CASE: Inputs = {
  project: {
    turbines: 5,
    turbineMw: 6.3,
    hubHeightM: 159,
    rotorDiameterM: 165,
    financialClose: "2027-01-01",
    constructionMonths: 18,
    lifetimeYears: 25,
  },
  energy: {
    referenceYieldHours: 3623,
    siteQuality: 0.68,
    southRegion: false,
    availability: 0.97,
    otherExtraLosses: 0,
    degradationPerYear: 0.002,
    sigma1y: 0.128,
    sigma10y: 0.103,
    negativePriceOutputShare: 0.05,
    negativePriceTimeShare: 0.065,
  },
  revenue: {
    awardPriceCt: 4.79,
    ceilingPriceCt: 7.25,
    futuresEurMwh: [
      { year: 2027, value: 128.37 },
      { year: 2028, value: 98.88 },
      { year: 2029, value: 82.74 },
    ],
    longTermBaseEurMwh2026: 75,
    captureFactor: 0.8,
    directMarketingCtKwh2026: 0.2,
    postEeg: "market",
    ppaEurMwh2026: 60,
    twoSidedPremium: false,
    receivableDays: 30,
    municipalCtKwh: 0.2,
    municipalAfterEeg: true,
    bankPriceBasis: "floor",
  },
  capex: {
    items: [
      // turbine 838 + transport & installation 325 (WindGuard split 67 / 26 / 7 % of 1,250 €/kW)
      { key: "turbine", eurPerKw: 1163, profile: "turbine" },
      { key: "foundation", eurPerKw: 88, profile: "thirds" },
      { key: "infrastructure", eurPerKw: 119, profile: "thirds" },
      { key: "gridConnection", eurPerKw: 133, profile: "thirds" },
      { key: "development", eurPerKw: 163, profile: "atStart" },
      { key: "compensation", eurPerKw: 35, profile: "atStart" },
      { key: "other", eurPerKw: 60, profile: "linear" },
    ],
    contingencyPct: 0.03,
    vatRate: 0.19,
    vatRefundLagMonths: 2,
  },
  opex: {
    maintenancePerKw: [14, 16, 17.6],
    managementPerKw: [4, 5, 5],
    insurancePerKw: [1, 1, 1],
    otherPerKw: [6, 6, 6],
    leaseShareOfRevenue: 0.1,
    leaseMinPerTurbine2026: 70_000,
    decommissioningBondPerMeterHub: 1000,
    guaranteeFeeRate: 0.0125,
    decommissioningCostPerKw2026: 50,
    decommissioningReserveYears: 5,
    gridFeePerKw2026: 0,
  },
  financing: {
    interestRate: 0.0535,
    tenorYearsFromClose: 20,
    graceYears: 3,
    repayment: "linear",
    targetDscrP50: 1.2,
    targetDscrP90: 1.0,
    covenantDscr: 1.05,
    lockupDscr: 1.1,
    maxGearing: 0.8,
    upfrontFeePct: 0.01,
    commitmentFeePerMonth: 0.0015,
    commitmentFeeStartMonth: 7,
    dsraMonths: 3,
    vatFacilitySpread: 0.0085,
    equityFirst: false,
  },
  tax: {
    legalForm: "KG",
    hebesatz: 4.0,
    depreciationYears: 16,
    degressive: false,
  },
  macro: {
    inflation: [
      { year: 2026, value: 0.029 },
      { year: 2027, value: 0.027 },
      { year: 2028, value: 0.019 },
    ],
    longRunInflation: 0.02,
    costOfEquity: 0.08,
    waccNominal: 0.058,
    waccReal: 0.039,
  },
};

export interface Source {
  title: string;
  url: string;
  date: string;
}

export const SOURCES: Record<string, Source> = {
  bnetza2608: {
    title: "Bundesnetzagentur: onshore wind tender of 1 Aug 2026",
    url: "https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2026/20260917_Wind.html",
    date: "2026-09-17",
  },
  bnetzaCeiling2026: {
    title: "Bundesnetzagentur: ceiling prices 2026",
    url: "https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2025/20251216_Hoechstwerte.html",
    date: "2025-12-16",
  },
  eeg: {
    title: "Erneuerbare-Energien-Gesetz (EEG 2023), consolidated text",
    url: "https://www.gesetze-im-internet.de/eeg_2014/",
    date: "2025-12-18",
  },
  windguardCost2025: {
    title: "Deutsche WindGuard: Kostensituation der Windenergie an Land – Stand 2025",
    url: "https://www.windguard.de/files/cto_layout/img/unternehmen/veroeffentlichungen/2025/Kostensituation%20der%20Windenergie%20an%20Land%20%E2%80%93%20Stand%202025.pdf",
    date: "2025-12-02",
  },
  fawsSiteQuality: {
    title: "Fachagentur Wind und Solar: site quality of turbines with a tender award",
    url: "https://www.fachagentur-wind-solar.de/fileadmin/Veroeffentlichungen/Wind/Analysen/FA_Wind_Solar_Guetefaktoren_WEA_mit_Ausschreibungszuschlag.pdf",
    date: "2025-06-30",
  },
  fawsStatusH1: {
    title: "Fachagentur Wind und Solar: Status des Windenergieausbaus an Land, H1 2026",
    url: "https://www.fachagentur-wind-solar.de/fileadmin/Veroeffentlichungen/Wind/Daten/FA_Wind_Solar_Status_des_Windenergieausbaus_an_Land_Halbjahr_2026.pdf",
    date: "2026-07-23",
  },
  kfw270: {
    title: "KfW programme 270 – rate sheet and Merkblatt",
    url: "https://www.kfw-formularsammlung.de/KonditionenanzeigerINet/KonditionenAnzeiger?ProgrammNameNr=270",
    date: "2026-09-29",
  },
  netztransparenzMarketValues: {
    title: "Netztransparenz: annual market values (JW) Wind an Land",
    url: "https://www.netztransparenz.de/de-de/Erneuerbare-Energien-und-Umlagen/EEG/Transparenzanforderungen/Marktpr%C3%A4mie/Marktwert%C3%BCbersicht",
    date: "2026-09-30",
  },
  futures: {
    title: "EEX Phelix-DE baseload futures (via Tacto, 25 Sep 2026; power2market, 31 Aug 2026)",
    url: "https://www.tacto.ai/en/energy/electricity-price",
    date: "2026-09-25",
  },
  bundesbank: {
    title: "Deutsche Bundesbank: macroeconomic projections, June 2026",
    url: "https://publikationen.bundesbank.de/content/998836",
    date: "2026-06-12",
  },
  ise2024: {
    title: "Fraunhofer ISE: Stromgestehungskosten Erneuerbare Energien (July 2024)",
    url: "https://www.ise.fraunhofer.de/content/dam/ise/de/documents/publications/studies/DE2024_ISE_Studie_Stromgestehungskosten_Erneuerbare_Energien.pdf",
    date: "2024-07-01",
  },
  gewstg: {
    title: "Gewerbesteuergesetz",
    url: "https://www.gesetze-im-internet.de/gewstg/",
    date: "2026-06-29",
  },
  kstg: {
    title: "Körperschaftsteuergesetz § 23",
    url: "https://www.gesetze-im-internet.de/kstg_1977/__23.html",
    date: "2026-02-04",
  },
  bfhWindPark: {
    title: "BFH IV R 46/09 (14 Apr 2011): wind-park assets depreciated over 16 years",
    url: "https://www.bundesfinanzhof.de/en/entscheidungen/entscheidungen-online/decision-detail/STRE201110124/",
    date: "2011-04-14",
  },
};

/** Which sources back which input (path in `Inputs`). Assumptions are marked with "assumption". */
export const INPUT_SOURCES: Record<string, string[]> = {
  "project.turbineMw": ["windguardCost2025"],
  "project.constructionMonths": ["fawsStatusH1", "assumption"],
  "energy.referenceYieldHours": ["windguardCost2025"],
  "energy.siteQuality": ["fawsSiteQuality"],
  "revenue.awardPriceCt": ["bnetza2608"],
  "revenue.ceilingPriceCt": ["bnetzaCeiling2026"],
  "revenue.futuresEurMwh": ["futures"],
  "revenue.captureFactor": ["netztransparenzMarketValues", "assumption"],
  "capex.items": ["windguardCost2025"],
  "opex.maintenancePerKw": ["windguardCost2025"],
  "financing.interestRate": ["kfw270"],
  "tax.hebesatz": ["gewstg", "assumption"],
  "tax.depreciationYears": ["bfhWindPark"],
  "macro.inflation": ["bundesbank"],
  "macro.waccReal": ["ise2024"],
};
