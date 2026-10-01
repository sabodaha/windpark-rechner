"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  BASE_CASE,
  buildSnapshot,
  ENGINE_VERSION,
  hashInputs,
  InvalidInputsError,
  type InputIssue,
  type Inputs,
  type ModelResult,
  type ScenarioName,
} from "@/engine";
import { type FieldDef, type FieldValue, withField } from "@/lib/fields";
import { decodeInputs, encodeInputs, ignoredParams, linkHasInputs, loadFromStorage, saveToStorage } from "@/lib/url-state";

/**
 * One completed calculation: the inputs and the results that belong to them. Everything shown or exported —
 * KPIs, charts, tables, the Excel file — comes from the same snapshot, never from newer inputs.
 */
export type Snapshot = { inputs: Inputs; inputHash: string; engineVersion: string } & (
  | { results: Record<ScenarioName, ModelResult>; issues: null }
  | { results: null; issues: InputIssue[] }
);

/** The engine's ModelSnapshot (without the trace), or the reasons the inputs cannot be calculated. */
function calculate(inputs: Inputs): Snapshot {
  const id = { inputs, inputHash: hashInputs(inputs), engineVersion: ENGINE_VERSION };
  try {
    const model = buildSnapshot(inputs, { trace: false });
    return { inputs: model.inputs, inputHash: model.inputHash, engineVersion: model.engineVersion, results: model.scenarios, issues: null };
  } catch (e) {
    if (e instanceof InvalidInputsError) return { ...id, results: null, issues: e.issues };
    return { ...id, results: null, issues: [{ path: "", message: e instanceof Error ? e.message : String(e) }] };
  }
}

/**
 * Calculator state. The first render uses the base case on server and client alike (the static HTML
 * shows it); after mounting, inputs from the URL — or else the last session — are applied.
 */
export function useCalculator() {
  const [inputs, setInputs] = useState<Inputs>(BASE_CASE);
  const [restored, setRestored] = useState(false);
  /** Parameters of the opening link that were not applied, until the inputs are changed. */
  const [ignored, setIgnored] = useState<string[]>([]);
  const deferred = useDeferredValue(inputs);
  const snapshot = useMemo(() => calculate(deferred), [deferred]);
  const pending = deferred !== inputs;

  useEffect(() => {
    const query = window.location.search.slice(1);
    // A link with inputs is what the visitor asked for — even if none of them can be read, the last session does
    // not replace it: the base case plus the valid values, and a list of the rest.
    if (linkHasInputs(query)) {
      setIgnored(ignoredParams(query));
      const fromUrl = decodeInputs(query, BASE_CASE);
      if (fromUrl) setInputs(fromUrl);
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
    setIgnored([]);
  }, []);

  const reset = useCallback(() => {
    setInputs(BASE_CASE);
    setRestored(false);
    setIgnored([]);
  }, []);

  const isCustom = useMemo(() => encodeInputs(inputs, BASE_CASE) !== "", [inputs]);

  return { inputs, snapshot, pending, setField, reset, isCustom, restored, ignored };
}
