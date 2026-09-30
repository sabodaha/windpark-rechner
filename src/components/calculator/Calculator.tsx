"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BASE_CASE, DATA_AS_OF, type ScenarioName } from "@/engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateLabel } from "@/lib/format";
import { PATHS } from "@/lib/site";
import { en } from "@/messages/en";
import { Actions } from "./Actions";
import { BidCalculator } from "./BidCalculator";
import { ChecksList } from "./ChecksList";
import { InputsPanel } from "./InputsPanel";
import { KpiBar } from "./KpiBar";
import { Overview } from "./Overview";
import { ScenarioSwitch } from "./ScenarioSwitch";
import { Sensitivity } from "./Sensitivity";
import { useCalculator } from "./useCalculator";
import { cashFlowRows, debtRows, pnlRows, taxRows, YearTable } from "./YearTable";

const t = en;
type Tab = keyof typeof en.tabs;

export function Calculator() {
  const { inputs, results, pending, setField, reset, isCustom, restored } = useCalculator();
  const [scenario, setScenario] = useState<ScenarioName>("base");
  const [tab, setTab] = useState<Tab>("overview");
  const r = results[scenario];
  const years = r.annual.map((a) => a.year);
  const L = t.tables.rows;

  const panel = <InputsPanel inputs={inputs} base={BASE_CASE} onChange={setField} t={t} />;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.header.title}</h1>
          <Badge variant={isCustom ? "neutral" : "outline"}>{isCustom ? t.header.customInputs : t.header.baseCase}</Badge>
          {restored && <span className="text-xs text-muted-foreground">{t.header.restored}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{t.header.subtitle}</p>
        <p className="text-xs text-muted-foreground">
          {t.header.disclaimer} {t.header.dataAsOf} {dateLabel(DATA_AS_OF)}.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={PATHS.methodology} className="font-medium text-link hover:underline">
            {t.site.calculatorLinks.methodology} →
          </Link>
          <Link href={PATHS.sources} className="font-medium text-link hover:underline">
            {t.site.calculatorLinks.sources} →
          </Link>
        </p>
      </header>

      <div className="z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
        <KpiBar results={results} scenario={scenario} t={t} pending={pending} onChecks={() => setTab("checks")} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ScenarioSwitch value={scenario} onChange={setScenario} t={t} />
        <div className="flex flex-wrap items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" className="lg:hidden">
                <SlidersHorizontal aria-hidden />
                {t.actions.editInputs}
              </Button>
            </SheetTrigger>
            <SheetContent title={t.inputs.title}>
              <div className="overflow-y-auto px-4 pb-6">{panel}</div>
            </SheetContent>
          </Sheet>
          <Actions inputs={inputs} results={results} t={t} isCustom={isCustom} onReset={reset} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label={t.inputs.title}>
          <Card className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <CardContent className="pt-2">{panel}</CardContent>
          </Card>
        </aside>

        <section className="min-w-0" aria-label={t.site.resultsLabel}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              {(Object.keys(t.tabs) as Tab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {t.tabs[key]}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <Overview inputs={inputs} results={results} scenario={scenario} t={t} />
            </TabsContent>
            <TabsContent value="cashflow">
              <YearTable years={years} rows={cashFlowRows(r.annual, L)} caption={`${t.tabs.cashflow} · ${t.tables.unit}`} />
            </TabsContent>
            <TabsContent value="pnl">
              <YearTable years={years} rows={pnlRows(r.annual, L)} caption={`${t.tabs.pnl} · ${t.tables.unit}`} />
            </TabsContent>
            <TabsContent value="debt">
              <YearTable years={years} rows={debtRows(r.annual, L)} caption={`${t.tabs.debt} · ${t.tables.unit}`} />
            </TabsContent>
            <TabsContent value="tax">
              <YearTable years={years} rows={taxRows(r.annual, L)} caption={`${t.tabs.tax} · ${t.tables.unit}`} />
            </TabsContent>
            <TabsContent value="sensitivity">
              <Sensitivity inputs={inputs} t={t} />
            </TabsContent>
            <TabsContent value="bid">
              <BidCalculator inputs={inputs} t={t} />
            </TabsContent>
            <TabsContent value="checks">
              <ChecksList result={r} t={t} />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.footer.author} · {t.footer.sourcesNote}
      </p>
    </div>
  );
}
