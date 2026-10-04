// German battery inputs <-> URL query: only fields that differ from the base case are written, in engine units (same
// rules as the Ukrainian calculator), with their own storage entry. Spec R3.1 §9 (M09): a link with inputs carries the
// model version `mv=3`; a link or stored entry without it was made before the revenue stack and opens as "day-ahead
// only" — the calculation it was made with — marked as such.
import { decodeInputs, encodeInputs, ignoredParams, inputStore, linkHasInputs } from "../field-kit";
import { DE_FIELDS } from "./fields";
import type { DeInputs } from "./types";

/** Where the German calculator keeps the inputs when the visitor asks it to remember them (Privacy names this key). */
export const DE_STORAGE_KEY = "battery-storage-calculator-germany:v2:inputs";
/** The key of v1.2 (before the revenue stack): read once as a legacy entry, then removed. */
export const DE_LEGACY_STORAGE_KEY = "battery-storage-calculator-germany:v1:inputs";
const store = inputStore(DE_STORAGE_KEY);
const legacyStore = inputStore(DE_LEGACY_STORAGE_KEY);

/** The model version of links made with the revenue stack (spec R3.1). */
export const DE_MODEL_VERSION = "3";
const VERSION = "mv";

const withoutVersion = (query: string) => {
  const params = new URLSearchParams(query);
  params.delete(VERSION);
  return params.toString();
};

/** A link with inputs and without the current model version. */
const isLegacyLink = (query: string) => linkHasInputs(withoutVersion(query)) && new URLSearchParams(query).get(VERSION) !== DE_MODEL_VERSION;

export const encodeDeInputs = (inputs: DeInputs, base: DeInputs): string => {
  const query = encodeInputs(DE_FIELDS, inputs, base);
  return query ? `${query}&${VERSION}=${DE_MODEL_VERSION}` : "";
};

/** Inputs of a link or a stored entry, and whether they predate the revenue stack: a link without the model version,
 *  or an entry under the legacy storage key (`legacy` given). Legacy inputs are read on top of "day-ahead only" and
 *  open as it even when nothing else applies; current ones on top of the base case, null when nothing applies. */
export function readDeInputs(query: string, base: DeInputs, legacy = isLegacyLink(query)): { inputs: DeInputs | null; legacy: boolean } {
  const from: DeInputs = legacy ? { ...base, stackEnabled: false } : base;
  const inputs = decodeInputs(DE_FIELDS, withoutVersion(query), from);
  return { inputs: inputs ?? (legacy ? from : null), legacy };
}

export const decodeDeInputs = (query: string, base: DeInputs): DeInputs | null => readDeInputs(query, base).inputs;
export const ignoredDeParams = (query: string): string[] => ignoredParams(DE_FIELDS, withoutVersion(query));
export const deLinkHasInputs = (query: string): boolean => linkHasInputs(withoutVersion(query));

/** Saves under the current key and drops a legacy entry. */
export const saveDeInputs = (query: string): void => {
  store.save(query);
  legacyStore.clear();
};
export const clearDeInputs = (): void => {
  store.clear();
  legacyStore.clear();
};
/** The stored inputs: the current entry, else a legacy one (made before the revenue stack); null if none. */
export function loadDeInputs(): { query: string; legacy: boolean } | null {
  const current = store.load();
  if (current !== null) return { query: current, legacy: false };
  const old = legacyStore.load();
  return old === null ? null : { query: old, legacy: true };
}
