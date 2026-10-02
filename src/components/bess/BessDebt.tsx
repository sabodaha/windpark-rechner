"use client";

import { FINANCE } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { parts } from "@/engine/dates";
import { millions } from "./chartFormat";
import { operatingYears } from "./BessOverview";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (day: number) => {
  const p = parts(day);
  return `${MON[p.month - 1]} ${String(p.year).slice(2)}`;
};

export function BessDebt({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const D = t.debt;
  const M = millions(f);
  const { result } = core;
  const k = result.kpis;
  // payment dates with debt service, each with the lender's case of the same date (sizing runs on the same calendar)
  const rows = result.periods.map((p, i) => ({ ...p, lender: result.lenderPeriods[i]?.dscr ?? null })).filter((p) => p.debtServiceEur > 0);
  const years = operatingYears(core);
  const hasDebt = (k.debtEur?.value ?? 0) > 0;
  const facts: [string, string][] = hasDebt
    ? [
        [D.opening, f.meur(k.debtEur?.value ?? null, 2)],
        [D.tenor, f.dateLabel(FINANCE.maturity)],
        [D.avgDscr, f.ratio(k.avgDscr?.value ?? null)],
        [D.llcr, f.ratio(k.llcr?.value ?? null)],
        [D.reserve, f.meur(result.funding.dsraInitialEur, 2)],
      ]
    : [];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{D.dscrTitle}</CardTitle>
          <CardDescription>{hasDebt ? D.dscrNote : D.noDebt}</CardDescription>
        </CardHeader>
        {hasDebt && (
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {facts.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular">{value}</dd>
                </div>
              ))}
            </dl>
            <YearChart
              years={rows.map((p) => p.day)}
              labels={rows.map((p) => periodLabel(p.day))}
              bars={[{ id: "dscr", label: D.dscr, color: SERIES[0]!, values: rows.map((p) => p.dscr ?? 0) }]}
              lines={result.lenderPeriods.length > 0 ? [{ id: "lender", label: D.lender, color: SERIES[1]!, values: rows.map((p) => p.lender) }] : []}
              refLines={[
                { label: `${D.lockup} ${f.ratio(FINANCE.lockupDscr)}`, value: FINANCE.lockupDscr, labelAt: "right-above" },
                { label: `${D.defaultLevel} ${f.ratio(FINANCE.defaultDscr)}`, value: FINANCE.defaultDscr, labelAt: "left-below" },
              ]}
              format={(v) => f.ratio(v)}
              axisFormat={(v) => f.num(v, 1)}
              yMin={0}
              ariaLabel={D.dscrTitle}
            />
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{D.cashTitle}</CardTitle>
          <CardDescription>{t.overview.chartNote.split(".")[0]}.</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years.map((a) => a.year)}
            bars={[
              { id: "cfads", label: D.cfads, color: SERIES[0]!, values: years.map((a) => M.m(a.cfadsEur)) },
              { id: "ds", label: D.service, color: SERIES[1]!, values: years.map((a) => M.m(-a.debtServiceEur)) },
              { id: "div", label: D.dividends, color: SERIES[2]!, values: years.map((a) => M.m(-a.dividendsGrossEur)) },
            ]}
            format={M.tip}
            axisFormat={M.axis}
            ariaLabel={D.cashTitle}
          />
        </CardContent>
      </Card>
    </div>
  );
}

