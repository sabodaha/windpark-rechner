"""Build the derived German revenue library for the battery-storage calculator (spec v1.2 R2 §13, K21).

Same optimiser as the Ukrainian library (algorithm version 2, `solve_day` of build_library.py); German inputs, euro
fields and a signed effective-fee axis. The raw price payloads stay outside the site and are read from paths in
environment variables; only monthly aggregates and multi-day statistics are written:

  public/bess/de-library-v1.bin   Float32 little-endian payload, node order as in the manifest
  public/bess/de-library-v1.json  manifest: market, currency, axes, snapshots, attribution, checks
  public/bess/de-stats-v1.json    derived statistics (averages over many days only)

Prices: DE-LU day-ahead, Bundesnetzagentur | SMARD.de via Energy-Charts (Fraunhofer ISE), CC BY 4.0. From 1 Oct 2025
the native resolution is 15 minutes; the library uses "hourly comparable" prices: the mean of the four quarter-hours of
each UTC hour, days in Europe/Berlin (23, 24 or 25 hours).

PowerShell:
  $env:BESS_DE_PRICES_2025_JSON = "<prices>\\energy_charts_de_lu_2025.json"
  $env:BESS_DE_PRICES_2026_JSON = "<prices>\\energy_charts_de_lu_2026_jan_sep.json"
  python scripts/bess/build_library_de.py --workers 20
"""
from __future__ import annotations

import os

for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

import argparse
import datetime as dt
import hashlib
import json
import math
import platform
import sys
import time
from collections import defaultdict
from multiprocessing import Pool
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import scipy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_library import MIP_REL_GAP, solve_day  # noqa: E402  the shared optimiser (algorithm version 2)

ROOT = Path(__file__).resolve().parents[2]
TZ = ZoneInfo("Europe/Berlin")
FILE_VERSION = 1
ALGORITHM_VERSION = 2
SNAPSHOTS = {
    "DE-2025": (dt.date(2025, 1, 1), dt.date(2025, 12, 31)),
    "DE-LTM-2026-09": (dt.date(2025, 10, 1), dt.date(2026, 9, 30)),
}
QUARTER_HOURS_FROM = dt.date(2025, 10, 1)
DURATIONS = {2: np.round(np.arange(1.2, 2.1001, 0.1), 2), 4: np.round(np.arange(2.4, 4.2001, 0.1), 2)}
CYCLE_CAPS = (1.0, 1.5)
RTE_NODES = (0.85, 0.88, 0.90)
FEE_NODES = tuple(float(v) for v in range(-15, 36, 5))
H_MID_FEES = (-15.0, 10.0, 35.0)
FIELDS = ("salesEUR", "purchasesEUR", "importMWh", "exportMWh")
GOLDEN_DE_2025 = {1: 42_911, 2: 79_766, 4: 134_416}
EXPECT_LBAR = {"DE-2025": 89.3217, "DE-LTM-2026-09": 104.0450}
EXPECT_TB2 = {"DE-2025": 84_737.51, "DE-LTM-2026-09": 97_716.57}
ATTRIBUTION = "Bundesnetzagentur | SMARD.de via Energy-Charts (Fraunhofer ISE), CC BY 4.0; changes: hourly averaging"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"

_DAYS: dict[str, list[tuple[dt.date, np.ndarray]]] = {}


# --------------------------------------------------------------------------------------------- data
def load_days(paths: list[Path]) -> dict[dt.date, np.ndarray]:
    """Local days → hourly prices; quarter-hours averaged by UTC hour (spec R2 §2.1)."""
    raw: dict[dt.date, list[tuple[int, float]]] = defaultdict(list)
    for path in paths:
        src = json.loads(path.read_text(encoding="utf-8-sig"))
        ts, pr = src["unix_seconds"], src["price"]
        if len(ts) != len(pr) or len(ts) != len(set(ts)) or ts != sorted(ts):
            raise ValueError(f"{path.name}: timestamps not unique and sorted")
        for t, v in zip(ts, pr):
            if v is None or not math.isfinite(v):
                raise ValueError(f"{path.name}: missing price at {t}")
            raw[dt.datetime.fromtimestamp(t, TZ).date()].append((t, float(v)))
    days: dict[dt.date, np.ndarray] = {}
    for day, pts in raw.items():
        step = 3600 if day < QUARTER_HOURS_FROM else 900
        start = int(dt.datetime(day.year, day.month, day.day, tzinfo=TZ).timestamp())
        nxt = day + dt.timedelta(days=1)
        end = int(dt.datetime(nxt.year, nxt.month, nxt.day, tzinfo=TZ).timestamp())
        if [p[0] for p in pts] != list(range(start, end, step)):
            continue  # an edge day of a file that is not complete in this file; the snapshot check catches real gaps
        hourly: dict[int, list[float]] = defaultdict(list)
        for t, v in pts:
            hourly[t // 3600].append(v)
        if any(len(v) != 3600 // step for v in hourly.values()):
            raise ValueError(f"{day}: incomplete hour")
        days[day] = np.array([sum(v) / len(v) for _, v in sorted(hourly.items())], dtype=float)
    return days


def snapshot_days(days: dict[dt.date, np.ndarray], start: dt.date, end: dt.date) -> list[tuple[dt.date, np.ndarray]]:
    out, d = [], start
    while d <= end:
        if d not in days:
            raise ValueError(f"missing day {d} in snapshot {start}..{end}")
        out.append((d, days[d]))
        d += dt.timedelta(days=1)
    return out


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tb2(p: np.ndarray) -> float:
    s = np.sort(p)
    return float(s[-2:].sum() - s[:2].sum())


# --------------------------------------------------------------------------------------------- nodes
def solve_node(task: tuple) -> tuple:
    snap, dur, cap, rte, fee, usable_h = task
    out = np.zeros((12, len(FIELDS)))
    peak = 0.0
    for day, p in _DAYS[snap]:
        s, b, imp, exp = solve_day(p, usable_h, cap * dur, rte, fee)
        out[day.month - 1] += (s, b, imp, exp)
        peak = max(peak, b)
    return task, out, peak


def _init_worker(days_by_snap):
    global _DAYS
    _DAYS = days_by_snap


def library_tasks() -> list[tuple]:
    return [(snap, dur, cap, rte, fee, float(h)) for snap in SNAPSHOTS for dur, grid in DURATIONS.items()
            for cap in CYCLE_CAPS for rte in RTE_NODES for fee in FEE_NODES for h in grid]


def midpoint_tasks() -> list[tuple]:
    tasks = []
    for snap in SNAPSHOTS:
        for dur, grid in DURATIONS.items():
            for cap in CYCLE_CAPS:
                for rte in RTE_NODES:
                    for fee in H_MID_FEES:
                        for h0, h1 in zip(grid[:-1], grid[1:]):
                            tasks.append((snap, dur, cap, rte, fee, round(float(h0 + h1) / 2, 3)))
                    for f0, f1 in zip(FEE_NODES[:-1], FEE_NODES[1:]):
                        tasks.append((snap, dur, cap, rte, (f0 + f1) / 2, float(dur)))
    return tasks


def release_gate(lib: dict, mids: dict) -> dict:
    """Spec R2 §13 / registry LIB releaseGate: net objective in EUR (sales − purchases − fee × import); hours axis linear,
    fee axis the better adjacent node schedule per month; monthly denominator max(|exact|, 5 % of the average month, €1)."""
    def objective(arr: np.ndarray, fee: float) -> np.ndarray:
        return arr[:, 0] - arr[:, 1] - fee * arr[:, 2]
    worst = {"annualHours": 0.0, "monthlyHours": 0.0, "annualFee": 0.0, "monthlyFee": 0.0}
    detail = []
    for (snap, dur, cap, rte, fee, h), arr in mids.items():
        grid = DURATIONS[dur]
        exact = objective(arr, fee)
        if h != float(dur):  # midpoint on the usable-hours axis
            k = int(np.searchsorted(grid, h)) - 1
            a = objective(lib[(snap, dur, cap, rte, fee, float(grid[k]))][0], fee)
            b = objective(lib[(snap, dur, cap, rte, fee, float(grid[k + 1]))][0], fee)
            est, axis = (a + b) / 2, "Hours"
        else:  # midpoint on the fee axis at full energy
            f0 = max(f for f in FEE_NODES if f < fee)
            f1 = min(f for f in FEE_NODES if f > fee)
            a = objective(lib[(snap, dur, cap, rte, f0, float(dur))][0], fee)
            b = objective(lib[(snap, dur, cap, rte, f1, float(dur))][0], fee)
            est, axis = np.maximum(a, b), "Fee"
        year_err = abs(est.sum() - exact.sum()) / max(abs(exact.sum()), 1.0)
        floor = max(0.05 * abs(exact.sum()) / 12, 1.0)
        month_err = float(np.max(np.abs(est - exact) / np.maximum(np.abs(exact), floor)))
        worst[f"annual{axis}"] = max(worst[f"annual{axis}"], year_err)
        worst[f"monthly{axis}"] = max(worst[f"monthly{axis}"], month_err)
        detail.append((snap, dur, cap, rte, fee, h, axis, year_err, month_err))
    detail.sort(key=lambda r: -r[7])
    passed = all(worst[f"annual{x}"] <= 0.005 and worst[f"monthly{x}"] <= 0.015 for x in ("Hours", "Fee"))
    return {"metric": "net objective, EUR (sales - purchases - fee x import)",
            "interpolation": {"usableHours": "linear", "importFee": "better adjacent node per month"},
            "monthlyDenominator": "max(|exact|, 5 % of the average month, EUR 1)",
            **{k: float(v) for k, v in worst.items()}, "gateAnnual": 0.005, "gateMonthly": 0.015, "passed": bool(passed),
            "checks": len(mids),
            "worstCases": [{"snapshot": s, "durationH": d, "cycleCap": c, "rte": r, "feeEUR": f, "usableH": hh, "axis": ax,
                            "annualError": round(float(e1), 6), "monthlyError": round(float(e2), 6)}
                           for s, d, c, r, f, hh, ax, e1, e2 in detail[:12]]}


# --------------------------------------------------------------------------------------------- statistics
def snapshot_meta(snap_days) -> dict:
    by_month: dict[int, list] = {m: [] for m in range(12)}
    for day, p in snap_days:
        by_month[day.month - 1].append(p)
    monthly = []
    for m in range(12):
        prices = np.concatenate(by_month[m])
        monthly.append({"month": m + 1, "days": len(by_month[m]), "hours": int(prices.size), "avgPriceEUR": round(float(prices.mean()), 6)})
    allp = np.concatenate([p for _, p in snap_days])
    return {"days": len(snap_days), "hours": int(allp.size), "avgPriceEUR": round(float(allp.mean()), 6),
            "tb2EurPerMw": round(sum(tb2(p) for _, p in snap_days), 4), "monthly": monthly}


def snapshot_stats(snap_days) -> dict:
    """Averages over all days of each month by local clock hour (the repeated autumn hour joins hour 2), TB2 deciles."""
    acc: dict[int, list[list[float]]] = {m: [[] for _ in range(24)] for m in range(1, 13)}
    for day, p in snap_days:
        start = dt.datetime(day.year, day.month, day.day, tzinfo=TZ)
        for i, v in enumerate(p):
            hour = (start.astimezone(dt.timezone.utc) + dt.timedelta(hours=i)).astimezone(TZ).hour
            acc[day.month][hour].append(float(v))
    profile = {str(m): [round(float(np.mean(v)), 3) if v else None for v in hrs] for m, hrs in acc.items()}
    t = np.array([tb2(p) for _, p in snap_days])
    q = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    return {"hourlyProfileByMonth": profile, "tb2": {"meanEUR": round(float(t.mean()), 3), "decilesEUR": [round(float(v), 2) for v in np.percentile(t, q)]}}


def golden(days) -> dict:
    snap = snapshot_days(days, *SNAPSHOTS["DE-2025"])
    out = {}
    for e, target in GOLDEN_DE_2025.items():
        total = sum(s - b for s, b, *_ in (solve_day(p, e, e, 0.90, 0.0) for _, p in snap))
        out[str(e)] = {"value": round(total, 4), "target": target, "ok": round(total) == target}
    return out


# --------------------------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--quick", action="store_true", help="checks, goldens and three nodes; no files written")
    args = ap.parse_args()
    paths = [Path(os.environ["BESS_DE_PRICES_2025_JSON"]), Path(os.environ["BESS_DE_PRICES_2026_JSON"])]
    t0 = time.time()
    days = load_days(paths)
    snaps = {k: snapshot_days(days, a, b) for k, (a, b) in SNAPSHOTS.items()}
    meta = {k: {"from": a.isoformat(), "to": b.isoformat(), **snapshot_meta(snaps[k])} for k, (a, b) in SNAPSHOTS.items()}
    for k in SNAPSHOTS:
        lbar, t2 = meta[k]["avgPriceEUR"], meta[k]["tb2EurPerMw"]
        print(f"{k}: Lbar {lbar} (expected {EXPECT_LBAR[k]}), TB2 {t2} (expected {EXPECT_TB2[k]})", flush=True)
        if abs(lbar - EXPECT_LBAR[k]) > 5e-5 or abs(t2 - EXPECT_TB2[k]) > 0.005:
            sys.exit(f"{k}: snapshot statistics differ from the registry")
    gold = golden(days)
    print("golden DE 2025:", gold, flush=True)
    if not all(g["ok"] for g in gold.values()):
        sys.exit("golden values not reproduced")
    tasks, mids = library_tasks(), midpoint_tasks()
    if args.quick:
        tasks, mids = [t for t in tasks if t[0] == "DE-2025" and t[1] == 2 and t[2] == 1.5 and t[3] == 0.85 and t[5] == 2.0][:3], []
    print(f"{len(tasks)} library nodes, {len(mids)} midpoint checks, {args.workers} workers", flush=True)
    results: dict[tuple, tuple[np.ndarray, float]] = {}
    with Pool(args.workers, initializer=_init_worker, initargs=(snaps,)) as pool:
        for i, (task, arr, peak) in enumerate(pool.imap_unordered(solve_node, tasks + mids, chunksize=2), 1):
            results[task] = (arr, peak)
            if i % 200 == 0:
                print(f"  {i}/{len(tasks) + len(mids)} nodes, {time.time() - t0:,.0f} s", flush=True)
    lib = {t: results[t] for t in tasks}
    if args.quick:
        for t, (arr, peak) in lib.items():
            print(t, "net objective at the node fee, EUR/MW:", round(float((arr[:, 0] - arr[:, 1] - t[4] * arr[:, 2]).sum()), 2), "peak day purchases:", round(peak, 2))
        return
    gate = release_gate(lib, {t: results[t][0] for t in mids})
    print("release gate:", {k: v for k, v in gate.items() if k != "worstCases"}, flush=True)
    if not gate["passed"]:
        sys.exit("release gate failed: the library is not written (spec R2 §13)")

    out_dir = ROOT / "public" / "bess"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = np.zeros((len(tasks), 12 * len(FIELDS) + 1), dtype="<f4")
    for i, t in enumerate(tasks):
        arr, peak = lib[t]
        payload[i, :-1] = arr.reshape(-1)
        payload[i, -1] = peak
    bin_name = f"de-library-v{FILE_VERSION}.bin"
    (out_dir / bin_name).write_bytes(payload.tobytes())
    manifest = {
        "schema": "bess-de-library", "market": "DE", "currency": "EUR", "priceBase": 2025,
        "version": FILE_VERSION, "algorithmVersion": ALGORITHM_VERSION, "created": dt.date.today().isoformat(),
        "spec": "German pack v1.2, specification R2 §13 (revenue library)",
        "attribution": ATTRIBUTION, "license": LICENSE_URL,
        "sources": {"prices2025Sha256": sha256(paths[0]), "prices2026Sha256": sha256(paths[1]),
                    "resolution": "hourly comparable: mean of four quarter-hours per UTC hour from 2025-10-01; local days Europe/Berlin"},
        "problem": {"resolution": "hourly", "boundary": "dailyReset (empty at start and end of each local day)",
                    "losses": "all on charge (RTE on charging)", "auxiliary": "inside RTE", "poiLimits": "1.0 x power",
                    "availability": "1.0 (derated in the engine)", "objective": "max sales - purchases - fee x import",
                    "fee": "signed effective fee in real 2025 EUR/MWh; outside the axis the engine reports unsupportedLibraryInput",
                    "tieBreak": "minimum discharge within 1e-9 x |V*| + 1e-6", "mipRelGap": MIP_REL_GAP, "perMW": True},
        "axes": {"snapshot": list(SNAPSHOTS), "durationHoursBoL": list(DURATIONS),
                 "usableHours": {str(k): [float(x) for x in v] for k, v in DURATIONS.items()},
                 "cycleCap": list(CYCLE_CAPS), "rte": list(RTE_NODES), "importFeeEUR": list(FEE_NODES)},
        "nodeOrder": ["snapshot", "durationHoursBoL", "cycleCap", "rte", "importFeeEUR", "usableHours"],
        "fields": list(FIELDS), "months": 12, "perNodeExtra": ["peakDayPurchasesEUR"],
        "dtype": "float32", "doublesPerNode": 12 * len(FIELDS) + 1, "nodes": len(tasks), "payload": bin_name,
        "payloadSha256": hashlib.sha256(payload.tobytes()).hexdigest(),
        "snapshots": meta, "golden": gold, "releaseGate": gate,
        "build": {"python": platform.python_version(), "scipy": scipy.__version__, "numpy": np.__version__, "seconds": round(time.time() - t0, 1)},
    }
    (out_dir / f"de-library-v{FILE_VERSION}.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    stats = {k: snapshot_stats(snaps[k]) for k in SNAPSHOTS}
    (out_dir / f"de-stats-v{FILE_VERSION}.json").write_text(
        json.dumps({"schema": "bess-de-stats", "version": FILE_VERSION, "attribution": ATTRIBUTION, "license": LICENSE_URL, "snapshots": stats},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"done in {time.time() - t0:,.0f} s: {len(tasks)} nodes, {payload.nbytes:,} bytes", flush=True)


if __name__ == "__main__":
    main()
