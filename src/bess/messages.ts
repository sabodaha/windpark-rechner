// English texts of the battery calculator (v1: Ukraine, day-ahead market). Kept apart from the wind calculator's
// dictionary; numbers in the texts come from the engine or the registry, never typed in twice.

export type BessKpiKey = "investorIrr" | "investorNpv" | "minDscr" | "netRevenue" | "lcos" | "payback";

export const bessEn = {
  meta: {
    title: "Battery Storage Investment Calculator — Ukraine",
    description:
      "Open project-finance model of a fictional 50 MW battery in Ukraine trading on the day-ahead market: revenue from " +
      "derived price data, degradation, war risk, Ukrainian tax and currency rules, a euro loan sized on a lender’s case.",
    breadcrumb: "Battery Storage Calculator",
  },
  header: {
    title: "Battery Storage Investment Calculator",
    market: "Ukraine · day-ahead market",
    marketNext: "Germany follows in the next version",
    subtitle: (mw: number, mwh: number, h: number) =>
      `Fictional project “Zoria Storage” · ${mw} MW / ${mwh} MWh (${h} h) · Kyiv region, Ukraine · revenue from day-ahead trading only`,
    disclaimer: "Illustrative calculation — not investment, tax or legal advice. Fictional case.",
    dataAsOf: "Prices to",
    oldData: "The price data is more than two months old.",
    baseCase: "Base case",
    customInputs: "Custom inputs",
    restored: "Inputs of your last visit",
    ignored: (list: string) => `Not applied from the link: ${list}`,
    methodology: "How the model works",
    sources: "Sources",
  },
  kpis: {
    investorIrr: {
      label: "Investor IRR (€)",
      hint:
        "The owner’s annual return in euros: share capital paid in against the dividends and the capital that actually " +
        "reach the German parent — after 5% Ukrainian withholding tax and within the National Bank’s limit of €1 million a month.",
    },
    investorNpv: {
      label: "Investor NPV at hurdle",
      hint:
        "The investor’s euro cash flows discounted at the equity hurdle rate to financial close (1 Feb 2027). Below zero, the " +
        "project earns less than the hurdle. It is the main measure: it exists even where an IRR does not.",
    },
    minDscr: {
      label: "Minimum DSCR",
      hint:
        "Lowest half-year ratio of cash available for debt service to debt service, on the selected price path. The loan " +
        "is sized so that the lender’s case — the low path and the lower library node — covers debt service by the target.",
    },
    netRevenue: {
      label: "Net revenue 2029",
      hint:
        "Day-ahead trading margin in the first full year after the realism factor and the optimiser’s fee, per MW of grid " +
        "connection, in nominal euros.",
    },
    lcos: {
      label: "LCOS",
      hint:
        "Levelised cost of storage: investment, operating costs, grid tariffs, the optimiser’s fee, the expected war loss, " +
        "charging power and decommissioning per MWh delivered, discounted at the project rate from financial close; before " +
        "financing and income tax.",
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
    },
    statusHint: {
      ambiguous: "The cash flows change sign more than once, so they have several IRRs; the NPV is the measure to read.",
      notDefined: "The cash flows never repay what was paid in at any rate, so there is no IRR — which is not the same as 0%.",
      unfunded: "The company runs out of cash in this case; returns are not shown. The NPV stays, marked.",
      notApplicable: "No loan in this case, so there is no debt service to cover.",
    },
    withoutDebt: "Without debt",
    noDebtHint: "The same project financed with equity only: what the asset earns before leverage.",
    stale: "Recalculating…",
  },
  validity: {
    ok: "No check failed",
    warnings: (n: number) => `${n} ${n === 1 ? "warning" : "warnings"}`,
    failed: (n: number) => `${n} ${n === 1 ? "check failed" : "checks failed"}`,
    outOfScope: (n: number) => `${n} outside the model’s scope`,
    details: "details",
    unsupported: "Outside the revenue library",
  },
  whatItTakes: {
    title: "What would it take?",
    short: "Day-ahead trading alone does not earn the hurdle rate.",
    enough: "Day-ahead trading alone earns at least the hurdle rate.",
    breakEven: (k: string, path: string) => `Investor NPV reaches zero if daily price spreads are ${k} the ${path} path.`,
    breakEvenBelow: (k: string, path: string) => `Spreads could fall to ${k} the ${path} path before the investor NPV turns negative.`,
    spreadIs: (need: string, now: string) =>
      `In 2029 that is an average gap between the two dearest and the two cheapest hours of a day of about ${need} per MWh, instead of ${now} (2025 euros).`,
    spreadContext: (ua: string, eu: string) => `For comparison, 2025: Ukraine ${ua}, neighbouring EU markets ${eu}.`,
    notReached: "Even spreads three times the path do not reach the hurdle.",
    unsupportedBelow: (k: string) => `Break-even lies below the range the revenue library covers (from ${k}).`,
    unsupported: "Break-even cannot be searched: these inputs lie outside the revenue library.",
    calculating: "Calculating break-even…",
    notIncluded:
      "Not in this version: balancing and ancillary services, and Ukrenergo’s multi-year auctions for them (contracts of up " +
      "to five years; no rounds were held in 2026). They are the first addition planned.",
    alternatives: "One change at a time, loan sized again",
    allAlternatives: "All alternatives",
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
    scenario: "Market scenario",
    battery: "Battery",
    revenue: "Revenue",
    costs: "Costs",
    grid: "Grid and timing",
    war: "War risk",
    financing: "Financing",
    valuation: "Currency and valuation",
  },
  fields: {
    scn: {
      label: "Spread path",
      hint:
        "How daily price spreads develop from the chosen price year, in 2025 euros. Reference: from 1.0 in 2028 to 0.773 in " +
        "2031 — where the neighbouring EU markets were in 2025. Low (the lender’s view): 0.85 to 0.60. High: 1.15 to 1.00.",
    },
    snap: {
      label: "Price year",
      hint:
        "Which history of hourly day-ahead prices the battery’s dispatch is optimised on: calendar 2025, or the 12 months to " +
        "September 2026, when spreads were wider.",
    },
    cur: {
      label: "Currency of the spread path",
      hint:
        "Euro: after coupling with the EU market, Ukrainian prices follow euro prices, so the path is held in real euros. " +
        "Hryvnia: the path is held in real hryvnias, and the euro value falls when the hryvnia weakens.",
    },
    dur: {
      label: "Duration",
      hint: "Hours of full power the battery can deliver at the start of life: 50 MW × 2 h = 100 MWh of usable AC energy.",
    },
    rte: {
      label: "Round-trip efficiency",
      hint:
        "Share of the energy bought that comes back out, measured at the grid connection with cooling and controls included. " +
        "The revenue library is solved for 85%, 88% and 90%.",
    },
    cyc: {
      label: "Cycle limit",
      hint: "Most full cycles a day that the dispatch may use, as in a manufacturer’s warranty (1.5 a day ≈ 548 a year).",
    },
    aug: {
      label: "Add modules in year 10",
      hint:
        "One augmentation in the 121st month of operation: 15% of the original DC capacity at €86 per kWh (2026 prices). " +
        "Without it, the usable energy keeps fading.",
    },
    deg: {
      label: "Faster wear (× 1.3)",
      hint: "Stress: the battery ages 30% faster than the cell model, as packs often do in the field.",
    },
    capt: {
      label: "Realism factor",
      hint:
        "Share of the perfect-foresight margin a real trader achieves: prices are not known in advance and bids are not " +
        "always accepted. 0.75 of the optimum; availability is counted separately.",
    },
    fee: {
      label: "Optimiser’s fee",
      hint: "Share of the trading margin paid to the company that trades the battery.",
    },
    capex: {
      label: "Investment cost",
      hint:
        "All-in investment as a share of the model’s estimate: battery blocks priced per DC kWh, power conversion and " +
        "substation per MW, balance of plant, protection against attacks, connection, development, owner’s costs and a " +
        "contingency.",
    },
    conn: {
      label: "Grid connection",
      hint:
        "Distribution network at 110 kV (pays the distribution tariff and a connection fee) or a bay in Ukrenergo’s " +
        "transmission substation (no distribution tariff; a higher one-off cost).",
    },
    delay: {
      label: "Delay to commercial operation",
      hint:
        "Months of delay after 1 Feb 2028. Beyond 30 Apr 2028 the battery loses the legacy treatment and pays network " +
        "tariffs on everything it draws, not only on net withdrawal.",
    },
    aux: {
      label: "Own consumption 1% of power",
      hint: "Stress: auxiliary load of 1% of the power, all year, bought at market prices — the Market Operator’s assumption.",
    },
    war: {
      label: "Expected war loss",
      hint:
        "Expected loss a year as a share of the replacement value: an 8% market premium for war risk, of which 35% is " +
        "taken as expected loss. Behind it: a 7% chance a year of a hit that destroys 40% and stops the site for 6 months.",
    },
    ins: {
      label: "War-risk insurance",
      hint:
        "Pay an 8% premium a year instead of carrying the expected loss: claims are paid after a deductible and nine months. " +
        "Cover is scarce for energy assets, so the base case has none.",
    },
    cover: {
      label: "Insurer found",
      hint: "Whether cover is actually available for this site. Without it, the switch above has no effect on the claims.",
    },
    state: {
      label: "State refunds premium",
      hint: "The state refunds the premium above 1% of the sum insured, up to 5 million UAH a year, while the budget lasts.",
    },
    debt: {
      label: "Senior loan",
      hint: "A euro loan from an international development bank, sized on the lender’s case. Off: the project is financed with equity only.",
    },
    rate: {
      label: "Interest rate, all-in",
      hint: "Fixed euro rate: 7-year swap 3.56% plus a 4.5% margin for a merchant battery in wartime.",
    },
    dscr: {
      label: "Target DSCR, lender’s case",
      hint:
        "The lender sizes the loan so that cash on the low path covers each instalment this many times — high, because " +
        "the revenue has no contract.",
    },
    gear: {
      label: "Maximum debt share",
      hint: "Upper limit of the loan as a share of the investment without VAT.",
    },
    term: {
      label: "Money out at the end",
      hint:
        "When the company is wound up: the cash goes to the German parent within the €1 million a month limit (and after the " +
        "model’s end), or — stress — it cannot leave the country at all.",
    },
    fx: {
      label: "Weaker hryvnia (+10%)",
      hint: "Stress: the euro costs 10% more hryvnias from 2028 on than on the budget path.",
    },
    hurdle: {
      label: "Equity hurdle rate (€)",
      hint:
        "Return an investor asks for on equity in Ukraine in euros, used for the investor NPV. With the full country risk " +
        "premium it would be about 22.6%; 15% takes about half of it.",
    },
    disc: {
      label: "Project discount rate",
      hint: "Rate for the project NPV and the LCOS (before financing).",
    },
  } as Record<string, { label: string; hint: string }>,
  options: {
    scn: { reference: "Reference", low: "Low", high: "High" },
    snap: { "UA-2025": "2025", "UA-LTM-2026-09": "Oct 2025 – Sep 2026" },
    cur: { EUR: "Euro", UAH: "Hryvnia" },
    dur: { "1": "1 h", "2": "2 h", "4": "4 h" },
    rte: { "0.85": "85%", "0.88": "88%", "0.9": "90%" },
    cyc: { "1": "1.0 a day", "1.5": "1.5 a day" },
    conn: { dso110kV: "Distribution 110 kV", ukrenergoBay: "Ukrenergo bay" },
    term: { capped: "Within the limit", blocked: "Blocked" },
  } as Record<string, Record<string, string>>,
  units: {
    "% of estimate": "% of estimate",
    "%/yr": "% a year",
    months: "months",
  } as Record<string, string>,
  scenarioName: { reference: "reference", low: "low", high: "high" } as Record<string, string>,
  tabs: {
    overview: "Overview",
    revenue: "Revenue",
    battery: "Battery",
    debt: "Debt & cash",
    risks: "Risks",
    sensitivity: "Sensitivity",
    checks: "Checks",
    tables: "Tables",
  },
  overview: {
    title: "How the money flows",
    revenue: (pf: string, net: string, capture: string, fee: string) =>
      `In 2029, the first full year, buying in the cheapest hours and selling in the dearest with perfect foresight would earn ${pf} per MW. ` +
      `A real trader achieves ${capture} of that and pays the optimiser ${fee} of what it earns: ${net} per MW remains.`,
    costs: (costs: string, ebitda: string) =>
      `Operating costs, network tariffs and the expected war loss take ${costs} per MW, which leaves EBITDA of ${ebitda} per MW.`,
    investment: (capex: string, perMw: string, debt: string, gearing: string, equity: string) =>
      `Building the battery costs ${capex} (${perMw} per MW). The lender looks at the low price path and lends ${debt} — ${gearing} of the cost; the owner pays in ${equity}.`,
    noLoan: (capex: string, perMw: string, equity: string) =>
      `Building the battery costs ${capex} (${perMw} per MW), all paid in by the owner: ${equity}.`,
    result: (irr: string, hurdle: string) => `The investor earns ${irr} a year in euros against a hurdle of ${hurdle}.`,
    resultNoIrr: (hurdle: string) => `The investor’s cash flows have no meaningful IRR; measured at the hurdle of ${hurdle}, see the NPV.`,
    chartTitle: "Revenue and costs by year",
    chartNote: "€ million, nominal. Costs include grid tariffs, the expected war loss (or insurance) and replacements.",
    netRevenue: "Net revenue",
    opex: "Operating costs",
    tariffs: "Grid tariffs",
    war: "War risk",
    lifecycle: "Replacements and decommissioning",
    cfads: "Cash for debt service",
  },
  revenue: {
    bridgeTitle: "From perfect foresight to cash, 2029",
    bridgeNote: "Per MW of grid connection, nominal euros.",
    pf: "Perfect-foresight margin",
    capture: "Realism factor",
    fee: "Optimiser’s fee",
    net: "Net revenue",
    opex: "Operating costs",
    tariffs: "Grid tariffs",
    war: "Expected war loss / insurance",
    other: "Other",
    ebitda: "EBITDA",
    tax: "Income tax paid",
    cfads: "Cash for debt service",
    pathsTitle: "Spread paths",
    selected: "selected",
    pathsNote: "Multiplier on the daily price spreads of the chosen price year, in 2025 euros; flat from 2031.",
    profileTitle: "Average day-ahead price by hour",
    profileNote: (from: string) =>
      `Average of all days of the month, € per MWh, ${from}. Derived from the Market Operator’s hourly prices; the hourly series is not published.`,
    hour: "Hour",
    tb2Title: "Daily top-two-hour spread",
    tb2Note: "Gap between the average of the two dearest and the two cheapest hours of each day, € per MWh.",
    mean: "Average",
    decile: (p: number) => `P${p}`,
  },
  battery: {
    title: "Capacity and use",
    note: "Usable energy at the end of each year as a share of the start, and the energy delivered to the grid.",
    soh: "Usable energy",
    delivered: "Delivered, GWh",
    cycles: "Full cycles a day",
    cyclesNote: (cap: string) => `Average over the operating days; the warranty limit is ${cap} a day.`,
    events: "Planned events",
    augmentation: (year: number) => `${year}: modules added (+15% of the original DC capacity)`,
    noAugmentation: "No augmentation: the usable energy keeps fading.",
    overhaul: (year: number) => `${year}: power conversion overhaul`,
  },
  debt: {
    dscrTitle: "Debt service cover by half-year",
    dscrNote: "Selected path. Below the lock-up level no dividends may be paid; below the default level the loan is in default.",
    dscr: "DSCR",
    lender: "Lender’s case",
    lockup: "Lock-up",
    defaultLevel: "Default",
    balanceTitle: "Loan",
    opening: "Loan at COD",
    tenor: "Final repayment",
    llcr: "LLCR at COD",
    avgDscr: "Average DSCR",
    reserve: "Debt service reserve",
    liquidity: "Liquidity reserve",
    noDebt: "No loan in this case.",
    cashTitle: "Cash flow by year",
    cfads: "Cash for debt service",
    service: "Debt service",
    dividends: "Dividends declared",
  },
  risks: {
    tariffTitle: "Network tariffs",
    tariffText:
      "Until 30 April 2037 a storage plant built in time pays transmission and distribution tariffs only on its net " +
      "withdrawal. From May 2037 the model charges them on everything it draws — the regulator has not yet set the rule. " +
      "A plant that misses the 30 April 2028 deadline pays on everything from the start.",
    tariffNow: (lost: boolean) => (lost ? "In this case the legacy treatment is lost." : "In this case the battery keeps the legacy treatment until April 2037."),
    warTitle: "War risk",
    warExpected: (el: string) => `Expected loss ${el} a year of the replacement value, charged as a cost every month.`,
    warInsured: "Insured: premiums are paid and claims arrive nine months after a hit.",
    warNote: "The NPV of the expected cash flow is not the expected NPV: a hit shortly after construction would hurt more than its average.",
    outage: (pct: string) => `Expected downtime from hits: ${pct} of the hours.`,
    cashTitle: "Cash that reaches the investor",
    cashText:
      "Dividends may only be paid out of profit of a year whose tax is settled, and depreciation keeps that profit far " +
      "below the cash the battery earns. So cash builds up in the company until it is wound up; then the National Bank’s " +
      "limit of €1 million a month applies to everything that leaves.",
    transferred: "Paid to the investor",
    inCompany: "Cash in the company",
    trapped: (v: string) => `Most cash held in the company at a year end: ${v}.`,
    fxTitle: "Currency",
    fxText: (rate2029: string, stress: boolean) =>
      `The battery earns and spends in hryvnias; the loan and the investor are in euros. The model’s path: ${rate2029} UAH per euro in 2029, then 2.9% weaker a year${stress ? " — and 10% weaker still in this stress" : ""}.`,
  },
  sensitivity: {
    title: "What moves the result",
    subtitle: "Each driver alone, with the loan as signed at financial close. Bars show the change of the investor NPV.",
    metric: "Measure",
    metrics: { npv: "Investor NPV", irr: "Investor IRR" },
    low: "Low setting",
    high: "High setting",
    calculating: "Calculating…",
    drivers: {
      spread: { label: "Spreads", low: "−20%", high: "+20%" },
      capture: { label: "Realism factor", low: "0.65", high: "0.85" },
      capex: { label: "Investment cost", low: "−10%", high: "+11%" },
      war: { label: "Expected war loss", low: "1.6%", high: "4.0%" },
      rate: { label: "Interest rate", low: "−1.5 pp", high: "+1.5 pp" },
      fx: { label: "Weaker hryvnia", low: "—", high: "+10%" },
      rte: { label: "Efficiency node", low: "88%", high: "90%" },
      degradation: { label: "Faster wear", low: "—", high: "× 1.3" },
      aux: { label: "Own consumption", low: "—", high: "1%" },
      grossTariff: { label: "Tariff on all withdrawal", low: "—", high: "from COD" },
    } as Record<string, { label: string; low: string; high: string }>,
    variantsTitle: "Alternative cases",
    variantsSubtitle: "Before investing: one change at a time (the last one combined), the loan sized again.",
    variant: "Case",
    current: "These inputs",
    irr: "Investor IRR",
    npv: "NPV at hurdle",
    debt: "Loan",
    variants: {
      fourHours: "4-hour battery",
      oneHour: "1-hour battery",
      high: "High spread path",
      low: "Low spread path",
      ltm: "Prices of the last 12 months",
      capture85: "Realism factor 0.85",
      war16: "Expected war loss 1.6%",
      noWar: "No war loss",
      capexMinus10: "Investment cost −10%",
      noDebt: "No loan",
      blocked: "Money blocked at the end",
      favourable: "4 h + high path + 0.85 + war loss 1.6%",
    } as Record<string, string>,
    breakEvenTitle: "Break-even spreads",
  },
  checks: {
    title: "Checks",
    groups: {
      integrity: "Calculation",
      funding: "Funding",
      covenant: "Covenants",
      data: "Data",
      scope: "Scope of the model",
      inputs: "Inputs",
      physical: "Physical",
    } as Record<string, string>,
    status: { pass: "Passed", fail: "Failed", warning: "Warning", notApplicable: "Not applicable", outOfScope: "Outside the model’s scope" } as Record<string, string>,
    value: "Value",
    ids: {
      library: "Inputs within the revenue library",
      sizingConverged: "Loan sizing converged",
      drawsEqualDebt: "Loan draws equal the loan",
      balanceSheet: "Balance sheet balances every month",
      cashNonNegative: "Cash never negative",
      debtRepaid: "Loan repaid by maturity, no arrears",
      gearing: "Loan within the debt share limit",
      dsraFunded: "Debt service reserve topped up",
      lockup: "Cover above the lock-up level in every period",
      default: "DSCR above the default level",
      repatriationCap: "Transfers within the €1 million monthly limit",
      terminalRemittance: "Money can leave at the end",
      thinCap: "Thin capitalisation (interest deduction limit)",
      dividendsWithinTaxableProfit: "Dividends within taxed profit (no advance tax)",
      receivablesWrittenOff: "Receivables collected",
      cohortLost: "Legacy network tariff kept",
      energyBalance: "Energy delivered equals efficiency × energy bought, every month",
      cycleLimit: "Delivered energy within the daily cycle limit",
      retiredBelowGrid: "Battery in service to the end of its life",
      feeFloor: "Equivalent fee never floored at zero",
      tariffAfter2037: "Network tariff after April 2037",
      psoSurcharges: "Public service surcharges from 2030",
      warCover: "War-risk cover available",
      taxRulesVerification: "Tax rules verified against the Tax Code",
    } as Record<string, string>,
    notes: {
      tariffAfter2037: "Gross-withdrawal tariff assumed until the regulator publishes the method.",
      psoSurcharges: "Surcharges under law 4937-IX are not quantified.",
      taxRulesVerification: "Tax deadlines and asset classes still to be verified against the Tax Code.",
      library: "A technical input lies outside the precomputed revenue grid; nothing is extrapolated.",
      retiredBelowGrid: "The usable energy fell below the revenue grid; the battery stands idle while fixed costs continue.",
      feeFloor: "In some months tariffs and fees were worth less than nothing to the dispatch; the model uses zero, which is conservative.",
    } as Record<string, string>,
  },
  tables: {
    title: "Year by year",
    unit: "€ thousand, nominal",
    rows: {
      delivered: "Energy delivered, MWh",
      soh: "Usable energy at year end, % of start",
      pf: "Perfect-foresight margin",
      captured: "After realism factor",
      fee: "Optimiser’s fee",
      net: "Net revenue",
      opex: "Operating costs",
      tariffs: "Grid tariffs",
      war: "War risk (expected loss or insurance)",
      ebitda: "EBITDA",
      tax: "Income tax paid",
      lifecycle: "Replacements and decommissioning",
      cfads: "Cash for debt service",
      debtService: "Debt service",
      dividends: "Dividends declared",
      investor: "Paid to the investor (after tax)",
      cash: "Cash in the company at year end",
    },
  },
  states: {
    loading: "Loading the revenue library…",
    error: "The calculation could not run",
    errorText: "The revenue library or the calculation failed to load. The figures shown are the base case.",
    retry: "Try again",
    unsupported: "These inputs lie outside the precomputed revenue grid. The model does not extrapolate.",
  },
  footer: {
    author: "Model and text: Igor Sabodakha",
    data: "Prices: Market Operator (Ukraine), derived statistics only; exchange rates: National Bank of Ukraine",
    version: (spec: string, lib: string) => `Methodology ${spec} · revenue library v${lib}`,
  },
};

export type BessMessages = typeof bessEn;
