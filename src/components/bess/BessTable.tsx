"use client";

import type { AnnualRow } from "@/bess/engine";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { type TableRow, YearTable } from "@/components/calculator/YearTable";
import { useFormat } from "@/components/site/LocaleProvider";

export function BessTable({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const L = t.tables.rows;
  const a = core.result.annual;
  const col = (fn: (r: AnnualRow) => number): (number | null)[] => a.map(fn);
  const start = core.inputs.durationH;
  const rows: TableRow[] = [
    { label: L.delivered, values: col((r) => r.deliveredMWh), format: (v) => f.num(v, 0) },
    { label: L.soh, values: col((r) => (r.deliveredMWh > 0 ? (100 * r.usableHoursEnd) / start : 0)), format: (v) => (v ? f.num(v, 1) : "—") },
    { label: L.pf, values: col((r) => r.pfMarginEur) },
    { label: L.captured, values: col((r) => r.capturedMarginEur), indent: true },
    { label: L.fee, values: col((r) => -r.optimiserFeeEur), indent: true },
    { label: L.net, values: col((r) => r.netRevenueEur), bold: true },
    { label: L.opex, values: col((r) => -r.opexEur) },
    { label: L.tariffs, values: col((r) => -r.tariffsEur) },
    { label: L.war, values: col((r) => -r.warExpectedEur) },
    { label: L.ebitda, values: col((r) => r.ebitdaEur), bold: true },
    { label: L.tax, values: col((r) => -r.taxPaidEur) },
    { label: L.lifecycle, values: col((r) => -r.lifecycleCapexEur) },
    { label: L.cfads, values: col((r) => r.cfadsEur), bold: true },
    { label: L.debtService, values: col((r) => -r.debtServiceEur) },
    { label: L.dividends, values: col((r) => r.dividendsGrossEur) },
    { label: L.investor, values: col((r) => r.investorNetEur), bold: true },
    { label: L.cash, values: col((r) => r.cashInSpvEur) },
  ];
  return <YearTable years={a.map((r) => r.year)} rows={rows} caption={`${t.tables.title} · ${t.tables.unit}`} />;
}
