// Number formatting for the English version (en-GB). The German version will pass "de-DE".
export const LOCALE = "en-GB";

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, style: "decimal" | "percent" = "decimal"): Intl.NumberFormat {
  const key = `${min}|${max}|${style}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max, style });
    cache.set(key, f);
  }
  return f;
}

export const NA = "n/a";

/** Typographic minus sign (U+2212); a value that rounds to zero gets no sign ("0", never "−0"). */
const minus = (s: string) => (/^-[0.,%]+$/.test(s) ? s.slice(1) : s.replace("-", "−"));

export function num(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return minus(nf(decimals, decimals).format(v));
}

export function pct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return minus(nf(decimals, decimals, "percent").format(v));
}

/** € amounts in millions: "€21.5m". */
export function meur(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v < 0 ? "−" : "";
  return `${sign}€${nf(decimals, decimals).format(Math.abs(v) / 1e6)}m`;
}

/** Compact € amounts: "€15k" below one million, "€1.2m" above. */
export function eurCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a < 999_500) return `${sign}€${nf(0, 0).format(Math.round(a / 1000))}k`;
  return `${sign}€${nf(1, 1).format(a / 1e6)}m`;
}

/** € thousands for tables. */
export function keur(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const r = Math.round(v / 1000);
  return minus(nf(0, 0).format(r));
}

export function ratio(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${minus(nf(decimals, decimals).format(v))}x`;
}

export function ct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${minus(nf(decimals, decimals).format(v))} ct/kWh`;
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
