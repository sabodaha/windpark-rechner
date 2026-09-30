// Shared by the workbook sheets: the environment built from one snapshot, and small helpers.
import type { Inputs, ModelResult, ModelSnapshot, OperationsTrace, ScenarioName } from "@/engine";
import { toDay } from "@/engine/dates";
import { excelDate, type Fmt } from "./ooxml";
import type { Grid } from "./grid";

export type Ops = "base" | "p90" | "resource" | "downside" | "lender50" | "lender90";
export const OPS: Ops[] = ["base", "p90", "resource", "downside", "lender50", "lender90"];
export const SC_LABEL: Record<Ops, string> = {
  base: "Base",
  p90: "P90 1-yr",
  resource: "P90 10-yr",
  downside: "Downside",
  lender50: "Lender case P50",
  lender90: "Lender case P90 1-yr",
};

export const xd = (iso: string) => excelDate(iso);
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const MONEY: Fmt = "int";
export const COLS_PERIOD = (n: number) => [46, 13, 16, 12, 14, ...Array(n).fill(13)];

export interface Env {
  snap: ModelSnapshot;
  i: Inputs;
  runs: Record<ScenarioName, ModelResult>;
  base: ModelResult;
  N: number;
  M: number;
  years: number[];
  grid: Grid;
  /** Operations trace of each block. */
  ops: Record<Ops, OperationsTrace>;
  cod: number;
  eegEnd: number;
  end: number;
}

export function makeEnv(snap: ModelSnapshot, grid: Grid): Env {
  const base = snap.scenarios.base;
  const t = base.trace!;
  return {
    snap,
    i: snap.inputs,
    runs: snap.scenarios,
    base,
    N: base.annual.length,
    M: base.construction.length,
    years: base.annual.map((a) => a.year),
    grid,
    ops: {
      base: t.operations,
      p90: snap.scenarios.p90.trace!.operations,
      resource: snap.scenarios.resource.trace!.operations,
      downside: snap.scenarios.downside.trace!.operations,
      lender50: t.lenderP50,
      lender90: t.lenderP90,
    },
    cod: toDay(base.timeline.cod),
    eegEnd: toDay(base.timeline.eegEnd),
    end: toDay(base.timeline.endOfLife),
  };
}

export function addMonthsDay(day: number, months: number): number {
  const d = new Date(day * 86_400_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return Math.round(Date.UTC(ny, nm, Math.min(d.getUTCDate(), last)) / 86_400_000);
}
export const addYearsDay = (day: number, years: number) => addMonthsDay(day, 12 * years);

export function cumulative(a: number[]): number[] {
  let s = 0;
  return a.map((x) => (s += x));
}
