// Battery inputs <-> URL query: only fields that differ from the base case are written, in engine units. Same rules
// as the wind calculator (lib/url-state.ts), with its own fields and its own storage entry.
import type { BessInputs } from "./engine";
import { decodeInputs, encodeInputs, ignoredParams, inputStore, linkHasInputs } from "./field-kit";
import { BESS_FIELDS } from "./fields";

/** Where the battery calculator keeps the inputs when the visitor asks it to remember them (Privacy names this key). */
export const BESS_STORAGE_KEY = "battery-storage-calculator:v1:inputs";
const store = inputStore(BESS_STORAGE_KEY);

export const encodeBessInputs = (inputs: BessInputs, base: BessInputs): string => encodeInputs(BESS_FIELDS, inputs, base);
export const decodeBessInputs = (query: string, base: BessInputs): BessInputs | null => decodeInputs(BESS_FIELDS, query, base);
/** Parameters of a link that were not applied: a value outside a field's range or options, or an unknown name. */
export const ignoredBessParams = (query: string): string[] => ignoredParams(BESS_FIELDS, query);
export const bessLinkHasInputs = linkHasInputs;
export const saveBessInputs = store.save;
export const clearBessInputs = store.clear;
/** The stored inputs; "" when the visitor asked to remember the base case; null when nothing is stored. */
export const loadBessInputs = store.load;
