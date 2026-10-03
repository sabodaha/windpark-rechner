// Small helpers shared by the contract's card, tab and status lines (spec v1.1 §14).
import type { CaseStatus } from "@/bess/engine";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2028-03-01" → "Mar 2028"; `back` months earlier (an exclusive end → its last month). */
export function monthLabel(iso: string, back = 0): string {
  const [y, m] = iso.split("-").map(Number);
  const k = y! * 12 + (m! - 1) - back;
  return `${MON[k % 12]} ${Math.floor(k / 12)}`;
}

/** The physical screens of the reserve (spec §14): their failure makes a case physically unsupported. */
export const RESERVE_SCREENS = ["reserveOverAllocated", "warrantyQuotaExceeded", "recoveryEnvelopeExceeded", "transitionPowerExceeded", "renewalUnsupported"];

/** A contract case without a result to show: its inputs, its physics or its own checks fail (spec §14). */
export function blockedStatus(core: BessCore): CaseStatus["primary"] | null {
  const p = core.result.status.primary;
  return core.inputs.contract?.enabled && (p === "inputUnsupported" || p === "physicallyUnsupported" || p === "calcError") ? p : null;
}

export function reasonText(t: BessMessages, code: string): string {
  return t.caseStatus.reasons[code] ?? t.checks.ids[code.replace(/^lender:/, "")] ?? code;
}

/** A check's label; the lender's copy of a check says so. */
export function checkLabel(t: BessMessages, id: string): string {
  const lender = id.startsWith("lender:");
  const base = lender ? id.slice("lender:".length) : id;
  const label = t.checks.ids[base] ?? base;
  return lender ? t.checks.lender(label) : label;
}
