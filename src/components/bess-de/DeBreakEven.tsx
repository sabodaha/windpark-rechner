"use client";

import { ArrowRight, CircleAlert, CircleCheck, Info } from "lucide-react";
import { DE_MARKET_2030, DE_TOLL_MARKET } from "@/bess/de/data";
import type { DeMessages } from "@/bess/de/messages";
import { DE_PATH_ORDER, type DeCore, type DeExtras, type DePathResult } from "@/bess/de/view";
import { Card, CardContent } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * The first answer of the page (spec §9.3): the toll price at which the investor NPV turns zero, against what the
 * market pays; why it is higher, in four points; and the honest note on what the model leaves out (G17, K20). Without
 * a toll, the break-even spread multiplier instead. With the revenue stack, the three reserve paths below it; their
 * rows fill as the worker finds them.
 */
export function DeBreakEven({
  core,
  extras,
  paths,
  t,
  onDetails,
}: {
  core: DeCore;
  extras: DeExtras | null;
  paths: DePathResult[] | null;
  t: DeMessages;
  onDetails: () => void;
}) {
  const f = useFormat();
  const B = t.breakEven;
  const { inputs } = core;
  const blocked = core.status.primary !== "ok" || !core.kpis;
  const npv = core.kpis?.investorNpvEur?.value ?? null;
  const short = npv === null || npv < 0;
  const toll = inputs.tollEnabled && inputs.tollShare > 0;
  const stack = inputs.stackEnabled === true;
  const eur = (v: number) => `€${f.num(Math.round(v / 1000) * 1000, 0)}`;
  const kEur = (v: number) => `€${f.num(Math.round(v / 1000), 0)}k`;

  if (blocked) {
    return (
      <Card className="border-l-4 border-l-border">
        <CardContent className="flex flex-col gap-2 py-4">
          <h2 className="text-base font-semibold">{B.title}</h2>
          <p className="text-sm text-muted-foreground">{B.blocked}</p>
        </CardContent>
      </Card>
    );
  }

  const answer = (() => {
    if (!extras) return <p className="text-muted-foreground">{B.calculating}</p>;
    if (toll) {
      const s = extras.tStar;
      if (!s) return <p>{B.unsupported}</p>;
      if (s.outcome === "found" && s.value !== null) {
        const root = s.roots.find((r) => r.price === s.value);
        return (
          <>
            <p>{B.found(eur(s.value), eur(inputs.tollPrice))}</p>
            {root && !root.funded && <p className="mt-1 text-warning">{B.foundUnfunded}</p>}
          </>
        );
      }
      if (s.outcome === "belowDomain") return <p>{B.belowDomain}</p>;
      if (s.outcome === "aboveDomain") return <p>{B.aboveDomain(eur(500_000))}</p>;
      if (s.outcome === "unresolvedPartialDomain") return <p>{B.unresolved}</p>;
      if (s.outcome === "refinementFailed") return <p>{B.refinementFailed}</p>;
      return <p>{B.unsupported}</p>;
    }
    const k = extras.k;
    const path = t.pathName[inputs.spreadPath] ?? inputs.spreadPath;
    if (!k || k.status === "unsupported") return <p>{B.merchantUnsupported}</p>;
    if (k.status === "found" && k.value !== null) return <p>{B.merchantFound(B.times(f.num(k.value, 2)), path)}</p>;
    if (k.status === "unsupportedBelow") return <p>{B.merchantBelow(B.times(f.num(k.supportedFrom ?? 0, 1)))}</p>;
    return <p>{B.merchantNotReached}</p>;
  })();

  return (
    <Card className={cn("border-l-4", short ? "border-l-critical" : "border-l-good")}>
      <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-base font-semibold">{toll ? B.title : B.merchantTitle}</h2>
          {toll && (
            <p className="flex items-start gap-1.5 text-sm font-medium">
              {short ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-good-text" aria-hidden />}
              {short ? B.short : B.enough}
            </p>
          )}
          <div className="text-sm leading-relaxed text-foreground/85" aria-live="polite">
            {answer}
            {toll && <p className="mt-1 text-muted-foreground">{B.market(eur(DE_TOLL_MARKET.lowEur), eur(DE_TOLL_MARKET.highEur))}</p>}
            {stack && core.stack && (
              <p className="mt-1 text-muted-foreground">
                {core.stack.firstOffer
                  ? B.reserveStart(f.dateLabel(`${core.stack.firstOffer}-01`).replace(/^\d+\s/, ""), core.stack.heldYears.join(", "))
                  : B.reserveNever}
              </p>
            )}
            {stack && extras?.market2030PerMwEur != null && (
              <p className="mt-1 text-muted-foreground">{B.benchmark(kEur(extras.market2030PerMwEur), kEur(DE_MARKET_2030.ffePwcEur), kEur(DE_MARKET_2030.modoEur))}</p>
            )}
          </div>
          {stack && (
            <table className="w-full max-w-lg text-sm" aria-busy={(paths?.length ?? 0) < DE_PATH_ORDER.length}>
              <caption className="pb-1 text-left text-xs font-medium text-muted-foreground">{B.pathsTitle}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 text-left font-medium">{B.pathCols.path}</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">{B.pathCols.irr}</th>
                  <th scope="col" className="py-1 text-right font-medium">{toll ? B.pathCols.tStar : B.pathCols.k}</th>
                </tr>
              </thead>
              <tbody>
                {DE_PATH_ORDER.map((id) => {
                  const p = paths?.find((r) => r.path === id);
                  const irr = p?.investorIrr;
                  const irrText = !p ? B.pathPending : irr?.status === "valid" && irr.value !== null ? f.pct(irr.value, 1) : "—";
                  const be = !p
                    ? B.pathPending
                    : toll
                      ? p.tStar?.outcome === "found" && p.tStar.value !== null ? eur(p.tStar.value) : "—"
                      : p.k?.status === "found" && p.k.value !== null ? B.times(f.num(p.k.value, 2)) : "—";
                  return (
                    <tr key={id} className={cn("border-b border-border last:border-0", id === inputs.reservePath && "font-semibold")}>
                      <td className="py-1 pr-3">{t.reservePathName[id] ?? id}</td>
                      <td className="py-1 pr-3 text-right tabular">{irrText}</td>
                      <td className="py-1 text-right tabular">{be}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {stack ? B.honestStack : B.honest}
          </p>
        </div>
        <div className="flex w-full flex-col gap-1.5 lg:w-96 lg:shrink-0">
          <div className="text-xs font-medium text-muted-foreground">{B.whyTitle}</div>
          <ol className="list-decimal space-y-1 rounded-lg border border-border py-2 pl-7 pr-3 text-sm">
            {(stack ? B.whyStack : B.why).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          {toll && (
            <button type="button" onClick={onDetails} className="flex w-fit items-center gap-1 text-xs font-medium text-link hover:underline">
              {t.toll.curveTitle}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
