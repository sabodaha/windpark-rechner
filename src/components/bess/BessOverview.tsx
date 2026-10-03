"use client";

import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { YearChart } from "@/components/charts/YearChart";
import { SERIES } from "@/components/charts/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { millions } from "./chartFormat";

/** Operating years only: the construction year has no flows to show. */
export const operatingYears = (core: BessCore) => core.result.annual.filter((a) => a.deliveredMWh > 0 || a.lifecycleCapexEur !== 0);

export function BessOverview({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const O = t.overview;
  const { inputs, result } = core;
  const k = result.kpis;
  const P = inputs.powerMW;
  const y29 = result.annual.find((a) => a.year === 2029);
  const perMw = (v: number) => f.eurCompact(v / P);
  const irr = k.investorIrr;
  const debt = k.debtEur?.value ?? 0;
  const years = operatingYears(core);
  const M = millions(f);
  // v1.1a: the reserve contract's 2029 lines and its yearly cash, when one runs (spec v1.1 §13)
  const bridge = result.contract && !result.contract.cancelled ? result.contract.bridge2029PerMW : null;
  const contractCash = years.some((a) => a.contractNetEur !== undefined);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{O.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-3xl flex-col gap-2 text-sm leading-relaxed text-foreground/85">
          {y29 && (
            <>
              <p>{O.revenue(perMw(y29.pfMarginEur), perMw(y29.netRevenueEur), f.pct(inputs.captureFactor, 0), f.pct(inputs.optimiserFeeRate, 0))}</p>
              {bridge && <p>{O.contract(f.eurCompact(bridge.capacity), f.eurCompact(bridge.net - bridge.daNet))}</p>}
              <p>{O.costs(perMw(y29.opexEur + y29.tariffsEur + y29.warExpectedEur), perMw(y29.ebitdaEur))}</p>
            </>
          )}
          <p>
            {debt > 0
              ? O.investment(f.meur(result.capexAllInEur, 1), perMw(result.capexAllInEur), f.meur(debt, 1), f.pct(k.gearing?.value ?? 0, 0), f.meur(k.equityEur?.value ?? 0, 1))
              : O.noLoan(f.meur(result.capexAllInEur, 1), perMw(result.capexAllInEur), f.meur(k.equityEur?.value ?? 0, 1))}
          </p>
          <p className="font-medium text-foreground">
            {irr?.status === "valid" && irr.value !== null ? O.result(f.pct(irr.value, 1), f.pct(inputs.equityHurdle, 0)) : O.resultNoIrr(f.pct(inputs.equityHurdle, 0))}
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
            years={years.map((a) => a.year)}
            bars={[
              { id: "net", label: O.netRevenue, color: SERIES[0]!, values: years.map((a) => M.m(a.netRevenueEur)) },
              ...(contractCash ? [{ id: "reserve", label: O.reserve, color: "var(--series-6)", values: years.map((a) => M.m(a.contractNetEur ?? 0)) }] : []),
              { id: "opex", label: O.opex, color: SERIES[1]!, values: years.map((a) => M.m(-a.opexEur)) },
              { id: "tariffs", label: O.tariffs, color: SERIES[2]!, values: years.map((a) => M.m(-a.tariffsEur)) },
              { id: "war", label: O.war, color: SERIES[3]!, values: years.map((a) => M.m(-a.warExpectedEur)) },
              { id: "life", label: O.lifecycle, color: SERIES[4]!, values: years.map((a) => M.m(-a.lifecycleCapexEur)) },
            ]}
            lines={[{ id: "cfads", label: O.cfads, color: "var(--chart-ink-2)", values: years.map((a) => M.m(a.cfadsEur)) }]}
            format={M.tip}
            axisFormat={M.axis}
            ariaLabel={O.chartTitle}
          />
        </CardContent>
      </Card>
    </div>
  );
}
