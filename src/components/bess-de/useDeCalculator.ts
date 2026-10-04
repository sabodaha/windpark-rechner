"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DeClient, SUPERSEDED } from "@/bess/de/client";
import { DE_BASE } from "@/bess/de/registry";
import type { DeInputs } from "@/bess/de/types";
import { clearDeInputs, deLinkHasInputs, encodeDeInputs, ignoredDeParams, loadDeInputs, readDeInputs, saveDeInputs } from "@/bess/de/url-state";
import { DE_PATH_ORDER, type DeCompare, type DeCore, type DeExtras, type DePathResult, type DeSensitivity } from "@/bess/de/view";
import type { FieldDef, FieldValue } from "@/bess/field-kit";

export interface DeInitial {
  core: DeCore;
  extras: DeExtras;
  paths: DePathResult[] | null;
  sensitivity: DeSensitivity;
  compare: DeCompare;
}

/** Everything computed for one set of inputs; the parts arrive one after the other. */
interface Entry {
  core: DeCore;
  extras?: DeExtras;
  /** The reserve paths found so far, in the order they arrived. */
  paths?: DePathResult[] | null;
  sensitivity?: DeSensitivity;
  compare?: DeCompare;
}

const keyOf = (i: DeInputs) => encodeDeInputs(i, DE_BASE);
const CACHE_SIZE = 12;

/**
 * German calculator state. The first render shows the base case computed at build time (the static HTML has it);
 * after mounting, inputs from the link — or the last session, if the visitor asked to remember it — are applied and
 * calculated in a worker. Until a result arrives, the previous one stays on screen, marked as recalculating. The
 * break-even toll price follows every main run, and with the revenue stack the three reserve paths, one job each;
 * sensitivity and the comparison only while their tab is open.
 */
export function useDeCalculator(initial: DeInitial) {
  const [inputs, setInputs] = useState<DeInputs>(DE_BASE);
  const [restored, setRestored] = useState(false);
  const [remember, setRemember] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  // inputs from a link or a stored entry made before the revenue stack (spec R3.1 §9): opened as "day-ahead only"
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [wantSensitivity, setWantSensitivity] = useState(false);
  const [wantCompare, setWantCompare] = useState(false);
  // results by input key; the base case is there from the start
  const cache = useRef(new Map<string, Entry>([["", { ...initial }]]));
  const [shownKey, setShownKey] = useState("");
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const client = useRef<DeClient | null>(null);
  const key = useMemo(() => keyOf(inputs), [inputs]);
  const latest = useRef(key);
  latest.current = key;

  const put = useCallback((k: string, patch: Partial<Entry>) => {
    const c = cache.current;
    const prev = c.get(k);
    if (!prev && !patch.core) return;
    c.delete(k);
    c.set(k, { ...prev, ...patch } as Entry);
    while (c.size > CACHE_SIZE) {
      const oldest = [...c.keys()].find((x) => x !== "");
      if (oldest === undefined) break;
      c.delete(oldest);
    }
    bump();
  }, []);

  const worker = () => (client.current ??= new DeClient());
  useEffect(() => () => client.current?.dispose(), []);

  // the main run for the current inputs
  useEffect(() => {
    if (cache.current.has(key)) {
      setShownKey(key);
      return;
    }
    let live = true;
    worker()
      .core(inputs)
      .then((core) => {
        if (core === SUPERSEDED || !live) return;
        put(key, { core });
        setError(null);
        if (latest.current === key) setShownKey(key);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // `inputs` belongs to `key`; `attempt` runs it again after an error
  }, [key, attempt, put]);

  const entry = cache.current.get(shownKey) ?? cache.current.get("")!;
  const supported = entry.core.status.primary === "ok";

  // the break-even toll price (or spread multiplier) for what is shown: slow, after the main run
  useEffect(() => {
    if (entry.extras || !supported) return;
    let live = true;
    const k = shownKey;
    worker()
      .extras(entry.core.inputs)
      .then((extras) => {
        if (extras !== SUPERSEDED && live) put(k, { extras });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, entry.extras === undefined, supported, attempt]);

  // the reserve paths of the revenue stack after the break-even price, one job each so that a new main run waits at most
  // one search: the selected path first (it reuses the price just found), then the others in table order. Paused while
  // other inputs are pending; a path already asked for is not asked again, and its answer is kept whenever it arrives.
  const pathJob = useRef<string | null>(null);
  const pathsFound = entry.paths?.length ?? 0;
  useEffect(() => {
    const extras = entry.extras;
    const inputs = entry.core.inputs;
    if (!extras || !supported || inputs.stackEnabled !== true || key !== shownKey) return;
    const order = [inputs.reservePath, ...DE_PATH_ORDER.filter((p) => p !== inputs.reservePath)];
    const next = order.find((p) => !entry.paths?.some((r) => r.path === p));
    const k = shownKey;
    const job = `${attempt}|${k}|${next}`;
    if (!next || pathJob.current === job) return;
    pathJob.current = job;
    const settle = () => {
      if (pathJob.current === job) pathJob.current = null;
    };
    worker()
      .path(inputs, next, { tStar: extras.tStar, k: extras.k })
      .then((result) => {
        settle();
        if (result === SUPERSEDED) return;
        const found = (cache.current.get(k)?.paths ?? []).filter((r) => r.path !== result.path);
        put(k, { paths: [...found, result] });
      })
      .catch((e: Error) => {
        settle();
        setError(e.message);
      });
  }, [key, shownKey, entry.extras === undefined, pathsFound, supported, attempt]);

  // sensitivity only while its tab is open
  useEffect(() => {
    if (!wantSensitivity || entry.sensitivity || !supported) return;
    let live = true;
    const k = shownKey;
    worker()
      .sensitivity(entry.core.inputs, entry.core.funding)
      .then((sensitivity) => {
        if (sensitivity !== SUPERSEDED && live) put(k, { sensitivity });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, wantSensitivity, entry.sensitivity === undefined, supported, attempt]);

  // the comparison with Ukraine only while its tab is open (it loads the Ukrainian library)
  useEffect(() => {
    if (!wantCompare || entry.compare) return;
    let live = true;
    const k = shownKey;
    worker()
      .compare(entry.core.inputs)
      .then((compare) => {
        if (compare !== SUPERSEDED && live) put(k, { compare });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, wantCompare, entry.compare === undefined, attempt]);

  // inputs from the link, else the remembered ones
  useEffect(() => {
    const stored = loadDeInputs();
    if (stored !== null) setRemember(true);
    const query = window.location.search.slice(1);
    if (deLinkHasInputs(query)) {
      setIgnored(ignoredDeParams(query));
      const fromUrl = readDeInputs(query, DE_BASE);
      if (fromUrl.inputs) setInputs(fromUrl.inputs);
      setLegacy(fromUrl.legacy);
      return;
    }
    const fromStorage = stored ? readDeInputs(stored.query, DE_BASE, stored.legacy) : null;
    if (fromStorage?.inputs) {
      setInputs(fromStorage.inputs);
      setRestored(true);
      setLegacy(fromStorage.legacy);
    }
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const url = `${window.location.pathname}${key ? `?${key}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    if (remember) saveDeInputs(key);
    else clearDeInputs();
  }, [key, remember]);

  const setField = useCallback((f: FieldDef<DeInputs>, v: FieldValue) => {
    setInputs((prev) => f.set(prev, v));
    setRestored(false);
    setIgnored([]);
    setLegacy(false);
  }, []);

  const reset = useCallback(() => {
    setInputs(DE_BASE);
    setRestored(false);
    setIgnored([]);
    setLegacy(false);
  }, []);

  const retry = useCallback(() => {
    client.current?.dispose();
    client.current = null;
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  return {
    inputs,
    setField,
    reset,
    isCustom: key !== "",
    restored,
    ignored,
    legacy,
    remember,
    setRemember,
    /** What is on screen: the result of `core.inputs`, which lag behind `inputs` while pending. */
    core: entry.core,
    extras: entry.extras ?? null,
    /** The reserve paths found so far (stack on); null before the first or without the stack. */
    paths: entry.paths ?? null,
    sensitivity: entry.sensitivity ?? null,
    compare: entry.compare ?? null,
    pending: shownKey !== key && !error,
    error,
    retry,
    requestSensitivity: setWantSensitivity,
    requestCompare: setWantCompare,
  };
}
