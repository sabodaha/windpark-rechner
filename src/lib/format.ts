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

export function num(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return nf(decimals, decimals).format(v === 0 ? 0 : v);
}

export function pct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return nf(decimals, decimals, "percent").format(v);
}

/** € amounts in millions: "€21.5m". */
export function meur(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const sign = v < 0 ? "−" : "";
  return `${sign}€${nf(decimals, decimals).format(Math.abs(v) / 1e6)}m`;
}

/** € thousands for tables. */
export function keur(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  const r = Math.round(v / 1000);
  return r === 0 ? "0" : nf(0, 0).format(r);
}

export function ratio(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${nf(decimals, decimals).format(v)}x`;
}

export function ct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return NA;
  return `${nf(decimals, decimals).format(v)} ct/kWh`;
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
