// What the sources pages list, in either language: the sources by topic, the inputs each one supports and the
// inputs that rest on an assumption.
import { SOURCES } from "@/engine";
import { FIELDS, type FieldDef } from "@/lib/fields";
import type { Locale } from "@/lib/i18n";
import { MESSAGES } from "@/messages";

export type SourceGroupId = "tenders" | "prices" | "costs" | "financing" | "tax" | "valuation" | "other";

/** Sources by topic, in the order of the page; "other" collects any source not listed here. */
const GROUP_KEYS: [Exclude<SourceGroupId, "other">, string[]][] = [
  ["tenders", ["bnetza2608", "bnetzaCeiling2026", "eeg", "eegSettlement", "eegAwardDeadlines", "eeg2027Draft"]],
  ["prices", ["futures", "futures2029", "priceScenarios", "netztransparenzMarketValues", "smard", "directMarketing", "ppa"]],
  [
    "costs",
    [
      "windguardCost2025",
      "fawsSiteQuality",
      "fawsStatusH1",
      "leeFullLoad",
      "degradation",
      "uncertainty",
      "leaseMarket",
      "decommissioning",
      "hessenSecurity",
      "agnes",
    ],
  ],
  ["financing", ["kfw270", "kfw270Merkblatt", "prospectuses", "gearing", "bankLetter"]],
  ["tax", ["gewstg", "kstg", "estg", "bfhWindPark", "ustg"]],
  ["valuation", ["bundesbank", "ecb", "ise2024"]],
];

/** The groups that have sources, each with its source keys. */
export function sourceGroups(): { id: SourceGroupId; keys: string[] }[] {
  const grouped = new Set(GROUP_KEYS.flatMap(([, keys]) => keys));
  return [
    ...GROUP_KEYS.map(([id, keys]) => ({ id, keys: keys.filter((k) => SOURCES[k]) })),
    { id: "other" as const, keys: Object.keys(SOURCES).filter((k) => !grouped.has(k)) },
  ].filter((g) => g.keys.length > 0);
}

/** Input label as on the panel; generic labels ("Other") get their group so they stand alone on the page. */
export function fieldLabel(locale: Locale, f: FieldDef, withDecade = true): string {
  const t = MESSAGES[locale];
  const base = f.opexCell ? t.inputs.opexItems[f.opexCell.item]! : (t.fields[f.id]?.label ?? f.id);
  const group = t.groups[f.group] ?? f.group;
  const label = base === t.inputs.opexItems.ot ? (locale === "de" ? `Sonstige ${group}` : `Other ${group.toLowerCase()}`) : base;
  if (!f.opexCell || !withDecade) return label;
  const decade = t.inputs.decade[f.opexCell.decade] ?? "";
  return `${label} (${locale === "de" ? decade : decade.toLowerCase()})`;
}

/** Inputs that cite a source, in the order of the input panel; opex cells collapse to one entry per item. */
export function inputsCiting(locale: Locale, key: string): string[] {
  return [...new Set(FIELDS.filter((f) => f.sources?.includes(key)).map((f) => fieldLabel(locale, f, false)))];
}

/** Inputs that rest on an assumption, by input group in panel order. */
export function assumptionsByGroup(locale: Locale): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const f of FIELDS.filter((x) => x.sources?.includes("assumption"))) {
    const label = fieldLabel(locale, f);
    const entry = out.find(([g]) => g === f.group);
    if (!entry) out.push([f.group, [label]]);
    else if (!entry[1].includes(label)) entry[1].push(label);
  }
  return out;
}
