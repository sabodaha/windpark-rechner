"use client";

import type { DePriceStats } from "@/bess/de/data";
import type { DeMessages } from "@/bess/de/messages";
import type { DeCore } from "@/bess/de/view";
import { ProfileChart } from "@/components/bess/ProfileChart";
import { YearChart } from "@/components/charts/YearChart";
import { SERIES } from "@/components/charts/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { deOperatingYears } from "./DeOverview";

/** The market share's 2029 bridge, the spread path and its effective fee, and the price data behind them. */
export function DeRevenue({ core, stats, t }: { core: DeCore; stats: Record<string, DePriceStats>; t: DeMessages }) {
  const f = useFormat();
  const R = t.revenue;
  const b = core.bridge2029;
  const stack = core.inputs.stackEnabled === true;
  const stackYears = deOperatingYears(core);
  const years = deOperatingYears(core).filter((y) => y.spreadM !== null);
  const snap = stats[core.inputs.snapshot];
  const eur = (v: number) => `€${f.num(v, 0)}`;
  const rows = b
    ? [
        { label: R.sales, value: b.salesEur },
        { label: R.purchases, value: -b.purchasesEur },
        { label: R.margin, value: b.marginEur, bold: true },
        { label: R.capture, value: b.captureEur },
        ...(stack ? [{ label: R.intraday, value: b.intradayEur }, { label: R.afrr, value: b.afrrEur }] : []),
        { label: R.fee, value: -b.optimiserFeeEur },
        { label: R.market, value: b.marketEur, bold: true },
        { label: R.toll, value: b.tollEur },
        { label: R.total, value: b.revenueEur, bold: true },
      ]
    : [];
  return (
    <div className="flex flex-col gap-4">
      {b && (
        <Card>
          <CardHeader>
            <CardTitle>{R.bridgeTitle}</CardTitle>
            <CardDescription>{R.bridgeNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full max-w-md text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className={cn("border-b border-border last:border-0", r.bold && "font-semibold")}>
                    <td className="py-1.5 pr-4">{r.label}</td>
                    <td className="py-1.5 text-right tabular">{eur(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {stack && core.stack && stackYears.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{R.stackTitle}</CardTitle>
            <CardDescription>{R.stackNote}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm">{core.stack.heldYears.length ? R.held(core.stack.heldYears.join(", ")) : R.heldNone}</p>
            <YearChart
              years={stackYears.map((y) => y.year)}
              bars={[
                { id: "afrr", label: R.afrr, color: SERIES[0]!, values: stackYears.map((y) => y.afrrEur / 1e6) },
                { id: "intraday", label: R.intraday, color: SERIES[1]!, values: stackYears.map((y) => y.intradayEur / 1e6) },
              ]}
              format={(v) => `€${f.num(v, 2)}m`}
              yMin={0}
              ariaLabel={R.stackTitle}
              height={200}
            />
          </CardContent>
        </Card>
      )}
      {years.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{R.pathTitle}</CardTitle>
            <CardDescription>{R.pathNote}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <YearChart
              years={years.map((y) => y.year)}
              lines={[{ id: "m", label: R.spread, color: SERIES[0]!, values: years.map((y) => y.spreadM) }]}
              format={(v) => f.num(v, 3)}
              yMin={0}
              ariaLabel={R.spread}
              height={180}
            />
            <YearChart
              years={years.map((y) => y.year)}
              lines={[{ id: "fee", label: R.importFee, color: SERIES[1]!, values: years.map((y) => y.importFee) }]}
              format={(v) => f.num(v, 2)}
              ariaLabel={R.importFee}
              height={180}
            />
          </CardContent>
        </Card>
      )}
      {snap && (
        <Card>
          <CardHeader>
            <CardTitle>{R.profileTitle}</CardTitle>
            <CardDescription>{R.profileNote(t.options.snap?.[core.inputs.snapshot] ?? core.inputs.snapshot)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProfileChart
              series={[
                { id: "jan", label: R.winter, color: SERIES[0]!, values: snap.hourlyProfileByMonth["1"] ?? [] },
                { id: "jul", label: R.summer, color: SERIES[1]!, values: snap.hourlyProfileByMonth["7"] ?? [] },
              ]}
              format={(v) => `€${f.num(v, 0)}`}
              hourLabel={R.hour}
              ariaLabel={R.profileTitle}
            />
            <div>
              <div className="text-sm font-medium">{R.tb2Title}</div>
              <p className="text-xs text-muted-foreground">{R.tb2Note(eur(snap.tb2.meanEUR))}</p>
              <p className="mt-1 text-xs tabular text-muted-foreground">{snap.tb2.decilesEUR.map((v) => f.num(v, 0)).join(" · ")}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
