"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { Info, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { SOURCES, type Inputs } from "@/engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { type FieldDef, type FieldValue, fromDisplay, sameValue, toDisplay } from "@/lib/fields";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";

interface Props {
  field: FieldDef;
  inputs: Inputs;
  base: Inputs;
  onChange: (f: FieldDef, v: FieldValue) => void;
  t: Messages;
}

/** A value as the input shows it, in the page's number format ("4.79" / "4,79"), without thousands separators. */
const display = (f: FieldDef, v: number, intl: string) =>
  new Intl.NumberFormat(intl, { minimumFractionDigits: 0, maximumFractionDigits: f.decimals ?? 2, useGrouping: false }).format(v);

/** Accepts "1.5", "1,5" and "1 500" regardless of locale. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/\s|'/g, "").replace(",", ".");
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

export function SourcesNote({ field, t }: { field: FieldDef; t: Messages }) {
  const f = useFormat();
  const keys = field.sources ?? [];
  if (keys.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="mb-1 font-medium text-muted-foreground">{keys.length > 1 ? t.inputs.sources : t.inputs.source}</div>
      <ul className="space-y-1">
        {keys.map((k) =>
          k === "assumption" ? (
            <li key={k} className="text-muted-foreground">
              {t.inputs.assumption}
            </li>
          ) : SOURCES[k] ? (
            <li key={k}>
              <a href={SOURCES[k].url} target="_blank" rel="noreferrer noopener" className="text-link hover:underline">
                {t.sourceTitles[k] ?? SOURCES[k].title}
              </a>
              <span className="text-muted-foreground"> · {f.dateLabel(SOURCES[k].date)}</span>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

export function FieldHelp({ field, t, label }: { field: FieldDef; t: Messages; label: string }) {
  const hint = t.fields[field.id]?.hint;
  return (
    <Popover>
      <PopoverTrigger
        className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t.inputs.help(label)}
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent>
        <div className="font-medium">{label}</div>
        {hint && <p className="mt-1 text-muted-foreground">{hint}</p>}
        <SourcesNote field={field} t={t} />
      </PopoverContent>
    </Popover>
  );
}

export function FieldControl({ field: f, inputs, base, onChange, t }: Props) {
  const id = useId();
  const label = t.fields[f.id]?.label ?? f.id;
  const value = f.get(inputs);
  const changed = !sameValue(value, f.get(base));

  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5">
        <label id={`${id}-label`} htmlFor={id} className="min-w-0 flex-1 truncate text-[13px] text-foreground">
          {label}
        </label>
        <FieldHelp field={f} t={t} label={label} />
        {changed && (
          <button
            type="button"
            onClick={() => onChange(f, f.get(base))}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`${t.inputs.reset}: ${label}`}
            title={t.inputs.reset}
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
        {f.kind === "switch" && (
          <Switch id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(f, c)} aria-label={label} />
        )}
      </div>
      {f.kind === "number" && <NumberInput id={id} field={f} value={Number(value)} onChange={onChange} t={t} changed={changed} />}
      {f.kind === "select" && (
        <RadioGroup
          value={String(value)}
          options={f.options ?? []}
          onChange={(o) => onChange(f, o)}
          labelledBy={`${id}-label`}
          className="mt-1.5 flex flex-wrap gap-1"
          optionClassName={(checked) =>
            cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
            )
          }
          render={(o) => t.options[f.optionsKey ?? ""]?.[o] ?? o}
        />
      )}
      {(f.kind === "month" || f.kind === "date") && (
        <input
          id={id}
          type={f.kind}
          value={String(value)}
          min={f.minDate}
          max={f.maxDate}
          onChange={(e) => {
            const v = e.target.value;
            if (v && (!f.minDate || v >= f.minDate) && (!f.maxDate || v <= f.maxDate)) onChange(f, v);
          }}
          className="mt-1.5 h-8 w-full rounded-md border border-border bg-card px-2 text-sm tabular"
        />
      )}
    </div>
  );
}

function NumberInput({
  id,
  field: f,
  value,
  onChange,
  t,
  changed,
}: {
  id: string;
  field: FieldDef;
  value: number;
  onChange: (f: FieldDef, v: FieldValue) => void;
  t: Messages;
  changed: boolean;
}) {
  const intl = useFormat().intl;
  const shown = toDisplay(f, value) as number;
  const [text, setText] = useState(display(f, shown, intl));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display(f, shown, intl));
  }, [shown, focused, f]);

  const commit = (raw: string) => {
    const v = parseNumber(raw);
    if (v === null) {
      setText(display(f, shown, intl));
      return;
    }
    const clamped = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v));
    onChange(f, fromDisplay(f, clamped));
    setText(display(f, clamped, intl));
  };

  const [uMin, uMax] = f.usual ?? [NaN, NaN];
  const outside = f.usual !== undefined && (shown < uMin - 1e-9 || shown > uMax + 1e-9);
  const unit = f.unit === undefined ? undefined : (t.units[f.unit] ?? f.unit);
  // A long unit ("% of revenue", "€ per turbine") needs a wider box, or the number itself gets cut off.
  const box = !f.usual ? "w-full" : (unit?.length ?? 0) > 8 ? "w-40 shrink-0" : "w-28 shrink-0";

  return (
    <div className="mt-1.5 flex items-center gap-2">
      {f.usual && (
        <input
          type="range"
          min={uMin}
          max={uMax}
          step={f.step ?? "any"}
          value={Math.min(uMax, Math.max(uMin, shown))}
          onChange={(e) => onChange(f, fromDisplay(f, Number(e.target.value)))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer"
          aria-label={t.fields[f.id]?.label ?? f.id}
          tabIndex={-1}
        />
      )}
      <div
        className={cn(
          "flex h-8 items-center rounded-md border bg-card focus-within:ring-2 focus-within:ring-ring",
          changed ? "border-link/50" : "border-border",
          box,
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setText(display(f, shown, intl));
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-sm tabular outline-none"
        />
        {unit && <span className="shrink-0 pr-2 text-xs text-muted-foreground">{unit}</span>}
      </div>
      {outside && (
        <span title={t.inputs.outsideUsual} className="text-warning" aria-label={t.inputs.outsideUsual}>
          <TriangleAlert className="size-3.5" />
        </span>
      )}
    </div>
  );
}
