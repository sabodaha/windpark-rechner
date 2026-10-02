"use client";

import { ArrowRight, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { StatsFile } from "@/bess/data";
import { REVENUE, SPREAD_PATHS } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore, BessExtras } from "@/bess/view";
import { Card, CardContent } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { metricText } from "./BessKpis";

const HIGHLIGHT = ["fourHours", "high", "noWar", "favourable"] as const;

/**
 * The first answer of the page (decision D01): does day-ahead trading alone pay, and if not, how far off is it —
 * the spread multiplier at which the investor NPV turns zero, in euros per MWh of daily spread.
 */
export function WhatItTakes({
  core,
  extras,
  tb2,
  t,
  onAlternatives,
}: {
  core: BessCore;
  extras: BessExtras | null;
  /** Mean daily top-two spread of each price snapshot, € per MWh (2025 euros). */
  tb2: Record<string, number>;
  t: BessMessages;
  onAlternatives: () => void;
}) {
  const f = useFormat();
  const W = t.whatItTakes;
  const { inputs, result } = core;
  const npv = result.kpis.investorNpv?.value ?? null;
  const short = npv === null || npv < 0;
  const path = t.scenarioName[inputs.scenario] ?? inputs.scenario;
  const m2029 = SPREAD_PATHS[inputs.scenario][2029];
  const now = m2029 * (tb2[inputs.snapshot] ?? 0);
  const eur = (v: number) => `€${f.num(v, 0)}`;
  const be = extras?.breakEven ?? null;
  const times = (k: number) => `${f.num(k, 2)} times`;
  const variants = extras ? HIGHLIGHT.map((id) => extras.variants.find((v) => v.id === id)).filter((v) => v !== undefined) : [];

  return (
    <Card className={cn("border-l-4", short ? "border-l-critical" : "border-l-good")}>
      <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-base font-semibold">{W.title}</h2>
          <p className="flex items-start gap-1.5 text-sm font-medium">
            {short ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-good-text" aria-hidden />}
            {short ? W.short : W.enough}
          </p>
          <div className="text-sm leading-relaxed text-foreground/85" aria-live="polite">
            {be === null ? (
              <p className="text-muted-foreground">{W.calculating}</p>
            ) : be.status === "found" && be.value !== null ? (
              <>
                <p>{be.value >= 1 ? W.breakEven(times(be.value), path) : W.breakEvenBelow(times(be.value), path)}</p>
                {now > 0 && <p className="mt-1">{W.spreadIs(eur(be.value * now), eur(now))}</p>}
                <p className="mt-1 text-muted-foreground">{W.spreadContext(eur(tb2["UA-2025"] ?? 0), eur(REVENUE.neighbourTb2Eur2025))}</p>
              </>
            ) : be.status === "unsupportedBelow" ? (
              <p>{W.unsupportedBelow(times(be.supportedFrom ?? 0))}</p>
            ) : (
              <p>{W.notReached}</p>
            )}
          </div>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {W.notIncluded}
          </p>
        </div>
        {variants.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 lg:w-80 lg:shrink-0">
            <div className="text-xs font-medium text-muted-foreground">{W.alternatives}</div>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {variants.map((v) => {
                const irr = metricText(v.investorIrr, (x) => f.pct(x, 1), t, f);
                return (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 truncate">{t.sensitivity.variants[v.id]}</span>
                    <span className={cn("shrink-0 font-semibold tabular", (v.investorNpv ?? -1) >= 0 && "text-good-text")}>{irr.text}</span>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={onAlternatives} className="flex w-fit items-center gap-1 text-xs font-medium text-link hover:underline">
              {W.allAlternatives}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
