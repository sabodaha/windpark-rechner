"use client";

import { useState, type ReactNode } from "react";
import type { Inputs, ModelResult, ScenarioName } from "@/engine";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateLabel, keur, meur, num, pct, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";
import { YearTable, type TableRow } from "./YearTable";

interface Props {
  inputs: Inputs;
  results: Record<ScenarioName, ModelResult>;
  scenario: ScenarioName;
  t: Messages;
}

const m = (v: number) => v / 1e6;
const fmtM = (v: number) => num(v, 2);
const fmtAxisM = (v: number) => num(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0);

export function Overview({ inputs, results, scenario, t }: Props) {
  const r = results[scenario];
  const a = r.annual;
  const years = a.map((x) => x.year);
  const C = t.charts;
  const k = r.kpis;
  const eegYears = a.map((x, i) => (x.eegShare > 0 ? i : -1)).filter((i) => i >= 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={C.cashflow.title}
          subtitle={C.cashflow.subtitle}
          table={{
            years,
            rows: [
              { label: C.cashflow.revenue, values: a.map((x) => x.revenue) },
              { label: C.cashflow.opex, values: a.map((x) => -x.opex) },
              { label: C.cashflow.taxes, values: a.map((x) => -x.taxes) },
              { label: C.cashflow.debtService, values: a.map((x) => -x.debtService) },
              { label: C.cashflow.distribution, values: a.map((x) => x.distribution), bold: true },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "rev", label: C.cashflow.revenue, color: SERIES[0]!, values: a.map((x) => m(x.revenue)) },
              { id: "opex", label: C.cashflow.opex, color: SERIES[1]!, values: a.map((x) => -m(x.opex)) },
              { id: "tax", label: C.cashflow.taxes, color: SERIES[2]!, values: a.map((x) => -m(x.taxes)) },
              { id: "ds", label: C.cashflow.debtService, color: SERIES[3]!, values: a.map((x) => -m(x.debtService)) },
            ]}
            lines={[{ id: "dist", label: C.cashflow.distribution, color: SERIES[4]!, values: a.map((x) => m(x.distribution)) }]}
            format={(v) => `€${fmtM(v)}m`}
            axisFormat={fmtAxisM}
            ariaLabel={`${C.cashflow.title}, ${C.cashflow.subtitle}`}
          />
        </ChartCard>

        <ChartCard
          title={C.dscr.title}
          subtitle={C.dscr.subtitle}
          table={{
            years,
            rows: [
              { label: C.dscr.base, values: results.base.annual.map((x) => x.dscr), format: (v) => (v === null ? "—" : ratio(v)) },
              { label: C.dscr.p90, values: results.p90.annual.map((x) => x.dscr), format: (v) => (v === null ? "—" : ratio(v)) },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            lines={[
              { id: "base", label: C.dscr.base, color: SERIES[0]!, values: results.base.annual.map((x) => x.dscr) },
              { id: "p90", label: C.dscr.p90, color: SERIES[1]!, values: results.p90.annual.map((x) => x.dscr) },
            ]}
            refLines={[
              { label: `${C.dscr.target} ${ratio(inputs.financing.targetDscrP50)}`, value: inputs.financing.targetDscrP50, labelAt: "right-above" },
              { label: `${C.dscr.covenant} ${ratio(inputs.financing.covenantDscr)}`, value: inputs.financing.covenantDscr, labelAt: "right-below" },
            ]}
            yMin={0}
            format={(v) => ratio(v)}
            axisFormat={(v) => num(v, 1)}
            ariaLabel={`${C.dscr.title}, ${C.dscr.subtitle}`}
          />
        </ChartCard>

        <ChartCard
          title={C.revenue.title}
          subtitle={C.revenue.subtitle}
          table={{
            years,
            rows: [
              { label: C.revenue.market, values: a.map((x) => (x.energySoldKwh > 0 ? ((x.revenueMarket + x.revenuePostEeg) / x.energySoldKwh) * 100 : null)), format: (v) => num(v, 2) },
              { label: C.revenue.premium, values: a.map((x) => (x.energySoldKwh > 0 ? (x.revenuePremium / x.energySoldKwh) * 100 : null)), format: (v) => num(v, 2) },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "mv", label: C.revenue.market, color: SERIES[0]!, values: a.map((x) => (x.energySoldKwh > 0 ? ((x.revenueMarket + x.revenuePostEeg) / x.energySoldKwh) * 100 : 0)) },
              { id: "mp", label: C.revenue.premium, color: SERIES[1]!, values: a.map((x) => (x.energySoldKwh > 0 ? (x.revenuePremium / x.energySoldKwh) * 100 : 0)) },
            ]}
            refLines={
              eegYears.length
                ? [{ label: `${C.revenue.aw} ${num(k.awCt, 2)}`, value: k.awCt, from: eegYears[0]!, to: eegYears[eegYears.length - 1]! }]
                : []
            }
            format={(v) => `${num(v, 2)} ct`}
            axisFormat={(v) => num(v, 0)}
            ariaLabel={`${C.revenue.title}, ${C.revenue.subtitle}`}
          />
        </ChartCard>

        <ChartCard
          title={C.debtService.title}
          subtitle={C.debtService.subtitle}
          table={{
            years,
            rows: [
              { label: C.debtService.interest, values: a.map((x) => x.interest) },
              { label: C.debtService.principal, values: a.map((x) => x.principal) },
              { label: t.tables.rows.debtClosing!, values: a.map((x) => x.debtClosing) },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "int", label: C.debtService.interest, color: SERIES[0]!, values: a.map((x) => m(x.interest)) },
              { id: "prin", label: C.debtService.principal, color: SERIES[1]!, values: a.map((x) => m(x.principal)) },
            ]}
            format={(v) => `€${fmtM(v)}m`}
            axisFormat={fmtAxisM}
            ariaLabel={`${C.debtService.title}, ${C.debtService.subtitle}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.facts}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Fact label={t.overview.capacity} value={`${num(k.capacityMw, 1)} MW`} />
              <Fact label={t.overview.p50} value={`${num(k.fullLoadHoursP50, 0)} h`} />
              <Fact label={t.overview.kf} value={num(k.correctionFactor, 3)} />
              <Fact label={t.overview.aw} value={`${num(k.awCt, 2)} ct/kWh`} />
              <Fact label={t.overview.cod} value={dateLabel(r.timeline.cod)} />
              <Fact label={t.overview.eegEnd} value={dateLabel(r.timeline.eegEnd)} />
              <Fact label={t.overview.loanEnd} value={dateLabel(r.timeline.loanMaturity)} />
              <Fact label={t.overview.endOfLife} value={dateLabel(r.timeline.endOfLife)} />
              <Fact label={t.overview.sizing} value={t.overview.binding[r.sizing.binding] ?? r.sizing.binding} />
              <Fact
                label={t.tables.lenderCase}
                value={t.tables.lenderDscr(ratio(r.sizing.minBankDscrP50), ratio(r.sizing.minBankDscrP90))}
              />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.sourcesUses}</CardTitle>
            <CardDescription>€ thousand · {pct(k.gearing, 1)} {t.kpis.gearing}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm tabular">
              <tbody>
                {(["capex", "upfrontFee", "commitmentFee", "interestDuringConstruction", "vatInterest", "dsraInitial", "totalUses"] as const).map((key) => (
                  <tr key={key} className={cn("border-b border-border last:border-0", key === "totalUses" && "font-semibold")}>
                    <td className="py-1">{t.overview.uses[key]}</td>
                    <td className="py-1 text-right">{keur(r.sourcesUses[key])}</td>
                  </tr>
                ))}
                {(["debt", "equity", "totalSources"] as const).map((key) => (
                  <tr key={key} className={cn("border-b border-border last:border-0", key === "totalSources" && "font-semibold")}>
                    <td className="py-1">{t.overview.uses[key]}</td>
                    <td className="py-1 text-right">{keur(r.sourcesUses[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.kpis.debt.label}: {meur(k.debt)} · Equity: {meur(k.equity)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular sm:text-left">{value}</dd>
    </>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  table,
  t,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  table: { years: number[]; rows: TableRow[] };
  t: Messages;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          aria-pressed={showTable}
          className="shrink-0 text-xs font-medium text-link hover:underline"
        >
          {showTable ? title : t.charts.tableView}
        </button>
      </CardHeader>
      <CardContent>{showTable ? <YearTable years={table.years} rows={table.rows} caption={title} /> : children}</CardContent>
    </Card>
  );
}
