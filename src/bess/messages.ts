// English texts of the battery calculator (v1: Ukraine, day-ahead market). Kept apart from the wind calculator's
// dictionary; numbers in the texts come from the engine or the registry, never typed in twice.

export type BessKpiKey = "investorIrr" | "investorNpv" | "minDscr" | "netRevenue" | "netRevenueContract" | "lcos" | "payback";

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
    ukraine: "Ukraine",
    germany: "Germany",
    switchLabel: "Market",
    compare: "Ukraine against Germany",
    subtitle: (mw: number, mwh: number, h: number, awardMw: number | null) =>
      `Fictional project “Zoria Storage” · ${mw} MW / ${mwh} MWh (${h} h) · Kyiv region, Ukraine · ` +
      (awardMw === null ? "revenue from day-ahead trading only" : `revenue from day-ahead trading and a ${awardMw} MW reserve contract`),
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
    netRevenueContract: {
      label: "Net revenue 2029",
      hint:
        "With the reserve contract: what is left of day-ahead trading after the realism factor and the optimiser’s fee, plus " +
        "the contract’s net contribution — availability fee, activation energy, restoring the stock, penalties, fees and the " +
        "extra network charges. Per MW of grid connection, nominal euros, expected values.",
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
    contractShort: "incl. contract",
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
  caseStatus: {
    title: {
      inputUnsupported: "Contract inputs outside the model",
      physicallyUnsupported: "The battery cannot hold this contract",
      calcError: "The calculation failed its own checks",
      cancelled: "Contract cancelled",
    } as Record<string, string>,
    text: {
      inputUnsupported: "These contract inputs lie outside what the model supports, so nothing is calculated.",
      physicallyUnsupported: "The award does not fit this battery on every day of service, so no money or returns are shown.",
      calcError: "An internal identity does not close, so the result is not shown.",
      cancelled:
        "Commercial operation starts more than four months late: the award is cancelled and the security kept. The case is " +
        "calculated without the contract’s service.",
    } as Record<string, string>,
    cMax: (mw: string) => `This battery holds up to ${mw} of reserve.`,
    reasons: {
      reserveProduct: "only symmetric aFRR is in this version",
      acceptedMW: "the award must be a whole number of MW, at least 1",
      tenorMonths: "the term must be 13 to 60 months",
      sustainHours: "full activation must be held for at least one hour",
      recoveryPowerShare: "the recovery margin must be above 0% and at most 100% of the award",
      nettingShare: "netting must be between 0% and 100%",
      activationRate: "activation must be between 0% and 15% of the award per hour",
      balancingPremium: "balancing prices must stay non-negative",
      peakDayFactor: "the peak-day factor must be at least 1",
      liquidityDays: "the liquidity reserve cannot be negative",
      penaltyInputs: "failures must be 0–12 a year and the penalty window 0–720 hours",
      lossAndLoadInputs: "other loss must be 0–100% a year and the standing load 0–5% of the award",
      stateProbability: "the monthly chances of a hit and of other loss add up to more than 1",
      paymentLag: "payment delays must be 1–24 months for balancing energy and 1–4 for the fee",
      collectionAndFee: "the collected share and the balancing fee must be between 0% and 100%",
      auctionCalendar: "the auction must fall between financial close and the start, at most 36 months before it",
      startBeforeReadiness: "service must start after commercial operation",
      renewalTenorMonths: "the second contract’s term must be 13 to 60 months",
      renewalAboveAuctionCap: "the second contract’s price must be positive and within the cap at its auction",
      exitOutsideOperations: "the last contract must end before the battery’s last operating month",
      priceNotPositive: "the contract price must be above zero",
      aboveAuctionCap: "the contract price is above the auction cap",
      library: "a technical input lies outside the revenue library",
      reserveOverAllocated: "the reserve needs more power or energy than the battery has",
      warrantyQuotaExceeded: "on a peak day the reserve would use more than its share of the daily warranty quota",
      recoveryEnvelopeExceeded: "the recovery margin cannot restore the stock within a day",
      transitionPowerExceeded: "the energy stock cannot be filled or sold within one day",
      renewalUnsupported: "the second contract does not fit the battery",
    } as Record<string, string>,
  },
  whatItTakes: {
    title: "What would it take?",
    short: "Day-ahead trading alone does not earn the hurdle rate.",
    enough: "Day-ahead trading alone earns at least the hurdle rate.",
    shortContract: "With the reserve contract, the project still does not earn the hurdle rate.",
    enoughContract: "With the reserve contract, the project earns at least the hurdle rate.",
    breakEven: (k: string, path: string) => `Investor NPV reaches zero if daily price spreads are ${k} the ${path} path.`,
    breakEvenBelow: (k: string, path: string) => `Spreads could fall to ${k} the ${path} path before the investor NPV turns negative.`,
    spreadIs: (need: string, now: string) =>
      `In 2029 that is an average gap between the two dearest and the two cheapest hours of a day of about ${need} per MWh, instead of ${now} (2025 euros).`,
    spreadContext: (ua: string, eu: string) => `For comparison, 2025: Ukraine ${ua}, neighbouring EU markets ${eu}.`,
    notReached: "Even spreads three times the path do not reach the hurdle.",
    unsupportedBelow: (k: string) => `Break-even lies below the range the revenue library covers (from ${k}).`,
    unsupported: "Break-even cannot be searched: these inputs lie outside the revenue library.",
    calculating: "Calculating break-even…",
    blocked: "There is no result to compare: the contract case is not calculated (see the status above).",
    notIncluded:
      "Not in this version: daily reserve auctions, the balancing market, FCR and upward-only aFRR. A multi-year " +
      "special-auction contract for symmetric aFRR is an option — see below.",
    alternatives: "One change at a time, loan sized again",
    allAlternatives: "All alternatives",
  },
  contract: {
    cardTitle: "With a reserve contract",
    cardTag: "Option — not in the base case",
    calculating: "Calculating the break-even contract price…",
    breakEven: (p: string) => `The investor NPV reaches zero at a contract price of ${p} per MW-hour.`,
    admissible: (cap: string) => `That is within the 2027 auction cap of ${cap}.`,
    aboveCap: (cap: string) => `That is above the 2027 auction cap of ${cap}, so no bid could win it.`,
    zeroPrice: "That is a zero price: a mathematical bound, not a bid.",
    viableAtZero: "The project earns the hurdle rate even at a zero contract price — a bound, not a bid.",
    allNegative: (max: string) => `Even ${max} per MW-hour does not reach the hurdle rate.`,
    allPositive: (max: string) => `Every contract price up to ${max} per MW-hour earns at least the hurdle rate.`,
    priceInsensitive: "The contract would be cancelled: commercial operation starts more than four months late.",
    physicallyUnsupported: (mw: string) => `An award of ${mw} does not fit this battery:`,
    inputUnsupported: "The contract’s inputs lie outside the model:",
    unresolved: "No break-even price could be found between €0 and €40: some prices could not be calculated.",
    refinementFailed: "The break-even price could not be pinned down between two neighbouring prices.",
    unfunded: "At that price the company runs short of cash; the NPV stands, marked.",
    gridNote: "Searched on a grid of €1 per MW-hour; another crossing between grid points cannot be ruled out.",
    roots: (n: number) => `${n} crossings found; the lowest is shown.`,
    templateDefault: (mw: string, months: number, start: string) =>
      `Contract tested: ${mw} of symmetric aFRR for ${months} months from ${start}, no second contract; the loan is sized again for every price.`,
    templateOwn: (mw: string, months: number, start: string) =>
      `Your contract, ${mw} for ${months} months from ${start}, without a second contract; the loan is sized again for every price.`,
    at: (price: string, npv: string) => `At ${price}, about the latest round’s price: investor NPV ${npv}.`,
    holds: (mw: string) => `This battery holds up to ${mw} of reserve.`,
    show: "Add this contract",
    open: "Contract details",
    scale: { cap: "cap", round: "latest round", breakEven: "break-even" },
    scaleLabel: "Contract price, € per MW-hour",
    tab: {
      offTitle: "Reserve contract: off",
      offText:
        "The base case trades on the day-ahead market only: no special auction was held in 2026. Switch the contract on to " +
        "see what a multi-year award for symmetric aFRR changes — the availability fee, the energy stock it needs, the " +
        "escrow, penalties, the share of the battery it takes out of trading, and the loan.",
      switchOn: "Switch the contract on",
      factsTitle: "The award",
      facts: {
        award: "Awarded capacity",
        cMax: "Largest this battery holds",
        price: "Contract price",
        cap: "Auction cap",
        service: "Service",
        second: "Second contract",
        none: "None",
        escrow: "Escrow (security)",
        liquidity: "Liquidity reserve",
        fill: "Energy stock bought",
        calls: "Owner’s cash for the contract",
        share: "Battery reserved",
        daShare: "Left for trading, 2029",
        recovery: "Stock restored after a full command",
      },
      recoveryValue: (up: string, down: string) => `${up} h after up · ${down} h after down`,
      expected:
        "Expected cash flows: hits and other losses are weighted by their chance. The NPV is the NPV of the expected flow; " +
        "the IRR of the expected flow is not the expected IRR.",
      bridgeTitle: "What the contract changes, 2029",
      bridgeNote: "Per MW of grid connection, nominal euros, expected values.",
      bridge: {
        capacity: "Availability fee",
        daNet: "Day-ahead trading, net",
        upEnergy: "Activation energy delivered",
        downEnergy: "Activation energy taken",
        restoration: "Restoring the stock",
        penalties: "Penalties",
        feesAndLoad: "Fees, standing load, certificate",
        networkIncrement: "Extra network charges",
        net: "Net revenue",
      },
      pStarTitle: "Break-even contract price",
      pStarNote: "Investor NPV at the hurdle rate for each contract price from €0 to €40 per MW-hour, the loan sized again each time.",
      npv: "Investor NPV",
      bucketsTitle: "Cash for debt service by source",
      bucketsNote:
        "Per half-year, € million. The lender counts the contract’s cash at a cover of 1.35 and the trading cash at the " +
        "merchant target.",
      bucketsShare: (share: string) => `In the first contract’s months the contract brings ${share} of this cash.`,
      bucketContract: "Contract",
      bucketMerchant: "Day-ahead trading",
      debtService: "Debt service",
      physicalTitle: "Can the battery hold it?",
      physicalNote: "Every check runs on every service day and every day of filling or selling the stock, on the selected path and on the lender’s.",
      notShown: "No money or returns are shown for this case.",
    },
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
    contract: "Reserve contract",
    contractOps: "Contract: activation and payment",
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
    ctr: {
      label: "Ukrenergo reserve contract",
      hint:
        "A special-auction contract to hold symmetric aFRR — automatic frequency restoration reserve — for Ukrenergo, paid " +
        "for availability at a euro price per MW and hour fixed for up to five years. The power and energy it ties up leave " +
        "day-ahead trading. Off in the base case: no round was held in 2026.",
    },
    cmw: {
      label: "Awarded capacity",
      hint:
        "MW of reserve the battery must hold every hour, up and down. With the recovery margin it ties up more power, plus " +
        "a stock of energy. Presets: 20 / 40 / 45 MW for a 1 / 2 / 4-hour battery; the Contract tab shows the largest award " +
        "this battery holds.",
    },
    cpr: {
      label: "Contract price",
      hint:
        "Euros per MW of reserve per hour of availability, fixed for the term and paid in hryvnias at each month’s rate. " +
        "The 2027 cap is 1,339.82 UAH, about €25 at the auction month’s rate. Rounds of 2024–2025 cleared at about €17–29.",
    },
    cren: {
      label: "Second contract after the first",
      hint: "Hypothetical: the battery wins another round when the first contract ends. The lender does not count on it.",
    },
    crp: {
      label: "Price of the second contract",
      hint: "Euros per MW-hour, within the cap at the rate of its auction six months before it starts. Follows the first price unless set.",
    },
    crt: {
      label: "Term of the second contract",
      hint: "13 to 60 months; it must end before the battery’s last operating month.",
    },
    cten: {
      label: "Contract term",
      hint: "From 13 months to five years under the Market Rules. Service starts the month after commercial operation (March 2028).",
    },
    chit: {
      label: "After a damaging strike",
      hint:
        "A hit that stops the battery for six months is force majeure, but after 30 days Ukrenergo may end the contract. " +
        "Base: the contract ends for the share hit, which returns to day-ahead trading after the repair. Option: the " +
        "contract is suspended and resumes.",
    },
    cev: {
      label: "Failures a year without relief",
      hint:
        "Events in which the battery is not available as contracted and no wartime relief applies (NEURC resolution 1294). " +
        "Each costs twice the fee of the hours in its penalty window.",
    },
    cph: {
      label: "Penalty window per failure",
      hint: "Hours of fees charged per failure. The Market Rules can look back up to 720 hours; 1 hour is the expected-cost approximation.",
    },
    cliq: {
      label: "Liquidity reserve",
      hint: "Days of reserve purchases and balancing payables the owner keeps in cash for the contract, on top of the escrow.",
    },
    cded: {
      label: "Penalties deductible for tax",
      hint: "Whether penalties, the security kept and written-off claims reduce taxable profit. The Tax Code does not settle this case.",
    },
    cbsp: {
      label: "Balancing prices of 2025",
      hint:
        "Activation energy paid at 60% above the day-ahead price upwards and 87.5% below it downwards, as balancing energy " +
        "of all products was in 2025 — an upper bound. Base: at the day-ahead price, because commands net out within the " +
        "hour and balanced hours are paid at the day-ahead price.",
    },
    clag: {
      label: "Balancing energy paid after",
      hint: "When Ukrenergo pays for activation energy. The rules say the next month; payments to balancing providers have run about a year late.",
    },
    cnet: {
      label: "No offset of balancing claims",
      hint:
        "Stress: what the battery owes for energy taken on command is paid in full the next month, while what it is owed for " +
        "energy delivered arrives only after the delay.",
    },
    cas: {
      label: "Availability fee paid after",
      hint: "Months from the service month to payment of the availability fee. Contract terms: the next month.",
    },
    csus: {
      label: "Full activation to hold",
      hint: "Hours the battery must sustain full activation each way. The minimum for aFRR is one hour; more ties up more energy.",
    },
    crho: {
      label: "Recovery margin",
      hint: "Extra power, as a share of the award, kept free to restore the energy stock while the reserve stays available.",
    },
    cphi: {
      label: "Peak-day activation",
      hint: "Activation on the busiest day as a multiple of the month’s average; it is checked against the daily warranty quota.",
    },
    cau: {
      label: "Activation up",
      hint: "Energy delivered on command per MW of award and hour: 5% means 0.05 MWh per MW each hour on average. Not yet calibrated to Ukrenergo’s data.",
    },
    cad: {
      label: "Activation down",
      hint: "Energy taken on command per MW of award and hour. Not yet calibrated to Ukrenergo’s data.",
    },
    cnu: {
      label: "Left after netting",
      hint: "Share of activation energy left after up and down commands in the same hour cancel out in settlement.",
    },
    ckap: {
      label: "Balancing claims collected",
      hint: "Share of the balancing receivable actually paid; the rest is written off.",
    },
    cfee: {
      label: "Balancing non-compliance fee",
      hint: "Sensitivity: a fee as a share of the settled activation energy. On full delivery the fee is zero.",
    },
    clo: {
      label: "Other loss of the contract",
      hint: "Chance a year of losing the contract for other reasons, such as the certificate. The share lost returns to day-ahead trading.",
    },
    clam: {
      label: "Standing load of the reserve",
      hint: "Power drawn all the time by the reserve’s controls and cooling, as a share of the award.",
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
    chit: { terminated: "Contract ends", suspended: "Suspended" },
    clag: { "1": "Next month", "6": "6 months", "12": "12 months", "24": "24 months" },
    cas: { "1": "Next month", "2": "2 months", "3": "3 months", "4": "4 months" },
    csus: { "1": "1 h", "1.5": "1.5 h" },
  } as Record<string, Record<string, string>>,
  units: {
    "% of estimate": "% of estimate",
    "%/yr": "% a year",
    months: "months",
    "a year": "a year",
    "% of award": "% of award",
  } as Record<string, string>,
  scenarioName: { reference: "reference", low: "low", high: "high" } as Record<string, string>,
  tabs: {
    overview: "Overview",
    revenue: "Revenue",
    battery: "Battery",
    debt: "Debt & cash",
    risks: "Risks",
    contract: "Contract",
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
    contract: (fee: string, net: string) =>
      `The reserve contract brings ${fee} per MW in availability fees; after activation energy, restoring the stock, ` +
      `penalties, fees and network charges it adds ${net} per MW to what is left of day-ahead trading.`,
    result: (irr: string, hurdle: string) => `The investor earns ${irr} a year in euros against a hurdle of ${hurdle}.`,
    resultNoIrr: (hurdle: string) => `The investor’s cash flows have no meaningful IRR; measured at the hurdle of ${hurdle}, see the NPV.`,
    chartTitle: "Revenue and costs by year",
    chartNote: "€ million, nominal. Costs include grid tariffs, the expected war loss (or insurance) and replacements.",
    netRevenue: "Net revenue",
    opex: "Operating costs",
    tariffs: "Grid tariffs",
    war: "War risk",
    lifecycle: "Replacements and decommissioning",
    reserve: "Reserve contract",
    cfads: "Cash for debt service",
  },
  revenue: {
    bridgeTitle: "From perfect foresight to cash, 2029",
    bridgeNote: "Per MW of grid connection, nominal euros.",
    pf: "Perfect-foresight margin",
    capture: "Realism factor",
    fee: "Optimiser’s fee",
    net: "Net revenue",
    contract: "Reserve contract, net cash",
    opex: "Operating costs",
    tariffs: "Grid tariffs",
    war: "Expected war loss / insurance",
    other: "Other, incl. timing of payments",
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
      cPrice: { label: "Contract price", low: "−20%", high: "+20%" },
      cActivation: { label: "Activation", low: "0", high: "10%" },
      cNetting: { label: "Left after netting", low: "0%", high: "100%" },
      cSustain: { label: "Full activation to hold", low: "—", high: "1.5 h" },
      cRecovery: { label: "Recovery margin", low: "—", high: "25%" },
      cPeakDay: { label: "Peak-day activation", low: "—", high: "× 3" },
      cEvents: { label: "Failures without relief", low: "0", high: "12 a year" },
      cPenaltyWindow: { label: "Penalty window", low: "—", high: "720 h" },
      cOtherLoss: { label: "Other loss of the contract", low: "—", high: "5% a year" },
      cBsFee: { label: "Balancing fee", low: "—", high: "2%" },
      cAsLag: { label: "Availability fee paid", low: "—", high: "after 4 months" },
      cCollection: { label: "Balancing claims collected", low: "—", high: "90%" },
      cDeductible: { label: "Penalties deductible", low: "—", high: "no" },
      cLoad: { label: "Standing load", low: "—", high: "0.5%" },
    } as Record<string, { label: string; low: string; high: string }>,
    noResult: (list: string) => `No result, shown as a status: ${list}.`,
    statusShort: {
      inputUnsupported: "inputs outside the model",
      physicallyUnsupported: "does not fit the battery",
      calcError: "calculation check failed",
    } as Record<string, string>,
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
      contractInputs: "Contract inputs within the model’s range",
      reserveOverAllocated: "Reserve fits the battery’s power and energy every month",
      warrantyQuotaExceeded: "Peak-day reserve use within its share of the warranty quota",
      recoveryEnvelopeExceeded: "Stock restored within the recovery margin",
      transitionPowerExceeded: "Stock filled and sold within one day each",
      renewalUnsupported: "Second contract fits the battery",
      activationEnergyBalance: "Activation energy balances every month",
      inventoryClosed: "Energy stock closes to zero",
      inventoryCostClosed: "Cost of the stock closes to zero",
      noDoubleSale: "Stock sold once",
      stateIdentity: "Contract shares add up to one",
      escrowRollForward: "Escrow and liquidity reserve released in full",
      receivablesReconcile: "Contract claims and debts settled",
      vatReconcile: "VAT of the contract reconciles",
      bucketsReconcile: "Contract and merchant cash add up",
      taxAllocationSums: "Tax split between contract and merchant adds up",
      contractCancelled: "Contract starts in time",
      activationProxy: "Activation, netting and balancing prices calibrated",
      repeatCalls: "Repeated or longer commands",
      meterProxy: "Network charges of the contract",
      certificateRules: "Certificate rules (30% threshold, three failures)",
      balancingFee: "Balancing non-compliance fee",
      wartimeRelief: "Wartime relief from penalties",
      futureAgreement: "Future service agreement and wartime settlement rules",
      collectionAndVat: "Balancing payment delay, write-offs and VAT timing",
      capRegime: "Auction cap after 2027",
      postExpiry: "Repairs still open when a contract ends",
      transitionDays: "Days of filling and selling the stock",
    } as Record<string, string>,
    lender: (label: string) => `${label} — lender’s case`,
    notes: {
      tariffAfter2037: "Gross-withdrawal tariff assumed until the regulator publishes the method.",
      psoSurcharges: "Surcharges under law 4937-IX are not quantified.",
      taxRulesVerification: "Tax deadlines and asset classes still to be verified against the Tax Code.",
      library: "A technical input lies outside the precomputed revenue grid; nothing is extrapolated.",
      retiredBelowGrid: "The usable energy fell below the revenue grid; the battery stands idle while fixed costs continue.",
      feeFloor: "In some months tariffs and fees were worth less than nothing to the dispatch; the model uses zero, which is conservative.",
      contractCancelled: "The start is more than four months late: the award is cancelled and the security kept.",
      activationProxy: "Uncalibrated assumptions; calibration to Ukrenergo’s minute data is planned.",
      repeatCalls: "Commands beyond the energy stock held are not modelled.",
      meterProxy: "Flows at the connection point are added up by share, which overstates the tariffs a little.",
      certificateRules: "Not modelled: the certificate is assumed to be kept; other loss of the contract is the stress.",
      balancingFee: "Zero on full delivery; a fee sensitivity only.",
      wartimeRelief: "Relief under resolution 1294 assumed granted; the penalty window is an expected-fee approximation.",
      futureAgreement: "Not reviewed, nor the wartime settlement rules of resolution 332.",
      collectionAndVat: "Scenarios; VAT of operating fees is not timed.",
      capRegime: "The 2027 cap is kept as a scenario.",
      postExpiry: "After the last contract, the average outage derate stands in for repairs still open.",
      transitionDays: "Each withholds one day of the moving share from the monthly day-ahead library.",
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
      contract: "Reserve contract, net cash",
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
