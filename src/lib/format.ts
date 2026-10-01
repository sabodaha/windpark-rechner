// Number and date formatting per language: en-GB for English ("€21.5m", "7.8%", "30 Sep 2026"), de-DE for German
// ("21,5 Mio. €", "7,8 %", "30.09.2026"). The plain exports are the English formats, which the report and the
// workbook use; pages and components of either language take FORMAT[locale].
import { INTL_LOCALE, type Locale } from "./i18n";

export interface Format {
  locale: Locale;
  /** BCP 47 tag for Intl, e.g. "de-DE". */
  intl: string;
  /** Shown for a value that does not exist (no loan, no DSCR). */
  na: string;
  num(v: number | null | undefined, decimals?: number): string;
  pct(v: number | null | undefined, decimals?: number): string;
  /** € amounts in millions: "€21.5m" / "21,5 Mio. €". */
  meur(v: number | null | undefined, decimals?: number): string;
  /** Compact € amounts: thousands below one million, millions above ("€15k" / "15 Tsd. €"). */
  eurCompact(v: number | null | undefined): string;
  /** € thousands for tables. */
  keur(v: number | null | undefined): string;
  ratio(v: number | null | undefined, decimals?: number): string;
  ct(v: number | null | undefined, decimals?: number): string;
  dateLabel(iso: string): string;
}

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** Typographic minus sign (U+2212); a value that rounds to zero gets no sign ("0", never "−0"). */
const minus = (s: string) => (/^-[0.,%\s  ]+$/.test(s) ? s.slice(1) : s.replace("-", "−"));

export function createFormat(locale: Locale): Format {
  const intl = INTL_LOCALE[locale];
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (min: number, max: number, style: "decimal" | "percent" = "decimal"): Intl.NumberFormat => {
    const key = `${min}|${max}|${style}`;
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(intl, { minimumFractionDigits: min, maximumFractionDigits: max, style });
      cache.set(key, f);
    }
    return f;
  };
  const de = locale === "de";
  const na = de ? "k. A." : "n/a";
  // German keeps a number and its unit on one line: no-break spaces, as Intl puts before "%".
  const sp = de ? "\u00a0" : " ";
  const millions = (v: number, decimals: number) => {
    const sign = v < 0 ? "−" : "";
    const x = nf(decimals, decimals).format(Math.abs(v) / 1e6);
    return de ? `${sign}${x}${sp}Mio.${sp}€` : `${sign}€${x}m`;
  };
  return {
    locale,
    intl,
    na,
    num: (v, decimals = 0) => (finite(v) ? minus(nf(decimals, decimals).format(v)) : na),
    pct: (v, decimals = 1) => (finite(v) ? minus(nf(decimals, decimals, "percent").format(v)) : na),
    meur: (v, decimals = 1) => (finite(v) ? millions(v, decimals) : na),
    eurCompact: (v) => {
      if (!finite(v)) return na;
      const a = Math.abs(v);
      if (a >= 999_500) return millions(v, 1);
      const sign = v < 0 ? "−" : "";
      const k = nf(0, 0).format(Math.round(a / 1000));
      return de ? `${sign}${k}${sp}Tsd.${sp}€` : `${sign}€${k}k`;
    },
    keur: (v) => (finite(v) ? minus(nf(0, 0).format(Math.round(v / 1000))) : na),
    ratio: (v, decimals = 2) => (finite(v) ? `${minus(nf(decimals, decimals).format(v))}x` : na),
    ct: (v, decimals = 2) => (finite(v) ? `${minus(nf(decimals, decimals).format(v))}${sp}ct/kWh` : na),
    dateLabel: (iso) => {
      const [y, m, d] = iso.split("-").map(Number);
      const date = new Date(Date.UTC(y!, m! - 1, d!));
      if (de) return date.toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
      // en-GB writes "Sept" for September; the texts use "Sep" throughout.
      return date.toLocaleDateString(intl, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace("Sept", "Sep");
    },
  };
}

export const FORMAT: Record<Locale, Format> = { en: createFormat("en"), de: createFormat("de") };

// English, for the modules that are English only so far (report, workbook, English pages).
export const LOCALE = FORMAT.en.intl;
export const NA = FORMAT.en.na;
export const { num, pct, meur, eurCompact, keur, ratio, ct, dateLabel } = FORMAT.en;
