// English texts of the German battery calculator (spec v1.2 R2.2). Kept apart from the Ukrainian calculator's
// dictionary; numbers in the texts come from the engine or the registry, passed in as arguments.

export type DeKpiKey = "investorIrr" | "investorNpv" | "minDscr" | "revenue2029" | "lcos" | "payback";

export const deEn = {
  meta: {
    title: "Battery Storage Investment Calculator — Germany",
    description:
      "Open project-finance model of a fictional 50 MW battery in Germany: a tolling contract for 80% of the battery and " +
      "day-ahead trading for the rest, revenue from derived price data, degradation, AgNes grid fees, German GmbH taxes, a " +
      "bank loan sized on a lender’s case, and the toll price at which the investor breaks even.",
    breadcrumb: "Germany",
  },
  header: {
    title: "Battery Storage Investment Calculator",
    market: "Germany · tolling + day-ahead market",
    ukraine: "Ukraine",
    germany: "Germany",
    switchLabel: "Market",
    subtitle: (mw: number, mwh: number, h: number, toll: boolean) =>
      `Fictional project “Batteriespeicher Musterfeld” · ${mw} MW / ${mwh} MWh (${h} h) · Germany · ` +
      (toll ? "a tolling contract and day-ahead trading" : "day-ahead trading only"),
    disclaimer: "Illustrative calculation — not investment, tax or legal advice. Fictional case.",
    dataAsOf: "Prices to",
    oldData: "The price data is more than two months old.",
    baseCase: "Base case",
    customInputs: "Custom inputs",
    restored: "Inputs of your last visit",
    ignored: (list: string) => `Not applied from the link: ${list}`,
    methodology: "How the model works",
    sources: "Sources",
    compare: "Germany against Ukraine",
  },
  kpis: {
    investorIrr: {
      label: "Investor IRR",
      hint:
        "The owner’s annual return: capital paid into the GmbH against the payouts the company may make — under §30 GmbHG " +
        "and only out of cash its plan does not need later — and the liquidation payout one year after the last month.",
    },
    investorNpv: {
      label: "Investor NPV at hurdle",
      hint:
        "The investor’s cash flows discounted at the equity hurdle rate to financial close (1 Feb 2027). Below zero, the " +
        "project earns less than the hurdle. It is the main measure: it exists even where an IRR does not.",
    },
    minDscr: {
      label: "Minimum DSCR",
      hint:
        "Lowest half-year ratio of cash available for debt service to the contractual debt service. The loan is sized on the " +
        "lender’s case — the low spread path and the lower library node — with the toll covered 1.15 times and the market 2.0 times.",
    },
    revenue2029: {
      label: "Revenue 2029",
      hint:
        "The company’s revenue in 2029, the first full year: the toll fee earned plus the market share’s trading margin after " +
        "the realism factor and the optimiser’s fee, per MW of grid connection, nominal euros.",
    },
    lcos: {
      label: "LCOS",
      hint:
        "Levelised cost of storage of the whole battery as if it traded alone: investment, operating costs, AgNes and other " +
        "charges, the optimiser’s fee, charging power and decommissioning per MWh delivered, discounted at the project rate " +
        "from financial close; before financing and income tax. The toll does not enter it.",
    },
    payback: {
      label: "Payback",
      hint: "Years from financial close until the investor’s cumulative cash flow first turns positive.",
    },
    perMw: "per MW",
    years: "years",
    notReached: "not reached",
    lenderCase: "lender case",
    status: {
      ambiguous: "several",
      notDefined: "none",
      unfunded: "cash short",
      notApplicable: "n/a",
    } as Record<string, string>,
    statusHint: {
      ambiguous: "The cash flows change sign more than once, so they have several IRRs; the NPV is the measure to read.",
      notDefined: "The cash flows never repay what was paid in at any rate, so there is no IRR — which is not the same as 0%.",
      unfunded:
        "The company runs out of cash, or ends with debt it cannot repay; returns are not shown. The NPV stays, marked. " +
        "Nothing is filled in: the shortfall stays in the ledger.",
      notApplicable: "No loan in this case, so there is no debt service to cover.",
    } as Record<string, string>,
    withoutDebt: "Without debt",
    noDebtHint: "The same project financed with equity only: what the asset earns before leverage.",
    stale: "Recalculating…",
  },
  validity: {
    ok: "No check failed",
    warnings: (n: number) => `${n} ${n === 1 ? "warning" : "warnings"}`,
    failed: (n: number) => `${n} ${n === 1 ? "check failed" : "checks failed"}`,
    details: "details",
  },
  caseStatus: {
    title: {
      inputUnsupported: "Inputs outside the model",
      calcError: "The calculation failed its own checks",
    } as Record<string, string>,
    text: {
      inputUnsupported: "These inputs lie outside what the model supports, so nothing is calculated.",
      calcError: "An internal identity does not close, so the result is not shown.",
    } as Record<string, string>,
  },
  breakEven: {
    title: "What would the toll have to pay?",
    short: "At this toll price, the project does not earn the hurdle rate.",
    enough: "At this toll price, the project earns at least the hurdle rate.",
    found: (tStar: string, now: string) => `The investor breaks even at a toll of ${tStar} per MW a year — against ${now} in these inputs.`,
    foundUnfunded: "At that price the company still runs short of cash at some point; the price is shown, marked.",
    market: (low: string, high: string) => `Tolling offers quoted in the market for 2-hour batteries: ${low}–${high} per MW a year (a benchmark, not an offer).`,
    belowDomain: "The investor breaks even even without a toll fee: the market share alone earns the hurdle.",
    aboveDomain: (max: string) => `Even a toll of ${max} per MW a year does not reach the hurdle.`,
    unresolved: "Some toll prices cannot be calculated (the loan cannot be sized), so the break-even price stays open.",
    refinementFailed: "A sign change was found, but the search could not pin the price down; see the curve in the Toll tab.",
    unsupported: "The break-even price cannot be searched: these inputs lie outside the model.",
    calculating: "Searching the break-even toll price — about forty full runs…",
    whyTitle: "Why the break-even price is above the market",
    why: [
      "No reserves (FCR, aFRR) and no intraday trading — in 2026 they earned most of German batteries’ revenue. The market share and the years after the toll trade day-ahead only.",
      "A fully amortising 10-year loan instead of the usual 7-year mini-perm with 70–80% debt.",
      "Investment of about €765 per kW for 2 hours, against about €700 in Modo Energy’s benchmark.",
      "A 15-year life, with no value after it.",
    ],
    honest:
      "A scenario of the day-ahead market only, without the intraday market and reserves, which gave the main revenue of German batteries in 2026. Nothing is tuned to reach a target.",
    merchantTitle: "What would the market have to pay?",
    merchantFound: (k: string, path: string) => `Without a toll, the investor breaks even if daily price spreads are ${k} the ${path} path.`,
    merchantNotReached: "Even spreads three times the path do not reach the hurdle.",
    merchantBelow: (k: string) => `Break-even lies below the range the revenue library covers (from ${k}).`,
    merchantUnsupported: "Break-even cannot be searched: these inputs lie outside the revenue library.",
    times: (k: string) => `${k} times`,
    blocked: "There is no result to compare: the case is not calculated (see the status above).",
  },
  actions: {
    copyLink: "Copy link",
    copied: "Link copied",
    reset: "Reset",
    remember: "Remember my inputs on this device",
    rememberHint: "Keeps your inputs in this browser for your next visit; nothing is sent to the server. Untick to delete them.",
    editInputs: "Edit assumptions",
    closePanel: "Close",
  },
  resultsLabel: "Results",
  inputs: {
    title: "Inputs",
    more: "More",
    less: "Fewer",
    reset: "Back to base value",
    help: (label: string) => `About ${label}`,
    outsideUsual: "Outside the usual range",
    source: "Source",
    sources: "Sources",
    assumption: "Assumption of the model (reason in the methodology)",
  },
  groups: {
    market: "Market",
    battery: "Battery",
    toll: "Tolling contract",
    grid: "Grid, fees and timing",
    costs: "Costs",
    tax: "Tax",
    financing: "Financing",
    valuation: "Valuation",
  } as Record<string, string>,
  fields: {
    path: {
      label: "Spread path",
      hint:
        "How daily price spreads develop from the chosen price year, as a multiplier. Reference: flat at 1.0 — 2025 spreads " +
        "held. Low (the lender’s view): 0.85 in 2028 to 0.60 in 2031. High: 1.185 to 1.0. After 2031 the path stays level.",
    },
    snap: {
      label: "Price year",
      hint:
        "The day-ahead prices the battery trades on: 2025, or the 12 months to September 2026. Quarter-hours from October " +
        "2025 are averaged to hours, so both years compare.",
    },
    k: {
      label: "Spread multiplier",
      hint: "Scales the spreads of every year on top of the path; 1.0 leaves them as they are. The break-even search moves it.",
    },
    capt: {
      label: "Realism factor",
      hint:
        "Share of the perfect-foresight margin a real optimiser captures — forecasts are not perfect. A loss is never " +
        "scaled down.",
    },
    fee: { label: "Optimiser’s fee", hint: "Share of the positive margin, after the realism factor, that the trading optimiser keeps." },
    dur: {
      label: "Duration",
      hint:
        "Hours of full-power discharge at the start. 4 hours brings its own O&M, construction, development, land and toll " +
        "price. 1 hour is outside this version: it is shown as a status.",
    },
    rte: { label: "Round-trip efficiency", hint: "Energy out over energy in, at the AC meter; the revenue library has these nodes." },
    cyc: { label: "Cycle limit", hint: "Full cycles a day the warranty allows on average; the market share and the toller share it." },
    av: { label: "Availability", hint: "Share of the time the battery can operate, from the second year." },
    av1: { label: "Availability, first year", hint: "Usually lower while the plant settles in." },
    deg: { label: "Faster wear", hint: "Wear 1.3 times the base rate (BLAST-Lite LFP model); the toll fee falls if capacity drops below the contract curve." },
    toll: {
      label: "Tolling contract",
      hint:
        "A buyer pays a fixed fee per MW a year for a share of the battery’s power and energy and trades it at its own " +
        "risk. Off: the whole battery trades day-ahead, without a loan.",
    },
    tp: { label: "Toll price", hint: "Fixed nominal fee per MW of the contracted share a year, net of VAT, paid monthly a month later." },
    ts: { label: "Contracted share", hint: "Share of power and energy given to the toller; the rest trades day-ahead." },
    tm: { label: "Contract term", hint: "Months of tolling from commercial operation; the market takes the whole battery afterwards." },
    agnes: {
      label: "AgNes capacity fee",
      hint:
        "Bundesnetzagentur’s draft grid fee for storage per MW of connection a year, from 2029. The base takes €5,000; the " +
        "tornado tests 0 and €7,000.",
    },
    gf: {
      label: "Grid-fee exemption",
      hint: "§118(6) EnWG: storage in operation by 4 August 2029 keeps the exemption. Lost if commissioning slips past that date.",
    },
    bkz: { label: "Grid connection contribution (BKZ)", hint: "One-off Baukostenzuschuss per kW of connection, paid during construction." },
    auxc: { label: "Charges on own consumption", hint: "Levies and taxes on the auxiliary power the battery uses, per MW a year." },
    delay: {
      label: "Delay to commercial operation",
      hint: "Months the battery starts late. Payment dates of the loan stay; operating costs and the toll start with operation.",
    },
    capex: { label: "Investment cost", hint: "Scales every investment line except the grid contribution; 100% is the estimate." },
    dev: { label: "Development cost", hint: "Scales the development line alone (permits, land, grid studies, fees before construction)." },
    om: { label: "Operation and maintenance", hint: "Full-service O&M per MW a year, nominal, indexed." },
    ins: { label: "Insurance", hint: "Property insurance a year, share of the insured value." },
    adm: { label: "Company costs", hint: "Management, accounting and audit of the project company a year." },
    heb: { label: "Trade-tax multiplier (Hebesatz)", hint: "Set by the municipality; the trade tax is 3.5% × this multiplier of the trade income." },
    afab: { label: "Battery tax life", hint: "Straight-line tax depreciation of the battery; 15 years per the industry table, 10 is a contested alternative." },
    debt: { label: "Bank loan", hint: "A fully amortising senior loan, sized so the lender’s case covers debt service." },
    rate: { label: "Interest rate", hint: "All-in fixed rate: 6-month EURIBOR swap plus the bank’s margin." },
    term: { label: "Loan term", hint: "Twenty or thirty half-yearly payments from 1 August 2028." },
    dscrc: { label: "Cover on the toll", hint: "Target ratio of the contracted cash flow to debt service in the lender’s case." },
    dscrm: { label: "Cover on the market", hint: "Target ratio of the market cash flow to debt service in the lender’s case." },
    gear: { label: "Maximum debt share", hint: "Cap on the loan as a share of the investment without VAT." },
    hurdle: { label: "Equity hurdle rate", hint: "The return the investor asks for: 12% with a toll, 15% without one." },
    disc: { label: "Project discount rate", hint: "Rate for the project NPV and the LCOS (before financing)." },
  } as Record<string, { label: string; hint: string }>,
  options: {
    path: { reference: "Reference", low: "Low", high: "High" },
    snap: { "DE-2025": "2025", "DE-LTM-2026-09": "Oct 2025 – Sep 2026" },
    dur: { "1": "1 h", "2": "2 h", "4": "4 h" },
    rte: { "0.85": "85%", "0.88": "88%", "0.9": "90%" },
    cyc: { "1": "1.0 a day", "1.5": "1.5 a day" },
    afab: { "10": "10 years", "15": "15 years" },
    term: { "20": "10 years", "30": "15 years" },
  } as Record<string, Record<string, string>>,
  units: {
    "% of estimate": "% of estimate",
    "% of value/yr": "% a year",
    "€/MW·yr": "€/MW a year",
    "€/yr": "€ a year",
    months: "months",
  } as Record<string, string>,
  pathName: { reference: "reference", low: "low", high: "high" } as Record<string, string>,
  tabs: {
    overview: "Overview",
    revenue: "Revenue",
    toll: "Toll",
    debt: "Debt & payouts",
    sensitivity: "Sensitivity",
    compare: "Germany vs Ukraine",
    checks: "Checks",
    tables: "Tables",
  },
  overview: {
    title: "How the money flows",
    revenue: (toll: string, market: string, total: string, share: string) =>
      `In 2029, the first full year, the toller pays ${toll} per MW for ${share} of the battery; the rest earns ${market} per MW on the day-ahead market — ${total} per MW in all.`,
    revenueMerchant: (market: string) => `In 2029, the first full year, the whole battery earns ${market} per MW on the day-ahead market.`,
    costs: (opex: string, ebitda: string) => `Operating costs and grid charges take ${opex} per MW, which leaves EBITDA of ${ebitda} per MW.`,
    investment: (capex: string, perKw: string, debt: string, gearing: string, equity: string) =>
      `Building the battery costs ${capex} (${perKw} per kW). The bank looks at the low spread path and lends ${debt} — ${gearing} of the cost without VAT; the owner pays in ${equity}.`,
    noLoan: (capex: string, perKw: string, equity: string) => `Building the battery costs ${capex} (${perKw} per kW), all paid in by the owner: ${equity}.`,
    lifecycle: (aug: string, pcs: string) =>
      `Batteries are added in ${aug} to restore capacity, and the inverters are overhauled in ${pcs}. The company keeps the cash these need instead of paying it out.`,
    result: (irr: string, hurdle: string) => `The investor earns ${irr} a year against a hurdle of ${hurdle}.`,
    resultNoIrr: (hurdle: string) => `The investor’s cash flows have no meaningful IRR; measured at the hurdle of ${hurdle}, see the NPV.`,
    unfunded: (month: string) => `The company runs out of cash in ${month}: no money is created, so the IRR is not shown.`,
    chartTitle: "Revenue and cash by year",
    chartNote: "€ million, nominal.",
    toll: "Toll fee",
    market: "Day-ahead trading",
    opex: "Operating costs",
    cfads: "Cash for debt service",
  },
  revenue: {
    bridgeTitle: "From the market’s trades to revenue, 2029",
    bridgeNote: "Per MW of grid connection, nominal euros.",
    sales: "Sales of the market share",
    purchases: "Purchases (charging)",
    margin: "Perfect-foresight margin",
    capture: "Realism factor",
    fee: "Optimiser’s fee",
    market: "Market revenue",
    toll: "Toll fee earned",
    total: "Revenue",
    pathTitle: "Spreads and the effective fee by year",
    pathNote:
      "The multiplier M of each year on the 2025 spreads, and the effective fee in 2025 euros per MWh that keeps the " +
      "price level while the spreads move (methodology, section 2).",
    spread: "Spread multiplier",
    importFee: "Effective fee, €/MWh",
    profileTitle: "Average day-ahead price by hour",
    profileNote: (snapshot: string) => `${snapshot}, € per MWh; winter and summer months.`,
    hour: "Hour",
    winter: "January",
    summer: "July",
    tb2Title: "Daily spread of the two dearest and two cheapest hours",
    tb2Note: (mean: string) => `Mean ${mean} per MWh; deciles of the days.`,
  },
  toll: {
    termsTitle: "The contract",
    terms: (price: string, share: string, months: number, from: string, to: string) =>
      `${share} of the battery for ${months} months (${from} – ${to}) at ${price} per MW a year, nominal and fixed, paid monthly in arrears.`,
    guarantee:
      "The fee falls with availability below 95% and with usable capacity below the contract curve — the capacity a " +
      "battery cycled 1.5 times a day would keep. The buyer’s own risk is not modelled.",
    capacityTitle: "Usable capacity against the contract curve",
    capacityNote: "Average usable energy of the year, MWh; the contract curve only while the toll runs.",
    usable: "Usable energy",
    contract: "Contract curve",
    curveTitle: "Investor NPV by toll price",
    curveNote: "€ million. Each point is a full run: the lender’s case, the loan sized again, taxes and payouts.",
    npv: "Investor NPV",
    marketBand: "Vertical lines: market quotes for 2-hour batteries",
    tStar: "Break-even",
    noToll: "This case has no tolling contract.",
  },
  debt: {
    dscrTitle: "Debt service cover by half-year",
    dscrNote: "Cash available for debt service over the six months to each payment, divided by the contractual payment.",
    base: "This case",
    lender: "Lender’s case",
    lockup: "Lock-up 1.10",
    default: "Default 1.00",
    budgetTitle: "Debt service against the lender’s budget",
    budgetNote: "€ million per half-year. The budget is what the lender’s case can carry: the toll’s cash covered 1.15 times, the market’s 2.0 times.",
    service: "Contractual debt service",
    budget: "Budget of the lender’s case",
    noDebt: "This case has no loan.",
    payoutsTitle: "Payouts to the owner",
    payoutsNote:
      "Payouts on 1 February and 1 August, after debt service. They never take cash the company’s plan still needs — for " +
      "batteries added later, the inverter overhaul, decommissioning — and never reduce net assets below the share capital (§30 GmbHG).",
    date: "Date",
    freeCash: "Free cash",
    holdback: "Kept for later",
    paid: "Paid out",
    reason: "Limited by",
    liquidation: (date: string, amount: string) => `Liquidation payout on ${date}: ${amount}.`,
    cappedBy: {
      notYet: "not yet allowed",
      shortfall: "loan behind schedule",
      lockup: "cover below lock-up",
      dsra: "reserve account short",
      reserveTopUp: "liquidity reserve topped up",
      section30: "§30 GmbHG",
      liquidityForecast: "cash needed later",
      cash: "free cash",
    } as Record<string, string>,
    showAll: "Show every date",
    showLess: "Show fewer",
  },
  sensitivity: {
    title: "What moves the result",
    subtitle: "Each driver alone, with the loan as signed at financial close. Bars show the change of the investor NPV.",
    low: "Low setting",
    high: "High setting",
    calculating: "Calculating…",
    drivers: {
      spread: { label: "Spreads", low: "−20%", high: "+20%" },
      capture: { label: "Realism factor", low: "0.65", high: "0.85" },
      capex: { label: "Investment cost", low: "−10%", high: "+11%" },
      development: { label: "Development cost", low: "−50%", high: "+50%" },
      rate: { label: "Interest rate", low: "−1.5 pp", high: "+1.5 pp" },
      rte: { label: "Efficiency node", low: "88%", high: "90%" },
      degradation: { label: "Faster wear", low: "—", high: "× 1.3" },
      tollPrice: { label: "Toll price", low: "× 110/120", high: "—" },
      availability: { label: "Availability", low: "—", high: "93%" },
      agnes: { label: "AgNes fee", low: "0", high: "€7,000" },
      bkz: { label: "Grid contribution", low: "0", high: "€165/kW" },
      afaBattery: { label: "Battery tax life", low: "—", high: "10 years" },
    } as Record<string, { label: string; low: string; high: string }>,
    noResult: (list: string) => `No result, shown as a status: ${list}.`,
    statusShort: { inputUnsupported: "inputs outside the model", calcError: "calculation check failed" } as Record<string, string>,
    variantsTitle: "Alternative cases",
    variantsSubtitle: "Before investing: one change at a time, the loan sized again.",
    variant: "Case",
    current: "These inputs",
    irr: "Investor IRR",
    npv: "NPV at hurdle",
    hurdle: "Hurdle",
    debt: "Loan",
    variants: {
      fourHours: "4-hour battery",
      oneHour: "1-hour battery",
      low: "Low spread path",
      high: "High spread path",
      ltm: "Prices of the last 12 months",
      noDebt: "No loan",
      merchant: "Day-ahead only, no loan",
      grandfathered: "Grid-fee exemption kept",
      loan15: "15-year loan",
    } as Record<string, string>,
  },
  compare: {
    title: "The same battery in Germany and in Ukraine",
    subtitle: (rate: string) =>
      `Fixed rows; the battery — duration, efficiency, cycle limit, augmentation — is the same in all. NPVs at a common ${rate} and at each market’s own hurdle.`,
    loadNote: "For any inputs other than the base case, this tab loads the Ukrainian revenue library (about 1.3 MB) from this site.",
    calculating: "Calculating both markets…",
    columns: {
      row: "Case",
      revenue: "Revenue",
      financing: "Financing",
      irr: "Investor IRR",
      npvCommon: (rate: string) => `NPV at ${rate}`,
      npvMarket: "NPV at the market’s hurdle",
      lcos: "LCOS",
      revenue2029: "Revenue 2029 per MW",
      gearing: "Debt share",
    },
    rows: {
      uaBase: { name: "Ukraine, base", revenue: "Day-ahead market", financing: "Development-bank loan" },
      uaNoDebt: { name: "Ukraine, no loan", revenue: "Day-ahead market", financing: "Equity" },
      deToll: { name: "Germany, toll with loan", revenue: "Toll 80% + day-ahead", financing: "Commercial-bank loan" },
      deTollNoDebt: { name: "Germany, toll without loan", revenue: "Toll 80% + day-ahead", financing: "Equity" },
      deMerchant: { name: "Germany, day-ahead only", revenue: "Day-ahead market", financing: "Equity" },
    } as Record<string, { name: string; revenue: string; financing: string }>,
    differencesTitle: "What differs between the two markets",
    differences: [
      ["Revenue", "Ukraine: day-ahead trading on spreads that were among Europe’s widest in 2025. Germany: a tolling contract for 80% of the battery and day-ahead trading for the rest."],
      ["Investment and costs", "Similar battery prices; Germany adds a grid connection contribution (BKZ) and from 2029 the AgNes capacity fee, Ukraine network tariffs and war risk."],
      ["Taxes", "Ukraine: 18% profit tax and 5% withholding tax on dividends to the German parent. Germany: corporate income tax, solidarity surcharge and trade tax of the GmbH."],
      ["Financing", "Ukraine: a euro loan of a development bank. Germany: a commercial bank’s loan sized on the toll and the market separately."],
      ["Payouts", "Ukraine: dividends out of closed tax profit, within the National Bank’s monthly limit. Germany: §30 GmbHG and the company’s own liquidity plan."],
      ["Risks", "Ukraine: war damage and the hryvnia. Germany: neither; the market risk of the years after the toll stays."],
    ] as [string, string][],
  },
  checks: {
    title: "Checks",
    groups: { input: "Inputs", integrity: "Calculation", scope: "Scope and covenants" } as Record<string, string>,
    status: { pass: "passed", fail: "failed", warn: "warning", notApplicable: "not applicable" } as Record<string, string>,
    ids: {
      notSupportedDuration: "Supported duration (2 or 4 hours)",
      merchantDebtUnsupported: "A loan needs the tolling contract",
      inputOutOfDomain: "Inputs within the model’s range",
      libraryFeeAxis: "Within the revenue library",
      sourcesUses: "Sources equal uses during construction",
      drawsEqualDebt: "Loan drawn in full",
      balanceSheet: "Balance sheet balances every month",
      bucketsReconcile: "Toll and market cash add up",
      taxReconcile: "Taxes paid equal taxes due",
      sharesSumToOne: "Toll and market shares add up",
      tollFeeWithinContract: "Toll fee within the contract",
      fundingConverged: "Loan sizing converged",
      gearingCap: "Loan within the maximum debt share",
      cashNonNegative: "Cash never below zero",
      debtRepaid: "Loan repaid by maturity",
      dsraFunded: "Reserve account full after each payment",
      interestBarrier: "Interest below the interest-barrier threshold",
      grandfatheringLost: "Grid-fee exemption kept",
      distributionCapped: "Payouts not cut by §30 GmbHG",
      lockup: "No payout blocked by the lock-up",
      default: "Cover never below 1.00",
    } as Record<string, string>,
  },
  tables: {
    title: "Year by year",
    unit: "€ thousand, nominal",
    rows: {
      discharge: "Energy delivered, MWh",
      usable: "Usable energy, MWh (average)",
      toll: "Toll fee",
      market: "Day-ahead trading",
      revenue: "Revenue",
      opex: "Operating costs and charges",
      ebitda: "EBITDA",
      afa: "Tax depreciation",
      interest: "Interest",
      tax: "Income taxes of the year",
      netIncome: "Net income",
      lifecycle: "Augmentation, overhaul, decommissioning",
      cfads: "Cash for debt service",
      debtService: "Debt service paid",
      payouts: "Payouts to the owner",
      cash: "Free cash at year end",
      debt: "Loan at year end",
    },
  },
  states: {
    error: "The calculation could not run",
    errorText: "The revenue library or the calculation failed to load. The figures shown are the base case.",
    retry: "Try again",
  },
  footer: {
    author: "Model and text: Igor Sabodakha",
    data: "Prices: Bundesnetzagentur | SMARD.de via Energy-Charts (CC BY 4.0), derived statistics only",
    version: (spec: string, lib: string) => `Methodology ${spec} · revenue library DE v${lib}`,
  },
};

export type DeMessages = typeof deEn;
