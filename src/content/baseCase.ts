// Base-case results for the static pages, computed once at build time from the same engine as the
// calculator — so the numbers quoted in the text can never drift from the model.
import { BASE_CASE, runScenarios, solveAwardPrice, TENDER_FACTS } from "@/engine";

export const BASE = runScenarios(BASE_CASE);
export const BID_AT_COST_OF_EQUITY = solveAwardPrice(BASE_CASE, BASE_CASE.macro.costOfEquity);
export { BASE_CASE, TENDER_FACTS };

/** Operating years in which a market premium is paid (the market value is below the AW). */
export function premiumYears(scenario: keyof typeof BASE): number {
  return BASE[scenario].annual.filter((a) => a.revenuePremium > 0.5).length;
}
