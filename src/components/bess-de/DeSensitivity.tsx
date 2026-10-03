"use client";

import { useEffect } from "react";
import type { DeMessages } from "@/bess/de/messages";
import type { DeCore, DeSensitivity as DeSensitivityResult } from "@/bess/de/view";
import { TornadoChart } from "@/components/charts/TornadoChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { deMetricText } from "./DeKpis";

/** The tornado on the locked funding and the variants with the loan sized again (spec §15). Asks for its run while open. */
export function DeSensitivity({ core, result, onShow, t }: { core: DeCore; result: DeSensitivityResult | null; onShow: (open: boolean) => void; t: DeMessages }) {
  const f = useFormat();
  const S = t.sensitivity;
  useEffect(() => {
    onShow(true);
    return () => onShow(false);
  }, [onShow]);
  if (!result) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{S.calculating}</CardContent>
      </Card>
    );
  }
  const { tornado, variants } = result;
  const noResult = tornado.bars.flatMap((b) =>
    [b.low, b.high]
      .filter((o) => o?.status)
      .map((o) => `${S.drivers[b.id]?.label ?? b.id}: ${S.statusShort[o!.status!] ?? o!.status}`),
  );
  const rows = tornado.bars.map((b) => ({
    label: S.drivers[b.id]?.label ?? b.id,
    lowLabel: S.drivers[b.id]?.low ?? "",
    highLabel: S.drivers[b.id]?.high ?? "",
    low: b.low?.npv ?? null,
    high: b.high?.npv ?? null,
  }));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{S.title}</CardTitle>
          <CardDescription>{S.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {tornado.base.npv !== null && (
            <TornadoChart rows={rows} base={tornado.base.npv} format={(v) => f.meur(v, 1)} lowName={S.low} highName={S.high} ariaLabel={S.title} />
          )}
          {noResult.length > 0 && <p className="text-xs text-muted-foreground">{S.noResult(noResult.join("; "))}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{S.variantsTitle}</CardTitle>
          <CardDescription>{S.variantsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">{S.variant}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{S.irr}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{S.npv}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{S.hurdle}</th>
                <th className="py-1.5 text-right font-medium">{S.debt}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border font-medium">
                <td className="py-1.5 pr-3">{S.current}</td>
                <td className="py-1.5 pr-3 text-right tabular">{deMetricText(core.kpis?.investorIrr, (v) => f.pct(v, 1), t, f).text}</td>
                <td className="py-1.5 pr-3 text-right tabular">{f.meur(core.kpis?.investorNpvEur?.value ?? null, 1)}</td>
                <td className="py-1.5 pr-3 text-right tabular">{f.pct(core.inputs.equityHurdle, 0)}</td>
                <td className="py-1.5 text-right tabular">{f.meur(core.kpis?.debtEur?.value ?? null, 1)}</td>
              </tr>
              {variants.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3">{S.variants[v.id] ?? v.id}</td>
                  {v.status ? (
                    <td colSpan={4} className="py-1.5 text-right text-muted-foreground">
                      {S.statusShort[v.status] ?? v.status}
                    </td>
                  ) : (
                    <>
                      <td className={cn("py-1.5 pr-3 text-right tabular", (v.investorNpv ?? -1) >= 0 && "text-good-text")}>
                        {deMetricText(v.investorIrr, (x) => f.pct(x, 1), t, f).text}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular">{f.meur(v.investorNpv, 1)}</td>
                      <td className="py-1.5 pr-3 text-right tabular">{f.pct(v.hurdle, 0)}</td>
                      <td className="py-1.5 text-right tabular">{f.meur(v.debtEur, 1)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
