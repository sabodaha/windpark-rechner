// Base case "Windpark Musterhöhe" (fictional). Every value comes from a public source, checked on
// 30 Sep 2026, or is a documented assumption. Keys of SOURCES are referenced from INPUT_SOURCES.
import type { Inputs } from "./types";

export const DATA_AS_OF = "2026-09-30";

/** Published tender facts, shown as reference points next to the user's inputs. */
export const TENDER_FACTS = {
  lastRoundDate: "2026-08-01",
  /** Date of the BNetzA announcement of the awards; § 36e and § 55 deadlines run from it. */
  lastRoundNoticeDate: "2026-09-17",
  lastRoundAverageCt: 4.79,
  ceiling2026Ct: 7.25,
} as const;

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
    awardNoticeDate: "2026-09-17",
    premiumTrueUpLagMonths: 3,
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
  eegAwardDeadlines: {
    title: "EEG §§ 36e, 36i, 55: award lapses 36 months after its announcement; penalty after 30 months",
    url: "https://www.gesetze-im-internet.de/eeg_2014/__36e.html",
    date: "2025-12-18",
  },
  eegSettlement: {
    title: "EEG § 26: monthly advances, may use the previous year's market value; final settlement next year",
    url: "https://www.gesetze-im-internet.de/eeg_2014/__26.html",
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
    title: "KfW programme 270 – rate sheet (price class A, 20 years, 3 grace years)",
    url: "https://www.kfw-formularsammlung.de/KonditionenanzeigerINet/KonditionenAnzeiger?ProgrammNameNr=270",
    date: "2026-09-29",
  },
  kfw270Merkblatt: {
    title: "KfW Merkblatt 270 (05/2025): quarterly equal instalments, grace years, drawdown period, commitment fee",
    url: "https://www.kfw.de/PDF/Download-Center/F%C3%B6rderprogramme-%28Inlandsf%C3%B6rderung%29/PDF-Dokumente/6000000178_M_270_EE-Standard.pdf",
    date: "2025-05-01",
  },
  netztransparenzMarketValues: {
    title: "Netztransparenz: annual market values (JW) Wind an Land",
    url: "https://www.netztransparenz.de/de-de/Erneuerbare-Energien-und-Umlagen/EEG/Transparenzanforderungen/Marktpr%C3%A4mie/Marktwert%C3%BCbersicht",
    date: "2026-09-30",
  },
  futures: {
    title: "EEX Phelix-DE baseload futures Cal-27 and Cal-28 (via Tacto, 25 Sep 2026)",
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
  estg: {
    title: "Einkommensteuergesetz §§ 6, 7, 10d (provisions, depreciation, loss offset)",
    url: "https://www.gesetze-im-internet.de/estg/",
    date: "2026-06-29",
  },
  smard: {
    title: "SMARD (Bundesnetzagentur): negative day-ahead prices 2023–2025",
    url: "https://www.smard.de/page/en/topic-article/217400/219038/record-high-for-solar-generation-in-each-quarter",
    date: "2026-01-05",
  },
  leeFullLoad: {
    title: "Deutsche WindGuard for LEE NRW: full-load hours of onshore turbines (availability, losses)",
    url: "https://www.lee-nrw.de/data/documents/2026/05/27/1135-6a16aed9d0bed.pdf",
    date: "2026-05-27",
  },
  degradation: {
    title: "Hamilton et al. (LBNL, Joule 2020): how does wind project performance change with age?",
    url: "https://emp.lbl.gov/publications/how-does-wind-project-performance",
    date: "2020-05-01",
  },
  uncertainty: {
    title: "Pryor et al., Wind Energy Science 3 (2018): inter-annual variability of wind",
    url: "https://wes.copernicus.org/articles/3/651/2018/",
    date: "2018-10-01",
  },
  leaseMarket: {
    title: "top agrar (Sep 2026): what land leases wind farms can still afford",
    url: "https://www.topagrar.com/energie/news/wie-viel-pacht-konnen-windparks-heute-noch-wirtschaftlich-tragen-b-20028943.html",
    date: "2026-09-26",
  },
  decommissioning: {
    title: "Bundestag research service WD 5-3000-087/25: decommissioning costs of wind turbines",
    url: "https://www.bundestag.de/resource/blob/1127440/WD-5-087-25.pdf",
    date: "2025-10-23",
  },
  hessenSecurity: {
    title: "Hessian Landtag Drucksache 21/2671: decommissioning security = hub height × €1,000",
    url: "https://starweb.hessen.de/cache/DRS/21/1/02671.pdf",
    date: "2025-09-09",
  },
  prospectuses: {
    title: "Community wind-farm prospectuses 2023–2026 (DSCR, reserves, fees, gearing)",
    url: "https://beteiligung.l-projekt.com/sites/beteiligung.l-projekt.com/files/downloads/VermAnlG_HW_BaFin_Prospekt_Endfassung_29082023.pdf",
    date: "2023-08-29",
  },
  gearing: {
    title: "Energie-Atlas Bayern: banks usually finance 75–85% of the investment",
    url: "https://www.energieatlas.bayern.de/erneuerbare-energien/windenergie/kommunen/finanzierung-teilhabe",
    date: "2026-02-01",
  },
  bankLetter: {
    title: "Solarserver (17 Sep 2026): 18 banks warn about financing risks of the EEG 2027 draft",
    url: "https://www.solarserver.de/2026/09/17/eeg-2027-banken-fordern-uebergangsfristen-vor-bundestags-lesung",
    date: "2026-09-17",
  },
  eeg2027Draft: {
    title: "Bundestag, 24 Sep 2026: first reading of the EEG 2027 bill (two-sided premium)",
    url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-de-energie-stromsektor-1211294",
    date: "2026-09-24",
  },
  priceScenarios: {
    title: "Long-term power price scenarios (Ariadne 70–80, Prognos 73–86, Agora 65–101 €/MWh)",
    url: "https://cubeconcepts.de/en/electricity-price-forecasts-in-comparison/",
    date: "2025-10-08",
  },
  directMarketing: {
    title:
      "Netztransparenz: statutory marketing deduction 2026 for plants after support (0.228 ct/kWh) — a reference point, not a market offer",
    url: "https://www.netztransparenz.de/de-de/Erneuerbare-Energien-und-Umlagen/EEG/EEG-Abrechnungen/Ausgef%C3%B6rderte-Anlagen/Abzugsbetrag-2026",
    date: "2026-01-01",
  },
  ppa: {
    title: "Energie & Management PPA index: onshore wind, 2-year PPAs (53–74 €/MWh)",
    url: "https://www.energie-und-management.de/nachrichten/ueberblick/detail/oel-zieht-auch-oekostrom-ppa-hoch-358681",
    date: "2026-04-09",
  },
  ecb: {
    title: "European Central Bank: 2% inflation target; staff projections September 2026",
    url: "https://www.ecb.europa.eu/press/projections/html/ecb.projections202609_ecbstaff~8e340fc69d.en.html",
    date: "2026-09-10",
  },
  ustg: {
    title: "Umsatzsteuergesetz §§ 12, 18 (VAT rate, returns)",
    url: "https://www.gesetze-im-internet.de/ustg_1980/",
    date: "2026-06-29",
  },
  agnes: {
    title: "Solarserver (17 Sep 2026): generator grid fees under BNetzA AgNes, corridor 4–7 €/kW/yr",
    url: "https://www.solarserver.de/2026/09/17/eeg-2027-banken-fordern-uebergangsfristen-vor-bundestags-lesung",
    date: "2026-09-17",
  },
  futures2029: {
    title: "EEX Phelix-DE baseload futures Cal-29 (power2market, 31 Aug 2026)",
    url: "https://www.power2market.com/de/markets/de/termin",
    date: "2026-08-31",
  },
};
