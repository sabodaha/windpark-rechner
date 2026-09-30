"use client";

import type { AnnualRow } from "@/engine";
import { keur, num, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TableRow {
  label: string;
  values: (number | null)[];
  format?: (v: number | null) => string;
  bold?: boolean;
  indent?: boolean;
}

/** Years as columns, the label column stays in place while the table scrolls sideways. */
export function YearTable({ years, rows, caption }: { years: number[]; rows: TableRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-max min-w-full border-collapse text-xs tabular">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-muted">
            <th scope="col" className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2 text-left font-medium">
              {caption}
            </th>
            {years.map((y) => (
              <th key={y} scope="col" className="px-2 py-2 text-right font-medium">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={cn("border-t border-border", r.bold && "font-semibold")}>
              <th scope="row" className={cn("sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal", r.bold && "font-semibold", r.indent && "pl-6 text-muted-foreground")}>
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={years[i]} className={cn("whitespace-nowrap px-2 py-1.5 text-right", v !== null && v < 0 && "text-muted-foreground")}>
                  {(r.format ?? keur)(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Key = keyof AnnualRow;
const col = (rows: AnnualRow[], key: Key, sign = 1) => rows.map((a) => (a[key] === null ? null : (a[key] as number) * sign));

export function cashFlowRows(a: AnnualRow[], L: Record<string, string>): TableRow[] {
  return [
    { label: L.energy!, values: a.map((r) => r.energySoldKwh / 1e6), format: (v) => num(v, 1) },
    { label: L.marketValue!, values: a.map((r) => r.marketValueEurKwh * 1000), format: (v) => num(v, 1) },
    { label: L.revenueMarket!, values: col(a, "revenueMarket"), indent: true },
    { label: L.revenuePremium!, values: col(a, "revenuePremium"), indent: true },
    { label: L.revenuePostEeg!, values: col(a, "revenuePostEeg"), indent: true },
    { label: L.revenue!, values: col(a, "revenue"), bold: true },
    { label: L.opex!, values: col(a, "opex", -1) },
    { label: L.municipalRefund!, values: col(a, "municipalRefund") },
    { label: L.ebitda!, values: col(a, "ebitda"), bold: true },
    { label: L.deltaWorkingCapital!, values: col(a, "deltaWorkingCapital", -1) },
    { label: L.taxes!, values: col(a, "taxes", -1) },
    { label: L.cfads!, values: col(a, "cfads"), bold: true },
    { label: L.interest!, values: col(a, "interest", -1), indent: true },
    { label: L.principal!, values: col(a, "principal", -1), indent: true },
    { label: L.debtService!, values: col(a, "debtService", -1) },
    { label: L.dscr!, values: col(a, "dscr"), format: (v) => (v === null ? "—" : ratio(v)) },
    { label: L.dsraBalance!, values: col(a, "dsraBalance") },
    { label: L.decommissioningReserve!, values: col(a, "decommissioningReserve") },
    { label: L.trappedCash!, values: col(a, "trappedCash") },
    { label: L.decommissioningPaid!, values: col(a, "decommissioningPaid", -1) },
    { label: L.distribution!, values: col(a, "distribution"), bold: true },
  ];
}

export function pnlRows(a: AnnualRow[], L: Record<string, string>): TableRow[] {
  return [
    { label: L.revenue!, values: col(a, "revenue"), bold: true },
    { label: L.municipalRefund!, values: col(a, "municipalRefund") },
    ...(["maintenance", "management", "insurance", "otherOpex", "lease", "directMarketing", "municipal", "guaranteeFee", "gridFee"] as const).map(
      (k) => ({ label: L[k]!, values: col(a, k, -1), indent: true }),
    ),
    { label: L.ebitda!, values: col(a, "ebitda"), bold: true },
    { label: L.depreciation!, values: col(a, "depreciation", -1) },
    { label: L.interest!, values: col(a, "interest", -1) },
    { label: L.provisionChange!, values: col(a, "provisionChange", -1) },
    { label: L.ebt!, values: col(a, "ebt"), bold: true },
    { label: L.tradeTax!, values: col(a, "tradeTax", -1) },
    { label: L.corporateTax!, values: col(a, "corporateTax", -1) },
    { label: L.soli!, values: col(a, "soli", -1) },
    { label: L.netIncome!, values: col(a, "netIncome"), bold: true },
  ];
}

export function debtRows(a: AnnualRow[], L: Record<string, string>): TableRow[] {
  return [
    { label: L.debtOpening!, values: col(a, "debtOpening") },
    { label: L.interest!, values: col(a, "interest") },
    { label: L.principal!, values: col(a, "principal") },
    { label: L.debtClosing!, values: col(a, "debtClosing"), bold: true },
    { label: L.debtService!, values: col(a, "debtService"), bold: true },
    { label: L.cfads!, values: col(a, "cfads") },
    { label: L.dscr!, values: col(a, "dscr"), format: (v) => (v === null ? "—" : ratio(v)), bold: true },
    { label: L.dsraBalance!, values: col(a, "dsraBalance") },
    { label: L.trappedCash!, values: col(a, "trappedCash") },
  ];
}

export function taxRows(a: AnnualRow[], L: Record<string, string>): TableRow[] {
  return [
    { label: L.ebt!, values: col(a, "ebt"), bold: true },
    { label: L.tradeTax!, values: col(a, "tradeTax") },
    { label: L.corporateTax!, values: col(a, "corporateTax") },
    { label: L.soli!, values: col(a, "soli") },
    { label: L.taxes!, values: col(a, "taxes"), bold: true },
  ];
}
