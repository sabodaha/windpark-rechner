"use client";

import { CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { runModel, solveAwardPrice, TENDER_FACTS, type BidResult, type Inputs } from "@/engine";
import { CurveChart } from "@/components/charts/CurveChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";

interface Calc {
  bid: BidResult;
  curve: { x: number; y: number | null }[];
}

export function BidCalculator({ inputs, t }: { inputs: Inputs; t: Messages }) {
  const f = useFormat();
  const [targetText, setTargetText] = useState(f.num(inputs.macro.costOfEquity * 100, 1));
  const [target, setTarget] = useState(inputs.macro.costOfEquity);
  const [calc, setCalc] = useState<Calc | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    const id = window.setTimeout(() => {
      const bid = solveAwardPrice(inputs, target);
      const curve: Calc["curve"] = [];
      for (let c = 3; c <= 10.0001; c += 0.25) {
        const copy = structuredClone(inputs);
        copy.revenue.awardPriceCt = c;
        let y: number | null = null;
        try {
          const r = runModel(copy);
          y = r.validity.returnsMeaningful ? r.kpis.equityIrr : null;
        } catch {
          y = null;
        }
        curve.push({ x: c, y });
      }
      setCalc({ bid, curve });
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [inputs, target]);

  const B = t.bid;
  const commit = () => {
    const v = Number(targetText.replace(",", "."));
    if (Number.isFinite(v) && v > -50 && v < 100) setTarget(v / 100);
    else setTargetText(f.num(target * 100, 1));
  };
  const ceiling = inputs.revenue.ceilingPriceCt;
  const bid = calc?.bid;
  const shown = bid?.feasible ?? null;
  const targetOnly = bid?.target && bid.feasible && bid.target.awardPriceCt < bid.feasible.awardPriceCt - 1e-9 ? bid.target : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{B.title}</CardTitle>
        <CardDescription>{B.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{B.target}</span>
            <span className="flex h-9 w-32 items-center rounded-md border border-border bg-card focus-within:ring-2 focus-within:ring-ring">
              <input
                type="text"
                inputMode="decimal"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && commit()}
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-right tabular outline-none"
              />
              <span className="pr-2 text-xs text-muted-foreground">%</span>
            </span>
          </label>
          <div className={cn("transition-opacity", busy && "opacity-50")}>
            <div className="text-sm text-muted-foreground">{B.result}</div>
            {shown ? (
              <div className="text-3xl font-semibold">
                {f.num(shown.awardPriceCt, 2)} <span className="text-base font-normal text-muted-foreground">ct/kWh</span>
              </div>
            ) : (
              <div className="text-lg font-semibold">{calc ? (bid?.target ? B.notFinanceable : B.notReachable) : "…"}</div>
            )}
            {shown && Number.isFinite(shown.awCt) && (
              <div className="text-xs text-muted-foreground">
                {f.num(shown.awCt, 2)} ct/kWh {B.atSite}
              </div>
            )}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">{B.lastRound}</dt>
            <dd className="tabular">{f.num(TENDER_FACTS.lastRoundAverageCt, 2)} ct/kWh</dd>
            <dt className="text-muted-foreground">{B.ceiling}</dt>
            <dd className="tabular">{f.num(ceiling, 2)} ct/kWh</dd>
            {Math.abs(ceiling - TENDER_FACTS.ceiling2026Ct) > 1e-9 && (
              <>
                <dt className="text-muted-foreground">{B.ceiling2026}</dt>
                <dd className="tabular">{f.num(TENDER_FACTS.ceiling2026Ct, 2)} ct/kWh</dd>
              </>
            )}
          </dl>
        </div>

        {bid && (
          <ul className={cn("flex flex-col gap-1 text-sm transition-opacity", busy && "opacity-50")}>
            <Status ok={bid.target !== null} label={B.statusTarget} />
            <Status ok={bid.feasible !== null} label={B.statusFinanceable} />
            <Status ok={bid.admissible} label={bid.admissible === false ? B.aboveCeiling : B.statusAdmissible} />
          </ul>
        )}
        {targetOnly && <p className="text-sm text-muted-foreground">{B.targetOnly(`${f.num(targetOnly.awardPriceCt, 2)} ct/kWh`)}</p>}

        {calc && (
          <div className={cn("transition-opacity", busy && "opacity-50")}>
            <div className="mb-1 text-xs font-medium text-muted-foreground">{B.curve}</div>
            <CurveChart
              points={calc.curve}
              xFormat={(v) => `${f.num(v, 1)} ct`}
              yFormat={(v) => f.pct(v, 0)}
              hLines={[{ label: `${B.target} ${f.pct(target, 1)}`, y: target }]}
              vLines={[
                { label: `${B.lastRound.split(",")[0]} ${f.num(TENDER_FACTS.lastRoundAverageCt, 2)}`, x: TENDER_FACTS.lastRoundAverageCt },
                { label: `${B.ceiling} ${f.num(ceiling, 2)}`, x: ceiling },
              ]}
              marker={shown !== null && shown.awardPriceCt <= 10 ? { x: shown.awardPriceCt, y: shown.equityIrr ?? target } : null}
              seriesLabel={t.kpis.equityIrr.label}
              ariaLabel={B.curve}
            />
            <p className="mt-1 text-xs text-muted-foreground">{B.resolution}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Status({ ok, label }: { ok: boolean | null; label: string }) {
  const Icon = ok === null ? CircleMinus : ok ? CircleCheck : CircleAlert;
  return (
    <li className={cn("flex items-center gap-1.5", ok === false && "text-critical")}>
      <Icon className={cn("size-4 shrink-0", ok === true && "text-good-text", ok === null && "text-muted-foreground")} aria-hidden />
      {label}
    </li>
  );
}
