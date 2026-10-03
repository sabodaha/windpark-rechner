"use client";

import type { DeMessages } from "@/bess/de/messages";
import type { DeCore, DeYear } from "@/bess/de/view";
import { type TableRow, YearTable } from "@/components/calculator/YearTable";
import { useFormat } from "@/components/site/LocaleProvider";

export function DeTables({ core, t }: { core: DeCore; t: DeMessages }) {
  const f = useFormat();
  const L = t.tables.rows;
  const y = core.years;
  const col = (fn: (r: DeYear) => number): (number | null)[] => y.map(fn);
  const rows: TableRow[] = [
    { label: L.discharge, values: col((r) => r.dischargeMWh), format: (v) => (v ? f.num(v, 0) : "—") },
    { label: L.usable, values: y.map((r) => r.usableMWh), format: (v) => (v ? f.num(v, 1) : "—") },
    { label: L.toll, values: col((r) => r.tollEur) },
    { label: L.market, values: col((r) => r.marketEur) },
    { label: L.revenue, values: col((r) => r.revenueEur), bold: true },
    { label: L.opex, values: col((r) => -r.opexEur) },
    { label: L.ebitda, values: col((r) => r.ebitdaEur), bold: true },
    { label: L.afa, values: col((r) => -r.afaEur) },
    { label: L.interest, values: col((r) => -r.interestEur) },
    { label: L.tax, values: col((r) => -r.taxEur) },
    { label: L.netIncome, values: col((r) => r.netIncomeEur), bold: true },
    { label: L.lifecycle, values: col((r) => -r.lifecycleEur) },
    { label: L.cfads, values: col((r) => r.cfadsEur), bold: true },
    { label: L.debtService, values: col((r) => -r.debtServicePaidEur) },
    { label: L.payouts, values: col((r) => r.distributionsEur), bold: true },
    { label: L.cash, values: col((r) => r.cashEndEur) },
    { label: L.debt, values: col((r) => r.debtEndEur) },
  ];
  return <YearTable years={y.map((r) => r.year)} rows={rows} caption={`${t.tables.title} · ${t.tables.unit}`} />;
}
