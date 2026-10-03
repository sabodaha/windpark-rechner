"use client";

import { DE_TOLL_MARKET } from "@/bess/de/data";
import type { DeMessages } from "@/bess/de/messages";
import type { DeCore, DeExtras } from "@/bess/de/view";
import { CurveChart } from "@/components/charts/CurveChart";
import { YearChart } from "@/components/charts/YearChart";
import { SERIES } from "@/components/charts/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { deOperatingYears } from "./DeOverview";

/** The tolling contract (spec §3): its terms, the capacity it is held to, and the investor NPV across toll prices. */
export function DeToll({ core, extras, t }: { core: DeCore; extras: DeExtras | null; t: DeMessages }) {
  const f = useFormat();
  const T = t.toll;
  const { inputs } = core;
  const cal = core.calendar!;
  if (!(inputs.tollEnabled && inputs.tollShare > 0) || cal.tollFirst === null) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{T.noToll}</CardContent>
      </Card>
    );
  }
  const years = deOperatingYears(core).filter((y) => y.usableMWh !== null);
  const eur = (v: number) => `€${f.num(v, 0)}`;
  const month = (ym: string) => new Intl.DateTimeFormat(f.intl, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
  const s = extras?.tStar ?? null;
  const points = s ? s.candidates.map((c) => ({ x: c.price, y: c.supported ? c.npv : null })) : [];
  const k = (v: number) => `€${f.num(v / 1000, 0)}k`;
  const vLines = [
    { label: k(DE_TOLL_MARKET.lowEur), x: DE_TOLL_MARKET.lowEur },
    { label: k(DE_TOLL_MARKET.highEur), x: DE_TOLL_MARKET.highEur },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{T.termsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-3xl flex-col gap-2 text-sm leading-relaxed text-foreground/85">
          <p>{T.terms(eur(inputs.tollPrice), f.pct(inputs.tollShare, 0), inputs.tollMonths, month(cal.tollFirst), month(cal.tollLast!))}</p>
          <p className="text-muted-foreground">{T.guarantee}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{T.curveTitle}</CardTitle>
          <CardDescription>
            {T.curveNote} {T.marketBand}: {k(DE_TOLL_MARKET.lowEur)}–{k(DE_TOLL_MARKET.highEur)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {points.length > 0 ? (
            <CurveChart
              points={points}
              xFormat={k}
              yFormat={(v) => `${f.num(v / 1e6, Math.abs(v) < 1e7 ? 1 : 0)}m`}
              hLines={[{ label: "0", y: 0 }]}
              vLines={vLines}
              marker={s && s.outcome === "found" && s.value !== null ? { x: s.value, y: 0 } : null}
              seriesLabel={T.npv}
              ariaLabel={T.curveTitle}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t.breakEven.calculating}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{T.capacityTitle}</CardTitle>
          <CardDescription>{T.capacityNote}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years.map((y) => y.year)}
            lines={[
              { id: "usable", label: T.usable, color: SERIES[0]!, values: years.map((y) => y.usableMWh) },
              { id: "contract", label: T.contract, color: SERIES[2]!, values: years.map((y) => y.contractMWh) },
            ]}
            format={(v) => `${f.num(v, 1)} MWh`}
            yMin={0}
            ariaLabel={T.capacityTitle}
          />
        </CardContent>
      </Card>
    </div>
  );
}
