// Public sources of the German battery calculator (spec v1.2 R2.4): what each says is in the methodology and in the input
// hints. `date` is the day the source was last checked against the model (or its publication date for a dated document).

export interface DeSource {
  title: string;
  url: string;
  date: string;
  /** What the model takes from it, for the Sources page. */
  used: string;
  group: "prices" | "revenue" | "technology" | "costs" | "grid" | "finance" | "tax" | "macro" | "law";
}

export const DE_SOURCES: Record<string, DeSource> = {
  energyCharts: {
    title: "Energy-Charts (Fraunhofer ISE): DE-LU day-ahead prices, data Bundesnetzagentur | SMARD.de (CC BY 4.0)",
    url: "https://www.energy-charts.info/charts/price_spot_market/chart.htm?l=en&c=DE",
    date: "2026-10-03",
    used:
      "Day-ahead prices of 2025 (the base snapshot) and of October 2025 to September 2026 (the alternative), retrieved " +
      "through the Energy-Charts API, with the " +
      "quarter-hours averaged to hours from 1 October 2025: the input of the revenue library. The daily spreads between " +
      "the two highest and two lowest hours sum to €84,737.51 per MW for 2025 and €97,716.57 for the alternative; " +
      "January–September 2026 ran 18.5% above the same months of 2025, the 2028 level of the high spread path.",
    group: "prices",
  },
  epex15min: {
    title: "EPEX SPOT: 15-minute products in the day-ahead market coupling",
    url: "https://www.epexspot.com/en/new-15-minute-products-market-coupling",
    date: "2026-10-03",
    used:
      "Day-ahead prices come in quarter-hours from delivery on 1 October 2025, so the model averages each hour’s four " +
      "quarter-hours and compares all prices by the hour. In January–September 2026 the quarter-hours gave a spread 4.8% " +
      "wider than their hourly averages; the model leaves that gain out.",
    group: "prices",
  },

  spreadOutlook: {
    title: "Modo Energy: June 2026 German battery storage livestream, key takeaways",
    url: "https://modoenergy.com/research/de/june-2026-german-battery-storage-livestream-key-takeaways",
    date: "2026-10-03",
    used:
      "In an extreme case of 78 GW of batteries, the spread between the highest and lowest prices narrows by about 40%: " +
      "the floor of the low spread path, 60% of the snapshot spread from 2031 after 85%, 75% and 65% in 2028–2030.",
    group: "revenue",
  },
  iseSimulator: {
    title: "Fraunhofer ISE: Energy-Charts launches a price simulator (press release, 1 Oct 2026)",
    url: "https://www.ise.fraunhofer.de/de/presse-und-medien/presseinformationen/2026/datenplattform-energy-charts-startet-preissimulator.html",
    date: "2026-10-03",
    used:
      "Adding 20 GW / 40 GWh of batteries to the 2025 bids cuts the average spread between the highest and lowest " +
      "quarter-hour prices from €130 to €53 per MWh, about 60%: a static test that goes further than the low spread path.",
    group: "revenue",
  },
  captureDe: {
    title: "Hornek et al., arXiv preprint: battery storage in the continuous intraday market, forecast vs perfect foresight (Jan 2025)",
    url: "https://arxiv.org/abs/2501.07121",
    date: "2026-10-03",
    used:
      "On the continuous intraday market a forecast-driven strategy earned 11% less than perfect foresight. No study " +
      "calibrates day-ahead trading alone in Germany, so the capture factor — 75% of the perfect-foresight day-ahead " +
      "margin, 65% and 85% in the tornado — is an assumption.",
    group: "revenue",
  },
  optimiserFee: {
    title: "enspired: BESS revenue models — toll, floor and fully merchant (4 Feb 2025)",
    url: "https://www.enspired-trading.com/blog/bess-revenue-models-toll-floor-fully-merchant",
    date: "2026-10-03",
    used:
      "Revenue splits between owner and optimiser of 90:10, 85:15 and 80:20: the model’s fee of 10% of the positive " +
      "merchant margin after the capture factor, with no fee on the tolled share.",
    group: "revenue",
  },
  tollMarket: {
    title: "Terralayr: what are tolling agreements? (15 Oct 2025)",
    url: "https://www.trlyr.com/insights/what-are-tolling-agreements/",
    date: "2026-10-03",
    used:
      "Indicative tolls of €110,000–150,000 per MW a year, typically for five to seven years and sometimes ten: the market " +
      "range shown next to the break-even toll, the base toll of €120,000 for two hours and €110,000 in the tornado. The " +
      "€150,000 for four hours has no public German deal behind it.",
    group: "revenue",
  },
  tollPractice: {
    title: "Nofar Energy: Tel Aviv Stock Exchange filing on the Stendal battery toll, 104.5 MW / 209 MWh (8 Dec 2024, in Hebrew)",
    url: "https://mayafiles.tase.co.il/rpdf/1632001-1633000/P1632128-00.pdf",
    date: "2026-10-03",
    used:
      "A seven-year toll for a fixed €85–95 million, paid monthly and adjusted for performance and availability (about " +
      "€116,200–129,870 per MW a year): the 84-month term, the nominal fee linked to availability (95% guaranteed in the " +
      "model) and a cross-check of the toll price. The tolled share is not disclosed; the model’s 80% is an assumption.",
    group: "revenue",
  },
  stromVkg: {
    title: "StromVKG (capacity market law of 21 Jul 2026) §12: eligibility in the 2026 auctions",
    url: "https://www.gesetze-im-internet.de/stromvkg/__12.html",
    date: "2026-10-03",
    used:
      "A battery in the 2026 capacity auctions must deliver for ten hours at 80% or more of its installed power, which " +
      "two- and four-hour batteries cannot do: one reason the model counts no capacity-market revenue.",
    group: "revenue",
  },

  degradation: {
    title: "NREL BLAST-Lite battery degradation models (BSD-3)",
    url: "https://github.com/NatLabRockies/BLAST-Lite",
    date: "2026-10-03",
    used:
      "Calendar and cycle fade of an LFP cell: 1.1% × years^0.526 and 1.55·10⁻⁴ × EFC^0.828, with the exponents of the " +
      "BLAST code and the coefficients reduced to fixed values at 25 °C; the stress case raises fade by 30%.",
    group: "technology",
  },
  warranty: {
    title: "ESS News: Making BESS warranties work — contracts vs reality (Sep 2025)",
    url: "https://www.ess-news.com/2025/09/19/making-bess-warranties-work-contracts-vs-reality/",
    date: "2026-10-03",
    used:
      "A manufacturer warranty of about 548 cycles a year at 0.5C: the cap of 1.5 cycles a day (1.0 as a variant), which " +
      "is also the toll buyer’s daily cycling.",
    group: "technology",
  },
  enervisIndex: {
    title: "enervis in pv magazine: German battery storage revenue index for July 2026 (28 Aug 2026)",
    url: "https://www.pv-magazine.de/2026/08/28/enervis-batteriespeicher-index-batteriespeicher-erloese-in-deutschland-bleiben-im-juli-auf-hohem-niveau-starke-photovoltaik-einspeisung-und-hohe-preise-zu-spitzenlastzeiten-getrieben-durch/",
    date: "2026-10-03",
    used:
      "Index inputs of 97% availability, 1.5 cycles a day and 87% round-trip efficiency: the model’s 97% availability " +
      "after the first operating year, its cap of 1.5 cycles a day and its efficiency nodes of 85–90%.",
    group: "technology",
  },
  availabilityGuarantee: {
    title: "Solarif: what performance guarantees lenders require for BESS",
    url: "https://solarif.com/academy-article/what-performance-guarantees-do-lenders-require-for-bess/",
    date: "2026-10-03",
    used:
      "Lenders require availability guarantees of 95–98%: the model’s 95% availability in the first operating year and " +
      "the 95% availability guaranteed to the toll buyer.",
    group: "technology",
  },

  capexDe: {
    title: "Modo Energy: Germany battery investment outlook Q2 2026, executive summary (16 Mar 2026)",
    url: "https://modoenergy.com/research/en/germany-battery-investment-outlook-q2-2026-executive-summary",
    date: "2026-10-03",
    used:
      "All-in costs of €700 per kW for two-hour and €935 per kW for four-hour batteries commissioned in 2026: shown next " +
      "to the model’s €765 and €1,024 per kW, without fitting. In the same outlook, 50% more batteries cut day-ahead " +
      "spreads by 17% in 2030: an anchor of the low spread path.",
    group: "costs",
  },
  speOutlook: {
    title: "SolarPower Europe: European Battery Market Outlook 2026–2030 (23 Jun 2026)",
    url: "https://www.solarpowereurope.org/insights/outlooks/european-battery-market-outlook-2026-2030-1/detail",
    date: "2026-10-03",
    used:
      "DC containers at €64–77 per nameplate kWh in Q2 2026: the DC block at €75 per kWh (€177.67 per kW at two hours) " +
      "and the augmentation of 15% more DC capacity in February 2038 at €86 per kWh, module plus 15% installation.",
    group: "costs",
  },
  ember: {
    title: "Ember: How cheap is battery storage? (11 Dec 2025)",
    url: "https://ember-energy.org/latest-insights/how-cheap-is-battery-storage/",
    date: "2026-10-03",
    used:
      "Installation and grid connection at about $50 per kWh outside China and the US: the cross-check for balance of " +
      "plant and EPC at €100 per kW for two hours and €150 for four.",
    group: "costs",
  },
  opexDe: {
    title: "Lazard: Levelized Cost of Energy+ 2026, storage (LCOS v11)",
    url: "https://www.lazard.com/media/kcfconhf/lazards-lcoeplus_vf.pdf",
    date: "2026-10-03",
    used:
      "Operation and maintenance at USD 5.00–8.75 per kWh a year for two-hour and USD 3.75–7.75 for four-hour systems: " +
      "the cross-check for O&M of €10,000 and €16,000 per MW a year. Round-trip efficiency of 87–91% at two hours: the " +
      "efficiency nodes of 88% and 90%.",
    group: "costs",
  },
  insurance: {
    title: "Solarif: emerging trends in battery storage insurance",
    url: "https://solarif.com/academy-article/what-are-emerging-battery-storage-insurance-trends-in-2025/",
    date: "2026-10-03",
    used:
      "Broker guidance of 0.3–1.2% of the insured value a year: the model’s 0.5% a year on the cost of the DC block, PCS, " +
      "balance of plant, substation and contingency (€23.5 million at two hours in 2026 prices), indexed.",
    group: "costs",
  },
  landLease: {
    title: "ENLAPA: leasing land for large battery storage",
    url: "https://www.enlapa.de/de/magazin/flaechen_verpachten_batterie_grossspeicher_bess",
    date: "2026-10-03",
    used: "Leases of €20,000–30,000 per hectare a year: the model’s €25,000 per hectare on 1 ha (two hours) or 1.5 ha (four hours).",
    group: "costs",
  },
  batteryRegulation: {
    title: "EU Battery Regulation 2023/1542, Article 61: collection of waste industrial batteries (text at Haufe)",
    url: "https://www.haufe.de/id/norm/verordnung-eu-20231542-des-europaeischen-parlaments-un-art-61-sammlung-von-starteraltbatterien-industriealtbatterien-und-elektrofahrzeugaltbatterien-HI15825762_p61.html",
    date: "2026-10-03",
    used:
      "Producers take back waste industrial batteries free of charge: the model’s net decommissioning cost of €10 per kWh " +
      "of initial usable capacity (dismantling, transport and site restoration less scrap), paid in April 2043.",
    group: "costs",
  },

  agnes: {
    title: "Bundesnetzagentur: draft AgNes determination on network charges for generators and storage (GBK-25-01-1#3, 6 Aug 2026)",
    url: "https://www.bundesnetzagentur.de/DE/Beschlusskammern/1_GZ/GBK-GZ/2025/GBK-25-01-1x3_AgNes/Downloads/FL-Entwurf_DE_DL_BF.html?nn=1059162",
    date: "2026-10-03",
    used:
      "A capacity fee on contracted connection capacity from 1 January 2029, with illustrative values of €4.92–5.14 per kW " +
      "a year: the model charges €5,000 per MW on all 50 MW (2029 money, indexed from 2030; €0 and €7,000 in the tornado). " +
      "Projects whose investment decision comes before the determination is announced, planned for 1 January 2027, would " +
      "keep the exemption; dynamic fees for 2030–2033 are not modelled.",
    group: "grid",
  },
  grandfathering: {
    title: "Energy Industry Act (EnWG) §118(6): network-charge exemption for storage",
    url: "https://www.gesetze-im-internet.de/enwg_2005/__118.html",
    date: "2026-10-03",
    used:
      "Storage commissioned by 4 August 2029 pays no network charges on the electricity it stores and feeds back for 20 " +
      "years: the grandfathering switch, off in the base case and void if commissioning slips past that date.",
    group: "grid",
  },
  bkz: {
    title: "Bundesnetzagentur: storage FAQ, construction-cost contributions after the Federal Court of Justice ruling of 15 Jul 2025 (EnVR 1/24)",
    url: "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/Speicher/start.html?r=1",
    date: "2026-10-03",
    used:
      "A grid-connected battery pays a construction-cost contribution on its import capacity, with no automatic " +
      "exemption: the model charges €135 per kW (€6.75 million for 50 MW), between the published 2026 prices of €91 and " +
      "€163 per kW, with €0 and €165 in the tornado.",
    group: "grid",
  },
  netzeBwBkz: {
    title: "Netze BW: construction-cost contribution price sheet, electricity (from 1 Jan 2026)",
    url: "https://assets.cdn.netze-bw.de/xytfb1vrn7of/3WkwLb2wCAE2YcQuG0YU4m/cff72cf6af73c9b225d0268390f45ebf/preisuebersicht-baukostenzuschuss-bkz-strom.pdf",
    date: "2026-10-03",
    used: "€162.97 per kW at 110 kV: the top of the published 2026 prices around the model’s €135 per kW.",
    group: "grid",
  },
  transnetBwTariff: {
    title: "TransnetBW: network charges and construction-cost contribution 2026 (price sheet of 5 Dec 2025)",
    url: "https://www.transnetbw.de/_Resources/Persistent/d/0/8/3/d083bd3e77c8f7304ad40cad3ff10d9d6e441274/2025-12-05_TransnetBW_Preisblatt%20Netzentgelte%20und%20Baukostenzuschuss%202026.pdf",
    date: "2026-10-03",
    used:
      "Contributions of €96.91 per kW at extra-high voltage and €113.15 at the extra-high/high-voltage transformation, " +
      "times a regional factor of 0.8–1.0, paid 50% at contract, 30% when grid works start and 20% at grid commissioning: " +
      "the lower published prices and the model’s payments in months 1, 3 and 12. Metering at €3,533.84 per point a year: " +
      "€3,500 in the model.",
    group: "grid",
  },
  chargingTax: {
    title: "Electricity Tax Act (StromStG) §5(4): storage as part of the supply network",
    url: "https://www.gesetze-im-internet.de/stromstg/__5.html",
    date: "2026-10-03",
    used:
      "No electricity tax on charging when the battery meets the conditions to count as part of the supply network: the " +
      "model’s tax on charging is zero.",
    group: "grid",
  },
  storageLevies: {
    title: "Energy Financing Act (EnFG) §21: levies on electricity storage",
    url: "https://www.gesetze-im-internet.de/enfg/__21.html",
    date: "2026-10-03",
    used:
      "No KWKG, offshore-grid or §19 StromNEV levies on electricity that is stored and fed back, counted over the year: " +
      "the model’s levies on charging are zero.",
    group: "grid",
  },
  auxCharges: {
    title: "Electricity Tax Act (StromStG) §3: standard tax rate",
    url: "https://www.gesetze-im-internet.de/stromstg/__3.html",
    date: "2026-10-03",
    used:
      "The standard electricity tax of €20.50 per MWh, which the model applies to auxiliary consumption: with the levies " +
      "and the network charge on about 1,400 MWh a year, it charges €2,000 per MW a year in 2026 prices, indexed.",
    group: "grid",
  },

  bankPractice: {
    title: "Modo Energy: toll agreements, leverage and equity returns in Germany (30 Jan 2026)",
    url: "https://modoenergy.com/research/en/germany-battery-toll-agreements-leverage-equity-returns-de",
    date: "2026-10-03",
    used:
      "Toll-backed debt is sized over 15–20 years but falls due after seven, with at least 60% repaid and the rest " +
      "refinanced, at an all-in 4–6%: the model’s 5.60% sits in that range, and its fully amortising ten-year loan " +
      "simplifies this mini-perm.",
    group: "finance",
  },
  dscrPractice: {
    title: "ESS News: how financing of standalone and co-located batteries really works, BBDF 2026 (1 Apr 2026)",
    url: "https://www.ess-news.com/2026/04/01/bbdf-2026-how-financing-standalone-vs-co-located-projects-really-works/",
    date: "2026-10-03",
    used:
      "Commerzbank’s debt-sizing ratios of 1.15 on contracted and 2.0 on merchant cash flow: the model’s target DSCRs, " +
      "applied in its bank case.",
    group: "finance",
  },
  gearingPractice: {
    title: "ZfK: battery storage financing by marketing model (15 Jul 2026)",
    url: "https://www.zfk.de/energie/erneuerbare/batteriespeicher-finanzierung-vermarktungsmodell-kredit-banken",
    date: "2026-10-03",
    used:
      "Debt of 70% with a five-year toll and 60% for a partly financed merchant model (Capcora, suena): the market " +
      "reference for the model’s debt cap of 80% of uses with an 80% toll for seven years.",
    group: "finance",
  },
  umweltbank: {
    title: "UmweltBank: financing of the Halle (Saale) battery, 11 MW / 22 MWh",
    url: "https://www.umweltbank.de/firmen/energieprojekt-finanzieren/batteriespeicher-halle-saale/",
    date: "2026-10-03",
    used: "A ten-year loan for a fully merchant battery without toll or floor: the same term as the model’s loan.",
    group: "finance",
  },

  taxLaw: {
    title: "Trade Tax Act (GewStG): current consolidated text",
    url: "https://www.gesetze-im-internet.de/gewstg/BJNR009790936.html",
    date: "2026-10-03",
    used:
      "Trade tax of 3.5% of trade income times the municipal multiplier, 400% for the fictional municipality (legal " +
      "minimum 200% to 2026 and 280% from 2027); 25% of interest plus half the property rent, above €200,000, added back; " +
      "losses offset €1 million in full and 60% beyond; prepayments on 15 February, May, August and November.",
    group: "tax",
  },
  kstLaw: {
    title: "Corporation Tax Act (KStG) §23: tax rate",
    url: "https://www.gesetze-im-internet.de/kstg_1977/__23.html",
    date: "2026-10-03",
    used: "Corporation tax of 15% to 2027, then 14%, 13%, 12% and 11% in 2028–2031 and 10% from 2032.",
    group: "tax",
  },
  soliLaw: {
    title: "Solidarity Surcharge Act (SolzG) §4: rate",
    url: "https://www.gesetze-im-internet.de/solzg_1995/__4.html",
    date: "2026-10-03",
    used: "Solidarity surcharge of 5.5% of the corporation tax.",
    group: "tax",
  },
  lossOffset: {
    title: "Income Tax Act (EStG) §10d: loss deduction",
    url: "https://www.gesetze-im-internet.de/estg/__10d.html",
    date: "2026-10-03",
    used:
      "Corporation-tax losses carried forward offset the first €1 million of income in full and 70% of the income above " +
      "it in 2024–2027; the model carries no losses back.",
    group: "tax",
  },
  lossOffset2028: {
    title: "Growth Opportunities Act of 27 Mar 2024 (BGBl. 2024 I Nr. 108), Article 6: loss deduction from 2028 (text at buzer.de)",
    url: "https://www.buzer.de/gesetz/16376/a309886.htm",
    date: "2026-10-03",
    used: "From 2028 corporation-tax losses offset 60% instead of 70% of the income above €1 million.",
    group: "tax",
  },
  interestBarrier: {
    title: "Income Tax Act (EStG) §4h: interest barrier",
    url: "https://www.gesetze-im-internet.de/estg/__4h.html",
    date: "2026-10-03",
    used:
      "Net interest below €3 million a year is exempt from the interest barrier; at €3 million or more the model flags " +
      "its tax as incomplete (about €0.9 million in the base case’s largest year).",
    group: "tax",
  },
  afa: {
    title: "Federal Ministry of Finance: depreciation (AfA) table for energy and water supply (24 Jan 1995)",
    url: "https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Weitere_Steuerthemen/Betriebspruefung/AfA-Tabellen/AfA-Tabelle_Energie-und-Wasserversorgung.html",
    date: "2026-10-03",
    used:
      "Accumulators over 15 years, the base tax life of the battery and its augmentation, and converters over 20 years, " +
      "the life of the PCS.",
    group: "tax",
  },
  afaGeneral: {
    title: "Federal Ministry of Finance: depreciation (AfA) table for general fixed assets (15 Dec 2000)",
    url: "https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Weitere_Steuerthemen/Betriebspruefung/AfA-Tabellen/Ergaenzende-AfA-Tabellen/AfA-Tabelle_AV.html",
    date: "2026-10-03",
    used:
      "Ten years under item 3.1.3: a disputed alternative for the battery of a storage-only company, offered as a switch " +
      "and a tornado case.",
    group: "tax",
  },
  afaLaw: {
    title: "Income Tax Act (EStG) §7: depreciation",
    url: "https://www.gesetze-im-internet.de/estg/__7.html",
    date: "2026-10-03",
    used:
      "Straight-line depreciation from the month of commissioning, 11/12 of a year in 2028. Declining-balance " +
      "depreciation is open only to assets acquired or made from 1 July 2025 to 31 December 2027, which a February 2028 " +
      "battery does not show, so the model leaves it out.",
    group: "tax",
  },
  vatLaw: {
    title: "VAT Act (UStG) §12: tax rates",
    url: "https://www.gesetze-im-internet.de/ustg_1980/__12.html",
    date: "2026-10-03",
    used:
      "VAT of 19% on the investment, the augmentation and the PCS overhaul, refunded two months after payment in the " +
      "model; VAT on the toll invoices has no cash effect.",
    group: "tax",
  },

  euribor: {
    title: "BlueGamma: EURIBOR swap rates (1–2 Oct 2026)",
    url: "https://www.bluegamma.io/euribor-swap-rates",
    date: "2026-10-03",
    used:
      "A 10-year euro swap at 3.64% on 1 October and 3.59% on 2 October 2026 (vendor mid-rates): with a 2.00% margin, the " +
      "fixed all-in loan rate of 5.60%.",
    group: "macro",
  },
  hicp: {
    title: "Deutsche Bundesbank: projection for Germany, Monthly Report June 2026",
    url: "https://publikationen.bundesbank.de/publikationen-de/berichte-studien/monatsberichte/monatsbericht-juni-2026-998608?article=deutschland-prognose-energiepreisschock-treibt-teuerung-an-und-bremst-die-konjunkturerholung-998836",
    date: "2026-10-03",
    used:
      "German HICP inflation of 2.9% in 2026, 2.7% in 2027 and 1.9% in 2028, extended at 2.0% a year from 2029: the index " +
      "that turns 2025 market prices and 2026 costs into nominal euros.",
    group: "macro",
  },

  gmbhLaw: {
    title: "Limited Liability Companies Act (GmbHG) §30: capital maintenance",
    url: "https://www.gesetze-im-internet.de/gmbhg/__30.html",
    date: "2026-10-03",
    used: "Distributions never take net assets below the €25,000 share capital.",
    group: "law",
  },
  insolvencyLaw: {
    title: "Insolvency Code (InsO) §15b: payments to shareholders, with §18: imminent illiquidity",
    url: "https://www.gesetze-im-internet.de/inso/__15b.html",
    date: "2026-10-03",
    used:
      "Distributions also never spend cash the company’s plan still needs until the end of the case — an assumption of " +
      "the model that goes beyond the ban on payments to shareholders that must lead to illiquidity (§15b(5) InsO), " +
      "which prescribes no formula. The 24-month forecast of §18(2) InsO concerns imminent illiquidity, not this rule.",
    group: "law",
  },
  liquidationLaw: {
    title: "Limited Liability Companies Act (GmbHG) §73: distribution after liquidation",
    url: "https://www.gesetze-im-internet.de/gmbhg/__73.html",
    date: "2026-10-03",
    used: "The cash left after liquidation is paid on 30 April 2044, a year after the creditors are called on (Sperrjahr).",
    group: "law",
  },
};

export const DE_SOURCE_GROUPS: DeSource["group"][] = ["prices", "revenue", "technology", "costs", "grid", "finance", "tax", "macro", "law"];
