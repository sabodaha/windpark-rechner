// Monthly calendar of the BESS case (model-spec §4): construction from financial close, operations from COD for the
// operating life, then a short settlement tail. Months are half-open; flows are dated at the month end unless stated.
import { addMonths, parts, toDay } from "@/engine/dates";
import { CASE, FINANCE } from "./registry";

export type Phase = "construction" | "operation" | "settlement";

export interface Month {
  index: number;
  start: number;
  /** First day of the next month (exclusive end); payment dates (1 February, 1 August) fall on it. */
  end: number;
  /** Last day of the month: ordinary construction, operating and tax cash is dated here (convention A03). */
  last: number;
  year: number;
  month: number;
  phase: Phase;
  /** Months since COD (0 in the COD month); −1 before COD. */
  opIndex: number;
  days: number;
}

export interface DebtPeriod {
  /** Payment date (1 February or 1 August). */
  day: number;
  /** Index of the last month of the period: the payment falls on that month's end. */
  lastMonth: number;
  /** First month of the period (COD month for the first one). */
  firstMonth: number;
}

export interface Calendar {
  months: Month[];
  fcDay: number;
  codDay: number;
  /** Actual COD month: operations, degradation and depreciation start here. */
  codIndex: number;
  /** Contractual COD month (FC + construction): funding, reserves and loan interest follow it even if COD slips. */
  plannedCodIndex: number;
  /** First month after operations end. */
  eolIndex: number;
  periods: DebtPeriod[];
  /** Semi-annual distribution dates after the loan matures (same calendar as debt service). */
  distributionDays: number[];
}

export function buildCalendar(codDelayMonths: number): Calendar {
  const fcDay = toDay(CASE.financialClose);
  const codDay = addMonths(fcDay, CASE.constructionMonths + codDelayMonths);
  const opMonths = CASE.operatingLifeYears * 12;
  const total = CASE.constructionMonths + codDelayMonths + opMonths + CASE.settlementHorizonMonths;
  const codIndex = CASE.constructionMonths + codDelayMonths;
  const eolIndex = codIndex + opMonths;
  const months: Month[] = [];
  for (let i = 0; i < total; i++) {
    const start = addMonths(fcDay, i);
    const end = addMonths(fcDay, i + 1);
    const { year, month } = parts(start);
    const phase: Phase = i < codIndex ? "construction" : i < eolIndex ? "operation" : "settlement";
    months.push({ index: i, start, end, last: end - 1, year, month, phase, opIndex: i >= codIndex ? i - codIndex : -1, days: end - start });
  }
  const first = toDay(FINANCE.firstRepayment);
  const maturity = toDay(FINANCE.maturity);
  const periods: DebtPeriod[] = [];
  let prevLast = codIndex - 1;
  for (let d = first; d <= maturity; d = addMonths(d, 6)) {
    const lastMonth = months.findIndex((m) => m.end === d);
    if (lastMonth < 0) throw new Error("debt date outside the calendar");
    periods.push({ day: d, lastMonth, firstMonth: Math.max(prevLast + 1, CASE.constructionMonths) });
    prevLast = lastMonth;
  }
  const distributionDays: number[] = [];
  for (let d = addMonths(maturity, 6); d <= months[months.length - 1]!.end; d = addMonths(d, 6)) distributionDays.push(d);
  return { months, fcDay, codDay, codIndex, plannedCodIndex: CASE.constructionMonths, eolIndex, periods, distributionDays };
}
