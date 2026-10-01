"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { useEffect, useState } from "react";
import { tornado, TORNADO_DRIVERS, type Inputs, type TornadoBar, type TornadoMetric } from "@/engine";
import { TornadoChart } from "@/components/charts/TornadoChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMetric, settingLabel } from "@/lib/tornado";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";

const METRICS: TornadoMetric[] = ["equityIrr", "projectIrrPostTax", "minDscr", "lcoeRealCt"];


const SETTINGS = new Map(TORNADO_DRIVERS.map((d) => [d.id, d.setting]));

export function Sensitivity({ inputs, t }: { inputs: Inputs; t: Messages }) {
  const f = useFormat();
  const [metric, setMetric] = useState<TornadoMetric>("equityIrr");
  const [bars, setBars] = useState<TornadoBar[] | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    // Let the tab paint first; the 25 model runs take well under a second.
    const id = window.setTimeout(() => {
      setBars(tornado(inputs, metric));
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [inputs, metric]);

  const S = t.sensitivity;
  const base = bars?.[0]?.base ?? null;
  const label = (b: TornadoBar, side: "low" | "high") => {
    const s = SETTINGS.get(b.id);
    return s ? settingLabel(s, side, f, S.units) : side === "low" ? b.lowLabel : b.highLabel;
  };
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{S.title}</CardTitle>
          <CardDescription>{S.subtitle}</CardDescription>
        </div>
        <RadioGroup
          value={metric}
          options={METRICS}
          onChange={setMetric}
          label={S.metric}
          className="inline-flex w-fit flex-wrap rounded-lg border border-border p-0.5"
          optionClassName={(checked) => cn("rounded-md px-2.5 py-1 text-xs", checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          render={(m) => S.metrics[m]}
        />
      </CardHeader>
      <CardContent className={cn("transition-opacity", busy && "opacity-50")}>
        {!bars ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{S.calculating}</p>
        ) : base === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{S.notMeaningful}</p>
        ) : (
          <>
            <TornadoChart
              rows={bars.map((b) => ({ label: S.drivers[b.id] ?? b.id, lowLabel: label(b, "low"), highLabel: label(b, "high"), low: b.low, high: b.high }))}
              base={base}
              format={(v) => formatMetric(metric, v, f)}
              lowName={S.low}
              highName={S.high}
              ariaLabel={`${S.title}: ${S.metrics[metric]}`}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {S.base}: {formatMetric(metric, base, f)}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-xs tabular">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-1 text-left font-medium" />
                    <th className="py-1 text-right font-medium">{S.low}</th>
                    <th className="py-1 text-right font-medium">{S.metrics[metric]}</th>
                    <th className="py-1 text-right font-medium">{S.high}</th>
                    <th className="py-1 text-right font-medium">{S.metrics[metric]}</th>
                  </tr>
                </thead>
                <tbody>
                  {bars.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0">
                      <td className="py-1">{S.drivers[b.id] ?? b.id}</td>
                      <td className="py-1 text-right text-muted-foreground">{label(b, "low")}</td>
                      <td className="py-1 text-right">{b.low === null ? "—" : formatMetric(metric, b.low, f)}</td>
                      <td className="py-1 text-right text-muted-foreground">{label(b, "high")}</td>
                      <td className="py-1 text-right">{b.high === null ? "—" : formatMetric(metric, b.high, f)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
