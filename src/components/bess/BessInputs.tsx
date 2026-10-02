"use client";

import { ChevronDown, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { BessInputs } from "@/bess/engine";
import { BESS_FIELDS, BESS_GROUPS, type BessFieldDef, type BessFieldValue, type BessGroupId, fromDisplay, sameValue, toDisplay } from "@/bess/fields";
import type { BessMessages } from "@/bess/messages";
import { BESS_SOURCES } from "@/bess/sources";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";

type OnChange = (f: BessFieldDef, v: BessFieldValue) => void;

interface Props {
  inputs: BessInputs;
  base: BessInputs;
  onChange: OnChange;
  t: BessMessages;
}

export function BessInputsPanel({ inputs, base, onChange, t }: Props) {
  return (
    <Accordion type="multiple" defaultValue={[...BESS_GROUPS]} className="w-full">
      {BESS_GROUPS.map((g) => (
        <Group key={g} group={g} inputs={inputs} base={base} onChange={onChange} t={t} />
      ))}
    </Accordion>
  );
}

function Group({ group, inputs, base, onChange, t }: Props & { group: BessGroupId }) {
  const [more, setMore] = useState(false);
  const fields = BESS_FIELDS.filter((f) => f.group === group && !(f.hidden?.(inputs) ?? false));
  const quick = fields.filter((f) => f.quick);
  const advanced = fields.filter((f) => !f.quick);
  const changed = fields.filter((f) => !sameValue(f.get(inputs), f.get(base))).length;
  // a group without quick fields shows everything at once
  const shown = quick.length > 0 ? quick : advanced;
  const hidden = quick.length > 0 ? advanced : [];
  return (
    <AccordionItem value={group}>
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          {t.groups[group]}
          {changed > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-link">{changed}</span>}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        {shown.map((f) => (
          <FieldControl key={f.id} field={f} inputs={inputs} base={base} onChange={onChange} t={t} />
        ))}
        {hidden.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-link hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} aria-hidden />
              {more ? t.inputs.less : `${t.inputs.more} (${hidden.length})`}
            </button>
            {more && (
              <div className="mt-1 border-l-2 border-border pl-3">
                {hidden.map((f) => (
                  <FieldControl key={f.id} field={f} inputs={inputs} base={base} onChange={onChange} t={t} />
                ))}
              </div>
            )}
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SourcesNote({ field, t }: { field: BessFieldDef; t: BessMessages }) {
  const f = useFormat();
  const keys = field.sources ?? [];
  if (keys.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-2">
      <div className="mb-1 font-medium text-muted-foreground">{keys.length > 1 ? t.inputs.sources : t.inputs.source}</div>
      <ul className="space-y-1">
        {keys.map((k) => {
          const s = BESS_SOURCES[k];
          if (k === "assumption" || !s)
            return (
              <li key={k} className="text-muted-foreground">
                {t.inputs.assumption}
              </li>
            );
          return (
            <li key={k}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-link hover:underline">
                {s.title}
              </a>
              <span className="text-muted-foreground"> · {f.dateLabel(s.date)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FieldHelp({ field, t, label }: { field: BessFieldDef; t: BessMessages; label: string }) {
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

function FieldControl({ field: f, inputs, base, onChange, t }: Props & { field: BessFieldDef }) {
  const id = useId();
  const label = t.fields[f.id]?.label ?? f.id;
  const value = f.get(inputs);
  const changed = !sameValue(value, f.get(base));
  return (
    <div className="py-2">
      <div className="flex items-center gap-1.5">
        <label id={`${id}-label`} htmlFor={id} className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
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
        {f.kind === "switch" && <Switch id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(f, c)} aria-label={label} />}
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
          render={(o) => t.options[f.id]?.[o] ?? o}
        />
      )}
    </div>
  );
}

const display = (f: BessFieldDef, v: number, intl: string) =>
  new Intl.NumberFormat(intl, { minimumFractionDigits: 0, maximumFractionDigits: f.decimals ?? 2, useGrouping: false }).format(v);

/** Accepts "1.5", "1,5" and "1 500" regardless of locale. */
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/\s|'/g, "").replace(",", ".");
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
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
  field: BessFieldDef;
  value: number;
  onChange: OnChange;
  t: BessMessages;
  changed: boolean;
}) {
  const intl = useFormat().intl;
  const shown = toDisplay(f, value) as number;
  const [text, setText] = useState(display(f, shown, intl));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display(f, shown, intl));
  }, [shown, focused, f, intl]);

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
