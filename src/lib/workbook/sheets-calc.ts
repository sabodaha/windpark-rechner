// Workbook sheets: Operations, Tax and Debt.
import { correctionFactor, marketPremium, SITE_REVIEW_THRESHOLD, SITE_REVIEW_YEARS } from "@/engine/eeg";
import { toDay } from "@/engine/dates";
import { MIN_DEBT_SERVICE } from "@/engine/model";
import { DOWNSIDE, TAX, type ModelResult, type OperationsTrace, type TaxTrace } from "@/engine";
import { addYearsDay, COLS_PERIOD, MONEY, SC_LABEL, sum, xd, type Env, type Ops } from "./common";
import { blank, period, scalar, text, type Ctx, type Row, type SheetDef } from "./grid";
import type { CellValue } from "./ooxml";

/** Share of each year's support days in the four AW periods (COD, the three § 36h reviews, EEG end). */
export function awWeights(e: Env): number[][] {
  const t = e.base.trace!.timing;
  const bounds = [e.cod, ...SITE_REVIEW_YEARS.map((n) => addYearsDay(e.cod, n)), e.eegEnd];
  return [0, 1, 2, 3].map((k) =>
    t.start.map((s, y) => {
      const a = toDay(s);
      const b = toDay(t.end[y]!);
      const days = t.eegShare[y]! * t.opDays[y]!;
      return days > 0 ? Math.max(0, Math.min(b, bounds[k + 1]!) - Math.max(a, bounds[k]!)) / days : 0;
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

interface OpsSpec {
  key: Ops;
  run: ModelResult;
  energy: string | null; // scalar id of the output factor, or null for 1
  price: string | null;
  opex: string | null;
  review: boolean;
  lender: boolean;
}

function opsSpecs(e: Env): OpsSpec[] {
  const r = e.runs;
  return [
    { key: "base", run: r.base, energy: null, price: null, opex: null, review: false, lender: false },
    { key: "p90", run: r.p90, energy: "sc.p90.energy", price: null, opex: null, review: false, lender: false },
    { key: "resource", run: r.resource, energy: "sc.res.energy", price: null, opex: null, review: true, lender: false },
    { key: "downside", run: r.downside, energy: "sc.res.energy", price: "in.downPrice", opex: "in.downOpex", review: true, lender: false },
    { key: "lender50", run: r.base, energy: null, price: null, opex: null, review: false, lender: true },
    { key: "lender90", run: r.base, energy: "sc.p90.energy", price: null, opex: null, review: false, lender: true },
  ];
}

export function operationsSheet(e: Env): SheetDef {
  const { N, i } = e;
  const rows: Row[] = [];
  const w = awWeights(e);
  const wRest = w[1]!.map((x, y) => x + w[2]![y]! + w[3]![y]!);
  const kf = (c: Ctx, q: string) => {
    const pct = `${q}*100`;
    const g = c.table("tab.kf", 0);
    const f = c.table("tab.kf", 1);
    const m = `MATCH(${pct},${g},1)`;
    return (
      `IF(${pct}<=IF(${c.k("in.south")},${c.k("k.kfSouthLow")},${c.k("k.kfLow")}),IF(${c.k("in.south")},${c.k("k.kfSouthFloor")},${c.k("k.kfFloor")}),` +
      `IF(${pct}>=${c.k("k.kfHigh")},${c.k("k.kfTop")},INDEX(${f},${m})+(${pct}-INDEX(${g},${m}))/(INDEX(${g},${m}+1)-INDEX(${g},${m}))*(INDEX(${f},${m}+1)-INDEX(${f},${m}))))`
    );
  };

  for (const s of opsSpecs(e)) {
    const o: OperationsTrace = e.ops[s.key];
    const pre = `o.${s.key}`;
    const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], opts: Parameters<typeof period>[5] = {}) =>
      rows.push(period(`${pre}.${id}`, label, N, f, values, opts));
    const R = (c: Ctx, id: string) => c.r(`${pre}.${id}`);
    const K = (c: Ctx, id: string) => c.k(`${pre}.${id}`);
    const energy = (c: Ctx) => (s.energy ? c.k(s.energy) : "1");
    const price = (c: Ctx) => (s.price ? c.k(s.price) : "1");
    const opex = (c: Ctx) => (s.opex ? c.k(s.opex) : "1");
    const periods = s.run.awPeriods;
    const q0 = periods[0]!.siteQuality;
    const qR = periods.at(-1)!.siteQuality;
    const aw0 = periods[0]!.awCt / 100;
    const awR = periods.at(-1)!.awCt / 100;
    const floor = s.lender && i.revenue.bankPriceBasis === "floor";
    const twoSided = !floor && i.revenue.twoSidedPremium;
    const prem = (aw: number, mv: number) => marketPremium(aw, mv, twoSided);

    rows.push(blank(), text(SC_LABEL[s.key], "section"));
    rows.push(
      scalar(`${pre}.floor`, "Lender's floor: revenue counted up to the AW (1 = yes)", s.lender ? (c) => `IF(${c.k("in.bankBasis")}="floor",1,0)` : undefined, floor ? 1 : 0, {
        fmt: "int",
        role: s.lender ? "calc" : "calc",
      }),
      scalar(`${pre}.twoSided`, "Two-sided premium in this case (1 = yes)", (c) => `IF(AND(${K(c, "floor")}=0,${c.k("in.twoSided")}),1,0)`, twoSided ? 1 : 0, { fmt: "int" }),
      scalar(`${pre}.q0`, "Site quality until the first § 36h review", (c) => c.k("in.siteQuality"), q0, { fmt: "pct1", role: "link" }),
      scalar(
        `${pre}.qR`,
        "Site quality after the reviews",
        s.review ? (c) => `${c.k("in.siteQuality")}*${energy(c)}` : (c) => c.k("in.siteQuality"),
        qR,
        { fmt: "pct1", note: s.review ? "multi-year stress: § 36h review applies" : "no review in this case" },
      ),
      scalar(`${pre}.kf0`, "Correction factor until the first review", (c) => kf(c, K(c, "q0")), correctionFactor(q0, i.energy.southRegion), { fmt: "dec3" }),
      scalar(`${pre}.kfR`, "Correction factor after the reviews", (c) => kf(c, K(c, "qR")), correctionFactor(qR, i.energy.southRegion), { fmt: "dec3" }),
      scalar(`${pre}.aw0`, "AW until the first review (rounded to 0.01 ct)", (c) => `ROUND(${c.k("in.award")}*${K(c, "kf0")},2)/100`, aw0, { unit: "€/kWh", fmt: "dec4" }),
      scalar(`${pre}.awR`, "AW after the reviews", (c) => `ROUND(${c.k("in.award")}*${K(c, "kfR")},2)/100`, awR, { unit: "€/kWh", fmt: "dec4" }),
    );

    const mvPrev0 = o.marketValuePrev[0]!;
    rows.push(
      period(
        `${pre}.base`,
        "Baseload price",
        N,
        (c) =>
          `IF(COUNTIF(${c.table("tab.futures", 0)},${c.r("t.year")})>0,SUMIFS(${c.table("tab.futures", 1)},${c.table("tab.futures", 0)},${c.r("t.year")}),${c.k("in.ltPrice")}*${c.r("t.index2026")})*${price(c)}`,
        o.basePrice,
        {
          unit: "€/MWh",
          fmt: "dec2",
          open: {
            f: (c) =>
              `IF(COUNTIF(${c.table("tab.futures", 0)},${c.k("t.codYear")}-1)>0,SUMIFS(${c.table("tab.futures", 1)},${c.table("tab.futures", 0)},${c.k("t.codYear")}-1),${c.k("in.ltPrice")}*${c.p("t.index2026")})*${price(c)}`,
            v: (mvPrev0 * 1000) / i.revenue.captureFactor,
          },
        },
      ),
    );
    rows.push(
      period(`${pre}.mv`, "Market value of wind (JW)", N, (c) => `${R(c, "base")}*${c.k("in.capture")}/1000`, o.marketValue, {
        unit: "€/kWh",
        fmt: "dec6",
        open: { f: (c) => `${c.p(`${pre}.base`)}*${c.k("in.capture")}/1000`, v: mvPrev0 },
      }),
    );
    P("mvPrev", "Market value of the year before (basis of the advances, § 26)", (c) => c.p(`${pre}.mv`), o.marketValuePrev, { unit: "€/kWh", fmt: "dec6" });
    P(
      "energy",
      "Output",
      (c) => `${c.k("t.capacityKw")}*${c.k("t.hoursP50")}*${c.r("t.fraction")}*${c.r("t.degFactor")}*${energy(c)}`,
      o.energy,
      { unit: "kWh", fmt: MONEY },
    );
    P("sold", "Output sold (not curtailed at negative prices)", (c) => `${R(c, "energy")}*(1-${c.k("in.negOutput")})`, o.sold, { unit: "kWh", fmt: MONEY });
    P("eligible", "Output eligible for the premium", (c) => `${R(c, "sold")}*${c.r("t.eegShare")}`, o.eligible, { unit: "kWh", fmt: MONEY });
    const premF = (aw: string) => (c: Ctx) => `IF(${K(c, "twoSided")}=1,${K(c, aw)}-${R(c, "mv")},MAX(0,${K(c, aw)}-${R(c, "mv")}))`;
    P("prem0", "Premium per kWh at the first AW", premF("aw0"), o.marketValue.map((mv) => prem(aw0, mv)), { unit: "€/kWh", fmt: "dec6" });
    P("premR", "Premium per kWh at the reviewed AW", premF("awR"), o.marketValue.map((mv) => prem(awR, mv)), { unit: "€/kWh", fmt: "dec6" });
    const wR = (c: Ctx) => `(${c.r("t.w1")}+${c.r("t.w2")}+${c.r("t.w3")})`;
    P("premiumRate", "Market premium per kWh (Anlage 1 EEG)", (c) => `${c.r("t.w0")}*${R(c, "prem0")}+${wR(c)}*${R(c, "premR")}`, o.premiumRate.map((v, y) => (floor ? w[0]![y]! * prem(aw0, o.marketValue[y]!) + wRest[y]! * prem(awR, o.marketValue[y]!) : v)), { unit: "€/kWh", fmt: "dec6" });
    P(
      "advanceRate",
      "Advance per kWh (previous year's market value, never negative)",
      (c) => `${c.r("t.w0")}*MAX(0,${K(c, "aw0")}-${R(c, "mvPrev")})+${wR(c)}*MAX(0,${K(c, "awR")}-${R(c, "mvPrev")})`,
      o.advanceRate,
      { unit: "€/kWh", fmt: "dec6" },
    );
    P(
      "premiumShare",
      "Share of support days with a positive premium",
      (c) => `${c.r("t.w0")}*IF(${R(c, "prem0")}>0,1,0)+${wR(c)}*IF(${R(c, "premR")}>0,1,0)`,
      o.premiumShare,
      { fmt: "dec4" },
    );
    P(
      "aw",
      "AW in force (day-weighted)",
      (c) => `IF(${c.r("t.eegShare")}>0,${c.r("t.w0")}*${K(c, "aw0")}+${wR(c)}*${K(c, "awR")},${K(c, "awR")})`,
      o.aw,
      { unit: "€/kWh", fmt: "dec6" },
    );
    P(
      "revenueMarket",
      "Revenue: market (floor case: up to the AW on output sold)",
      (c) =>
        `IF(${K(c, "floor")}=1,${R(c, "sold")}*${c.r("t.eegShare")}*(${c.r("t.w0")}*MIN(${R(c, "mv")},${K(c, "aw0")})+${wR(c)}*MIN(${R(c, "mv")},${K(c, "awR")})),` +
        `${R(c, "energy")}*${R(c, "mv")}*${c.r("t.eegShare")})`,
      o.revenueMarket,
      { unit: "€", fmt: MONEY },
    );
    P("premiumAccrued", "Revenue: market premium for the year", (c) => `${R(c, "eligible")}*${R(c, "premiumRate")}`, o.premiumAccrued, { unit: "€", fmt: MONEY });
    const delta = o.eligible.map((el, y) => el * w[0]![y]! * (prem(awR, o.marketValue[y]!) - prem(aw0, o.marketValue[y]!)));
    P("reviewDelta", "§ 36h: first five years paid again at the reviewed AW", (c) => `${R(c, "eligible")}*${c.r("t.w0")}*(${R(c, "premR")}-${R(c, "prem0")})`, delta, { unit: "€", fmt: MONEY });
    const settleTotal = Math.abs(qR - q0) > SITE_REVIEW_THRESHOLD + 1e-12 ? sum(delta) : 0;
    rows.push(
      scalar(
        `${pre}.settleTotal`,
        "§ 36h settlement (only if the site quality moved by more than 2 points)",
        (c) => `IF(ABS(${K(c, "qR")}-${K(c, "q0")})>${c.k("k.reviewThreshold")},SUM(${c.range(`${pre}.reviewDelta`)}),0)`,
        settleTotal,
        { unit: "€", fmt: MONEY },
      ),
    );
    P(
      "settlement",
      "Revenue: § 36h settlement, in the year of the first review",
      (c) => `IF(${c.r("t.year")}=YEAR(${c.k("t.review1")}),${K(c, "settleTotal")},0)`,
      o.siteQualitySettlement,
      { unit: "€", fmt: MONEY },
    );
    P("revenuePremium", "Revenue: market premium", (c) => `${R(c, "premiumAccrued")}+${R(c, "settlement")}`, o.revenuePremium, { unit: "€", fmt: MONEY });
    P(
      "postPrice",
      "Price after support (market value or PPA)",
      (c) => `IF(${c.k("in.postEeg")}="ppa",${c.k("in.ppa")}*${c.r("t.index2026")}*${price(c)}/1000,${R(c, "mv")})`,
      o.postEegPrice,
      { unit: "€/kWh", fmt: "dec6" },
    );
    P(
      "revenuePost",
      "Revenue: after support",
      (c) => `IF(${c.k("in.postEeg")}="ppa",${R(c, "sold")},${R(c, "energy")})*${R(c, "postPrice")}*(1-${c.r("t.eegShare")})`,
      o.revenuePostEeg,
      { unit: "€", fmt: MONEY },
    );
    P("revenue", "Revenue", (c) => `${R(c, "revenueMarket")}+${R(c, "revenuePremium")}+${R(c, "revenuePost")}`, o.revenue, { unit: "€", fmt: MONEY, role: "total" });
    P("advance", "Premium advances for the year (§ 26)", (c) => `${R(c, "eligible")}*${R(c, "advanceRate")}`, o.premiumAdvance, { unit: "€", fmt: MONEY });
    const t = e.base.trace!.timing;
    const opexScale = s.key === "downside" ? DOWNSIDE.opexScale : 1;
    const fixed = t.index2025.map((ix, y) => e.base.kpis.capacityMw * 1000 * ix * t.fraction[y]! * opexScale);
    P("fixed", "Fixed-cost basis (capacity × index × part year)", (c) => `${c.k("t.capacityKw")}*${c.r("t.index2025")}*${c.r("t.fraction")}*${opex(c)}`, fixed, { unit: "kW", fmt: "dec2" });
    const decade = (c: Ctx, item: number) =>
      `CHOOSE(${c.r("t.decade")}+1,${e.grid.tableCell("Operations", "tab.opex", item, 1)},${e.grid.tableCell("Operations", "tab.opex", item, 2)},${e.grid.tableCell("Operations", "tab.opex", item, 3)})`;
    P("maintenance", "Maintenance", (c) => `${decade(c, 0)}*${R(c, "fixed")}`, o.maintenance, { unit: "€", fmt: MONEY });
    P("management", "Management", (c) => `${decade(c, 1)}*${R(c, "fixed")}`, o.management, { unit: "€", fmt: MONEY });
    P("insurance", "Insurance", (c) => `${decade(c, 2)}*${R(c, "fixed")}`, o.insurance, { unit: "€", fmt: MONEY });
    P("other", "Other", (c) => `${decade(c, 3)}*${R(c, "fixed")}`, o.other, { unit: "€", fmt: MONEY });
    P("leaseRevenue", "Land lease on revenue", (c) => `${c.k("in.leaseShare")}*${R(c, "revenue")}`, o.leaseOnRevenue, { unit: "€", fmt: MONEY });
    P(
      "leaseMinimum",
      "Land lease minimum",
      (c) => `${c.k("in.leaseMin")}*${c.k("in.turbines")}*${c.r("t.index2026")}*${c.r("t.fraction")}`,
      o.leaseMinimum,
      { unit: "€", fmt: MONEY },
    );
    P("lease", "Land lease", (c) => `MAX(${R(c, "leaseRevenue")},${R(c, "leaseMinimum")})`, o.lease, { unit: "€", fmt: MONEY });
    P("marketing", "Direct marketing", (c) => `${c.k("in.dv")}*${c.r("t.index2026")}/100*${R(c, "sold")}`, o.directMarketing, { unit: "€", fmt: MONEY });
    P(
      "municipal",
      "Municipal payment (§ 6)",
      (c) => `${c.k("in.municipal")}/100*${R(c, "energy")}*(${c.r("t.eegShare")}+IF(${c.k("in.municipalAfter")},1-${c.r("t.eegShare")},0))`,
      o.municipal,
      { unit: "€", fmt: MONEY },
    );
    P("guarantee", "Guarantee fee", (c) => `${c.k("t.bond")}*${c.k("in.guaranteeFee")}*${c.r("t.fraction")}`, o.guaranteeFee, { unit: "€", fmt: MONEY });
    P(
      "gridFee",
      "Generator grid fee",
      (c) => `${c.k("in.gridFee")}*${c.k("t.capacityKw")}*${c.r("t.index2026")}*${c.r("t.fraction")}*${opex(c)}`,
      o.gridFee,
      { unit: "€", fmt: MONEY },
    );
    P(
      "opex",
      "Operating costs",
      (c) =>
        `${R(c, "maintenance")}+${R(c, "management")}+${R(c, "insurance")}+${R(c, "other")}+${R(c, "lease")}+${R(c, "marketing")}+${R(c, "municipal")}+${R(c, "guarantee")}+${R(c, "gridFee")}`,
      o.opex,
      { unit: "€", fmt: MONEY, role: "total" },
    );
    P("refund", "§ 6 refund (up to 0.2 ct/kWh, years with a premium)", (c) => `${c.k("t.refundRate")}*${R(c, "eligible")}*${R(c, "premiumShare")}`, o.municipalRefund, { unit: "€", fmt: MONEY });
    P("ebitda", "EBITDA", (c) => `${R(c, "revenue")}+${R(c, "refund")}-${R(c, "opex")}`, o.ebitda, { unit: "€", fmt: MONEY, role: "total" });
    P("billed", "Market and PPA sales billed", (c) => `${R(c, "revenueMarket")}+${R(c, "revenuePost")}`, o.revenueMarket.map((v, y) => v + o.revenuePostEeg[y]!), { unit: "€", fmt: MONEY });
    P(
      "trueUp",
      "Premium and § 6 refund still due after the advances",
      (c) => `${R(c, "revenuePremium")}-${R(c, "advance")}+${R(c, "refund")}`,
      o.revenuePremium.map((v, y) => v - o.premiumAdvance[y]! + o.municipalRefund[y]!),
      { unit: "€", fmt: MONEY },
    );
    P(
      "recMarket",
      "Receivables: market sales",
      (c) => `IF(${c.r("t.isLast")}=1,0,IF(${c.r("t.opDays")}>0,MIN(${R(c, "billed")},${R(c, "billed")}/${c.r("t.opDays")}*${c.k("in.receivableDays")}),0))`,
      o.receivablesMarket,
      { unit: "€", fmt: MONEY },
    );
    P(
      "decAdvance",
      "Receivables: December advance (paid on 15 January)",
      (c) => `IF(OR(${c.r("t.isLast")}=1,${c.k("t.lagYears")}=0,${c.k("t.eegEnd")}<=DATE(${c.r("t.year")},12,1)),0,${R(c, "advance")}/${c.r("t.opMonths")})`,
      o.decemberAdvance,
      { unit: "€", fmt: MONEY },
    );
    P(
      "openSettle",
      "Receivables: premium and § 6 refund awaiting the final settlement",
      (c) =>
        `IF(OR(${c.r("t.isLast")}=1,${c.k("t.lagYears")}=0),0,SUMIFS(${c.range(`${pre}.trueUp`)},${c.range("t.year")},">"&(${c.r("t.year")}-${c.k("t.lagYears")}),${c.range("t.year")},"<="&${c.r("t.year")}))`,
      o.openSettlements,
      { unit: "€", fmt: MONEY },
    );
    P("recPremium", "Receivables: premium", (c) => `${R(c, "decAdvance")}+${R(c, "openSettle")}`, o.receivablesPremium, { unit: "€", fmt: MONEY });
    rows.push(
      period(`${pre}.receivables`, "Receivables at year end", N, (c) => `${R(c, "recMarket")}+${R(c, "recPremium")}`, o.receivables, {
        unit: "€",
        fmt: MONEY,
        role: "total",
        open: { f: (c) => c.k("o.base.wc0"), v: e.base.sourcesUses.workingCapitalInitial },
      }),
    );
    P("deltaWc", "Change in working capital", (c) => `${R(c, "receivables")}-${c.p(`${pre}.receivables`)}`, o.deltaWorkingCapital, { unit: "€", fmt: MONEY });
    if (s.key === "base") {
      rows.push(
        scalar("o.base.wc0", "Start-up liquidity: base receivables at the end of the first year", (c) => `MAX(0,${c.r("o.base.receivables")})`, e.base.sourcesUses.workingCapitalInitial, {
          unit: "€",
          fmt: MONEY,
          note: "funded at COD; the same amount in every case",
        }),
      );
    }
  }
  // The opex table lives on Inputs; its cells are addressed from here.
  return {
    name: "Operations",
    rows,
    widths: COLS_PERIOD(N),
    freeze: { rows: 4, cols: 5 },
    periods: e.years,
    tabColor: "FF808080",
  };
}

// ---------------------------------------------------------------------------------------------
// Tax
// ---------------------------------------------------------------------------------------------

interface TaxSpec {
  key: string;
  label: string;
  ops: Ops;
  trace: TaxTrace;
  depBase: string;
  levered: boolean;
}

function taxSpecs(e: Env): TaxSpec[] {
  const r = e.runs;
  const cap = (k: "base" | "down") => `c.${k}.capitalized`;
  const net = (k: "base" | "down") => `c.${k}.capexNet`;
  return [
    { key: "base", label: "Base", ops: "base", trace: r.base.trace!.tax, depBase: cap("base"), levered: true },
    { key: "p90", label: "P90 1-yr", ops: "p90", trace: r.p90.trace!.tax, depBase: cap("base"), levered: true },
    { key: "resource", label: "P90 10-yr", ops: "resource", trace: r.resource.trace!.tax, depBase: cap("base"), levered: true },
    { key: "downside", label: "Downside", ops: "downside", trace: r.downside.trace!.tax, depBase: cap("down"), levered: true },
    { key: "baseU", label: "Base without debt (project IRR)", ops: "base", trace: r.base.trace!.taxUnlevered, depBase: net("base"), levered: false },
    { key: "p90U", label: "P90 1-yr without debt", ops: "p90", trace: r.p90.trace!.taxUnlevered, depBase: net("base"), levered: false },
    { key: "resourceU", label: "P90 10-yr without debt", ops: "resource", trace: r.resource.trace!.taxUnlevered, depBase: net("base"), levered: false },
    { key: "downsideU", label: "Downside without debt", ops: "downside", trace: r.downside.trace!.taxUnlevered, depBase: net("down"), levered: false },
    { key: "lender50", label: "Lender case P50", ops: "lender50", trace: r.base.trace!.taxLenderP50, depBase: cap("base"), levered: true },
    { key: "lender90", label: "Lender case P90 1-yr", ops: "lender90", trace: r.base.trace!.taxLenderP90, depBase: cap("base"), levered: true },
  ];
}

/** The depreciation schedule's intermediate lines, mirroring the workbook formulas. */
function depreciationLines(e: Env, base: number) {
  const i = e.i;
  const life = i.tax.depreciationYears;
  const t = e.base.trace!.timing;
  const allowed =
    i.tax.degressive && e.cod >= toDay(TAX.degressiveWindowStart) && e.cod <= toDay(TAX.degressiveWindowEnd) ? 1 : 0;
  const rate = Math.min(TAX.degressiveMultiple / life, TAX.degressiveCap);
  const codMonth = new Date(e.cod * 86_400_000).getUTCMonth() + 1;
  const L = { bookOpen: [] as number[], usedOpen: [] as number[], remaining: [] as number[], linear: [] as number[], deg: [] as number[], switched: [] as number[], scheduled: [] as number[], bookClose: [] as number[], usedClose: [] as number[] };
  let book = base;
  let used = 0;
  let switched = 0;
  t.years.forEach((_, y) => {
    const months = y === 0 ? 13 - codMonth : 12;
    const remaining = life - used / 12;
    const linear = remaining > 0 ? (book / remaining) * (months / 12) : book;
    const deg = book * rate * (months / 12);
    switched = allowed === 0 || switched === 1 || linear >= deg ? 1 : 0;
    const scheduled = book <= 1e-6 ? 0 : Math.min(book, switched === 1 ? linear : deg);
    L.bookOpen.push(book);
    L.usedOpen.push(used);
    L.remaining.push(remaining);
    L.linear.push(linear);
    L.deg.push(deg);
    L.switched.push(switched);
    L.scheduled.push(scheduled);
    used = used + (book > 1e-6 ? months : 0);
    book = book - scheduled;
    L.bookClose.push(book);
    L.usedClose.push(used);
  });
  return L;
}

export function taxSheet(e: Env): SheetDef {
  const { N } = e;
  const rows: Row[] = [];
  const t = e.base.trace!.timing;
  const tb = e.base.trace!.tax;
  rows.push(text("Tax provision for decommissioning (the same in every case)", "section"));
  const endX = e.end;
  const elapsed = t.end.map((d) => Math.min(1, (toDay(d) - e.cod) / (endX - e.cod)));
  const under = t.end.map((d) => (endX < addMonths12(toDay(d)) ? 1 : 0));
  const remainingYears = t.end.map((d) => Math.max(0, (endX - toDay(d)) / 365));
  rows.push(
    period("tx.elapsed", "Share of the operating life elapsed at the year end", N, (c) => `MIN(1,(${c.r("t.opEnd")}-${c.k("t.cod")})/(${c.k("t.end")}-${c.k("t.cod")}))`, elapsed, { fmt: "dec6" }),
    period("tx.under12", "Less than twelve months left (1 = no discounting)", N, (c) => `IF(${c.k("t.end")}<EDATE(${c.r("t.opEnd")},12),1,0)`, under, { fmt: "int" }),
    period("tx.remaining", "Years left", N, (c) => `MAX(0,(${c.k("t.end")}-${c.r("t.opEnd")})/${c.k("k.daysPerYear")})`, remainingYears, { fmt: "dec4" }),
    period(
      "tx.provision",
      "Provision at the year end",
      N,
      (c) =>
        `${c.k("t.provisionCost")}*${c.r("t.index2026")}*${c.r("tx.elapsed")}/IF(${c.r("tx.under12")}=1,1,(1+${c.k("k.provisionRate")})^${c.r("tx.remaining")})`,
      tb.provision,
      { unit: "€", fmt: MONEY },
    ),
    period("tx.provisionChange", "Increase of the provision", N, (c) => `${c.r("tx.provision")}-${c.p("tx.provision")}`, tb.provisionChange, { unit: "€", fmt: MONEY, open: { v: 0 } }),
  );

  for (const s of taxSpecs(e)) {
    const tr = s.trace;
    const o = e.ops[s.ops];
    const pre = `tx.${s.key}`;
    const P = (id: string, label: string, f: (c: Ctx) => string, values: CellValue[], opts: Parameters<typeof period>[5] = {}) =>
      rows.push(period(`${pre}.${id}`, label, N, f, values, opts));
    const R = (c: Ctx, id: string) => c.r(`${pre}.${id}`);
    const OP = (c: Ctx, id: string) => c.r(`o.${s.ops}.${id}`);
    const L = depreciationLines(e, tr.depreciationBase);
    rows.push(blank(), text(s.label, "section"));
    rows.push(scalar(`${pre}.depBase`, s.levered ? "Depreciable base: capex and capitalised financing costs" : "Depreciable base: capex", (c) => c.k(s.depBase), tr.depreciationBase, { unit: "€", fmt: MONEY, role: "link" }));
    rows.push(period(`${pre}.bookOpen`, "Book value at the start of the year", N, (c) => c.p(`${pre}.bookClose`), L.bookOpen, { unit: "€", fmt: MONEY }));
    rows.push(period(`${pre}.usedOpen`, "Months depreciated before the year", N, (c) => c.p(`${pre}.usedClose`), L.usedOpen, { fmt: "int", open: { v: 0 } }));
    P("remaining", "Remaining useful life", (c) => `${c.k("in.depYears")}-${R(c, "usedOpen")}/12`, L.remaining, { unit: "years", fmt: "dec4" });
    P("linear", "Straight-line amount", (c) => `IF(${R(c, "remaining")}>0,${R(c, "bookOpen")}/${R(c, "remaining")}*${c.r("t.depMonths")}/12,${R(c, "bookOpen")})`, L.linear, { unit: "€", fmt: MONEY });
    P("deg", "Declining-balance amount", (c) => `${R(c, "bookOpen")}*${c.k("t.degRate")}*${c.r("t.depMonths")}/12`, L.deg, { unit: "€", fmt: MONEY });
    rows.push(
      period(
        `${pre}.switched`,
        "Straight-line from this year (1 = yes)",
        N,
        (c) => `IF(OR(${c.k("t.degAllowed")}=0,${c.p(`${pre}.switched`)}=1,${R(c, "linear")}>=${R(c, "deg")}),1,0)`,
        L.switched,
        { fmt: "int", open: { v: 0 } },
      ),
    );
    P("scheduled", "Depreciation by schedule", (c) => `IF(${R(c, "bookOpen")}<=${c.k("k.tiny")},0,MIN(${R(c, "bookOpen")},IF(${R(c, "switched")}=1,${R(c, "linear")},${R(c, "deg")})))`, tr.depreciationScheduled, { unit: "€", fmt: MONEY });
    P("bookClose", "Book value at the year end", (c) => `${R(c, "bookOpen")}-${R(c, "scheduled")}`, L.bookClose, {
      unit: "€",
      fmt: MONEY,
      open: { f: (c) => c.k(`${pre}.depBase`), v: tr.depreciationBase },
    });
    P("usedClose", "Months depreciated", (c) => `${R(c, "usedOpen")}+IF(${R(c, "bookOpen")}>${c.k("k.tiny")},${c.r("t.depMonths")},0)`, L.usedClose, { fmt: "int" });
    P("writeOff", "Book value written off when the farm is dismantled", (c) => `IF(AND(${c.r("t.isLast")}=1,${R(c, "bookClose")}>${c.k("k.tiny")}),${R(c, "bookClose")},0)`, tr.residualWriteOff, { unit: "€", fmt: MONEY });
    P("dep", "Depreciation", (c) => `${R(c, "scheduled")}+${R(c, "writeOff")}`, tr.depreciation, { unit: "€", fmt: MONEY, role: "total" });
    P("interest", "Interest", s.levered ? (c) => c.r("d.interest") : () => "0", tr.interest, { unit: "€", fmt: MONEY, role: s.levered ? "link" : "calc" });
    P("ebt", "Profit before tax", (c) => `${OP(c, "ebitda")}-${R(c, "dep")}-${R(c, "interest")}-${c.r("tx.provisionChange")}`, tr.ebt, { unit: "€", fmt: MONEY, role: "total" });
    P(
      "addBack",
      "Trade tax: add-back of interest and land lease",
      (c) => `${c.k("k.addBackShare")}*MAX(0,${R(c, "interest")}+${c.k("k.leaseAddBack")}*${OP(c, "lease")}-${c.k("k.addBackAllowance")})`,
      tr.addBack,
      { unit: "€", fmt: MONEY },
    );
    P("income", "Trade income before losses", (c) => `${R(c, "ebt")}+${R(c, "addBack")}`, tr.tradeIncome, { unit: "€", fmt: MONEY });
    rows.push(period(`${pre}.poolOpen`, "Trade loss carry-forward at the start", N, (c) => c.p(`${pre}.poolClose`), tr.tradePoolOpen, { unit: "€", fmt: MONEY, open: { v: 0 } }));
    P(
      "lossUsed",
      "Trade losses used (€1m in full, 60 % above)",
      (c) =>
        `IF(${R(c, "income")}>0,MIN(${R(c, "poolOpen")},MIN(${R(c, "income")},${c.k("k.lossFull")})+${c.k("k.tradeLossShare")}*MAX(0,${R(c, "income")}-${c.k("k.lossFull")})),0)`,
      tr.tradeLossUsed,
      { unit: "€", fmt: MONEY },
    );
    P("poolClose", "Trade loss carry-forward at the year end", (c) => `${R(c, "poolOpen")}-${R(c, "lossUsed")}+MAX(0,-${R(c, "income")})`, tr.tradePoolClose, { unit: "€", fmt: MONEY });
    P(
      "tradeBase",
      "Trade tax base (rounded down to €100; KG allowance)",
      (c) =>
        `IF(${c.k("in.legalForm")}="KG",MAX(0,ROUNDDOWN(MAX(0,${R(c, "income")}-${R(c, "lossUsed")})/100,0)*100-${c.k("k.allowanceKG")}),ROUNDDOWN(MAX(0,${R(c, "income")}-${R(c, "lossUsed")})/100,0)*100)`,
      tr.tradeBase,
      { unit: "€", fmt: MONEY },
    );
    P("tradeTax", "Trade tax", (c) => `${R(c, "tradeBase")}*${c.k("k.tradeRate")}*${c.k("in.hebesatz")}`, tr.tradeTax, { unit: "€", fmt: MONEY });
    rows.push(period(`${pre}.cPoolOpen`, "Corporate loss carry-forward at the start (GmbH)", N, (c) => c.p(`${pre}.cPoolClose`), tr.corporatePoolOpen, { unit: "€", fmt: MONEY, open: { v: 0 } }));
    const shareOf = e.years.map((y) => (y <= 2027 ? 0.7 : 0.6));
    P("cShare", "Corporate tax: share of profit above €1m that losses may offset", (c) => `IF(${c.r("t.year")}<=${c.k("k.corpLossSwitch")},${c.k("k.corpLossEarly")},${c.k("k.corpLossLate")})`, shareOf, { fmt: "pct1" });
    P(
      "cLossUsed",
      "Corporate losses used",
      (c) =>
        `IF(AND(${c.k("in.legalForm")}="GmbH",${R(c, "ebt")}>0),MIN(${R(c, "cPoolOpen")},MIN(${R(c, "ebt")},${c.k("k.lossFull")})+${R(c, "cShare")}*MAX(0,${R(c, "ebt")}-${c.k("k.lossFull")})),0)`,
      tr.corporateLossUsed,
      { unit: "€", fmt: MONEY },
    );
    P("cPoolClose", "Corporate loss carry-forward at the year end", (c) => `IF(${c.k("in.legalForm")}="GmbH",${R(c, "cPoolOpen")}-${R(c, "cLossUsed")}+MAX(0,-${R(c, "ebt")}),0)`, tr.corporatePoolClose, { unit: "€", fmt: MONEY });
    P("cTaxable", "Corporate taxable income", (c) => `IF(${c.k("in.legalForm")}="GmbH",MAX(0,${R(c, "ebt")}-${R(c, "cLossUsed")}),0)`, tr.corporateTaxable, { unit: "€", fmt: MONEY });
    P(
      "cRate",
      "Corporate tax rate (§ 23 KStG)",
      (c) =>
        `IF(${c.k("in.legalForm")}="GmbH",MAX(${c.k("k.kstLow")},${c.k("k.kstHigh")}-${c.k("k.kstStep")}*MAX(0,${c.r("t.year")}-${c.k("k.kstStepFrom")})),0)`,
      tr.corporateRate,
      { fmt: "pct1" },
    );
    P("kst", "Corporate tax", (c) => `${R(c, "cTaxable")}*${R(c, "cRate")}`, tr.corporateTax, { unit: "€", fmt: MONEY });
    P("soli", "Solidarity surcharge", (c) => `${R(c, "kst")}*${c.k("k.soli")}`, tr.soli, { unit: "€", fmt: MONEY });
    P("taxes", "Taxes", (c) => `${R(c, "tradeTax")}+${R(c, "kst")}+${R(c, "soli")}`, tr.taxes, { unit: "€", fmt: MONEY, role: "total" });
    P("cfads", "CFADS: EBITDA − change in working capital − taxes", (c) => `${OP(c, "ebitda")}-${OP(c, "deltaWc")}-${R(c, "taxes")}`, tr.cfads, { unit: "€", fmt: MONEY, role: "total" });
    void o;
  }
  return { name: "Tax", rows, widths: COLS_PERIOD(N), freeze: { rows: 4, cols: 5 }, periods: e.years, tabColor: "FF808080" };
}

function addMonths12(day: number): number {
  const d = new Date(day * 86_400_000);
  const y = d.getUTCFullYear() + 1;
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(y, m, Math.min(d.getUTCDate(), last)) / 86_400_000);
}

// ---------------------------------------------------------------------------------------------
// Debt
// ---------------------------------------------------------------------------------------------

export function debtSheet(e: Env): SheetDef {
  const { N, i } = e;
  const b = e.base;
  const tr = b.trace!;
  const D = b.kpis.debt;
  const rows: Row[] = [];
  const n = 4 * (i.financing.tenorYearsFromClose - i.financing.graceYears);
  const r = i.financing.interestRate;
  const payment = r === 0 ? D / n : (D * (r / 4)) / (1 - Math.pow(1 + r / 4, -n));
  rows.push(text("Loan (the same in every case)", "section"));
  rows.push(
    scalar("d.debt", "Senior loan", (c) => c.k("sol.debt"), D, { unit: "€", fmt: MONEY, role: "link" }),
    scalar("d.payment", "Quarterly payment of an annuity loan", (c) => `IF(${c.k("in.rate")}=0,${c.k("d.debt")}/${c.k("t.nInstalments")},${c.k("d.debt")}*(${c.k("in.rate")}/4)/(1-(1+${c.k("in.rate")}/4)^(-${c.k("t.nInstalments")})))`, payment, { unit: "€", fmt: MONEY }),
  );
  const sculpted = i.financing.repayment === "sculpted";
  rows.push(
    period("d.sculpted", "Sculpted principal per year (solved on the website)", N, undefined, e.years.map((_, y) => (sculpted ? b.annual[y]!.principal : 0)), {
      unit: "€",
      fmt: MONEY,
      role: "solver",
      note: sculpted ? "pasted; used only for sculpted repayment" : "not used",
    }),
  );
  rows.push(
    period("d.open", "Loan at the start of the year", N, (c) => c.p("d.close"), b.annual.map((a) => a.debtOpening), { unit: "€", fmt: MONEY }),
    period("d.interest", "Interest (sum of the months)", N, (c) => `SUMIFS(${c.table("tab.loan", 5)},${c.table("tab.loan", 2)},${c.r("t.year")})`, b.annual.map((a) => a.interest), { unit: "€", fmt: MONEY }),
    period("d.principal", "Principal (sum of the instalments)", N, (c) => `SUMIFS(${c.table("tab.loan", 6)},${c.table("tab.loan", 2)},${c.r("t.year")})`, b.annual.map((a) => a.principal), { unit: "€", fmt: MONEY }),
    period("d.close", "Loan at the year end", N, (c) => `${c.r("d.open")}-${c.r("d.principal")}`, b.annual.map((a) => a.debtClosing), {
      unit: "€",
      fmt: MONEY,
      open: { f: (c) => c.k("d.debt"), v: D },
    }),
    period("d.ds", "Debt service", N, (c) => `${c.r("d.interest")}+${c.r("d.principal")}`, b.annual.map((a) => a.debtService), { unit: "€", fmt: MONEY, role: "total" }),
    period(
      "d.dsraTarget",
      "DSRA target: months of next year's debt service (at least the first repayment year's)",
      N,
      (c) =>
        `IF(${c.r("t.year")}>=${c.k("t.maturityYear")},0,${c.k("in.dsraMonths")}/12*IFERROR(INDEX(${c.range("d.ds")},MATCH(MAX(${c.r("t.year")}+1,${c.k("t.firstRepYear")}),${c.range("t.year")},0)),0))`,
      tr.waterfall.dsraTarget,
      { unit: "€", fmt: MONEY },
    ),
  );
  rows.push(
    scalar(
      "d.dsra0",
      "DSRA funded at COD: months of the debt service of the first full year with repayment",
      (c) => {
        const basis = `MAX(${c.k("t.firstRepYear")},${c.k("t.firstFullYear")})`;
        return `IF(${basis}>${c.k("t.maturityYear")},0,${c.k("in.dsraMonths")}/12*IFERROR(INDEX(${c.range("d.ds")},MATCH(${basis},${c.range("t.year")},0)),0))`;
      },
      b.sourcesUses.dsraInitial,
      { unit: "€", fmt: MONEY },
    ),
  );

  rows.push(blank(), text("Lender's case: does the pasted loan still fit? (sizing on the base run)", "section"));
  const L = b.sizing.lenderCase;
  const ratio = (cf: number, ds: number) => (ds >= MIN_DEBT_SERVICE ? cf / ds : "");
  rows.push(
    period("d.cf50", "CFADS, lender's case P50", N, (c) => c.r("tx.lender50.cfads"), L.cfadsP50, { unit: "€", fmt: MONEY, role: "link" }),
    period("d.cf90", "CFADS, lender's case P90 1-yr", N, (c) => c.r("tx.lender90.cfads"), L.cfadsP90, { unit: "€", fmt: MONEY, role: "link" }),
    period("d.dscr50", "DSCR, lender's case P50", N, (c) => `IF(${c.r("d.ds")}>=${c.k("k.dsMin")},${c.r("d.cf50")}/${c.r("d.ds")},"")`, L.cfadsP50.map((cf, y) => ratio(cf, L.debtService[y]!)), { fmt: "ratio" }),
    period("d.dscr90", "DSCR, lender's case P90 1-yr", N, (c) => `IF(${c.r("d.ds")}>=${c.k("k.dsMin")},${c.r("d.cf90")}/${c.r("d.ds")},"")`, L.cfadsP90.map((cf, y) => ratio(cf, L.debtService[y]!)), { fmt: "ratio" }),
    period(
      "d.headroom",
      "Lower of DSCR ÷ target, P50 and P90",
      N,
      (c) => `IF(${c.r("d.ds")}>=${c.k("k.dsMin")},MIN(${c.r("d.dscr50")}/${c.k("in.t50")},${c.r("d.dscr90")}/${c.k("in.t90")}),"")`,
      L.cfadsP50.map((cf, y) => (L.debtService[y]! >= MIN_DEBT_SERVICE ? Math.min(cf / L.debtService[y]! / i.financing.targetDscrP50, L.cfadsP90[y]! / L.debtService[y]! / i.financing.targetDscrP90) : "")),
      { fmt: "dec4" },
    ),
  );
  const headroom = L.cfadsP50
    .map((cf, y) => (L.debtService[y]! >= MIN_DEBT_SERVICE ? Math.min(cf / L.debtService[y]! / i.financing.targetDscrP50, L.cfadsP90[y]! / L.debtService[y]! / i.financing.targetDscrP90) : Infinity))
    .reduce((a, x) => Math.min(a, x), Infinity);
  const usesBase = b.sourcesUses.totalUses;
  // Without debt service there is no DSCR to scale from: no loan.
  const loanDscr = Number.isFinite(headroom) ? D * headroom : 0;
  const loanCap = i.financing.maxGearing * usesBase;
  rows.push(
    scalar(
      "d.minHeadroom",
      "Lowest DSCR ÷ target over the loan (1 = a target binds)",
      (c) => `IF(COUNT(${c.range("d.headroom")})=0,"n/a",MIN(${c.range("d.headroom")}))`,
      Number.isFinite(headroom) ? headroom : "n/a",
      { fmt: "dec6" },
    ),
    scalar(
      "d.loanDscr",
      "Loan the DSCR targets allow (equal instalments or annuity)",
      (c) => `IF(COUNT(${c.range("d.headroom")})=0,0,${c.k("d.debt")}*${c.k("d.minHeadroom")})`,
      loanDscr,
      { unit: "€", fmt: MONEY, note: "debt service is proportional to the loan" },
    ),
    scalar("d.loanCap", "Loan the gearing cap allows", (c) => `${c.k("in.maxGearing")}*${c.k("c.base.uses")}`, loanCap, { unit: "€", fmt: MONEY }),
    scalar(
      "d.loanCalc",
      "Loan recalculated in this workbook",
      (c) => `IF(${c.k("in.repayment")}="sculpted",${c.k("d.debt")},MAX(0,MIN(${c.k("d.loanDscr")},${c.k("d.loanCap")})))`,
      sculpted ? D : Math.max(0, Math.min(loanDscr, loanCap)),
      { unit: "€", fmt: MONEY, role: "total" },
    ),
  );

  // Monthly loan table: from COD to the last instalment.
  const months = tr.loanMonths;
  const C = i.project.constructionMonths;
  const loanRows = months.map((m, k) => {
    const j = C + k;
    const cell = (col: number) => e.grid.tableCell("Debt", "tab.loan", k, col);
    const prev = (col: number) => e.grid.tableCell("Debt", "tab.loan", k - 1, col);
    return [
      k === 0 ? { v: j, fmt: "int" as const, f: (c: Ctx) => c.k("in.construction") } : { v: j, fmt: "int" as const, f: () => `${prev(0)}+1` },
      { v: xd(m.date), fmt: "date" as const, f: (c: Ctx) => `EDATE(${c.k("t.fc")},${cell(0)})` },
      { v: m.year, fmt: "year" as const, f: () => `YEAR(${cell(1)})` },
      {
        v: m.instalment,
        fmt: "int" as const,
        f: (c: Ctx) =>
          `IF(AND(${cell(0)}-12*${c.k("in.grace")}+1>=3,MOD(${cell(0)}-12*${c.k("in.grace")}+1,3)=0),(${cell(0)}-12*${c.k("in.grace")}+1)/3-1,-1)`,
      },
      k === 0 ? { v: m.opening, fmt: MONEY, f: (c: Ctx) => c.k("d.debt") } : { v: m.opening, fmt: MONEY, f: () => prev(7) },
      { v: m.interest, fmt: MONEY, f: (c: Ctx) => `${cell(4)}*${c.k("in.rate")}/12` },
      {
        v: m.principal,
        fmt: MONEY,
        f: (c: Ctx) =>
          `IF(${cell(3)}<0,0,IF(${cell(3)}=${c.k("t.nInstalments")}-1,${cell(4)},MAX(0,MIN(${cell(4)},` +
          `IF(${c.k("in.repayment")}="annuity",${c.k("d.payment")}-${cell(4)}*${c.k("in.rate")}/4,` +
          `IF(${c.k("in.repayment")}="sculpted",INDEX(${c.range("d.sculpted")},MATCH(${cell(2)},${c.range("t.year")},0))/INDEX(${c.range("t.instalments")},MATCH(${cell(2)},${c.range("t.year")},0)),` +
          `${c.k("d.debt")}/${c.k("t.nInstalments")}))))))`,
      },
      { v: m.closing, fmt: MONEY, f: () => `${cell(4)}-${cell(6)}` },
    ];
  });
  rows.push(blank(), text("Loan by month (interest at rate ÷ 12; instalments at quarter ends)", "section"));
  rows.push({ kind: "table", id: "tab.loan", head: ["Months since close", "Month starts", "Year", "Instalment no. (−1: none)", "Loan at the start", "Interest", "Principal", "Loan at the end"], rows: loanRows });
  return { name: "Debt", rows, widths: COLS_PERIOD(N), freeze: { rows: 4, cols: 1 }, periods: e.years, tabColor: "FF808080" };
}

