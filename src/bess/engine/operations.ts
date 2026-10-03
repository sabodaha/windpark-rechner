// Monthly operations of one case (model-spec §3, §6, §7, §9, §10): cohort degradation, library revenue under the
// scenario's price transformation, capture and fee, operating costs, network tariffs, war risk, lifecycle capex.
// All money is in UAH (the SPV's functional currency); `fx` converts to EUR.
import { toDay } from "@/engine/dates";
import type { Calendar } from "./calendar";
import { paidCapexEur, type CapexBuild } from "./capex";
import { lookup, monthFields, type Library, UnsupportedLibraryInput } from "./library";
import { FX_ANCHOR_2025, fxMonth, hicpIndex, uaCpiIndex } from "./macro";
import { CASE, CAPEX, GRID, OPEX, PRICE_LEVEL_EUR, RESERVE, SPREAD_PATHS, TECH, WAR, type ScenarioId } from "./registry";
import { settlementHours, type ContractPlan } from "./reserves";
import type { BessInputs } from "./types";

export interface OpsSettings {
  scenario: ScenarioId;
  lowerNode: boolean;
  /** Multiplier on the whole spread path (break-even search); 1 in normal runs. */
  spreadScale: number;
  /** Tariff on gross withdrawal from COD, as if the legacy cohort were lost (sensitivity, spec §16). */
  grossTariffFromCod?: boolean;
  /** v1.1a: the reserve contract of this run (the lender case passes its own plan without renewal, β = 0). */
  plan?: ContractPlan | null;
}

/** One month of the v1.1a reserve (spec v1.1 R3 §2–§6). Energy in AC MWh, money in UAH (accrual, ex VAT). */
export interface ReserveMonth {
  award: "A1" | "A2" | "";
  /** Award in which the exit event of this month's exit day happened (stock sold on the 1st), or "". */
  exitOrigin: "A1" | "A2" | "";
  window: number;
  H: number;
  A: number;
  S: number;
  R: number;
  released: number;
  Zplus: number;
  Z: number;
  sigmaP: number;
  sigmaE: number;
  /** σ* of one unit of mass (spec §3), also in transition months; sigma = W·σ*. */
  sigmaStar: number;
  sigma: number;
  /** Share of the DA library withheld for the fill and exit days (τ, spec §3). */
  tau: number;
  sigmaA: number;
  U: number;
  Dn: number;
  K: number;
  Uset: number;
  Dset: number;
  /** Routine restoration at constant stock, the pre-service fill and the exit-day sale (spec §4, R2-01). */
  Broutine: number;
  Xroutine: number;
  Bfill: number;
  Xexit: number;
  /** Totals, non-overlapping: B = Bfill + Broutine, X = Xroutine + Xexit. */
  B: number;
  X: number;
  J: number;
  /** Stock waiting at this month's close for next month's exit day. */
  exitQueue: number;
  Iopen: number;
  Iclose: number;
  standingMWh: number;
  energyPriceUah: number;
  capacityUah: number;
  upEnergyUah: number;
  downEnergyUah: number;
  /** Routine restoration purchase (B_routine) and export (X_routine). */
  restorationPurchaseUah: number;
  restorationSaleUah: number;
  fillPurchaseUah: number;
  exitSaleUah: number;
  /** Inventory cost basis: the fill (commodity only) is capitalised; released on the exit sale, written off on
   *  destruction (spec §4). */
  basisAddUah: number;
  basisReleaseUah: number;
  basisWriteOffUah: number;
  basisCloseUah: number;
  penaltyAsUah: number;
  penaltyBsUah: number;
  standingLoadUah: number;
  recertUah: number;
  /** Market-operator fee and NEURC levy in total, and the parts on the exit sale and (levy) on up energy. */
  moFeeUah: number;
  levyUah: number;
  moFeeExitUah: number;
  levyExitUah: number;
  levyUpUah: number;
  /** One network bill: total, the DA slice alone, and the DA slice with the non-exit reserve flows. */
  networkTotalUah: number;
  networkDaUah: number;
  networkServiceUah: number;
  /** Daily envelope (spec §3): (а) quota and (б) recovery on service days; (в) the fill day; (г) the exit day — left
   *  side and limit. */
  quota: { Q: number; a: [number, number]; b: [number, number]; fill: [number, number]; exitQuota: [number, number]; exitPower: [number, number] };
}

export interface OpsMonth {
  index: number;
  fx: number;
  operating: boolean;
  usableHours: number;
  sohInitial: number;
  importMWh: number;
  exportMWh: number;
  auxMWh: number;
  salesUah: number;
  purchasesUah: number;
  /** Library purchases at base-period prices (UAH), for scaling the liquidity reserve. */
  purchasesHistUah: number;
  pfMarginUah: number;
  capturedUah: number;
  captureLossUah: number;
  optimiserFeeUah: number;
  /** Operating costs paid in the month (O&M, insurance, security, admin, metering, land, market and regulator fees, aux). */
  opexUah: number;
  tariffUah: number;
  warExpectedUah: number;
  insurancePremiumUah: number;
  /** Expected insurance claim recognised when the damage is expected (income); cash follows 9 months later. */
  insuranceClaimAccrualUah: number;
  /** Insurance claim cash received in the month. */
  insurancePayoutUah: number;
  /** State premium compensation recognised with the premium instalment, net of the per-policy fee. */
  stateCompensationAccrualUah: number;
  /** State compensation cash received in the month. */
  stateCompensationUah: number;
  /** VAT on lifecycle capex paid in the month (refunded two months later). */
  lifecycleVatUah: number;
  lifecycleCapexUah: number;
  decommissioningUah: number;
  grossTariffRegime: boolean;
  libraryFeeUah: number;
  /** Peak daily purchases of the node in use, per the whole plant, base-period UAH. */
  peakDayPurchasesUah: number;
  /** v1.1a reserve of the month, or null without a contract. */
  reserve: ReserveMonth | null;
  /** Fixed site costs of the month (O&M, property insurance, security, administration, metering, land, the monthly
   *  market-operator fee): the shared costs allocated to the contract bucket by resource share (spec v1.1 §11). */
  fixedOpexUah: number;
}

export interface OpsResult {
  months: OpsMonth[];
  cohortLost: boolean;
  /** The usable energy fell below the library grid and the battery stood idle for the rest of its life. */
  retiredBelowGrid: boolean;
  /** Operating months whose equivalent fee was negative and floored at zero (M01). */
  feeFloorMonths: number;
  unsupported: string | null;
  augmentationUah: number;
  /** v1.1a checks (spec R3 §3–§4, §14): the largest violation of each, ≤ 0 passes. Physical screens of the initial
   *  award and its transition days; `renewal` — any physical screen in the second award's months and exits. */
  reserveChecks: ReserveChecks;
}

export interface ReserveChecks {
  headroom: number;
  quotaA: number;
  recoveryB: number;
  transitionPower: number;
  renewal: number;
  energyBalance: number;
  inventory: number;
  inventoryCost: number;
  lifecycle: number;
}

const yearKey = (table: Record<number, number>, y: number) => table[Math.min(Math.max(y, 2028), 2031)]!;

export function soh(ageYears: number, efc: number, stress: number): number {
  const cal = TECH.calendarFade.coefficient * Math.pow(Math.max(ageYears, 0), TECH.calendarFade.exponent);
  const cyc = TECH.cycleFade.coefficient * Math.pow(Math.max(efc, 0), TECH.cycleFade.exponent);
  return 1 - stress * (cal + cyc);
}

export function runOperations(inp: BessInputs, lib: Library, cal: Calendar, capex: CapexBuild, s: OpsSettings): OpsResult {
  const P = inp.powerMW;
  const meta = lib.manifest.snapshots[inp.snapshot];
  const key = { snapshot: inp.snapshot, duration: inp.durationH, cycleCap: inp.cycleCap, rte: inp.rte };
  const cohortLost = (s.grossTariffFromCod ?? false) || cal.codDay > toDay(CASE.legacyCohortCodCutoff);
  const grossFrom = toDay("2037-05-01");
  const stress = inp.degradationStress ? TECH.degradationStressFactor : 1;
  const elRate = WAR.marketPremium * inp.lossRatio;
  const hit = elRate / WAR.severity;
  const outageDerate = (hit * WAR.downtimeMonths) / 12;
  // replacement value: the dated payment total of the investment less development (spec §8–9, S1.3), indexed from 2026
  const rv2026 = paidCapexEur(capex, (i) => fxMonth(cal.months[i]!.year, cal.months[i]!.month, inp.fxStress)) - capex.developmentEur;
  const usableBoL = capex.usableAcMWh;
  const cohorts = [{ bol: usableBoL, start: cal.codIndex, efc: 0, active: true }];
  const months: OpsMonth[] = [];
  let unsupported: string | null = null;
  let retiredBelowGrid = false;
  let feeFloorMonths = 0;
  let augmentationUah = 0;
  const payouts = new Map<number, number>();
  const compensations = new Map<number, number>();
  const compUsed = new Map<number, number>();
  const plan = s.plan ?? null;
  const rc: ReserveChecks = { headroom: -Infinity, quotaA: -Infinity, recoveryB: -Infinity, transitionPower: -Infinity, renewal: -Infinity, energyBalance: 0, inventory: 0, inventoryCost: 0, lifecycle: 0 };
  /** Reserve stock (deliverable AC MWh), its UAH cost basis and the basis per MWh (constant: no refill), carried month to
   *  month; the stock that left by exit or destruction, for the lifecycle check. */
  let stock = 0;
  let basis = 0;
  let unitBasis = 0;
  let stockOut = 0;
  /** Record a physical screen's violation against the initial award or, for the second award, against `renewal`. */
  const screen = (key: "headroom" | "quotaA" | "recoveryB" | "transitionPower", award: string, v: number) => {
    if (award === "A2") rc.renewal = Math.max(rc.renewal, v);
    else rc[key] = Math.max(rc[key], v);
  };

  /** One month of the reserve's physics and money (spec v1.1 R3 §3–§6); carries the stock and its cost basis. */
  function reserveMonth(rm: ReserveMonth, plan: ContractPlan, usableAcBoL: number, i: number, fx: number, price: number, cpiMo: number, hicp26: number) {
    const c = plan.c;
    const C = c.acceptedMW;
    const W = rm.window;
    const rte = inp.rte;
    const unit = c.sustainHours * C; // the stock of one unit of mass (spec §4)
    rm.energyPriceUah = price;
    // gross commands and their within-hour netting: a common cancelled quantity keeps the signed difference (R1-05);
    // routine restoration keeps the continuing stock constant; destruction and the exit queue at the month end (R2-01)
    if (W) {
      rm.U = c.activationUp * C * rm.H * rm.A * rm.Zplus;
      rm.Dn = c.activationDown * C * rm.H * rm.A * rm.Zplus;
      rm.K = (1 - c.nettingShare) * Math.min(rm.U, rm.Dn);
      rm.Uset = rm.U - rm.K;
      rm.Dset = rm.Dn - rm.K;
      rm.Broutine = Math.max(rm.U / rte - rm.Dn, 0);
      rm.Xroutine = Math.max(rte * rm.Dn - rm.U, 0);
      rm.J = c.onHit === "terminated" ? plan.hitLoss[i]! * unit : 0;
      rm.exitQueue = (plan.otherLoss[i]! + (i === plan.lastService ? plan.Send : 0)) * unit;
    }
    // the fill on the last day of the month before the first obligated hour; the exit sale on the 1st (spec §4)
    if (i === plan.fillIndex) rm.Bfill = unit / rte;
    rm.Xexit = plan.exitMass[i]! * unit;
    rm.B = rm.Bfill + rm.Broutine;
    rm.X = rm.Xroutine + rm.Xexit;
    // one identity on the totals, compared with the closing stock the states imply
    rm.Iopen = stock;
    rm.Iclose = rm.Iopen + rte * (rm.Dn + rm.B) - rm.U - rm.X - rm.J;
    const expected = i === plan.fillIndex ? unit
      : W ? (i === plan.lastService ? rm.exitQueue : unit * (plan.S[i]! - plan.hitLoss[i]! - plan.otherLoss[i]!) + rm.exitQueue)
      : 0;
    rc.energyBalance = Math.max(rc.energyBalance, Math.abs(rm.Iclose - expected));
    stock = rm.Iclose;
    stockOut += rm.Xexit + rm.J;
    // the cost basis: the fill's commodity cost, released on the exit sale and written off on destruction (spec §4)
    if (i === plan.fillIndex) {
      rm.fillPurchaseUah = rm.Bfill * price;
      rm.basisAddUah = rm.fillPurchaseUah;
      unitBasis = rm.fillPurchaseUah / unit;
    }
    rm.basisReleaseUah = unitBasis * rm.Xexit;
    rm.basisWriteOffUah = unitBasis * rm.J;
    basis = basis + rm.basisAddUah - rm.basisReleaseUah - rm.basisWriteOffUah;
    rm.basisCloseUah = basis;
    rc.inventoryCost = Math.max(rc.inventoryCost, Math.abs(basis - unitBasis * stock));
    // money, accrual, UAH ex VAT
    const award = plan.awards.find((a) => a.tag === rm.award);
    const pc = award ? award.eurPerMWHour : 0;
    if (W) {
      rm.capacityUah = C * pc * fx * rm.H * rm.A * rm.Zplus;
      rm.penaltyAsUah = RESERVE.penaltyFactorAfrr * pc * fx * C * c.penaltyHours * (c.failureEvents / 12) * rm.Zplus;
      rm.standingMWh = c.standingLoadShare * C * rm.H * rm.Zplus;
    }
    rm.upEnergyUah = rm.Uset * price * (1 + c.balancingPremiumUp);
    rm.downEnergyUah = rm.Dset * price * (1 - c.balancingPremiumDown);
    rm.restorationPurchaseUah = rm.Broutine * price;
    rm.restorationSaleUah = rm.Xroutine * price;
    rm.exitSaleUah = rm.Xexit * price;
    rm.penaltyBsUah = c.bsFeeShare * (rm.Uset + rm.Dset) * price;
    rm.standingLoadUah = rm.standingMWh * price;
    if (plan.recertIndex.includes(i)) rm.recertUah = RESERVE.certificateCostEur2026 * hicp26 * fx * (plan.S[i]! + plan.R[i]!);
    const moRate = OPEX.marketOperatorFeeUahPerMWh * cpiMo;
    rm.moFeeUah = moRate * (rm.B + rm.X + rm.standingMWh);
    rm.moFeeExitUah = moRate * rm.Xexit;
    rm.levyUpUah = OPEX.neurcFeeRate * rm.upEnergyUah;
    rm.levyExitUah = OPEX.neurcFeeRate * rm.exitSaleUah;
    rm.levyUah = OPEX.neurcFeeRate * (rm.restorationSaleUah + rm.exitSaleUah + rm.upEnergyUah);
    // the daily envelope (spec §3): service days (а) quota and (б) recovery; the fill day (в) and the exit day (г)
    const Q = inp.cycleCap * usableAcBoL;
    const Hd = RESERVE.longestDayHours;
    const Ht = RESERVE.transitionDayHours;
    const pcsPower = C * (1 + c.recoveryPowerShare);
    rm.quota.Q = Q;
    if (W) {
      const phi = c.peakDayFactor;
      const Uday = phi * c.activationUp * C * Hd;
      const Xday = phi * Math.max(0, rte * c.activationDown - c.activationUp) * C * Hd;
      const Bday = phi * Math.max(0, c.activationUp / rte - c.activationDown) * C * Hd;
      rm.quota.a = [Uday + Xday, rm.sigmaStar * Q];
      rm.quota.b = [Math.max(Bday, Xday), c.recoveryPowerShare * C * Hd];
      screen("quotaA", rm.award, rm.quota.a[0] - rm.quota.a[1]);
      screen("recoveryB", rm.award, rm.quota.b[0] - rm.quota.b[1]);
    }
    if (i === plan.fillIndex) {
      rm.quota.fill = [rm.Bfill, pcsPower * Ht];
      screen("transitionPower", "A1", rm.quota.fill[0] - rm.quota.fill[1]);
    }
    if (rm.Xexit > 0) {
      rm.quota.exitQuota = [unit, rm.sigmaStar * Q];
      rm.quota.exitPower = [unit, pcsPower * Ht];
      screen("quotaA", rm.exitOrigin, rm.quota.exitQuota[0] - rm.quota.exitQuota[1]);
      screen("transitionPower", rm.exitOrigin, rm.quota.exitPower[0] - rm.quota.exitPower[1]);
    }
  }

  for (const m of cal.months) {
    const fx = fxMonth(m.year, m.month, inp.fxStress);
    const row: OpsMonth = {
      index: m.index, fx, operating: m.phase === "operation", usableHours: 0, sohInitial: 0, importMWh: 0, exportMWh: 0,
      auxMWh: 0, salesUah: 0, purchasesUah: 0, purchasesHistUah: 0, pfMarginUah: 0, capturedUah: 0, captureLossUah: 0, optimiserFeeUah: 0,
      opexUah: 0, tariffUah: 0, warExpectedUah: 0, insurancePremiumUah: 0, insuranceClaimAccrualUah: 0,
      insurancePayoutUah: payouts.get(m.index) ?? 0, stateCompensationAccrualUah: 0,
      stateCompensationUah: compensations.get(m.index) ?? 0, lifecycleVatUah: 0, lifecycleCapexUah: 0, decommissioningUah: 0,
      grossTariffRegime: false, libraryFeeUah: 0, peakDayPurchasesUah: 0, reserve: null, fixedOpexUah: 0,
    };
    months.push(row);
    if (m.phase === "settlement") {
      if (m.index === cal.months.length - 1) {
        row.decommissioningUah = TECH.decommissioningEurPerKwhUsable2026 * usableBoL * 1000 * (hicpIndex(m.year) / hicpIndex(2026)) * fx;
      }
      continue;
    }
    if (m.phase !== "operation") continue;

    const y = m.year;
    const hicp = hicpIndex(y) / hicpIndex(2026);
    const cpi = uaCpiIndex(y) / uaCpiIndex(2026);
    const cpiMo = uaCpiIndex(y) / uaCpiIndex(2027); // market operator fee: the rate is for 2027 (A02)
    // lifecycle events at the start of the month
    if (inp.augmentation && m.opIndex === TECH.augmentation.monthAfterCod) {
      const addDc = TECH.augmentation.dcShareOfInitial * capex.nameplateDcMWh;
      cohorts.push({ bol: addDc / TECH.nameplateFactor, start: m.index, efc: 0, active: true });
      row.lifecycleCapexUah += addDc * 1000 * TECH.augmentation.priceEurPerKwhDc2026 * hicp * fx;
      augmentationUah = row.lifecycleCapexUah;
    }
    if (m.opIndex === TECH.pcsOverhaul.monthAfterCod) row.lifecycleCapexUah += TECH.pcsOverhaul.eurPerMW2026 * P * hicp * fx;
    // the import VAT relief ends by 2029 at the latest, so later equipment carries recoverable 20 % VAT
    row.lifecycleVatUah = CAPEX.vatRate * row.lifecycleCapexUah;

    // usable energy at the start of the month
    let usable = 0;
    const shares: number[] = [];
    for (const c of cohorts) {
      const h = c.active ? soh((m.index - c.start) / 12, c.efc, stress) : 0;
      if (c.active && h < TECH.minimumOperatingSoH) c.active = false;
      const u = c.active ? c.bol * h : 0;
      shares.push(u);
      usable += u;
      if (c === cohorts[0]) row.sohInitial = c.active ? h : 0;
    }
    row.usableHours = usable / P;

    // scenario path and the import fee in the library's base-period scale
    const mult = s.spreadScale * yearKey(SPREAD_PATHS[s.scenario], y);
    const level = yearKey(PRICE_LEVEL_EUR, y);
    row.grossTariffRegime = cohortLost || m.start >= grossFrom;
    const tdRate = GRID.transmissionDispatchUahPerMWh2027 * (uaCpiIndex(y) / uaCpiIndex(2027));
    const distRate = inp.connection === "dso110kV" ? GRID.distributionClass1UahPerMWh2026 * cpi : 0;
    const tariffRate = tdRate + distRate;
    // Map nominal per-MWh charges onto the library's base-period price scale (spec §6).
    const toBase = (uahPerMWh: number) =>
      inp.pathCurrency === "EUR" ? (uahPerMWh * FX_ANCHOR_2025) / (fx * hicpIndex(y) * mult) : uahPerMWh / (uaCpiIndex(y) * mult);
    if (lib.manifest.version >= 2) {
      // S1.2: in a closed day Σd = RTE·Σc, so a charge on net withdrawal, a uniform price-level shift and a per-MWh fee
      // on both directions are each an exact equivalent of a fee on purchases: one axis carries all of them.
      const shift = inp.pathCurrency === "EUR"
        ? ((level - mult * meta.avgPriceEUR) / mult) * FX_ANCHOR_2025
        : (level * FX_ANCHOR_2025 - mult * meta.avgPriceUAH) / mult;
      const gross = row.grossTariffRegime ? toBase(tariffRate) : 0;
      const net = row.grossTariffRegime ? 0 : toBase(tariffRate);
      const mo = toBase(OPEX.marketOperatorFeeUahPerMWh * cpiMo);
      const raw = gross + (1 - inp.rte) * (net + shift) + (1 + inp.rte) * mo;
      // a negative equivalent fee is floored at zero: a deliberately conservative dispatch proxy, counted (M01)
      if (raw < 0) feeFloorMonths += 1;
      row.libraryFeeUah = Math.max(0, raw);
    } else if (row.grossTariffRegime) {
      row.libraryFeeUah = toBase(tariffRate); // S1.1: only the gross-withdrawal tariff enters the dispatch
    }
    // below the library's lowest usable-energy node the remaining modules are retired: the battery stands idle while
    // its fixed costs continue (spec §5, §7; U11)
    const lowest = lib.manifest.axes.usableHours[String(inp.durationH)]![0]!;
    let lib0 = null;
    if (row.usableHours < lowest - 1e-9) retiredBelowGrid = true;
    else {
      try {
        lib0 = lookup(lib, key, row.usableHours, row.libraryFeeUah, s.lowerNode);
      } catch (e) {
        if (e instanceof UnsupportedLibraryInput) {
          unsupported ??= `${m.year}-${String(m.month).padStart(2, "0")}: ${e.message}`;
          continue;
        }
        throw e;
      }
    }
    const f = lib0 ? monthFields(lib0, m.month) : { salesUAH: 0, purchasesUAH: 0, salesEUR: 0, purchasesEUR: 0, importMWh: 0, exportMWh: 0 };
    const avail = (m.opIndex < 12 ? TECH.availabilityYear1 : TECH.availability) * (1 - outageDerate);
    // v1.1a: in its service months the reserve holds a homogeneous slice σ* of PCS and energy per unit of mass; the fill
    // and exit days withhold the moving mass's slice for one day (τ); the DA slice is the rest of the battery,
    // σ_a = 1 − σ·Z − τ (spec R3 §3). Without a contract Pda is P exactly and the v1 arithmetic is unchanged.
    let rm: ReserveMonth | null = null;
    let Pda = P;
    if (plan) {
      const i = m.index;
      const c = plan.c;
      const W = plan.window[i]!;
      const C = c.acceptedMW;
      // simultaneous import of a serving state: down command, recovery, the reserve's standing load and the site's own
      // auxiliary-load stress (R2-02)
      const aAux = inp.auxStress ? TECH.auxStressShareOfPower : 0;
      const sigmaP = (C * (1 + c.recoveryPowerShare + c.standingLoadShare)) / P + aAux;
      const sigmaE = row.usableHours > 0 ? (C * 2 * c.sustainHours) / (row.usableHours * P) : Infinity;
      const sigmaStar = Math.max(sigmaP, sigmaE);
      const moving = (i === plan.fillIndex ? 1 : 0) + plan.exitMass[i]!;
      const tau = moving > 0 ? (sigmaStar * moving) / m.days : 0;
      const sigma = W ? sigmaStar : 0;
      const sigmaA = 1 - sigma * plan.Z[i]! - tau;
      const exitOrigin = plan.exitOrigin[i]!;
      if (W) screen("headroom", plan.awardOf[i]!, sigmaStar - 1);
      if (i === plan.fillIndex) screen("headroom", "A1", sigmaStar - 1);
      if (plan.exitMass[i]! > 0) screen("headroom", exitOrigin, sigmaStar - 1);
      Pda = P * sigmaA;
      rm = {
        award: plan.awardOf[i]!, exitOrigin, window: W, H: settlementHours(m.month, m.days), A: m.opIndex < 12 ? TECH.availabilityYear1 : TECH.availability,
        S: plan.S[i]!, R: plan.R[i]!, released: plan.released[i]!, Zplus: plan.Zplus[i]!, Z: plan.Z[i]!, sigmaP, sigmaE, sigmaStar, sigma, tau, sigmaA,
        U: 0, Dn: 0, K: 0, Uset: 0, Dset: 0, Broutine: 0, Xroutine: 0, Bfill: 0, Xexit: 0, B: 0, X: 0, J: 0, exitQueue: 0,
        Iopen: 0, Iclose: 0, standingMWh: 0, energyPriceUah: 0, capacityUah: 0, upEnergyUah: 0, downEnergyUah: 0,
        restorationPurchaseUah: 0, restorationSaleUah: 0, fillPurchaseUah: 0, exitSaleUah: 0, basisAddUah: 0, basisReleaseUah: 0,
        basisWriteOffUah: 0, basisCloseUah: 0, penaltyAsUah: 0, penaltyBsUah: 0, standingLoadUah: 0, recertUah: 0, moFeeUah: 0,
        levyUah: 0, moFeeExitUah: 0, levyExitUah: 0, levyUpUah: 0, networkTotalUah: 0, networkDaUah: 0, networkServiceUah: 0,
        quota: { Q: 0, a: [0, 0], b: [0, 0], fill: [0, 0], exitQuota: [0, 0], exitPower: [0, 0] },
      };
      row.reserve = rm;
    }
    const I = f.importMWh * Pda * avail;
    const O = f.exportMWh * Pda * avail;
    row.importMWh = I;
    row.exportMWh = O;
    row.peakDayPurchasesUah = (lib0?.peakDayPurchasesUAH ?? 0) * Pda;
    row.purchasesHistUah = f.purchasesUAH * Pda * avail;

    if (inp.pathCurrency === "EUR") {
      const sh = f.salesEUR * Pda * avail;
      const ph = f.purchasesEUR * Pda * avail;
      const shift = level - mult * meta.avgPriceEUR;
      row.salesUah = (mult * sh + shift * O) * hicpIndex(y) * fx;
      row.purchasesUah = (mult * ph + shift * I) * hicpIndex(y) * fx;
    } else {
      const sh = f.salesUAH * Pda * avail;
      const ph = f.purchasesUAH * Pda * avail;
      const shift = level * FX_ANCHOR_2025 - mult * meta.avgPriceUAH;
      row.salesUah = (mult * sh + shift * O) * uaCpiIndex(y);
      row.purchasesUah = (mult * ph + shift * I) * uaCpiIndex(y);
    }
    row.pfMarginUah = row.salesUah - row.purchasesUah;
    row.capturedUah = inp.captureFactor * Math.max(row.pfMarginUah, 0) + Math.min(row.pfMarginUah, 0);
    row.captureLossUah = row.pfMarginUah - row.capturedUah;
    row.optimiserFeeUah = inp.optimiserFeeRate * Math.max(row.capturedUah, 0);

    const auxPrice = inp.pathCurrency === "EUR" ? level * hicpIndex(y) * fx : level * FX_ANCHOR_2025 * uaCpiIndex(y);
    if (plan && rm) reserveMonth(rm, plan, capex.usableAcMWh, m.index, fx, auxPrice, cpiMo, hicp);

    // degradation: delivered energy split by usable share, EFC = 0.9 × AC cycles of the cohort's start-of-life energy;
    // the reserve's cell discharge (commands up, routine exports and the exit sale) wears the same cohorts (spec §3)
    const discharge = rm ? O + rm.U + rm.X : O;
    cohorts.forEach((c, j) => {
      if (usable > 0 && c.active) c.efc += (TECH.efcPerAcCycle * discharge * (shares[j]! / usable)) / c.bol;
    });

    // costs
    const aux = inp.auxStress ? TECH.auxStressShareOfPower * P * m.days * 24 : 0;
    row.auxMWh = aux;
    // one network bill for the connection point; the reserve's slice adds its imports and exports (a summed-slice proxy
    // of the meter, spec §3). For the bucket allocation (spec §11) the bill of the DA slice alone and the bill with the
    // non-exit reserve flows are kept: the exit sale's increment follows the exit's origin
    const bill = (imp: number, exp: number) => tariffRate * (row.grossTariffRegime ? I + aux + imp : Math.max(0, I + aux + imp - O - exp));
    const resImp = rm ? rm.Dn + rm.B + rm.standingMWh : 0;
    row.tariffUah = bill(resImp, rm ? rm.U + rm.X : 0);
    if (rm) {
      rm.networkTotalUah = row.tariffUah;
      rm.networkServiceUah = bill(resImp, rm.U + rm.Xroutine);
      rm.networkDaUah = bill(0, 0);
    }
    const rvEur = rv2026 * hicp;
    const eur = (v: number) => v * fx;
    row.opexUah =
      eur((OPEX.omEurPerKwYear * P * 1000 * hicp) / 12) +
      eur((OPEX.propertyInsuranceRate * rvEur) / 12) +
      OPEX.securityUahPerMonth * cpi +
      eur((OPEX.spvAdminEurPerYear * hicp) / 12) +
      eur((OPEX.meteringEurPerYear * hicp) / 12) +
      (OPEX.landLeaseEurPerHaYear * OPEX.landHa * CAPEX.bookFxUah * cpi) / 12 +
      OPEX.marketOperatorFeeUahPerMWh * cpiMo * (I + O + aux) +
      OPEX.marketOperatorFeeUahPerMonth * cpiMo +
      OPEX.neurcFeeRate * row.salesUah +
      aux * auxPrice;
    if (rm) {
      row.fixedOpexUah =
        eur((OPEX.omEurPerKwYear * P * 1000 * hicp) / 12) +
        eur((OPEX.propertyInsuranceRate * rvEur) / 12) +
        OPEX.securityUahPerMonth * cpi +
        eur((OPEX.spvAdminEurPerYear * hicp) / 12) +
        eur((OPEX.meteringEurPerYear * hicp) / 12) +
        (OPEX.landLeaseEurPerHaYear * OPEX.landHa * CAPEX.bookFxUah * cpi) / 12 +
        OPEX.marketOperatorFeeUahPerMonth * cpiMo;
    }

    // war risk: expected loss without cover; with insurance the premium, the expected repair and lagged receipts
    if (inp.insurance) {
      row.insurancePremiumUah = eur((WAR.insurancePremiumRate * rvEur) / 12);
      const grossLoss = WAR.severity * rvEur;
      const deductible = Math.max(WAR.deductibleShare * rvEur, WAR.deductibleMinEur);
      row.warExpectedUah = eur((hit / 12) * grossLoss);
      // deductible per event = max(5 % of the replacement value, €250k), applied to the 40 % severity loss
      const payout = eur((hit / 12) * Math.max(0, grossLoss - deductible));
      row.insuranceClaimAccrualUah = payout;
      const due = m.index + WAR.insurancePayoutLagMonths;
      payouts.set(due, (payouts.get(due) ?? 0) + payout);
      if (inp.stateBudgetAvailable) {
        // the UAH 5 m ceiling counts compensation by the calendar year it is paid out; one fee per policy year
        const at = m.index + WAR.stateCompensationLagMonths;
        const receiptYear = cal.months[Math.min(at, cal.months.length - 1)]!.year + Math.max(0, at - (cal.months.length - 1)) / 12;
        const key = Math.floor(receiptYear);
        const used = compUsed.get(key) ?? 0;
        const accrual = Math.max(0, Math.min(((WAR.insurancePremiumRate - 0.01) * rvEur * fx) / 12, WAR.stateCompensationCapUah - used));
        compUsed.set(key, used + accrual);
        row.stateCompensationAccrualUah = accrual;
        compensations.set(at, (compensations.get(at) ?? 0) + accrual);
        if (m.opIndex % 12 === 0) row.opexUah += WAR.stateCompensationFeeUah;
      }
    } else {
      row.warExpectedUah = eur((elRate * rvEur) / 12);
    }
  }
  // receivables falling due after the last month are not collected: the ledger writes them off (no claim recovery
  // beyond the settlement horizon is assumed)
  rc.inventory = Math.max(Math.abs(stock), Math.abs(basis));
  // every unit of the filled stock leaves exactly once, by an exit sale or destruction (spec §4, noDoubleSale)
  if (plan && !plan.cancelled) rc.lifecycle = Math.abs(plan.c.sustainHours * plan.c.acceptedMW - stockOut);
  return { months, cohortLost, unsupported, augmentationUah, retiredBelowGrid, feeFloorMonths, reserveChecks: rc };
}
