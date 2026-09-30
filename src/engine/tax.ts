// German taxes of the project company. Statutory values are constants, not user inputs.
import type { LegalForm } from "./types";

export const TAX = {
  /** § 11 (2) GewStG */
  tradeTaxBaseRate: 0.035,
  /** § 11 (1) Nr. 1 GewStG — partnerships and individuals only */
  tradeTaxAllowancePartnership: 24_500,
  /** § 8 Nr. 1 GewStG: a quarter of interest, 50 % of land leases and 20 % of movable rents above the allowance */
  addBackShare: 0.25,
  addBackAllowance: 200_000,
  immovableLeaseShare: 0.5,
  /** § 10a GewStG / § 10d (2) EStG: 1 m offset in full, above that only a share */
  lossOffsetFull: 1_000_000,
  tradeTaxLossShare: 0.6,
  /** § 4 SolZG */
  soli: 0.055,
  /** § 16 (4) GewStG from 2027 */
  minHebesatzFrom2027: 2.8,
  /** § 6 (1) Nr. 3a e) EStG */
  provisionDiscountRate: 0.055,
  /** § 4h (2) a) EStG */
  interestBarrierThreshold: 3_000_000,
  /** § 7 (2) EStG as amended in 2025: at most 3× straight-line, at most 30 % */
  degressiveMultiple: 3,
  degressiveCap: 0.3,
  degressiveWindowEnd: "2027-12-31",
} as const;

/** § 23 (1) KStG as amended by the 2025 investment programme. */
export function corporateTaxRate(year: number): number {
  if (year <= 2027) return 0.15;
  if (year >= 2032) return 0.1;
  return 0.15 - 0.01 * (year - 2027);
}

/** § 10d (2) EStG: 70 % for 2024–2027, 60 % from 2028. */
export function corporateLossShare(year: number): number {
  return year <= 2027 ? 0.7 : 0.6;
}

/** Offsets a positive profit against a loss pool under minimum taxation. */
export function offsetLosses(profit: number, pool: number, share: number): { taxable: number; pool: number } {
  if (profit <= 0) return { taxable: 0, pool: pool - profit };
  const allowed = Math.min(profit, TAX.lossOffsetFull) + share * Math.max(0, profit - TAX.lossOffsetFull);
  const used = Math.min(pool, allowed);
  return { taxable: profit - used, pool: pool - used };
}

export interface TaxYear {
  year: number;
  ebt: number;
  interest: number;
  lease: number;
}

export interface TaxResult {
  tradeTax: number[];
  corporateTax: number[];
  soli: number[];
}

/**
 * Trade tax for both legal forms; corporate tax + Soli only for a GmbH (for a GmbH & Co. KG they are
 * paid by the partners). Taxes are not deductible (§ 4 (5b) EStG), so there is no circularity.
 */
export function computeTaxes(years: TaxYear[], legalForm: LegalForm, hebesatz: number): TaxResult {
  const tradeTax: number[] = [];
  const corporateTax: number[] = [];
  const soli: number[] = [];
  let tradePool = 0;
  let corporatePool = 0;
  for (const y of years) {
    const addBack =
      TAX.addBackShare * Math.max(0, y.interest + TAX.immovableLeaseShare * y.lease - TAX.addBackAllowance);
    const trade = offsetLosses(y.ebt + addBack, tradePool, TAX.tradeTaxLossShare);
    tradePool = trade.pool;
    let base = Math.floor(trade.taxable / 100) * 100;
    if (legalForm === "KG") base = Math.max(0, base - TAX.tradeTaxAllowancePartnership);
    tradeTax.push(base * TAX.tradeTaxBaseRate * hebesatz);

    if (legalForm === "GmbH") {
      const corp = offsetLosses(y.ebt, corporatePool, corporateLossShare(y.year));
      corporatePool = corp.pool;
      const kst = corp.taxable * corporateTaxRate(y.year);
      corporateTax.push(kst);
      soli.push(kst * TAX.soli);
    } else {
      corporateTax.push(0);
      soli.push(0);
    }
  }
  return { tradeTax, corporateTax, soli };
}

/**
 * Depreciation per calendar year. The first year counts the commissioning month in full
 * (§ 7 (1) sentence 4 EStG). Degressive: rate = min(3 / life, 30 %) on the book value, switching to
 * straight-line over the remaining life as soon as that is higher (§ 7 (3) EStG).
 */
export function depreciation(
  base: number,
  commissioningMonth: number,
  lifeYears: number,
  degressive: boolean,
  years: number[],
): number[] {
  const out: number[] = [];
  let book = base;
  let monthsUsed = 0;
  let straightLine = !degressive;
  const rate = Math.min(TAX.degressiveMultiple / lifeYears, TAX.degressiveCap);
  years.forEach((_, i) => {
    if (book <= 1e-6) {
      out.push(0);
      return;
    }
    const months = i === 0 ? 13 - commissioningMonth : 12;
    const remainingYears = lifeYears - monthsUsed / 12;
    const linear = remainingYears > 0 ? (book / remainingYears) * (months / 12) : book;
    let amount: number;
    if (straightLine) amount = linear;
    else {
      const deg = book * rate * (months / 12);
      if (linear >= deg) {
        straightLine = true;
        amount = linear;
      } else amount = deg;
    }
    amount = Math.min(amount, book);
    book -= amount;
    monthsUsed += months;
    out.push(amount);
  });
  return out;
}
