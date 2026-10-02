"use client";

import { MACRO, WAR } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { millions } from "./chartFormat";
import { operatingYears } from "./BessOverview";

export function BessRisks({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const R = t.risks;
  const M = millions(f);
  const { inputs, result } = core;
  const years = operatingYears(core);
  const cohortLost = result.checks.find((c) => c.id === "cohortLost")?.status === "warning";
  const expectedLoss = WAR.marketPremium * inputs.lossRatio;
  const outage = (expectedLoss / WAR.severity) * (WAR.downtimeMonths / 12);
  const fx2029 = MACRO.fxEurUah[2029]! * (inputs.fxStress ? 1 + MACRO.fxStress : 1);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{R.tariffTitle}</CardTitle>
          <CardDescription>{R.tariffText}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm font-medium">{R.tariffNow(cohortLost)}</p>
          <YearChart
            years={years.map((a) => a.year)}
            bars={[{ id: "tariffs", label: t.overview.tariffs, color: SERIES[2]!, values: years.map((a) => M.m(a.tariffsEur)) }]}
            format={M.tip}
            axisFormat={M.axis}
            height={180}
            ariaLabel={R.tariffTitle}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{R.warTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-3xl flex-col gap-1.5 text-sm leading-relaxed text-foreground/85">
          <p>{inputs.insurance ? R.warInsured : R.warExpected(f.pct(expectedLoss, 1))}</p>
          <p>{R.outage(f.pct(outage, 1))}</p>
          <p className="text-muted-foreground">{R.warNote}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{R.cashTitle}</CardTitle>
          <CardDescription>{R.cashText}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm font-medium">{R.trapped(f.meur(result.kpis.trappedCashMaxEur?.value ?? 0, 1))}</p>
          <YearChart
            years={years.map((a) => a.year)}
            bars={[{ id: "paid", label: R.transferred, color: SERIES[0]!, values: years.map((a) => M.m(a.investorNetEur)) }]}
            lines={[{ id: "cash", label: R.inCompany, color: SERIES[1]!, values: years.map((a) => M.m(a.cashInSpvEur)) }]}
            format={M.tip}
            axisFormat={M.axis}
            ariaLabel={R.cashTitle}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{R.fxTitle}</CardTitle>
        </CardHeader>
        <CardContent className="max-w-3xl text-sm leading-relaxed text-foreground/85">
          <p>{R.fxText(f.num(fx2029, 1), inputs.fxStress)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
