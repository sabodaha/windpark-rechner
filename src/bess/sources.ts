// Public sources of the battery calculator: what each says is in the methodology and in the input hints. `date` is
// the day the source was last checked against the model (or its publication date where it is a dated document).

export interface BessSource {
  title: string;
  url: string;
  date: string;
  /** What the model takes from it, for the Sources page. */
  used: string;
  group: "prices" | "reserves" | "technology" | "costs" | "grid" | "war" | "finance" | "tax" | "macro";
}

export const BESS_SOURCES: Record<string, BessSource> = {
  oreeDam: {
    title: "Market Operator (Ukraine): day-ahead market prices, hourly",
    url: "https://www.oree.com.ua/index.php/pricectr",
    date: "2026-09-30",
    used: "Hourly day-ahead prices of 2025 and of the 12 months to September 2026, from which the revenue library and the price statistics are derived. The series itself is not published here.",
    group: "prices",
  },
  oreeStudy: {
    title: "Market Operator (Ukraine): study of energy storage economics (April 2026)",
    url: "https://www.oree.com.ua/index.php/web/11618",
    date: "2026-10-01",
    used: "Cross-check of day-ahead margins and costs; auxiliary load of 1% of inverter power (stress); network tariff regimes.",
    group: "prices",
  },
  nbuFx: {
    title: "National Bank of Ukraine: official EUR/UAH exchange rates",
    url: "https://bank.gov.ua/en/markets/exchangerates",
    date: "2026-09-30",
    used: "Daily rates that convert the price series to euros; 2025 average 47.09 UAH per euro.",
    group: "prices",
  },
  neighbours2025: {
    title: "Energy-Charts (Fraunhofer ISE): day-ahead prices of Hungary, Romania, Slovakia and Poland (CC BY 4.0)",
    url: "https://api.energy-charts.info/",
    date: "2026-10-02",
    used: "Daily top-two-hour spreads of the neighbouring EU markets in 2025 (average €140.52 per MWh against €181.75 in Ukraine): where the spread paths converge.",
    group: "prices",
  },
  marketRules: {
    title: "Market Rules (NEURC resolution 307), edition of 11 June 2026",
    url: "https://zakon.rada.gov.ua/laws/show/v0307874-18",
    date: "2026-10-02",
    used:
      "Special auctions for ancillary services: awards of 13 months to five years at a euro price fixed at the National " +
      "Bank’s average rate of the auction month; a performance security of €30,000 per MW; a start up to four months late " +
      "against a 20% top-up, a quarter of which is kept each month; availability penalties at twice the fee for aFRR; " +
      "offset of a balancing provider’s claims and debts within the same month; payment terms.",
    group: "reserves",
  },
  tsc: {
    title: "Transmission System Code (NEURC resolution 309), edition of 1 September 2026",
    url: "https://zakon.rada.gov.ua/laws/show/v0309874-18",
    date: "2026-10-02",
    used: "aFRR must hold full activation for at least one hour each way; a provider’s certificate is valid for 60 months.",
    group: "reserves",
  },
  ukrenergoCaps: {
    title: "Ukrenergo: price caps for ancillary services, 2027",
    url: "https://ua.energy/wp-content/uploads/2026/09/granychni-tsiny-na-DP-2027.pdf",
    date: "2026-10-02",
    used:
      "Cap of 1,339.82 UAH per MW-hour for symmetric aFRR, unchanged since 2022: about €25 at the rate of the auction " +
      "month. The model keeps it for later auctions as a scenario.",
    group: "reserves",
  },
  ukrenergoAuctions: {
    title: "Ukrenergo: ancillary services market, winners of the special auctions",
    url: "https://ua.energy/dopomizhni-poslugy/",
    date: "2026-10-03",
    used:
      "Special auctions for aFRR on 22 August and 24 December 2024 and 27 May 2025 (for FCR on 15 August 2024), priced in " +
      "euros at the average rate of the auction month; none since.",
    group: "reserves",
  },
  ukrenergoRoundMay2025: {
    title: "Ukrenergo (official Telegram channel): final results of the special auction of 27 May 2025",
    url: "https://t.me/Ukrenergo/3998",
    date: "2026-10-03",
    used:
      "Symmetric aFRR at a weighted average of 786.95 UAH per MW-hour, about €17 at the rate of May 2025: the default " +
      "price of a new award.",
    group: "reserves",
  },
  ukrenergoRoundDec2024: {
    title: "Ukrenergo (official Telegram channel): results of the special auction of 24 December 2024",
    url: "https://t.me/Ukrenergo/3654",
    date: "2026-10-03",
    used: "Symmetric aFRR at an average of 1,263.08 UAH per MW-hour, about €29 at the rate of December 2024.",
    group: "reserves",
  },
  ukrenergoRoundAug2024: {
    title: "Ukrenergo (official Telegram channel): results of the special auction of 22 August 2024",
    url: "https://t.me/Ukrenergo/3305",
    date: "2026-10-03",
    used: "Symmetric aFRR at a weighted average of 1,219.41 UAH per MW-hour, about €27 at the rate of August 2024.",
    group: "reserves",
  },
  neurc1294: {
    title: "NEURC resolution 1294 of 3 August 2026: wartime relief for ancillary-service providers",
    url: "https://www.nerc.gov.ua/acts/pro-vnesennia-zminy-do-postanovy-nkrekp-vid-25-liutoho-2022-roku-332",
    date: "2026-10-02",
    used:
      "From 1 September 2026, documented emergency outages and grid constraints are relieved of non-compliance fees: the " +
      "model counts only failures without relief.",
    group: "reserves",
  },
  neurcOpenData: {
    title: "NEURC: open data on the electricity market during the war",
    url: "https://www.nerc.gov.ua/storage/app/sites/1/Docs/Monitoryng/Vidkryti_dani/Open_Data_During_the_War%20_01.09.2026.xlsx",
    date: "2026-10-02",
    used:
      "Balancing energy of 2025: up at 8,482 UAH per MWh and down at 662 UAH against a day-ahead average of 5,292 — the " +
      "“balancing prices of 2025” switch (all products, so an upper bound for aFRR).",
    group: "reserves",
  },
  lazardLcos: {
    title: "Lazard: Levelized Cost of Energy+ (storage), 2026 (LCOS v11)",
    url: "https://www.lazard.com/media/kcfconhf/lazards-lcoeplus_vf.pdf",
    date: "2026-10-01",
    used: "Round-trip efficiency of 87–91% for two-hour systems; extended warranty costs.",
    group: "technology",
  },
  nlrAtb: {
    title: "NLR Annual Technology Baseline 2025: utility-scale battery storage",
    url: "https://atb.nlr.gov/electricity/2025/utility-scale_battery_storage",
    date: "2026-10-01",
    used: "Round-trip efficiency of 85% including cooling and controls (the base node); pack life 20–30% shorter than cell life (the degradation stress).",
    group: "technology",
  },
  blastLite: {
    title: "NREL BLAST-Lite battery degradation models (BSD-3)",
    url: "https://github.com/NREL/BLAST-Lite",
    date: "2026-10-01",
    used: "Calendar and cycle fade of an LFP cell at 25 °C: 1.1% × years^0.526 and 1.55·10⁻⁴ × EFC^0.828.",
    group: "technology",
  },
  warranty: {
    title: "ESS News: Making BESS warranties work — contracts vs reality (Sep 2025)",
    url: "https://www.ess-news.com/2025/09/19/making-bess-warranties-work-contracts-vs-reality/",
    date: "2026-10-01",
    used: "A manufacturer warranty of about 548 cycles a year at 0.5C: the 1.5 cycles a day cap.",
    group: "technology",
  },
  spe2026: {
    title: "SolarPower Europe: European Battery Market Outlook 2026",
    url: "https://gensed.org/wp-content/uploads/2026/06/European_Battery_Market_Outlook_2026_2bccb1c9b7.pdf",
    date: "2026-10-01",
    used: "DC containers at €64–77 per kWh and AC systems at €90–110 per kWh delivered to Europe (Q2 2026): the DC block and the augmentation price.",
    group: "costs",
  },
  prozorro: {
    title: "Prozorro tender UA-2026-08-06-011836-a: battery storage in Kharkiv",
    url: "https://prozorro.gov.ua/tender/UA-2026-08-06-011836-a",
    date: "2026-09-15",
    used: "Benchmark of about €169 per kWh without construction and connection.",
    group: "costs",
  },
  elektryka: {
    title: "Interfax-Ukraine: 50 MW / 131 MWh storage project and its loan",
    url: "https://interfax.com.ua/news/economic/1168608.html",
    date: "2026-10-01",
    used: "Benchmark of about €257 per kWh all-in, with a loan of about 70% of cost.",
    group: "costs",
  },
  connectionFee: {
    title: "NEURC resolution 2231 of 30 Dec 2025: connection fees",
    url: "https://www.nerc.gov.ua/storage/app/uploads/public/695/509/cec/695509cecf950239464870.pdf",
    date: "2026-10-01",
    used: "Connection fee of 935 UAH per kW at 110 kV; 110 kV line at €76.5k per km.",
    group: "grid",
  },
  law4834: {
    title: "Law of Ukraine 4834-IX: network tariffs for energy storage (transitional provisions, item 9-2)",
    url: "https://zakon.rada.gov.ua/laws/show/4834-20",
    date: "2026-10-02",
    used: "Tariffs on net withdrawal until 30 Apr 2037 for storage in operation by 30 Apr 2028 with the documents filed in time; on gross withdrawal afterwards (model assumption).",
    group: "grid",
  },
  distributionTariff: {
    title: "NEURC: distribution tariffs from 1 Aug 2026",
    url: "https://www.nerc.gov.ua/sferi-diyalnosti/elektroenergiya/promislovist/tarifi-na-elektroenergiyu-dlya-nepobutovih-spozhivachiv/tarifi-na-poslugi-z-rozpodilu-elektrichnoyi-energiyi/taryfy-posluhy-rozp-ee-diut-01082026",
    date: "2026-10-01",
    used: "Class 1 distribution tariff of 628.37 UAH per MWh (Kyiv region network).",
    group: "grid",
  },
  transmissionTariff: {
    title: "Interfax-Ukraine: transmission tariff from 1 Aug 2026",
    url: "https://interfax.com.ua/news/economic/1188613.html",
    date: "2026-10-01",
    used: "Transmission tariff of 928.45 UAH per MWh; with dispatch, 1,047.09 UAH per MWh assumed for 2027.",
    group: "grid",
  },
  marketFee: {
    title: "Market Operator (Ukraine): fee for the day-ahead and intraday markets",
    url: "https://www.oree.com.ua/index.php/newsctr/n/30775",
    date: "2026-10-01",
    used: "6.88 UAH for each MWh bought and each MWh sold, plus 4,669.71 UAH a month.",
    group: "grid",
  },
  damRules: {
    title: "Rules of the day-ahead and intraday markets (NEURC resolution 308)",
    url: "https://zakon.rada.gov.ua/laws/show/v0308874-18",
    date: "2026-10-01",
    used: "Buyers prepay; sellers are paid before delivery: the small working capital of the model.",
    group: "grid",
  },
  warPremium: {
    title: "Insurance Business Association of Ukraine (NASU): war-risk insurance market overview, Q1 2026",
    url: "https://nasu.com.ua/en/war-risk-insurance-market-overview-for-q1-2026/",
    date: "2026-10-01",
    used: "War-risk premiums of 7–9% a year in central Ukraine: the 8% premium behind the expected loss and the insurance switch.",
    group: "war",
  },
  compensation: {
    title: "Cabinet of Ministers resolution 1541 (2025): compensation of war-risk insurance premiums",
    url: "https://zakon.rada.gov.ua/laws/show/1541-2025-%D0%BF",
    date: "2026-10-02",
    used: "The state refunds the premium above 1% of the sum insured, up to 5 million UAH a company a year, while the budget lasts.",
    group: "war",
  },
  euribor: {
    title: "euribor-rates.eu: current EURIBOR rates",
    url: "https://www.euribor-rates.eu/en/current-euribor-rates/",
    date: "2026-09-30",
    used: "6-month EURIBOR of 3.074% on 30 Sep 2026.",
    group: "finance",
  },
  swaps: {
    title: "BlueGamma: EURIBOR swap rates",
    url: "https://www.bluegamma.io/euribor-swap-rates",
    date: "2026-10-01",
    used: "7-year swap of 3.56%: with a 4.5% margin, the fixed all-in rate of 8%.",
    group: "finance",
  },
  ebrdEquity: {
    title: "Interfax-Ukraine: EBRD expects 30–40% sponsor equity in storage projects",
    url: "https://interfax.com.ua/news/greendeal/1163144.html",
    date: "2026-10-01",
    used: "The 60% cap on debt.",
    group: "finance",
  },
  damodaran: {
    title: "Damodaran: country risk premiums, July 2026",
    url: "https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctrypremJuly26.xlsx",
    date: "2026-10-01",
    used: "Country risk premium for Ukraine of 14.85%: the 15% equity hurdle in euros sits between half and all of it.",
    group: "finance",
  },
  nbuCurrency: {
    title: "NBU resolution 18 (2022): currency restrictions, item 14(46)",
    url: "https://zakon.rada.gov.ua/laws/show/v0018500-22",
    date: "2026-10-02",
    used: "Dividends abroad up to €1 million a month per company; debt service to international financial institutions is free.",
    group: "finance",
  },
  taxCode: {
    title: "Tax Code of Ukraine",
    url: "https://zakon.rada.gov.ua/laws/show/2755-17",
    date: "2026-10-02",
    used: "Corporate income tax of 18%, loss carry-forward, depreciation lives, 5% withholding tax on dividends to an EU parent under the treaty, VAT of 20%.",
    group: "tax",
  },
  customsCode: {
    title: "Customs Code of Ukraine: import relief for batteries and inverters",
    url: "https://zakon.rada.gov.ua/laws/show/4495-17",
    date: "2026-10-02",
    used: "No import VAT or duty on lithium-ion batteries and inverters imported before 1 Jan 2029; transformers pay VAT, refunded.",
    group: "tax",
  },
  nbuInflationReport: {
    title: "National Bank of Ukraine: Inflation Report, July 2026",
    url: "https://bank.gov.ua/admin_uploads/article/IR_2026-Q3.pdf",
    date: "2026-10-01",
    used: "Ukrainian inflation of 8.2%, 8.3% and 5.6% (2026–28), 5% afterwards.",
    group: "macro",
  },
  budgetFx: {
    title: "UNIAN: the hryvnia rate in the 2027 state budget",
    url: "https://www.unian.ua/economics/finance/kurs-dolara-u-2027-roci-yaki-cifri-zakladeni-v-derzhavniy-byudzhet-13500747.html",
    date: "2026-10-01",
    used: "UAH per US dollar from the budget declaration; with EUR/USD 1.16, the euro path 51.5 / 54.6 / 57.0 / 58.8 (2026–29), then +2.9% a year.",
    group: "macro",
  },
  ecbProjections: {
    title: "ECB staff macroeconomic projections, September 2026",
    url: "https://www.ecb.europa.eu/press/projections/html/ecb.projections202609_ecbstaff~8e340fc69d.en.html",
    date: "2026-10-01",
    used: "Euro area inflation of 3.0%, 2.5% and 2.1% (2026–28), 2% afterwards: the real-euro conversion.",
    group: "macro",
  },
  imf: {
    title: "IMF Country Report 26/188: Ukraine",
    url: "https://www.imf.org/-/media/files/publications/cr/2026/english/1ukrea2026002.pdf",
    date: "2026-10-01",
    used: "Inflation cross-check and the timing of the easing of currency restrictions (the model keeps them for the whole life).",
    group: "macro",
  },
};

export const BESS_SOURCE_GROUPS: BessSource["group"][] = ["prices", "reserves", "technology", "costs", "grid", "war", "finance", "tax", "macro"];
