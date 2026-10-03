"use client";

import { useEffect } from "react";
import type { DeMessages } from "@/bess/de/messages";
import type { DeMetric } from "@/bess/de/types";
import type { DeCompare as DeCompareResult } from "@/bess/de/view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { deLcosText, deMetricText } from "./DeKpis";

/** Germany against Ukraine with the same battery (spec §11): fixed rows; the Ukrainian library loads with this tab. */
export function DeCompare({ result, onShow, t }: { result: DeCompareResult | null; onShow: (open: boolean) => void; t: DeMessages }) {
  const f = useFormat();
  const C = t.compare;
  useEffect(() => {
    onShow(true);
    return () => onShow(false);
  }, [onShow]);
  const rate = result ? f.pct(result.commonRate, 0) : "";
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{C.title}</CardTitle>
          <CardDescription>{result ? C.subtitle(rate) : C.calculating}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {result && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">{C.columns.row}</th>
                    <th className="py-1.5 pr-3 font-medium">{C.columns.revenue}</th>
                    <th className="py-1.5 pr-3 font-medium">{C.columns.financing}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{C.columns.irr}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{C.columns.npvCommon(rate)}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{C.columns.npvMarket}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{C.columns.lcos}</th>
                    <th className="py-1.5 pr-3 text-right font-medium">{C.columns.revenue2029}</th>
                    <th className="py-1.5 text-right font-medium">{C.columns.gearing}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const meta = C.rows[r.id]!;
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3 font-medium">{meta.name}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{meta.revenue}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{meta.financing}</td>
                        {r.status ? (
                          <td colSpan={6} className="py-1.5 text-right text-muted-foreground">
                            {t.sensitivity.statusShort[r.status] ?? r.status}
                          </td>
                        ) : (
                          <>
                            <td className="py-1.5 pr-3 text-right tabular">{deMetricText(r.investorIrr as DeMetric | null, (v) => f.pct(v, 1), t, f).text}</td>
                            <td className="py-1.5 pr-3 text-right tabular">{f.meur(r.npvCommonEur, 1)}</td>
                            <td className="py-1.5 pr-3 text-right tabular">
                              {f.meur(r.npvMarketEur, 1)} <span className="text-xs text-muted-foreground">@ {f.pct(r.marketHurdle, 0)}</span>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular">{deLcosText(r.lcosEurPerMWh, f)}</td>
                            <td className="py-1.5 pr-3 text-right tabular">{f.eurCompact(r.revenue2029PerMwEur)}</td>
                            <td className="py-1.5 text-right tabular">{r.gearing === null ? "—" : f.pct(r.gearing, 0)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{C.loadNote}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{C.differencesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {C.differences.map(([topic, text]) => (
              <div key={topic}>
                <dt className="font-medium">{topic}</dt>
                <dd className="text-foreground/85">{text}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
