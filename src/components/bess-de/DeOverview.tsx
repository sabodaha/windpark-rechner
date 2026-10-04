"use client";

import type { DeMessages } from "@/bess/de/messages";
import type { DeCore, DeYear } from "@/bess/de/view";
import { millions } from "@/components/bess/chartFormat";
import { YearChart } from "@/components/charts/YearChart";
import { SERIES } from "@/components/charts/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";

/** Years with flows to show: from commercial operation to the last settlement month. */
export const deOperatingYears = (core: DeCore): DeYear[] => core.years.filter((y) => y.revenueEur !== 0 || y.lifecycleEur !== 0 || y.dischargeMWh > 0);

const yearOf = (month: string) => month.slice(0, 4);

export function DeOverview({ core, t }: { core: DeCore; t: DeMessages }) {
  const f = useFormat();
  const O = t.overview;
  const { inputs } = core;
  const k = core.kpis!;
  const P = inputs.powerMW;
  const y29 = core.years.find((y) => y.year === 2029);
  const perMw = (v: number) => f.eurCompact(v / P);
  const irr = k.investorIrr!;
  const debt = k.debtEur?.value ?? 0;
  const capex = core.capex!;
  const equity = core.years.reduce((s, y) => s + y.equityEur, 0);
  const years = deOperatingYears(core);
  const M = millions(f);
  const toll = inputs.tollEnabled && inputs.tollShare > 0;
  const stack = inputs.stackEnabled === true;
  const cal = core.calendar!;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{O.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-3xl flex-col gap-2 text-sm leading-relaxed text-foreground/85">
          {y29 && (
            <>
              <p>
                {stack
                  ? toll
                    ? O.revenueStack(perMw(y29.tollEur), perMw(y29.marketEur), perMw(y29.revenueEur), f.pct(inputs.tollShare, 0), perMw(y29.dayAheadEur), perMw(y29.intradayEur), perMw(y29.afrrEur))
                    : O.revenueMerchantStack(perMw(y29.marketEur), perMw(y29.dayAheadEur), perMw(y29.intradayEur), perMw(y29.afrrEur))
                  : toll
                    ? O.revenue(perMw(y29.tollEur), perMw(y29.marketEur), perMw(y29.revenueEur), f.pct(inputs.tollShare, 0))
                    : O.revenueMerchant(perMw(y29.marketEur))}
              </p>
              <p>{O.costs(perMw(y29.opexEur), perMw(y29.ebitdaEur))}</p>
            </>
          )}
          <p>
            {debt > 0
              ? O.investment(f.meur(capex.totalEur, 1), `€${f.num(capex.perKw, 0)}`, f.meur(debt, 1), f.pct(k.gearing?.value ?? 0, 0), f.meur(equity, 1))
              : O.noLoan(f.meur(capex.totalEur, 1), `€${f.num(capex.perKw, 0)}`, f.meur(equity, 1))}
          </p>
          <p>{O.lifecycle(yearOf(cal.augmentation), yearOf(cal.pcsOverhaul))}</p>
          <p className="font-medium text-foreground">
            {irr.status === "unfunded" && core.firstDeficit
              ? O.unfunded(f.dateLabel(`${core.firstDeficit}-01`))
              : irr.status === "valid" && irr.value !== null
                ? O.result(f.pct(irr.value, 1), f.pct(inputs.equityHurdle, 0))
                : O.resultNoIrr(f.pct(inputs.equityHurdle, 0))}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{O.chartTitle}</CardTitle>
          <CardDescription>{O.chartNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years.map((y) => y.year)}
            bars={[
              ...(toll ? [{ id: "toll", label: O.toll, color: SERIES[0]!, values: years.map((y) => M.m(y.tollEur)) }] : []),
              { id: "market", label: stack ? O.marketStack : O.market, color: SERIES[1]!, values: years.map((y) => M.m(y.marketEur)) },
              { id: "opex", label: O.opex, color: SERIES[2]!, values: years.map((y) => M.m(-y.opexEur)) },
            ]}
            lines={[{ id: "cfads", label: O.cfads, color: "var(--chart-ink-2)", values: years.map((y) => M.m(y.cfadsEur)) }]}
            format={M.tip}
            axisFormat={M.axis}
            ariaLabel={O.chartTitle}
          />
        </CardContent>
      </Card>
    </div>
  );
}
