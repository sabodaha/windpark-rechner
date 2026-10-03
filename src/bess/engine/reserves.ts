// v1.1a reserve contract: the award calendar, the contract states and the input domain (spec v1.1 R3 §1–§2, §14,
// §17). Pure functions of the inputs and the calendar; the physics and money of the reserve live in operations.ts and
// ledger.ts. Without an enabled contract nothing here is used.
import type { Calendar } from "./calendar";
import { fxMonth } from "./macro";
import { RESERVE, WAR } from "./registry";
import type { BessInputs, ContractInputs } from "./types";

export interface Award {
  tag: "A1" | "A2";
  auctionIndex: number;
  start: number;
  /** First month after the award (exclusive end). */
  endExclusive: number;
  eurPerMWHour: number;
  /** The auction cap in EUR at the auction month's FX (spec §5). */
  capEur: number;
}

export interface ContractPlan {
  c: ContractInputs;
  originalStart: number;
  /** Approved late start in months (D); above the maximum the award is cancelled before service. */
  delay: number;
  cancelled: boolean;
  /** Month of the first obligated hour; −1 if cancelled. */
  effectiveStart: number;
  awards: Award[];
  /** Month in which the pre-service stock fill and the contract liquidity reserve are funded; −1 if cancelled. */
  fillIndex: number;
  /** Months with a re-certification cost (charged on the live mass S + R). */
  recertIndex: number[];
  /** Per month: 1 inside an award's service window. */
  window: number[];
  awardOf: ("A1" | "A2" | "")[];
  /** Opening survival, end-of-month losses, repair and released masses, serving and reserved masses (spec §2). */
  S: number[];
  hitLoss: number[];
  otherLoss: number[];
  R: number[];
  released: number[];
  Zplus: number[];
  Z: number[];
  /** Last service month of the last award; −1 if cancelled. */
  lastService: number;
  /** Mass after the last transition of the last award (S_end, spec §2). */
  Send: number;
  /** Per month: the mass that sells its stock on that month's exit day (the 1st), and the award the exit event
   *  happened in (spec §2, §4). */
  exitMass: number[];
  exitOrigin: ("A1" | "A2" | "")[];
  /** Monthly strike probability and the inherited whole-asset outage derate. */
  piHit: number;
  outageDerate: number;
}

/** Settlement hours of a calendar month in Kyiv local time with EU daylight saving (spec §1). */
export function settlementHours(month: number, days: number): number {
  return days * 24 - (month === 3 ? 1 : 0) + (month === 10 ? 1 : 0);
}

export function contractActive(inp: BessInputs): inp is BessInputs & { contract: ContractInputs } {
  return !!inp.contract && inp.contract.enabled;
}

const capEurAt = (cal: Calendar, idx: number, fxStress: boolean) => {
  const m = cal.months[Math.max(0, Math.min(idx, cal.months.length - 1))]!;
  return RESERVE.auctionCapUah / fxMonth(m.year, m.month, fxStress);
};

/** Why an enabled contract input is outside the supported domain (spec §14): `code` — the canonical code of the input
 *  rule it breaks (gate-3 amendment G3-01: the reference validator's vocabulary), `message` — the explanation. */
export interface InputIssue {
  code: string;
  message: string;
}

/** Every input-domain rule an enabled contract breaks, in the canonical order (G3-01); empty when supported.
 *  `diagnostic` admits the p* scan's zero and above-cap prices (spec §12); every other rule still applies. */
export function contractIssues(inp: BessInputs, cal: Calendar, diagnostic = false): InputIssue[] {
  if (!contractActive(inp)) return [];
  const c = inp.contract;
  const out: InputIssue[] = [];
  const need = (ok: boolean, code: string, message: string) => { if (!ok) out.push({ code, message }); };
  const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
  need(!c.product || c.product === "aFRR-symmetric", "reserveProduct", `product ${c.product} is outside v1.1a (v1.1b)`);
  need(Number.isInteger(c.acceptedMW) && c.acceptedMW >= 1, "acceptedMW", "awarded MW must be a whole number ≥ 1");
  need(Number.isInteger(c.tenorMonths) && between(c.tenorMonths, RESERVE.minTenorMonths, RESERVE.maxTenorMonths), "tenorMonths", "tenor must be 13–60 months");
  need(c.sustainHours >= RESERVE.minSustainHours, "sustainHours", "sustain hours below the 1-hour aFRR minimum");
  need(c.recoveryPowerShare > 0 && c.recoveryPowerShare <= 1, "recoveryPowerShare", "recovery share outside (0, 1]");
  need(between(c.nettingShare, 0, 1), "nettingShare", "netting share outside 0–1");
  need(between(c.activationUp, 0, 0.15) && between(c.activationDown, 0, 0.15), "activationRate", "activation outside 0–0.15");
  need(c.balancingPremiumUp >= 0 && between(c.balancingPremiumDown, 0, 1), "balancingPremium", "balancing premia outside the supported sign domain");
  need(c.peakDayFactor >= 1, "peakDayFactor", "peak-day factor below 1");
  need(c.liquidityDays >= 0, "liquidityDays", "negative liquidity days");
  need(between(c.failureEvents, 0, 12) && between(c.penaltyHours, 0, 720), "penaltyInputs", "failure events outside 0–12 or penalty hours outside 0–720");
  need(between(c.otherLossRate, 0, 1) && between(c.standingLoadShare, 0, 0.05), "lossAndLoadInputs", "other-loss rate outside 0–1 or standing load outside 0–5 % of C");
  const piHit = (WAR.marketPremium * inp.lossRatio) / WAR.severity / 12;
  need(piHit + c.otherLossRate / 12 <= 1, "stateProbability", "monthly strike and other-loss probabilities exceed 1");
  need(between(c.balancingLagMonths, 1, 24) && between(c.asPaymentLagMonths, 1, 4), "paymentLag", "BSP lag outside 1–24 or AS lag outside 1–4 months");
  need(between(c.balancingCollection, 0, 1) && between(c.bsFeeShare, 0, 1), "collectionAndFee", "collection share or balancing fee share outside 0–1");
  const originalStart = cal.plannedCodIndex + c.startOffsetFromCod;
  need(Number.isInteger(c.auctionMonthOffset) && c.auctionMonthOffset >= 0 && c.auctionMonthOffset <= originalStart && originalStart - c.auctionMonthOffset <= RESERVE.maxDeferralMonths,
    "auctionCalendar", "auction before financial close, after the start, or more than 36 months before it");
  need(Number.isInteger(c.startOffsetFromCod) && c.startOffsetFromCod >= 1, "startBeforeReadiness", "service must start after the COD month");
  let endExclusive = originalStart + c.tenorMonths;
  if (c.renewal) {
    need(Number.isInteger(c.renewalTenorMonths) && between(c.renewalTenorMonths, RESERVE.minTenorMonths, RESERVE.maxTenorMonths), "renewalTenorMonths", "renewal tenor must be 13–60 months");
    need(diagnostic || (c.renewalPrice > 0 && c.renewalPrice <= capEurAt(cal, endExclusive - 6, inp.fxStress) + 1e-9), "renewalAboveAuctionCap", "the renewal price must be positive and within the cap at its auction month's FX");
    endExclusive += c.renewalTenorMonths;
  }
  // the exit day of the last award is the 1st of its exclusive end month: an operating month, no hidden extra month (R2-02)
  need(endExclusive <= cal.eolIndex - 1, "exitOutsideOperations", "the last award ends after the last operating month");
  if (!diagnostic) {
    need(c.eurPerMWHour > 0, "priceNotPositive", "the award price must be positive");
    need(c.eurPerMWHour <= capEurAt(cal, c.auctionMonthOffset, inp.fxStress) + 1e-9, "aboveAuctionCap", "the award price is above the auction cap at the auction month's FX");
  }
  return out;
}

/** The first input issue (for callers that need only whether the contract is supported), or null. */
export function contractUnsupported(inp: BessInputs, cal: Calendar, diagnostic = false): InputIssue | null {
  return contractIssues(inp, cal, diagnostic)[0] ?? null;
}

/** Award calendar and contract states (spec §1–§2). Call only for an enabled, supported contract. */
export function contractPlan(inp: BessInputs & { contract: ContractInputs }, cal: Calendar): ContractPlan {
  const c = inp.contract;
  const n = cal.months.length;
  const originalStart = cal.plannedCodIndex + c.startOffsetFromCod;
  // certified on the 15th of the actual COD month: at least ten days before the 1st of any later month (spec §1)
  const delay = Math.max(0, cal.codIndex - (originalStart - 1));
  const cancelled = delay > RESERVE.deferralMaxMonths;
  const effectiveStart = cancelled ? -1 : originalStart + delay;
  const a1End = originalStart + c.tenorMonths; // the end stays fixed on a deferral (spec §1, ⚠)
  const awards: Award[] = [];
  if (!cancelled) {
    awards.push({ tag: "A1", auctionIndex: c.auctionMonthOffset, start: effectiveStart, endExclusive: a1End, eurPerMWHour: c.eurPerMWHour, capEur: capEurAt(cal, c.auctionMonthOffset, inp.fxStress) });
    if (c.renewal) {
      awards.push({ tag: "A2", auctionIndex: a1End - 6, start: a1End, endExclusive: a1End + c.renewalTenorMonths, eurPerMWHour: c.renewalPrice, capEur: capEurAt(cal, a1End - 6, inp.fxStress) });
    }
  }
  const window = new Array(n).fill(0) as number[];
  const awardOf = new Array(n).fill("") as ("A1" | "A2" | "")[];
  for (const a of awards) for (let i = a.start; i < a.endExclusive && i < n; i++) {
    window[i] = 1;
    awardOf[i] = a.tag;
  }
  const lastService = awards.length ? awards[awards.length - 1]!.endExclusive - 1 : -1;

  const hit = (WAR.marketPremium * inp.lossRatio) / WAR.severity;
  const piHit = hit / 12;
  const outageDerate = (hit * WAR.downtimeMonths) / 12;
  const piO = c.otherLossRate / 12;
  const chi = c.onHit === "terminated" ? 1 : 0;
  const Drep = WAR.downtimeMonths;
  const S = new Array(n).fill(0) as number[];
  const hitLoss = new Array(n).fill(0) as number[];
  const otherLoss = new Array(n).fill(0) as number[];
  const R = new Array(n).fill(0) as number[];
  const released = new Array(n).fill(0) as number[];
  const Zplus = new Array(n).fill(0) as number[];
  const Z = new Array(n).fill(0) as number[];
  if (!cancelled) {
    // one continuous state machine across A1 and A2: survival carries over, hazards continue (spec §8)
    let s = 1;
    for (let k = effectiveStart; k <= lastService; k++) {
      S[k] = s;
      hitLoss[k] = chi * piHit * s;
      otherLoss[k] = piO * s;
      s = s - hitLoss[k]! - otherLoss[k]!;
    }
    for (let m = effectiveStart; m <= lastService; m++) {
      let r = 0;
      let l = 0;
      for (let k = effectiveStart; k < m; k++) {
        l += otherLoss[k]!;
        if (k >= m - Drep) r += hitLoss[k]!;
        else l += hitLoss[k]!;
      }
      R[m] = r;
      released[m] = l;
      Zplus[m] = chi === 1 ? S[m]! : S[m]! * (1 - outageDerate);
      Z[m] = chi === 1 ? S[m]! + r : S[m]!;
    }
  }
  // exit days (spec §2, §4): the other-loss mass of month m − 1 and, after the last award, the surviving mass sell their
  // stock on the 1st of month m; a transfer to A2 is not an exit
  const exitMass = new Array(n).fill(0) as number[];
  const exitOrigin = new Array(n).fill("") as ("A1" | "A2" | "")[];
  let Send = 0;
  if (!cancelled) {
    Send = S[lastService]! - hitLoss[lastService]! - otherLoss[lastService]!;
    for (let k = effectiveStart; k <= lastService; k++) {
      exitMass[k + 1]! += otherLoss[k]! + (k === lastService ? Send : 0);
      if (exitMass[k + 1]! > 0) exitOrigin[k + 1] = awardOf[k]!;
    }
  }
  // re-certification: the certificate (issued in the actual COD month) expires after 60 months; renewal starts with one
  // unless a re-certification fell in the previous 12 months (spec §1)
  const recertIndex: number[] = [];
  if (!cancelled) {
    for (let e = cal.codIndex + RESERVE.certificateMonths; e <= lastService; e += RESERVE.certificateMonths) if (window[e]) recertIndex.push(e);
    const a2 = awards.find((a) => a.tag === "A2");
    if (a2 && !recertIndex.some((e) => e >= a2.start - 12 && e <= a2.start)) recertIndex.push(a2.start);
    recertIndex.sort((a, b) => a - b);
  }
  return {
    c, originalStart, delay, cancelled, effectiveStart, awards, fillIndex: cancelled ? -1 : effectiveStart - 1, recertIndex,
    window, awardOf, S, hitLoss, otherLoss, R, released, Zplus, Z, lastService, Send, exitMass, exitOrigin, piHit, outageDerate,
  };
}

/** Hours to restore readiness after a full command at the recovery power ρC (spec R3 §3): up — buy h·C/RTE; down — sell
 *  RTE·h·C. A disclosed indicator; the daily check (б) is the binding screen. */
export function recoveryHours(c: Pick<ContractInputs, "sustainHours" | "recoveryPowerShare">, rte: number): { up: number; down: number } {
  return { up: c.sustainHours / (rte * c.recoveryPowerShare), down: (rte * c.sustainHours) / c.recoveryPowerShare };
}
