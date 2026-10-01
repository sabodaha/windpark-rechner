"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BASE_CASE, InvalidInputsError, runScenarios, type Inputs, type ModelResult, type ScenarioName } from "@/engine";
import { modelExtras, type ModelExtras } from "@/lib/extras";
import { PATHS } from "@/lib/site";
import { decodeInputs, encodeInputs, ignoredParams } from "@/lib/url-state";
import { en } from "@/messages/en";
import { buildReportData } from "./data";
import { SLIDE_W } from "./parts";
import { Report } from "./Report";

type State =
  | { kind: "ready"; inputs: Inputs; results: Record<ScenarioName, ModelResult>; extras: ModelExtras; isBase: boolean }
  | { kind: "calculating" }
  | { kind: "error"; message: string };

/**
 * The report page. The static HTML (and the published PDF) show the base case; inputs in the URL — the calculator's
 * query — are calculated after loading, and the browser's print dialog saves them as a PDF.
 */
export function ReportView({ baseExtras }: { baseExtras: ModelExtras }) {
  const baseResults = useMemo(() => runScenarios(BASE_CASE), []);
  const [state, setState] = useState<State>({ kind: "ready", inputs: BASE_CASE, results: baseResults, extras: baseExtras, isBase: true });
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const T = en.report;

  useEffect(() => {
    const raw = window.location.search.slice(1);
    if (!raw) return;
    const inputs = decodeInputs(raw, BASE_CASE);
    if (!inputs) {
      setNotice(T.invalidLink);
      return;
    }
    const ignored = ignoredParams(raw);
    if (ignored.length) setNotice(en.header.ignored(ignored.join(", ")));
    const q = encodeInputs(inputs, BASE_CASE);
    if (!q) return;
    setQuery(q);
    setState({ kind: "calculating" });
    // Let the page paint first: the scenarios, tornado and bid calculator take a second or two.
    const id = window.setTimeout(() => {
      try {
        setState({ kind: "ready", inputs, results: runScenarios(inputs), extras: modelExtras(inputs), isBase: false });
      } catch (e) {
        const message = e instanceof InvalidInputsError ? e.issues.map((x) => x.message).join(" ") : e instanceof Error ? e.message : String(e);
        setState({ kind: "error", message });
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [T.invalidLink]);

  const data = useMemo(
    () => (state.kind === "ready" ? buildReportData(state.inputs, state.results, state.extras, state.isBase) : null),
    [state],
  );

  // On screen the slides shrink to fit the window; print always uses the full 1280 × 720 px.
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setZoom(Math.min(1, w / SLIDE_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const back = `${PATHS.calculator}${query ? `?${query}` : ""}`;
  return (
    <div className="report-root">
      <div className="no-print mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-4 pb-2 pt-6 sm:px-6">
        <p className="text-sm font-medium text-muted-foreground">
          <Link href={back} className="hover:underline">
            {en.meta.title}
          </Link>{" "}
          · {T.name}
        </p>
        <p className="text-2xl font-semibold tracking-tight">
          {T.heading} — {state.kind === "ready" && !state.isBase ? T.custom : T.base}
        </p>
        <p className="text-sm text-muted-foreground">{en.header.disclaimer}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => window.print()} disabled={state.kind !== "ready"}>
            <Printer aria-hidden />
            {T.print}
          </Button>
          {(state.kind !== "ready" || state.isBase) && (
            <Button asChild variant="outline" size="sm">
              <a href={PATHS.reportPdf} download>
                <Download aria-hidden />
                {T.download}
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href={back}>
              <ArrowLeft aria-hidden />
              {T.back}
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{T.hint}</p>
        {notice && <p className="rounded-md border border-border bg-card px-3 py-2 text-sm">{notice}</p>}
      </div>
      <div ref={frame} className="report-frame mx-auto w-full max-w-[1280px] px-4 pb-10 sm:px-6">
        {state.kind === "calculating" && <p className="py-16 text-center text-muted-foreground">{T.calculating}</p>}
        {state.kind === "error" && (
          <div className="rounded-lg border border-border bg-card p-6">
            <p className="font-semibold">{en.invalid.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          </div>
        )}
        {data && (
          <div className="report-deck" style={{ zoom }}>
            <Report d={data} />
          </div>
        )}
      </div>
    </div>
  );
}
