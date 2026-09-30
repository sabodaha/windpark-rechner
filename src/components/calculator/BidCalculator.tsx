"use client";

import { useEffect, useState } from "react";
import { runModel, solveAwardPrice, TENDER_FACTS, type BidResult, type Inputs } from "@/engine";
import { CurveChart } from "@/components/charts/CurveChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

interface Calc {
  bid: BidResult;
  curve: { x: number; y: number | null }[];
}

export function BidCalculator({ inputs, t }: { inputs: Inputs; t: Messages }) {
  const [targetText, setTargetText] = useState(num(inputs.macro.costOfEquity * 100, 1));
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
        curve.push({ x: c, y: runModel(copy).kpis.equityIrr });
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
    else setTargetText(num(target * 100, 1));
  };
  const above = calc?.bid.awardPriceCt !== null && calc?.bid.awardPriceCt !== undefined && calc.bid.awardPriceCt > TENDER_FACTS.ceiling2026Ct;

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
            {calc?.bid.awardPriceCt !== null && calc?.bid.awardPriceCt !== undefined ? (
              <div className="text-3xl font-semibold">
                {num(calc.bid.awardPriceCt, 2)} <span className="text-base font-normal text-muted-foreground">ct/kWh</span>
              </div>
            ) : (
              <div className="text-lg font-semibold">{calc ? B.notReachable : "…"}</div>
            )}
            {calc?.bid.awCt !== null && calc?.bid.awCt !== undefined && (
              <div className="text-xs text-muted-foreground">
                {num(calc.bid.awCt, 2)} ct/kWh {B.atSite}
              </div>
            )}
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">{B.lastRound}</dt>
            <dd className="tabular">{num(TENDER_FACTS.lastRoundAverageCt, 2)} ct/kWh</dd>
            <dt className="text-muted-foreground">{B.ceiling}</dt>
            <dd className="tabular">{num(TENDER_FACTS.ceiling2026Ct, 2)} ct/kWh</dd>
          </dl>
        </div>
        {above && <p className="text-sm text-critical">{B.aboveCeiling}</p>}
        {calc && (
          <div className={cn("transition-opacity", busy && "opacity-50")}>
            <div className="mb-1 text-xs font-medium text-muted-foreground">{B.curve}</div>
            <CurveChart
              points={calc.curve}
              xFormat={(v) => `${num(v, 1)} ct`}
              yFormat={(v) => pct(v, 0)}
              hLines={[{ label: `${B.target} ${pct(target, 1)}`, y: target }]}
              vLines={[
                { label: `${B.lastRound.split(",")[0]} ${num(TENDER_FACTS.lastRoundAverageCt, 2)}`, x: TENDER_FACTS.lastRoundAverageCt },
                { label: `${B.ceiling} ${num(TENDER_FACTS.ceiling2026Ct, 2)}`, x: TENDER_FACTS.ceiling2026Ct },
              ]}
              marker={calc.bid.awardPriceCt !== null && calc.bid.awardPriceCt <= 10 ? { x: calc.bid.awardPriceCt, y: calc.bid.equityIrr ?? target } : null}
              seriesLabel={t.kpis.equityIrr.label}
              ariaLabel={B.curve}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
