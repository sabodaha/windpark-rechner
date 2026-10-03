"use client";

import { useState } from "react";
import type { DeMessages } from "@/bess/de/messages";
import type { DeCore } from "@/bess/de/view";
import { millions } from "@/components/bess/chartFormat";
import { YearChart } from "@/components/charts/YearChart";
import { SERIES } from "@/components/charts/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
/** Payout dates shown before "show every date": the first ones with a reason worth reading. */
const FIRST = 8;

/** The loan by half-year against the lender's case, and the payouts to the owner with what limited each (spec §7–§8). */
export function DeDebt({ core, t }: { core: DeCore; t: DeMessages }) {
  const f = useFormat();
  const D = t.debt;
  const M = millions(f);
  const { inputs } = core;
  const [all, setAll] = useState(false);
  const rows = core.periods.filter((p) => p.debtServiceEur > 0.01);
  const hasDebt = rows.length > 0;
  const payouts = core.payouts.filter((p) => p.cappedBy !== "notYet" || p.paidEur > 0.01);
  const shown = all ? payouts : payouts.slice(0, FIRST);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{D.dscrTitle}</CardTitle>
          <CardDescription>{hasDebt ? D.dscrNote : D.noDebt}</CardDescription>
        </CardHeader>
        {hasDebt && (
          <CardContent>
            <YearChart
              years={rows.map((_p, i) => i)}
              labels={rows.map((p) => periodLabel(p.date))}
              bars={[{ id: "dscr", label: D.base, color: SERIES[0]!, values: rows.map((p) => p.dscr ?? 0) }]}
              lines={rows.some((p) => p.lenderDscr !== null) ? [{ id: "lender", label: D.lender, color: SERIES[1]!, values: rows.map((p) => p.lenderDscr) }] : []}
              refLines={[
                { label: D.lockup, value: inputs.lockupDscr, labelAt: "right-above" },
                { label: D.default, value: inputs.defaultDscr, labelAt: "left-below" },
              ]}
              format={(v) => f.ratio(v)}
              axisFormat={(v) => f.num(v, 1)}
              yMin={0}
              ariaLabel={D.dscrTitle}
            />
          </CardContent>
        )}
      </Card>
      {hasDebt && rows.some((p) => p.lenderBudgetEur !== null) && (
        <Card>
          <CardHeader>
            <CardTitle>{D.budgetTitle}</CardTitle>
            <CardDescription>{D.budgetNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <YearChart
              years={rows.map((_p, i) => i)}
              labels={rows.map((p) => periodLabel(p.date))}
              bars={[{ id: "service", label: D.service, color: SERIES[0]!, values: rows.map((p) => M.m(p.debtServiceEur)) }]}
              lines={[{ id: "budget", label: D.budget, color: SERIES[2]!, values: rows.map((p) => (p.lenderBudgetEur === null ? null : M.m(p.lenderBudgetEur))) }]}
              format={M.tip}
              axisFormat={M.axis}
              yMin={0}
              ariaLabel={D.budgetTitle}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{D.payoutsTitle}</CardTitle>
          <CardDescription>{D.payoutsNote}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{D.date}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{D.freeCash}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{D.holdback}</th>
                  <th className="py-1.5 pr-3 text-right font-medium">{D.paid}</th>
                  <th className="py-1.5 font-medium">{D.reason}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.date} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 tabular">{f.dateLabel(p.date)}</td>
                    <td className="py-1.5 pr-3 text-right tabular">{f.meur(p.freeCashEur, 2)}</td>
                    <td className="py-1.5 pr-3 text-right tabular">{p.forecastHoldbackEur > 0.01 ? f.meur(p.forecastHoldbackEur, 2) : "—"}</td>
                    <td className={cn("py-1.5 pr-3 text-right tabular", p.paidEur > 0.01 && "font-semibold")}>{p.paidEur > 0.01 ? f.meur(p.paidEur, 2) : "—"}</td>
                    <td className="py-1.5 text-muted-foreground">{D.cappedBy[p.cappedBy] ?? p.cappedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payouts.length > FIRST && (
            <button type="button" onClick={() => setAll((a) => !a)} className="w-fit text-xs font-medium text-link hover:underline">
              {all ? D.showLess : `${D.showAll} (${payouts.length})`}
            </button>
          )}
          {core.liquidationPayoutEur !== null && core.calendar && (
            <p className="text-sm">{D.liquidation(f.dateLabel(core.calendar.liquidation), f.meur(core.liquidationPayoutEur, 2))}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
