"""Build the derived Ukrainian revenue library for the battery-storage calculator.

It follows the model methodology (library section, spec revision S1.2). The raw inputs are private and are read
from paths in environment variables; only monthly aggregates and multi-day statistics are written:

  public/bess/ua-library-v{N}.bin   Float64 little-endian payload, node order as in the manifest
  public/bess/ua-library-v{N}.json  manifest: axes, snapshots, attribution, checks
  public/bess/ua-stats-v{N}.json    derived statistics (averages over many days only)

No single-day value, hourly schedule or raw price is written.

PowerShell:
  $env:BESS_UA_PRICES_CSV = "<private>\\dam_hourly_2023_2026.csv"
  $env:BESS_NBU_FX_JSON = "<private>\\nbu_eur_uah_2024-2026.json"
  python scripts/bess/build_library.py --version 1 --workers 20
"""
from __future__ import annotations

import os

# One BLAS thread per process: with many workers the default thread pools exhaust memory (seen on a 24-thread machine).
for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

import argparse
import datetime as dt
import hashlib
import json
import platform
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csr_matrix

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOTS = {
    "UA-2025": (dt.date(2025, 1, 1), dt.date(2025, 12, 31)),
    "UA-LTM-2026-09": (dt.date(2025, 10, 1), dt.date(2026, 9, 30)),
}
DURATIONS_BY_VERSION = {
    1: {1: np.round(np.arange(0.6, 1.1001, 0.1), 2), 2: np.round(np.arange(1.2, 2.1001, 0.1), 2),
        4: np.round(np.arange(2.4, 4.2001, 0.1), 2)},
    # v2: the 1 h battery needs 0.05 h steps (0.1 h gave 1.1 % midpoint error in v1)
    2: {1: np.round(np.arange(0.6, 1.1001, 0.05), 2), 2: np.round(np.arange(1.2, 2.1001, 0.1), 2),
        4: np.round(np.arange(2.4, 4.2001, 0.1), 2)},
}
DURATIONS = DURATIONS_BY_VERSION[2]
CYCLE_CAPS = (1.0, 1.5)
RTE_NODES = (0.85, 0.88, 0.90)
FEE_NODES_BY_VERSION = {1: (0.0, 1000.0, 2000.0, 3000.0),
                        2: tuple(float(v) for v in range(0, 4001, 500))}
FEE_NODES = FEE_NODES_BY_VERSION[2]
# midpoints on the usable-hours axis are checked at these fee nodes (all fee midpoints are checked at full energy)
H_MID_FEES_BY_VERSION = {1: (0.0, 1000.0, 2000.0, 3000.0), 2: (0.0, 2000.0, 4000.0)}
H_MID_FEES = H_MID_FEES_BY_VERSION[2]
DTYPE_BY_VERSION = {1: "<f8", 2: "<f4"}
FIELDS = ("salesUAH", "purchasesUAH", "salesEUR", "purchasesEUR", "importMWh", "exportMWh")
MIP_REL_GAP = 1e-6
GOLDEN_UA_SEP_2026 = {1: 388_702, 2: 753_228, 4: 1_384_275}
ATTRIBUTION = "Дані: АТ «Оператор ринку», https://www.oree.com.ua"

_DAYS: dict[str, list[tuple[dt.date, np.ndarray, float]]] = {}


# --------------------------------------------------------------------------------------------- data
def load_inputs(csv_path: Path, fx_path: Path) -> tuple[dict[dt.date, np.ndarray], pd.Series]:
    df = pd.read_csv(csv_path)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    days: dict[dt.date, np.ndarray] = {}
    for day, g in df.groupby("date"):
        g = g.sort_values("col")
        expected = int(g["hours_in_day"].iloc[0])
        if len(g) != expected:
            raise ValueError(f"{day}: {len(g)} hours, expected {expected}")
        days[day] = g["price_uah_mwh"].to_numpy(dtype=float)
    fx_rows = json.loads(fx_path.read_text(encoding="utf-8"))
    fx = pd.Series({dt.datetime.strptime(r["exchangedate"], "%d.%m.%Y").date(): float(r["rate"]) for r in fx_rows})
    return days, fx.sort_index()


def snapshot_days(days: dict[dt.date, np.ndarray], fx: pd.Series, start: dt.date, end: dt.date):
    out = []
    d = start
    while d <= end:
        if d not in days:
            raise ValueError(f"missing day {d} in snapshot {start}..{end}")
        rate = fx[fx.index <= d]
        if rate.empty:
            raise ValueError(f"no NBU rate on or before {d}")
        out.append((d, days[d], float(rate.iloc[-1])))
        d += dt.timedelta(days=1)
    return out


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------------------------------------- dispatch
def solve_day(p: np.ndarray, usable_h: float, cap_h: float, rte: float, fee: float) -> tuple[float, float, float, float]:
    """One closed day, 1 MW, perfect foresight. Variables [c, d, x, u]; all losses on charge (spec section 5).

    Returns sales, energy purchases (without the fee), import MWh and export MWh. Ties: maximum margin first, then
    minimum discharge within the stated tolerance."""
    n = len(p)
    rows, cols, vals = [], [], []
    lo, hi = [], []
    r = 0
    for t in range(n):  # x_t - x_{t-1} - rte c_t + d_t = 0
        rows += [r, r, r]; cols += [2 * n + t, t, n + t]; vals += [1.0, -rte, 1.0]
        if t:
            rows.append(r); cols.append(2 * n + t - 1); vals.append(-1.0)
        lo.append(0.0); hi.append(0.0); r += 1
    for t in range(n):  # c_t - u_t <= 0 ; d_t + u_t <= 1
        rows += [r, r]; cols += [t, 3 * n + t]; vals += [1.0, -1.0]; lo.append(-np.inf); hi.append(0.0); r += 1
        rows += [r, r]; cols += [n + t, 3 * n + t]; vals += [1.0, 1.0]; lo.append(-np.inf); hi.append(1.0); r += 1
    rows += [r] * n; cols += list(range(n, 2 * n)); vals += [1.0] * n; lo.append(-np.inf); hi.append(cap_h); r += 1
    a = csr_matrix((vals, (rows, cols)), shape=(r, 4 * n))
    lb = np.zeros(4 * n)
    ub = np.concatenate([np.ones(n), np.ones(n), np.full(n, usable_h), np.ones(n)])
    ub[3 * n - 1] = 0.0  # closed day: empty at the end (and empty at the start by construction)
    integrality = np.concatenate([np.zeros(3 * n), np.ones(n)])
    cost = np.concatenate([p + fee, -p, np.zeros(n), np.zeros(n)])  # minimise purchases + fee - sales
    opts = {"mip_rel_gap": MIP_REL_GAP}
    res = milp(cost, constraints=LinearConstraint(a, lo, hi), bounds=Bounds(lb, ub), integrality=integrality,
               options=opts)
    if res.status != 0:
        raise RuntimeError(f"primary solve failed: {res.message}")
    v_star = -res.fun
    tol = 1e-9 * abs(v_star) + 1e-6  # a looser tie-break tolerance accumulates: 0.01 a day moved the goldens by ~1 UAH
    # second solve: minimum discharge subject to objective >= v* - tol
    a2 = csr_matrix(np.vstack([a.toarray(), cost]))
    lo2 = lo + [-np.inf]
    hi2 = hi + [-v_star + tol]
    cost2 = np.concatenate([np.zeros(n), np.ones(n), np.zeros(n), np.zeros(n)])
    res2 = milp(cost2, constraints=LinearConstraint(a2, lo2, hi2), bounds=Bounds(lb, ub), integrality=integrality,
                options=opts)
    x = res2.x if res2.status == 0 else res.x
    c, d = np.clip(x[:n], 0, None), np.clip(x[n:2 * n], 0, None)
    return float(p @ d), float(p @ c), float(c.sum()), float(d.sum())


def solve_node(task: tuple) -> tuple:
    snap, dur, cap, rte, fee, usable_h = task
    cap_h = cap * dur
    out = np.zeros((12, len(FIELDS)))
    peak_day_purchases = 0.0
    for day, p, rate in _DAYS[snap]:
        s, b, imp, exp = solve_day(p, usable_h, cap_h, rte, fee)
        m = day.month - 1
        out[m] += (s, b, s / rate, b / rate, imp, exp)
        peak_day_purchases = max(peak_day_purchases, b)
    return task, out, peak_day_purchases


def _init_worker(days_by_snap):
    global _DAYS
    _DAYS = days_by_snap


# --------------------------------------------------------------------------------------------- statistics
def tb2(p: np.ndarray) -> float:
    s = np.sort(p)
    return float(s[-2:].mean() - s[:2].mean())


def snapshot_meta(snap_days) -> dict:
    by_month: dict[int, list] = {m: [] for m in range(12)}
    for day, p, rate in snap_days:
        by_month[day.month - 1].append((p, rate))
    monthly = []
    for m in range(12):
        prices = np.concatenate([p for p, _ in by_month[m]])
        prices_eur = np.concatenate([p / rate for p, rate in by_month[m]])
        monthly.append({"month": m + 1, "days": len(by_month[m]), "hours": int(prices.size),
                        "avgPriceUAH": round(float(prices.mean()), 4), "avgPriceEUR": round(float(prices_eur.mean()), 6),
                        "avgFx": round(float(np.mean([r for _, r in by_month[m]])), 6)})
    all_p = np.concatenate([p for _, p, _ in snap_days])
    all_eur = np.concatenate([p / r for _, p, r in snap_days])
    return {"days": len(snap_days), "hours": int(all_p.size), "avgPriceUAH": round(float(all_p.mean()), 4),
            "avgPriceEUR": round(float(all_eur.mean()), 6), "monthly": monthly}


def snapshot_stats(snap_days, csv: pd.DataFrame) -> dict:
    """Averages over all days of each month by local hour of day, and deciles of daily TB2. Nothing per day."""
    profile = {}
    for m in range(1, 13):
        sel = csv[csv["month"] == m]
        if sel.empty:
            continue
        g = sel.groupby("start_hour_local")
        profile[str(m)] = {"uah": [round(float(v), 2) for v in g["price_uah_mwh"].mean().reindex(range(24)).to_numpy()],
                           "eur": [round(float(v), 3) for v in g["price_eur_mwh"].mean().reindex(range(24)).to_numpy()]}
    tb2_uah = np.array([tb2(p) for _, p, _ in snap_days])
    tb2_eur = np.array([tb2(p / r) for _, p, r in snap_days])
    q = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return {"hourlyProfileByMonth": profile,
            "tb2": {"meanUAH": round(float(tb2_uah.mean()), 2), "meanEUR": round(float(tb2_eur.mean()), 3),
                    "decilesUAH": [round(float(v), 1) for v in np.percentile(tb2_uah, q)],
                    "decilesEUR": [round(float(v), 2) for v in np.percentile(tb2_eur, q)]}}


# --------------------------------------------------------------------------------------------- main
def library_tasks(snaps) -> list[tuple]:
    tasks = []
    for snap in snaps:
        for dur, grid in DURATIONS.items():
            for cap in CYCLE_CAPS:
                for rte in RTE_NODES:
                    for fee in FEE_NODES:
                        for h in grid:
                            tasks.append((snap, dur, cap, rte, fee, float(h)))
    return tasks


def midpoint_tasks(snaps) -> list[tuple]:
    tasks = []
    for snap in snaps:
        for dur, grid in DURATIONS.items():
            for cap in CYCLE_CAPS:
                for rte in RTE_NODES:
                    for fee in H_MID_FEES:
                        for h0, h1 in zip(grid[:-1], grid[1:]):
                            tasks.append((snap, dur, cap, rte, fee, round(float(h0 + h1) / 2, 3)))
                    for f0, f1 in zip(FEE_NODES[:-1], FEE_NODES[1:]):
                        tasks.append((snap, dur, cap, rte, (f0 + f1) / 2, float(dur)))
    return tasks


def margin(arr: np.ndarray) -> np.ndarray:
    return arr[:, 0] - arr[:, 1]  # UAH, monthly


def release_gate(lib: dict, mids: dict) -> dict:
    worst_year, worst_month, worst_fee = 0.0, 0.0, 0.0
    by_duration: dict[str, dict[str, float]] = {}
    detail = []
    for (snap, dur, cap, rte, fee, h), arr in mids.items():
        grid = DURATIONS[dur]
        if fee in FEE_NODES:  # midpoint on the usable-hours axis
            k = int(np.searchsorted(grid, h)) - 1
            a = lib[(snap, dur, cap, rte, fee, float(grid[k]))][0]
            b = lib[(snap, dur, cap, rte, fee, float(grid[k + 1]))][0]
        else:  # midpoint on the fee axis
            f0 = max(f for f in FEE_NODES if f < fee)
            f1 = min(f for f in FEE_NODES if f > fee)
            a = lib[(snap, dur, cap, rte, f0, float(dur))][0]
            b = lib[(snap, dur, cap, rte, f1, float(dur))][0]
        exact_m, interp_m = margin(arr), (margin(a) + margin(b)) / 2
        year_err = abs(interp_m.sum() - exact_m.sum()) / max(abs(exact_m.sum()), 1.0)
        floor = 0.05 * abs(exact_m.sum()) / 12
        month_err = float(np.max(np.abs(interp_m - exact_m) / np.maximum(np.abs(exact_m), floor)))
        if fee in FEE_NODES:
            worst_year, worst_month = max(worst_year, year_err), max(worst_month, month_err)
        else:
            worst_fee = max(worst_fee, year_err)
        bd = by_duration.setdefault(str(dur), {"annual": 0.0, "monthly": 0.0})
        bd["annual"], bd["monthly"] = max(bd["annual"], year_err), max(bd["monthly"], month_err)
        detail.append((snap, dur, cap, rte, fee, h, year_err, month_err))
    detail.sort(key=lambda r: -r[6])
    return {"maxAnnualErrorUsableHours": worst_year, "maxMonthlyErrorUsableHours": worst_month,
            "maxAnnualErrorFee": worst_fee, "gateAnnual": 0.005, "gateMonthly": 0.015,
            "passed": bool(worst_year <= 0.005 and worst_month <= 0.015 and worst_fee <= 0.005),
            "byDuration": by_duration,
            "worstCases": [{"snapshot": s, "durationH": d, "cycleCap": c, "rte": r, "feeUAH": f, "usableH": h,
                            "annualError": round(e1, 6), "monthlyError": round(e2, 6)} for s, d, c, r, f, h, e1, e2 in detail[:10]]}


def release_gate_v2(lib: dict, mids: dict) -> dict:
    """S1.2 gate on the net objective (sales - purchases - fee x import), as the optimiser sees it (A12): linear
    interpolation on the usable-hours axis; on the fee axis the better of the two adjacent node schedules, chosen per
    month at the actual fee - a feasible schedule, so the estimate never exceeds the optimum (the value is convex in
    the fee)."""
    def objective(arr: np.ndarray, fee: float) -> np.ndarray:
        return arr[:, 0] - arr[:, 1] - fee * arr[:, 4]
    worst = {"annualHours": 0.0, "monthlyHours": 0.0, "annualFee": 0.0, "monthlyFee": 0.0}
    by_duration: dict[str, dict[str, float]] = {}
    detail = []
    for (snap, dur, cap, rte, fee, h), arr in mids.items():
        grid = DURATIONS[dur]
        exact = objective(arr, fee)
        if fee in FEE_NODES:
            k = int(np.searchsorted(grid, h)) - 1
            a = objective(lib[(snap, dur, cap, rte, fee, float(grid[k]))][0], fee)
            b = objective(lib[(snap, dur, cap, rte, fee, float(grid[k + 1]))][0], fee)
            est = (a + b) / 2
            axis = "Hours"
        else:
            f0 = max(f for f in FEE_NODES if f < fee)
            f1 = min(f for f in FEE_NODES if f > fee)
            a = objective(lib[(snap, dur, cap, rte, f0, float(dur))][0], fee)
            b = objective(lib[(snap, dur, cap, rte, f1, float(dur))][0], fee)
            est = np.maximum(a, b)
            axis = "Fee"
        year_err = abs(est.sum() - exact.sum()) / max(abs(exact.sum()), 1.0)
        floor = 0.05 * abs(exact.sum()) / 12
        month_err = float(np.max(np.abs(est - exact) / np.maximum(np.abs(exact), max(floor, 1.0))))
        worst[f"annual{axis}"] = max(worst[f"annual{axis}"], year_err)
        worst[f"monthly{axis}"] = max(worst[f"monthly{axis}"], month_err)
        bd = by_duration.setdefault(str(dur), {"annual": 0.0, "monthly": 0.0})
        bd["annual"], bd["monthly"] = max(bd["annual"], year_err), max(bd["monthly"], month_err)
        detail.append((snap, dur, cap, rte, fee, h, axis, year_err, month_err))
    detail.sort(key=lambda r: -r[7])
    passed = all(worst[f"annual{x}"] <= 0.005 and worst[f"monthly{x}"] <= 0.015 for x in ("Hours", "Fee"))
    return {"metric": "net objective, UAH (sales - purchases - fee x import)",
            "interpolation": {"usableHours": "linear", "importFee": "better adjacent node per month"},
            **{k: float(v) for k, v in worst.items()}, "gateAnnual": 0.005, "gateMonthly": 0.015, "passed": bool(passed),
            "byDuration": {d: {k: float(v) for k, v in vals.items()} for d, vals in by_duration.items()},
            "worstCases": [{"snapshot": s, "durationH": d, "cycleCap": c, "rte": r, "feeUAH": f, "usableH": h, "axis": ax,
                            "annualError": round(float(e1), 6), "monthlyError": round(float(e2), 6)}
                           for s, d, c, r, f, h, ax, e1, e2 in detail[:12]]}


def load_payload(version: int) -> dict:
    out_dir = ROOT / "public" / "bess"
    manifest = json.loads((out_dir / f"ua-library-v{version}.json").read_text(encoding="utf-8"))
    dtype = "<f4" if manifest.get("dtype") == "float32" else "<f8"
    payload = np.frombuffer((out_dir / manifest["payload"]).read_bytes(), dtype=dtype).astype(np.float64)
    payload = payload.reshape(manifest["nodes"], manifest["doublesPerNode"])
    lib = {}
    for i, t in enumerate(library_tasks(SNAPSHOTS)):
        lib[t] = (payload[i, :-1].reshape(12, len(FIELDS)), float(payload[i, -1]))
    return manifest, lib


def golden(days, fx) -> dict:
    sep = snapshot_days(days, fx, dt.date(2026, 9, 1), dt.date(2026, 9, 30))
    out = {}
    for e, target in GOLDEN_UA_SEP_2026.items():
        total = sum(s - b for s, b, *_ in (solve_day(p, e, e, 0.90, 0.0) for _, p, _ in sep))
        out[str(e)] = {"value": round(total, 4), "target": target, "ok": round(total) == target}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", type=int, required=True)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--quick", action="store_true", help="tiny subset, no files written")
    ap.add_argument("--gate-only", action="store_true", help="re-run the release gate on an existing payload (S1.2 rule)")
    args = ap.parse_args()
    global FEE_NODES, H_MID_FEES, DURATIONS
    FEE_NODES = FEE_NODES_BY_VERSION[args.version]
    DURATIONS = DURATIONS_BY_VERSION[args.version]
    H_MID_FEES = H_MID_FEES_BY_VERSION[args.version]
    csv_path = Path(os.environ["BESS_UA_PRICES_CSV"])
    fx_path = Path(os.environ["BESS_NBU_FX_JSON"])
    t0 = time.time()
    days, fx = load_inputs(csv_path, fx_path)

    gold = golden(days, fx)
    print("golden UA Sep 2026:", gold, flush=True)
    if not all(g["ok"] for g in gold.values()):
        sys.exit("golden values not reproduced")

    snaps = {k: snapshot_days(days, fx, a, b) for k, (a, b) in SNAPSHOTS.items()}
    tasks = library_tasks(snaps)
    mids = midpoint_tasks(snaps)
    if args.gate_only:
        manifest, lib_existing = load_payload(args.version)
        results_mid: dict[tuple, np.ndarray] = {}
        with Pool(args.workers, initializer=_init_worker, initargs=(snaps,)) as pool:
            for i, (task, arr, _peak) in enumerate(pool.imap_unordered(solve_node, mids, chunksize=2), 1):
                results_mid[task] = arr
                if i % 200 == 0:
                    print(f"  {i}/{len(mids)} midpoints, {time.time() - t0:,.0f} s", flush=True)
        gate = release_gate_v2(lib_existing, results_mid)
        print("release gate (S1.2):", {k: v for k, v in gate.items() if k != "worstCases"}, flush=True)
        manifest["releaseGate"] = gate
        manifest["releaseGateRecomputed"] = dt.date.today().isoformat()
        out_dir = ROOT / "public" / "bess"
        (out_dir / f"ua-library-v{args.version}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        return
    if args.quick:
        tasks = [t for t in tasks if t[0] == "UA-2025" and t[1] == 2 and t[2] == 1.5 and t[3] == 0.85 and t[4] == 0.0][:3]
        mids = []
    print(f"{len(tasks)} library nodes, {len(mids)} midpoint checks, {args.workers} workers", flush=True)

    results: dict[tuple, tuple[np.ndarray, float]] = {}
    with Pool(args.workers, initializer=_init_worker, initargs=(snaps,)) as pool:
        for i, (task, arr, peak) in enumerate(pool.imap_unordered(solve_node, tasks + mids, chunksize=2), 1):
            results[task] = (arr, peak)
            if i % 200 == 0:
                print(f"  {i}/{len(tasks) + len(mids)} nodes, {time.time() - t0:,.0f} s", flush=True)
    lib = {t: results[t] for t in tasks}
    mid = {t: results[t][0] for t in mids}
    if args.quick:
        for t, (arr, peak) in lib.items():
            print(t, "annual margin UAH/MW:", round(float(margin(arr).sum())), "peak day purchases:", round(peak))
        return

    gate = release_gate_v2(lib, mid) if args.version >= 2 else release_gate(lib, mid)
    print("release gate:", {k: v for k, v in gate.items() if k != "worstCases"}, flush=True)

    out_dir = ROOT / "public" / "bess"
    out_dir.mkdir(parents=True, exist_ok=True)
    dtype = DTYPE_BY_VERSION[args.version]
    payload = np.zeros((len(tasks), 12 * len(FIELDS) + 1), dtype=dtype)
    for i, t in enumerate(tasks):
        arr, peak = lib[t]
        payload[i, :-1] = arr.reshape(-1)
        payload[i, -1] = peak
    bin_name = f"ua-library-v{args.version}.bin"
    (out_dir / bin_name).write_bytes(payload.tobytes())

    csv = pd.read_csv(csv_path)
    csv["date"] = pd.to_datetime(csv["date"]).dt.date
    stats = {}
    meta = {}
    for snap, (a, b) in SNAPSHOTS.items():
        sel = csv[(csv["date"] >= a) & (csv["date"] <= b)].copy()
        sel["month"] = pd.to_datetime(sel["date"]).dt.month
        rate = {d: r for d, _, r in snaps[snap]}
        sel["price_eur_mwh"] = sel["price_uah_mwh"] / sel["date"].map(rate)
        stats[snap] = snapshot_stats(snaps[snap], sel)
        meta[snap] = {"from": a.isoformat(), "to": b.isoformat(), **snapshot_meta(snaps[snap])}

    manifest = {
        "schema": "bess-ua-library", "version": args.version, "created": dt.date.today().isoformat(),
        "spec": "model methodology S1.2, revenue library",
        "attribution": ATTRIBUTION, "license": "Derived results only; source data © АТ «Оператор ринку». NBU exchange rates.",
        "sources": {"pricesSha256": sha256(csv_path), "fxSha256": sha256(fx_path)},
        "problem": {"resolution": "hourly", "boundary": "dailyReset (empty at start and end of each local day)",
                    "losses": "all on charge (RTE on charging)", "auxiliary": "inside RTE", "poiLimits": "1.0 x power",
                    "availability": "1.0 (derated in the engine)", "objective": "max sales - purchases - fee x import",
                    "tieBreak": "minimum discharge within 1e-9 x |V*| + 1e-6", "mipRelGap": MIP_REL_GAP,
                    "perMW": True},
        "axes": {"snapshot": list(SNAPSHOTS), "durationHoursBoL": list(DURATIONS),
                 "usableHours": {str(k): [float(x) for x in v] for k, v in DURATIONS.items()},
                 "cycleCap": list(CYCLE_CAPS), "rte": list(RTE_NODES), "importFeeUAH": list(FEE_NODES)},
        "nodeOrder": ["snapshot", "durationHoursBoL", "cycleCap", "rte", "importFeeUAH", "usableHours"],
        "fields": list(FIELDS), "months": 12, "perNodeExtra": ["peakDayPurchasesUAH"],
        "dtype": "float32" if dtype == "<f4" else "float64",
        "doublesPerNode": 12 * len(FIELDS) + 1, "nodes": len(tasks), "payload": bin_name,
        "payloadSha256": hashlib.sha256(payload.tobytes()).hexdigest(),
        "snapshots": meta, "golden": gold, "releaseGate": gate,
        "build": {"python": platform.python_version(), "scipy": scipy.__version__, "numpy": np.__version__,
                  "seconds": round(time.time() - t0, 1)},
    }
    (out_dir / f"ua-library-v{args.version}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                                                                 encoding="utf-8")
    (out_dir / f"ua-stats-v{args.version}.json").write_text(
        json.dumps({"schema": "bess-ua-stats", "version": args.version, "attribution": ATTRIBUTION, "snapshots": stats},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done in {time.time() - t0:,.0f} s: {len(tasks)} nodes, {payload.nbytes:,} bytes", flush=True)


if __name__ == "__main__":
    main()
