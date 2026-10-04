"use client";

import { Check, CircleAlert, Link2, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DE_DATA_AS_OF, DE_SPEC_REVISION, type DePriceStats } from "@/bess/de/data";
import { DE_FIELDS, DE_GROUPS } from "@/bess/de/fields";
import { deEn } from "@/bess/de/messages";
import { DE_BASE } from "@/bess/de/registry";
import { DE_SOURCES } from "@/bess/de/sources";
import type { DeInputs } from "@/bess/de/types";
import { InputsPanel } from "@/components/bess/BessInputs";
import { MarketSwitch } from "@/components/bess/MarketSwitch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat } from "@/components/site/LocaleProvider";
import { PATHS } from "@/lib/site";
import { DeBreakEven } from "./DeBreakEven";
import { DeChecks } from "./DeChecks";
import { DeCompare } from "./DeCompare";
import { DeDebt } from "./DeDebt";
import { DeKpis } from "./DeKpis";
import { DeOverview } from "./DeOverview";
import { DeRevenue } from "./DeRevenue";
import { DeSensitivity } from "./DeSensitivity";
import { DeTables } from "./DeTables";
import { DeToll } from "./DeToll";
import { type DeInitial, useDeCalculator } from "./useDeCalculator";

type Tab = keyof typeof deEn.tabs;

/** Tabs that still mean something when a case has no result: the comparison (fixed rows) and the checks behind it. */
const WITHOUT_RESULT: Tab[] = ["compare", "checks"];

interface Props {
  initial: DeInitial;
  /** Price statistics per snapshot (derived; de-stats). */
  stats: Record<string, DePriceStats>;
  libraryVersion: number;
}

export function DeCalculator({ initial, stats, libraryVersion }: Props) {
  const t = deEn;
  const f = useFormat();
  const calc = useDeCalculator(initial);
  const { core, inputs } = calc;
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  // a soft note once the price data is more than two months old (the static page cannot know today's date)
  const [oldData, setOldData] = useState(false);
  useEffect(() => setOldData(Date.now() - Date.parse(DE_DATA_AS_OF) > 61 * 86_400_000), []);
  // a tab named in the address opens on arrival (the Ukrainian page links to #compare)
  useEffect(() => {
    const named = window.location.hash.slice(1);
    if (named in t.tabs) setTab(named as Tab);
  }, [t.tabs]);
  const onSensitivity = useCallback((open: boolean) => calc.requestSensitivity(open), [calc.requestSensitivity]);
  const onCompare = useCallback((open: boolean) => calc.requestCompare(open), [calc.requestCompare]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: the address bar carries the same inputs
    }
  };

  const panel = (
    <InputsPanel<DeInputs> inputs={inputs} base={DE_BASE} onChange={calc.setField} t={t} fields={DE_FIELDS} groups={DE_GROUPS} sources={DE_SOURCES} />
  );
  const shown = core.inputs;
  const blocked = core.status.primary !== "ok" || !core.kpis;
  const results = useRef<HTMLElement>(null);
  const openToll = () => {
    setTab("toll");
    results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.header.title}</h1>
          <MarketSwitch current="germany" ukraine={t.header.ukraine} germany={t.header.germany} label={t.header.switchLabel} />
          <Badge variant={calc.isCustom ? "neutral" : "outline"}>{calc.isCustom ? t.header.customInputs : t.header.baseCase}</Badge>
          {calc.restored && <span className="text-xs text-muted-foreground">{t.header.restored}</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          {t.header.subtitle(shown.powerMW, shown.powerMW * shown.durationHours, shown.durationHours, shown.tollEnabled && shown.tollShare > 0, shown.stackEnabled === true)}
        </p>
        {calc.legacy && (
          <p role="status" className="w-fit max-w-3xl rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            {t.header.legacy}
          </p>
        )}
        {calc.ignored.length > 0 && (
          <p role="status" className="w-fit rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            {t.header.ignored(calc.ignored.join(", "))}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t.header.disclaimer} {t.header.dataAsOf} {f.dateLabel(DE_DATA_AS_OF)}.
          {oldData && <span className="text-warning"> {t.header.oldData}</span>}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={PATHS.bessDeMethodology} className="font-medium text-link hover:underline">
            {t.header.methodology} →
          </Link>
          <Link href={PATHS.bessDeSources} className="font-medium text-link hover:underline">
            {t.header.sources} →
          </Link>
        </p>
      </header>

      <div className="z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
        <DeKpis core={core} t={t} pending={calc.pending} onChecks={() => setTab("checks")} />
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

      <DeBreakEven core={core} extras={calc.extras} paths={calc.paths} t={t} onDetails={openToll} />

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

        <section ref={results} className="min-w-0 scroll-mt-28" aria-label={t.resultsLabel}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              {(Object.keys(t.tabs) as Tab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {t.tabs[key]}
                </TabsTrigger>
              ))}
            </TabsList>
            {blocked && !WITHOUT_RESULT.includes(tab) && (
              <Card className="mt-4 border-l-4 border-l-critical">
                <CardContent className="flex flex-col gap-1 py-4 text-sm">
                  <div className="font-semibold">{t.caseStatus.title[core.status.primary] ?? core.status.primary}</div>
                  <p className="text-muted-foreground">{t.caseStatus.text[core.status.primary] ?? ""}</p>
                </CardContent>
              </Card>
            )}
            <TabsContent value="overview">{!blocked && <DeOverview core={core} t={t} />}</TabsContent>
            <TabsContent value="revenue">{!blocked && <DeRevenue core={core} stats={stats} t={t} />}</TabsContent>
            <TabsContent value="toll">{!blocked && <DeToll core={core} extras={calc.extras} t={t} />}</TabsContent>
            <TabsContent value="debt">{!blocked && <DeDebt core={core} t={t} />}</TabsContent>
            <TabsContent value="sensitivity">{!blocked && <DeSensitivity core={core} result={calc.sensitivity} onShow={onSensitivity} t={t} />}</TabsContent>
            <TabsContent value="compare">
              <DeCompare result={calc.compare} onShow={onCompare} t={t} stack={shown.stackEnabled === true} />
            </TabsContent>
            <TabsContent value="checks">
              <DeChecks core={core} t={t} />
            </TabsContent>
            <TabsContent value="tables">{!blocked && <DeTables core={core} t={t} />}</TabsContent>
          </Tabs>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.footer.author} · {t.footer.data} · <span className="tabular">{t.footer.version(DE_SPEC_REVISION, String(libraryVersion))}</span>
      </p>
    </div>
  );
}
