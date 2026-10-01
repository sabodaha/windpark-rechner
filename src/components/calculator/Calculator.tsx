"use client";

import { CircleAlert, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BASE_CASE, DATA_AS_OF, type InputIssue, type ScenarioName } from "@/engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat, useLocale, useMessages } from "@/components/site/LocaleProvider";
import { paths } from "@/lib/site";
import type { Messages } from "@/messages";
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

type Tab = keyof Messages["tabs"];

export function Calculator() {
  const t = useMessages();
  const f = useFormat();
  const P = paths(useLocale());
  const { inputs, snapshot, pending, setField, reset, isCustom, restored, ignored, remember, setRemember } = useCalculator();
  const [scenario, setScenario] = useState<ScenarioName>("base");
  const [tab, setTab] = useState<Tab>("overview");
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
        <p className="text-sm text-muted-foreground">{t.header.subtitle(inputs.project.turbines, Number(inputs.project.turbineMw.toFixed(2)))}</p>
        {ignored.length > 0 && (
          <p role="status" className="w-fit rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
            {t.header.ignored(ignored.join(", "))}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t.header.disclaimer} {t.header.dataAsOf} {f.dateLabel(DATA_AS_OF)}.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={P.methodology} className="font-medium text-link hover:underline">
            {t.site.calculatorLinks.methodology} →
          </Link>
          <Link href={P.sources} className="font-medium text-link hover:underline">
            {t.site.calculatorLinks.sources} →
          </Link>
        </p>
      </header>

      {snapshot.results && (
        <div className="z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
          <KpiBar results={snapshot.results} inputs={snapshot.inputs} scenario={scenario} t={t} pending={pending} onChecks={() => setTab("checks")} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {snapshot.results ? <ScenarioSwitch value={scenario} onChange={setScenario} t={t} /> : <span />}
        <div className="flex flex-wrap items-center gap-2">
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
          <Actions snapshot={snapshot} pending={pending} t={t} isCustom={isCustom} onReset={reset} remember={remember} onRemember={setRemember} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label={t.inputs.title}>
          <Card className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <CardContent className="pt-2">{panel}</CardContent>
          </Card>
        </aside>

        <section className="min-w-0" aria-label={t.site.resultsLabel}>
          {snapshot.results === null ? (
            <InvalidInputs issues={snapshot.issues} onReset={reset} t={t} />
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList>
                {(Object.keys(t.tabs) as Tab[]).map((key) => (
                  <TabsTrigger key={key} value={key}>
                    {t.tabs[key]}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="overview">
                <Overview inputs={snapshot.inputs} results={snapshot.results} scenario={scenario} t={t} />
              </TabsContent>
              <TabsContent value="cashflow">
                <YearTable
                  years={snapshot.results[scenario].annual.map((a) => a.year)}
                  rows={cashFlowRows(snapshot.results[scenario].annual, L, f)}
                  caption={`${t.tabs.cashflow} · ${t.tables.unit}`}
                  note={t.tables.distributionNote}
                />
              </TabsContent>
              <TabsContent value="pnl">
                <YearTable
                  years={snapshot.results[scenario].annual.map((a) => a.year)}
                  rows={pnlRows(snapshot.results[scenario].annual, L, f)}
                  caption={`${t.tabs.pnl} · ${t.tables.unit}`}
                />
              </TabsContent>
              <TabsContent value="debt">
                <YearTable
                  years={snapshot.results[scenario].annual.map((a) => a.year)}
                  rows={debtRows(snapshot.results[scenario].annual, L, f)}
                  caption={`${t.tabs.debt} · ${t.tables.unit}`}
                />
              </TabsContent>
              <TabsContent value="tax">
                <YearTable
                  years={snapshot.results[scenario].annual.map((a) => a.year)}
                  rows={taxRows(snapshot.results[scenario].annual, L, f)}
                  caption={`${t.tabs.tax} · ${t.tables.unit}`}
                />
              </TabsContent>
              <TabsContent value="sensitivity">
                <Sensitivity inputs={snapshot.inputs} t={t} />
              </TabsContent>
              <TabsContent value="bid">
                <BidCalculator inputs={snapshot.inputs} t={t} />
              </TabsContent>
              <TabsContent value="checks">
                <ChecksList result={snapshot.results[scenario]} t={t} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.footer.author} · {t.footer.sourcesNote} ·{" "}
        <span className="tabular">{t.footer.version(snapshot.engineVersion, snapshot.inputHash)}</span>
      </p>
    </div>
  );
}

/** Engine paths of the inputs that cross-field rules refer to, and the fields that edit them. */
const PATH_FIELD: Record<string, string> = {
  "project.financialClose": "fc",
  "project.constructionMonths": "construction",
  "financing.graceYears": "grace",
  "financing.tenorYearsFromClose": "tenor",
  "revenue.awardNoticeDate": "awardNotice",
};

/** Shown instead of the results when the inputs cannot be calculated (e.g. from an edited link). */
function InvalidInputs({ issues, onReset, t }: { issues: InputIssue[]; onReset: () => void; t: Messages }) {
  return (
    <Card role="alert">
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center gap-2 font-semibold text-critical">
          <CircleAlert className="size-5" aria-hidden />
          {t.invalid.title}
        </div>
        <p className="text-sm text-muted-foreground">{t.invalid.intro}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {issues.map((i) => (
            <li key={`${i.path}:${i.message}`}>
              {i.path && <span className="font-medium">{t.fields[PATH_FIELD[i.path] ?? ""]?.label ?? i.path}:</span>}{" "}
              {t.invalid.issue[i.code](i)}
            </li>
          ))}
        </ul>
        <div>
          <Button size="sm" variant="outline" onClick={onReset}>
            <RotateCcw aria-hidden />
            {t.invalid.reset}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
