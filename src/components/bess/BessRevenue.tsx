"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { useState } from "react";
import type { PriceStats } from "@/bess/data";
import { SPREAD_PATHS } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { ProfileChart } from "./ProfileChart";

const MONTHS = ["1", "4", "7", "10"] as const;
const MONTH_NAMES: Record<string, string> = { "1": "January", "4": "April", "7": "July", "10": "October" };

/** 2029 per MW, from the perfect-foresight margin to the cash available for debt service. */
function Bridge({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const R = t.revenue;
  const P = core.inputs.powerMW;
  const a = core.result.annual.find((x) => x.year === 2029);
  if (!a) return null;
  const net = a.netRevenueEur;
  const reserve = a.contractNetEur ?? 0;
  const other = a.ebitdaEur - (net + reserve - a.opexEur - a.tariffsEur - a.warExpectedEur);
  const rows: { label: string; v: number; total?: boolean }[] = [
    { label: R.pf, v: a.pfMarginEur, total: true },
    { label: R.capture, v: a.capturedMarginEur - a.pfMarginEur },
    { label: R.fee, v: -a.optimiserFeeEur },
    { label: R.net, v: net, total: true },
    ...(a.contractNetEur !== undefined ? [{ label: R.contract, v: reserve }] : []),
    { label: R.opex, v: -a.opexEur },
    { label: R.tariffs, v: -a.tariffsEur },
    { label: R.war, v: -a.warExpectedEur },
    ...(Math.abs(other) > 0.005 * a.pfMarginEur ? [{ label: R.other, v: other }] : []),
    { label: R.ebitda, v: a.ebitdaEur, total: true },
    { label: R.tax, v: -a.taxPaidEur },
    { label: R.cfads, v: a.cfadsEur, total: true },
  ];
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-2 sm:grid-cols-[14rem_1fr_5rem]">
          <span className={cn("truncate", r.total ? "font-medium" : "pl-3 text-muted-foreground")}>{r.label}</span>
          <span className="h-3 rounded-sm bg-secondary">
            <span
              className={cn("block h-3 rounded-sm", r.total ? "bg-[var(--series-1)]" : r.v < 0 ? "bg-[var(--series-2)]" : "bg-[var(--series-3)]")}
              style={{ width: `${(Math.abs(r.v) / max) * 100}%` }}
            />
          </span>
          <span className={cn("text-right tabular", r.total && "font-semibold")}>{f.eurCompact(r.v / P)}</span>
        </li>
      ))}
    </ul>
  );
}

export function BessRevenue({ core, stats, t }: { core: BessCore; stats: Record<string, PriceStats>; t: BessMessages }) {
  const f = useFormat();
  const R = t.revenue;
  const { inputs } = core;
  const years = Array.from({ length: 15 }, (_, i) => 2028 + i);
  const path = (id: keyof typeof SPREAD_PATHS) => years.map((y) => SPREAD_PATHS[id][Math.min(y, 2031) as 2028 | 2029 | 2030 | 2031]);
  // the chart follows the input until the visitor picks another price year here
  const [picked, setSnap] = useState<string | null>(null);
  const snap = picked ?? inputs.snapshot;
  const s = stats[snap] ?? stats[inputs.snapshot];
  const fromLabel = t.options.snap?.[snap] ?? snap;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{R.bridgeTitle}</CardTitle>
          <CardDescription>{R.bridgeNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <Bridge core={core} t={t} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{R.pathsTitle}</CardTitle>
          <CardDescription>{R.pathsNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years}
            lines={(["high", "reference", "low"] as const).map((id, i) => ({
              id,
              label: `${t.options.scn?.[id] ?? id}${id === inputs.scenario ? ` (${R.selected})` : ""}`,
              color: SERIES[i]!,
              values: path(id),
            }))}
            format={(v) => f.num(v, 3)}
            axisFormat={(v) => f.num(v, 1)}
            yMin={0}
            ariaLabel={R.pathsTitle}
          />
        </CardContent>
      </Card>
      {s && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{R.profileTitle}</CardTitle>
              <CardDescription>{R.profileNote(fromLabel)}</CardDescription>
            </div>
            <RadioGroup
              value={snap}
              options={Object.keys(stats)}
              onChange={setSnap}
              label={t.fields.snap?.label}
              className="inline-flex w-fit shrink-0 flex-wrap rounded-lg border border-border p-0.5"
              optionClassName={(checked) => cn("rounded-md px-2.5 py-1 text-xs", checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              render={(o) => t.options.snap?.[o] ?? o}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ProfileChart
              series={MONTHS.map((m, i) => ({ id: m, label: MONTH_NAMES[m]!, color: SERIES[i]!, values: s.hourlyProfileByMonth[m]?.eur ?? [] }))}
              format={(v) => `€${f.num(v, 0)}`}
              hourLabel={R.hour}
              ariaLabel={R.profileTitle}
            />
            <div>
              <h3 className="text-sm font-semibold">{R.tb2Title}</h3>
              <p className="text-xs text-muted-foreground">{R.tb2Note}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-max min-w-full text-xs tabular">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 pr-3 text-left font-medium">{R.mean}</th>
                      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => (
                        <th key={p} className="px-2 py-1 text-right font-medium">
                          {R.decile(p)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1 pr-3 font-semibold">€{f.num(s.tb2.meanEUR, 0)}</td>
                      {s.tb2.decilesEUR.map((v, i) => (
                        <td key={i} className="px-2 py-1 text-right">
                          €{f.num(v, 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
