"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { type Inputs } from "@/engine";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FIELDS, type FieldDef, type FieldValue, GROUPS, type GroupId, fromDisplay, sameValue, toDisplay } from "@/lib/fields";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";
import { FieldControl, FieldHelp } from "./FieldControl";

interface Props {
  inputs: Inputs;
  base: Inputs;
  onChange: (f: FieldDef, v: FieldValue) => void;
  t: Messages;
}

export function InputsPanel({ inputs, base, onChange, t }: Props) {
  return (
    <Accordion type="multiple" defaultValue={[...GROUPS]} className="w-full">
      {GROUPS.map((g) => (
        <Group key={g} group={g} inputs={inputs} base={base} onChange={onChange} t={t} />
      ))}
    </Accordion>
  );
}

function Group({ group, inputs, base, onChange, t }: Props & { group: GroupId }) {
  const [more, setMore] = useState(false);
  const fields = FIELDS.filter((f) => f.group === group && !(f.hidden?.(inputs) ?? false));
  const quick = fields.filter((f) => f.quick);
  const advanced = fields.filter((f) => !f.quick && !f.opexCell);
  const cells = fields.filter((f) => f.opexCell);
  const changedInGroup = fields.filter((f) => !f.virtual && !sameValue(f.get(inputs), f.get(base))).length;

  return (
    <AccordionItem value={group}>
      <AccordionTrigger>
        <span className="flex items-center gap-2">
          {t.groups[group]}
          {changedInGroup > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-medium text-link">{changedInGroup}</span>}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        {quick.map((f) => (
          <FieldControl key={f.id} field={f} inputs={inputs} base={base} onChange={onChange} t={t} />
        ))}
        {(advanced.length > 0 || cells.length > 0) && (
          <>
            <button
              type="button"
              onClick={() => setMore((m) => !m)}
              aria-expanded={more}
              className="mt-1 flex items-center gap-1 text-xs font-medium text-link hover:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} aria-hidden />
              {more ? t.inputs.less : `${t.inputs.more} (${advanced.length + cells.length})`}
            </button>
            {more && (
              <div className="mt-1 border-l-2 border-border pl-3">
                {cells.length > 0 && <OpexGrid cells={cells} inputs={inputs} onChange={onChange} t={t} />}
                {advanced.map((f) => (
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

/** Opex per item and decade as a compact grid (€/kW/yr, 2025 prices). */
function OpexGrid({ cells, inputs, onChange, t }: { cells: FieldDef[]; inputs: Inputs; onChange: Props["onChange"]; t: Messages }) {
  const items = ["om", "mg", "in", "ot"] as const;
  const first = cells[0];
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[13px]">
        <span className="flex-1">{t.fields.opexTotal?.label.replace(", years 1–10", "")} (€/kW/yr)</span>
        {first && <FieldHelp field={first} t={t} label="Opex by decade" />}
      </div>
      <div className="grid grid-cols-[1fr_repeat(3,3.6rem)] items-center gap-1 text-xs">
        <span />
        {t.inputs.decade.map((d) => (
          <span key={d} className="text-center text-[11px] text-muted-foreground">
            {d.replace("Years ", "")}
          </span>
        ))}
        {items.map((item) => (
          <OpexRow key={item} item={item} cells={cells} inputs={inputs} onChange={onChange} t={t} />
        ))}
      </div>
    </div>
  );
}

function OpexRow({ item, cells, inputs, onChange, t }: { item: "om" | "mg" | "in" | "ot"; cells: FieldDef[]; inputs: Inputs; onChange: Props["onChange"]; t: Messages }) {
  return (
    <>
      <span className="text-muted-foreground">{t.inputs.opexItems[item]}</span>
      {[0, 1, 2].map((d) => {
        const f = cells.find((c) => c.opexCell?.item === item && c.opexCell.decade === d);
        if (!f) return <span key={d} />;
        const v = toDisplay(f, f.get(inputs)) as number;
        return (
          <input
            key={`${item}-${d}-${v}`}
            type="text"
            inputMode="decimal"
            defaultValue={String(Math.round(v * 10) / 10)}
            aria-label={`${t.inputs.opexItems[item]}, ${t.inputs.decade[d]}`}
            onBlur={(e) => {
              const x = Number(e.target.value.replace(",", "."));
              if (Number.isFinite(x) && x >= 0) onChange(f, fromDisplay(f, x));
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-7 w-full rounded border border-border bg-card px-1 text-right tabular"
          />
        );
      })}
    </>
  );
}
