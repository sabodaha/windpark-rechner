// Where the battery calculator's data lives and what it covers. The revenue library and the price statistics are
// derived from day-ahead prices (model-spec §5, §19): the raw hourly series is not published.

/** Files served with the site, next to the pages (same origin; nothing is requested from other hosts). */
export const BESS_FILES = {
  manifest: "/bess/ua-library-v2.json",
  payload: "/bess/ua-library-v2.bin",
  stats: "/bess/ua-stats-v2.json",
} as const;

/** Day-ahead prices run to this date (the last-12-months snapshot ends here). */
export const BESS_DATA_AS_OF = "2026-09-30";

/** Last change of the battery pages (sitemap, dateModified). */
export const BESS_UPDATED = "2026-10-02";

/** Methodology revision the engine implements. */
export const BESS_SPEC_REVISION = "S1.3";

export const BESS_CASE_NAME = "Zoria Storage";

/** Derived statistics of one price snapshot (ua-stats-v2.json): the average price by hour for each month and the
 *  distribution of the daily top-two-hour spread (TB2). */
export interface PriceStats {
  hourlyProfileByMonth: Record<string, { uah: number[]; eur: number[] }>;
  tb2: { meanUAH: number; meanEUR: number; decilesUAH: number[]; decilesEUR: number[] };
}

export interface StatsFile {
  schema: string;
  version: number;
  attribution: string;
  snapshots: Record<string, PriceStats>;
}
