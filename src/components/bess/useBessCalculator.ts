"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BessClient, SUPERSEDED } from "@/bess/client";
import { BESS_BASE, type BessInputs } from "@/bess/engine";
import type { BessFieldDef, BessFieldValue } from "@/bess/fields";
import {
  bessLinkHasInputs,
  clearBessInputs,
  decodeBessInputs,
  encodeBessInputs,
  ignoredBessParams,
  loadBessInputs,
  saveBessInputs,
} from "@/bess/url-state";
import type { BessCore, BessExtras, BessPStar, BessTornado } from "@/bess/view";

export interface BessInitial {
  core: BessCore;
  extras: BessExtras;
  tornado: BessTornado;
  pstar: BessPStar;
}

/** Everything computed for one set of inputs; the parts arrive one after the other. */
interface Entry {
  core: BessCore;
  extras?: BessExtras;
  tornado?: BessTornado;
  pstar?: BessPStar;
}

const keyOf = (i: BessInputs) => encodeBessInputs(i, BESS_BASE);
const CACHE_SIZE = 12;

/**
 * Battery calculator state. The first render shows the base case computed at build time (the static HTML has it);
 * after mounting, inputs from the link — or the last session, if the visitor asked to remember it — are applied and
 * calculated in a worker. Until a result arrives, the previous one stays on screen, marked as recalculating.
 */
export function useBessCalculator(initial: BessInitial) {
  const [inputs, setInputs] = useState<BessInputs>(BESS_BASE);
  const [restored, setRestored] = useState(false);
  const [remember, setRemember] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [wantTornado, setWantTornado] = useState(false);
  // results by input key; the base case is there from the start
  const cache = useRef(new Map<string, Entry>([["", { ...initial }]]));
  const [shownKey, setShownKey] = useState("");
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const client = useRef<BessClient | null>(null);
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

  const worker = () => (client.current ??= new BessClient());
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

  // break-even and alternatives for what is shown
  useEffect(() => {
    if (entry.extras) return;
    let live = true;
    const k = shownKey;
    worker()
      .extras(entry.core.inputs, entry.core.result.funding)
      .then((extras) => {
        if (extras !== SUPERSEDED && live) put(k, { extras });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, entry.extras === undefined, attempt]);

  // the reserve contract's break-even price and the largest award: slow, after the main run and the break-even spread
  useEffect(() => {
    if (entry.pstar) return;
    let live = true;
    const k = shownKey;
    worker()
      .pstar(entry.core.inputs)
      .then((pstar) => {
        if (pstar !== SUPERSEDED && live) put(k, { pstar });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, entry.pstar === undefined, attempt]);

  // sensitivity only while its tab is open
  useEffect(() => {
    if (!wantTornado || entry.tornado) return;
    let live = true;
    const k = shownKey;
    worker()
      .tornado(entry.core.inputs, entry.core.result.funding)
      .then((tornado) => {
        if (tornado !== SUPERSEDED && live) put(k, { tornado });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [shownKey, wantTornado, entry.tornado === undefined, attempt]);

  // inputs from the link, else the remembered ones
  useEffect(() => {
    const stored = loadBessInputs();
    if (stored !== null) setRemember(true);
    const query = window.location.search.slice(1);
    if (bessLinkHasInputs(query)) {
      setIgnored(ignoredBessParams(query));
      const fromUrl = decodeBessInputs(query, BESS_BASE);
      if (fromUrl) setInputs(fromUrl);
      return;
    }
    const fromStorage = stored ? decodeBessInputs(stored, BESS_BASE) : null;
    if (fromStorage) {
      setInputs(fromStorage);
      setRestored(true);
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
    if (remember) saveBessInputs(key);
    else clearBessInputs();
  }, [key, remember]);

  const setField = useCallback((f: BessFieldDef, v: BessFieldValue) => {
    setInputs((prev) => f.set(prev, v));
    setRestored(false);
    setIgnored([]);
  }, []);

  const reset = useCallback(() => {
    setInputs(BESS_BASE);
    setRestored(false);
    setIgnored([]);
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
    remember,
    setRemember,
    /** What is on screen: the result of `core.inputs`, which lag behind `inputs` while pending. */
    core: entry.core,
    extras: entry.extras ?? null,
    tornado: entry.tornado ?? null,
    pstar: entry.pstar ?? null,
    pending: shownKey !== key && !error,
    error,
    retry,
    requestTornado: setWantTornado,
  };
}
