// Where the German battery calculator's data lives and what it covers (spec v1.2 R2.2 §13). The revenue library and
// the price statistics are derived from day-ahead prices; the raw series is not published.

/** Files served with the site, next to the pages (same origin; nothing is requested from other hosts). */
export const DE_FILES = {
  manifest: "/bess/de-library-v1.json",
  payload: "/bess/de-library-v1.bin",
  stats: "/bess/de-stats-v1.json",
} as const;

/** Day-ahead prices run to this date (the last-12-months snapshot ends here). */
export const DE_DATA_AS_OF = "2026-09-30";

/** First publication and last change of the German battery pages (datePublished, dateModified). */
export const DE_PUBLISHED = "2026-10-04";
export const DE_UPDATED = "2026-10-04";

/** Specification revision the engine implements. */
export const DE_SPEC_REVISION = "v1.2 R2.4";

export const DE_CASE_NAME = "Batteriespeicher Musterfeld";

/** Market tolling offers for 2 h batteries, € per MW and year (Terralayr, 15.10.2025): a benchmark, not an offer
 *  (spec §9.3). */
export const DE_TOLL_MARKET = { lowEur: 110_000, highEur: 150_000, source: "tollMarket" } as const;

/** Derived statistics of one price snapshot (de-stats-v1.json): the average price by hour for each month (€/MWh) and
 *  the distribution of the daily top-two-hour spread (TB2). */
export interface DePriceStats {
  hourlyProfileByMonth: Record<string, number[]>;
  tb2: { meanEUR: number; decilesEUR: number[] };
}

export interface DeStatsFile {
  schema: string;
  version: number;
  attribution: string;
  license: string;
  snapshots: Record<string, DePriceStats>;
}
