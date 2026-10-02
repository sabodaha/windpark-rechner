"use client";

import { Check, CircleAlert, Link2, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BESS_DATA_AS_OF, BESS_SPEC_REVISION, type PriceStats } from "@/bess/data";
import { BESS_BASE } from "@/bess/engine";
import { bessEn } from "@/bess/messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat } from "@/components/site/LocaleProvider";
import { PATHS } from "@/lib/site";
import { BessBattery } from "./BessBattery";
import { BessChecks } from "./BessChecks";
import { BessDebt } from "./BessDebt";
import { BessInputsPanel } from "./BessInputs";
import { BessKpis } from "./BessKpis";
import { BessOverview } from "./BessOverview";
import { BessRevenue } from "./BessRevenue";
import { BessRisks } from "./BessRisks";
import { BessSensitivity } from "./BessSensitivity";
import { BessTable } from "./BessTable";
import { type BessInitial, useBessCalculator } from "./useBessCalculator";
import { WhatItTakes } from "./WhatItTakes";

type Tab = keyof typeof bessEn.tabs;

interface Props {
  initial: BessInitial;
  /** Price statistics per snapshot (derived; ua-stats). */
  stats: Record<string, PriceStats>;
  libraryVersion: number;
}

export function BessCalculator({ initial, stats, libraryVersion }: Props) {
  const t = bessEn;
  const f = useFormat();
  const calc = useBessCalculator(initial);
  const { core, inputs } = calc;
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  // a soft note once the price data is more than two months old (the static page cannot know today's date)
  const [oldData, setOldData] = useState(false);
  useEffect(() => setOldData(Date.now() - Date.parse(BESS_DATA_AS_OF) > 61 * 86_400_000), []);
  const tb2 = Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, s.tb2.meanEUR]));
  const onTornado = useCallback((open: boolean) => calc.requestTornado(open), [calc.requestTornado]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: the address bar carries the same inputs
    }
  };

  const panel = <BessInputsPanel inputs={inputs} base={BESS_BASE} onChange={calc.setField} t={t} />;
  const shownInputs = core.inputs;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.header.title}</h1>
          <Badge variant="outline" title={t.header.marketNext}>
            {t.header.market}
          </Badge>
          <Badge variant={calc.isCustom ? "neutral" : "outline"}>{calc.isCustom ? t.header.customInputs : t.header.baseCase}</Badge>
          {calc.restored && <span className="text-xs text-muted-foreground">{t.header.restored}</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          {t.header.subtitle(shownInputs.powerMW, shownInputs.powerMW * shownInputs.durationH, shownInputs.durationH)}
        </p>
        {calc.ignored.length > 0 && (
          <p role="status" className="w-fit rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            {t.header.ignored(calc.ignored.join(", "))}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t.header.disclaimer} {t.header.dataAsOf} {f.dateLabel(BESS_DATA_AS_OF)}.
          {oldData && <span className="text-warning"> {t.header.oldData}</span>}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={PATHS.bessMethodology} className="font-medium text-link hover:underline">
            {t.header.methodology} →
          </Link>
          <Link href={PATHS.bessSources} className="font-medium text-link hover:underline">
            {t.header.sources} →
          </Link>
        </p>
      </header>

      <div className="z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
        <BessKpis core={core} t={t} pending={calc.pending} onChecks={() => setTab("checks")} />
      </div>

      {calc.error && (
        <Card role="alert">
          <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
            <CircleAlert className="size-4 text-critical" aria-hidden />
            <span className="font-medium">{t.states.error}.</span>
            <span className="text-muted-foreground">{t.states.errorText}</span>
            <Button size="sm" variant="outline" onClick={calc.retry}>
              {t.states.retry}
            </Button>
          </CardContent>
        </Card>
      )}

      <WhatItTakes core={core} extras={calc.extras} tb2={tb2} t={t} onAlternatives={() => setTab("sensitivity")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" className="lg:hidden">
                <SlidersHorizontal aria-hidden />
                {t.actions.editInputs}
              </Button>
            </SheetTrigger>
            <SheetContent title={t.inputs.title} closeLabel={t.actions.closePanel}>
              <div className="overflow-y-auto px-4 pb-6">{panel}</div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
            {copied ? t.actions.copied : t.actions.copyLink}
          </Button>
          {calc.isCustom && (
            <Button variant="ghost" size="sm" onClick={calc.reset}>
              <RotateCcw aria-hidden />
              {t.actions.reset}
            </Button>
          )}
          <label className="flex h-8 cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground" title={t.actions.rememberHint}>
            <input
              type="checkbox"
              checked={calc.remember}
              onChange={(e) => calc.setRemember(e.target.checked)}
              className="size-3.5 cursor-pointer accent-[var(--primary)]"
            />
            {t.actions.remember}
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label={t.inputs.title}>
          <Card className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <CardContent className="pt-2">{panel}</CardContent>
          </Card>
        </aside>

        <section className="min-w-0" aria-label={t.resultsLabel}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              {(Object.keys(t.tabs) as Tab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {t.tabs[key]}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <BessOverview core={core} t={t} />
            </TabsContent>
            <TabsContent value="revenue">
              <BessRevenue core={core} stats={stats} t={t} />
            </TabsContent>
            <TabsContent value="battery">
              <BessBattery core={core} t={t} />
            </TabsContent>
            <TabsContent value="debt">
              <BessDebt core={core} t={t} />
            </TabsContent>
            <TabsContent value="risks">
              <BessRisks core={core} t={t} />
            </TabsContent>
            <TabsContent value="sensitivity">
              <BessSensitivity core={core} extras={calc.extras} tornado={calc.tornado} onShow={onTornado} t={t} />
            </TabsContent>
            <TabsContent value="checks">
              <BessChecks core={core} t={t} />
            </TabsContent>
            <TabsContent value="tables">
              <BessTable core={core} t={t} />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.footer.author} · {t.footer.data} · <span className="tabular">{t.footer.version(BESS_SPEC_REVISION, String(libraryVersion))}</span>
      </p>
    </div>
  );
}
