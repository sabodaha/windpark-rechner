// Monthly calendar of the German pack (spec v1.2 R2 §1). Same shape as the Ukrainian calendar, so the shared debt helpers
// (`periodRates`, `sculpt`) apply unchanged. Index 0 is the FC month (model month 1 = February 2027).
import { addMonths, parts, toDay } from "@/engine/dates";
import type { Calendar, Month, Phase, DebtPeriod } from "../engine/calendar";
import { DE_CASE, DE_TECH } from "./registry";

export interface DeCalendar extends Calendar {
  /** First and last toll month (indices), null without a toll. */
  tollFirst: number | null;
  tollLast: number | null;
  augmentationIndex: number;
  pcsOverhaulIndex: number;
  /** Distribution dates: every 1 February / 1 August from 2028-08-01 while inside the model months (month index). */
  distributionMonths: number[];
  liquidationDay: number;
  grandfatheringApplied: boolean;
}

export function buildDeCalendar(codDelayMonths: number, repaymentCount: number, tollMonths: number | null, grandfathered: boolean): DeCalendar {
  const fcDay = toDay(DE_CASE.financialClose);
  const constr = DE_CASE.constructionMonths;
  const codIndex = constr + codDelayMonths;
  const opMonths = DE_CASE.operatingLifeYears * 12;
  const eolIndex = codIndex + opMonths;
  const total = eolIndex + DE_CASE.settlementHorizonMonths;
  const months: Month[] = [];
  for (let i = 0; i < total; i++) {
    const start = addMonths(fcDay, i);
    const end = addMonths(fcDay, i + 1);
    const { year, month } = parts(start);
    const phase: Phase = i < codIndex ? "construction" : i < eolIndex ? "operation" : "settlement";
    months.push({ index: i, start, end, last: end - 1, year, month, phase, opIndex: i >= codIndex ? i - codIndex : -1, days: end - start });
  }
  const periods: DebtPeriod[] = [];
  let prevLast = codIndex - 1;
  let d = toDay(DE_CASE.firstRepayment);
  for (let k = 0; k < repaymentCount; k++, d = addMonths(d, 6)) {
    const lastMonth = months.findIndex((m) => m.end === d);
    if (lastMonth < 0) throw new Error("debt date outside the calendar");
    periods.push({ day: d, lastMonth, firstMonth: Math.max(prevLast + 1, constr) });
    prevLast = lastMonth;
  }
  const distributionMonths: number[] = [];
  for (let i = 0; i < total; i++) {
    const m = months[i]!;
    if ((m.month === 2 || m.month === 8) && m.start >= toDay(DE_CASE.firstDistributionDate)) distributionMonths.push(i);
  }
  const lastStart = months[total - 1]!.start;
  const liq = addMonths(lastStart, 13) - 1; // last day of the month 12 months after the last settlement month
  const tollFirst = tollMonths ? codIndex : null;
  const tollLast = tollMonths ? Math.min(codIndex + tollMonths - 1, eolIndex - 1) : null;
  const codDay = months[codIndex]!.start;
  return {
    months, fcDay, codDay, codIndex, plannedCodIndex: constr, eolIndex, periods, distributionDays: [],
    tollFirst, tollLast,
    augmentationIndex: codIndex + DE_TECH.augmentationMonthAfterCod,
    pcsOverhaulIndex: codIndex + DE_TECH.pcsOverhaulMonthAfterCod,
    distributionMonths, liquidationDay: liq,
    grandfatheringApplied: grandfathered && codDay <= toDay(DE_CASE.grandfatheringDeadline),
  };
}
