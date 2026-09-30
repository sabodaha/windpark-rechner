"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_CASE,
  InvalidInputsError,
  runScenarios,
  type InputIssue,
  type Inputs,
  type ModelResult,
  type ScenarioName,
} from "@/engine";
import { type FieldDef, type FieldValue, withField } from "@/lib/fields";
import { decodeInputs, encodeInputs, loadFromStorage, saveToStorage } from "@/lib/url-state";

/**
 * One completed calculation: the inputs and the results that belong to them. Everything shown or exported —
 * KPIs, charts, tables, the Excel file — comes from the same snapshot, never from newer inputs.
 */
export type Snapshot =
  | { inputs: Inputs; results: Record<ScenarioName, ModelResult>; issues: null }
  | { inputs: Inputs; results: null; issues: InputIssue[] };

function calculate(inputs: Inputs): Snapshot {
  try {
    return { inputs, results: runScenarios(inputs), issues: null };
  } catch (e) {
    if (e instanceof InvalidInputsError) return { inputs, results: null, issues: e.issues };
    return { inputs, results: null, issues: [{ path: "", message: e instanceof Error ? e.message : String(e) }] };
  }
}

/**
 * Calculator state. The first render uses the base case on server and client alike (the static HTML
 * shows it); after mounting, inputs from the URL — or else the last session — are applied.
 */
export function useCalculator() {
  const [inputs, setInputs] = useState<Inputs>(BASE_CASE);
  const [restored, setRestored] = useState(false);
  const deferred = useDeferredValue(inputs);
  const snapshot = useMemo(() => calculate(deferred), [deferred]);
  const pending = deferred !== inputs;

  useEffect(() => {
    const query = window.location.search.slice(1);
    const fromUrl = query ? decodeInputs(query, BASE_CASE) : null;
    if (fromUrl) {
      setInputs(fromUrl);
      return;
    }
    const stored = loadFromStorage();
    const fromStorage = stored ? decodeInputs(stored, BASE_CASE) : null;
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
    const query = encodeInputs(inputs, BASE_CASE);
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    saveToStorage(query);
  }, [inputs]);

  const setField = useCallback((f: FieldDef, v: FieldValue) => {
    setInputs((prev) => withField(prev, f, v));
    setRestored(false);
  }, []);

  const reset = useCallback(() => {
    setInputs(BASE_CASE);
    setRestored(false);
  }, []);

  const isCustom = useMemo(() => encodeInputs(inputs, BASE_CASE) !== "", [inputs]);

  return { inputs, snapshot, pending, setField, reset, isCustom, restored };
}
