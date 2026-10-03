"use client";

import { useEffect, useState } from "react";
import type { Metric } from "@/bess/engine";
import type { DriverOutcome } from "@/bess/engine/sensitivity";
import type { BessMessages } from "@/bess/messages";
import type { BessCore, BessExtras, BessTornado } from "@/bess/view";
import { TornadoChart } from "@/components/charts/TornadoChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup } from "@/components/ui/radio-group";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { metricText } from "./BessKpis";

type Measure = "npv" | "irr";

const valueOf = (o: DriverOutcome | null, m: Measure): number | null => {
  if (!o) return null;
  if (m === "npv") return o.npv === null ? null : o.npv / 1e6;
  return o.irr.status === "valid" ? o.irr.value : null;
};

export function BessSensitivity({
  core,
  extras,
  tornado,
  onShow,
  t,
}: {
  core: BessCore;
  extras: BessExtras | null;
  tornado: BessTornado | null;
  /** Asks for the tornado while this tab is open. */
  onShow: (open: boolean) => void;
  t: BessMessages;
}) {
  const f = useFormat();
  const S = t.sensitivity;
  const [measure, setMeasure] = useState<Measure>("npv");
  useEffect(() => {
    onShow(true);
    return () => onShow(false);
  }, [onShow]);
  const fmt = (v: number) => (measure === "npv" ? f.meur(v * 1e6, 1) : f.pct(v, 1));
  const base = tornado ? valueOf(tornado.base, measure) : null;
  const irr = (m: Metric) => metricText(m, (v) => f.pct(v, 1), t, f).text;
  // contract settings the battery cannot hold are named with their status, not drawn (spec v1.1 §15)
  const noResult = (tornado?.bars ?? []).flatMap((b) =>
    (["low", "high"] as const)
      .filter((side) => b[side]?.status)
      .map((side) => `${S.drivers[b.id]?.label ?? b.id} ${S.drivers[b.id]?.[side] ?? ""} — ${S.statusShort[b[side]!.status!] ?? b[side]!.status}`),
  );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{S.title}</CardTitle>
            <CardDescription>{S.subtitle}</CardDescription>
          </div>
          <RadioGroup
            value={measure}
            options={["npv", "irr"] as Measure[]}
            onChange={setMeasure}
            label={S.metric}
            className="inline-flex w-fit shrink-0 flex-wrap rounded-lg border border-border p-0.5"
            optionClassName={(checked) => cn("rounded-md px-2.5 py-1 text-xs", checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            render={(m) => S.metrics[m]}
          />
        </CardHeader>
        <CardContent>
          {!tornado || base === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{tornado ? t.kpis.statusHint.notDefined : S.calculating}</p>
          ) : (
            <TornadoChart
              rows={tornado.bars.filter((b) => !(b.high.status && (b.low === null || b.low.status))).map((b) => ({
                label: S.drivers[b.id]?.label ?? b.id,
                lowLabel: S.drivers[b.id]?.low ?? "",
                highLabel: S.drivers[b.id]?.high ?? "",
                low: valueOf(b.low, measure),
                high: valueOf(b.high, measure),
              }))}
              base={base}
              format={fmt}
              lowName={S.low}
              highName={S.high}
              ariaLabel={S.title}
            />
          )}
          {noResult.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{S.noResult(noResult.join("; "))}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{S.variantsTitle}</CardTitle>
          <CardDescription>{S.variantsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {!extras ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{S.calculating}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm tabular">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 text-left font-medium">{S.variant}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{S.irr}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{S.npv}</th>
                    <th className="py-1.5 pl-2 text-right font-medium">{S.debt}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border font-medium">
                    <td className="py-1.5 pr-3">{S.current}</td>
                    <td className="px-2 py-1.5 text-right">{irr(core.result.kpis.investorIrr!)}</td>
                    <td className="px-2 py-1.5 text-right">{f.meur(core.result.kpis.investorNpv?.value ?? null, 1)}</td>
                    <td className="py-1.5 pl-2 text-right">{f.meur(core.result.kpis.debtEur?.value ?? null, 1)}</td>
                  </tr>
                  {extras.variants.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-3">{S.variants[v.id] ?? v.id}</td>
                      <td className={cn("px-2 py-1.5 text-right", (v.investorNpv ?? -1) >= 0 && "font-semibold text-good-text")}>
                        {v.status ? S.statusShort[v.status] ?? v.status : irr(v.investorIrr)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{f.meur(v.investorNpv, 1)}</td>
                      <td className="py-1.5 pl-2 text-right">{f.meur(v.debtEur, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
