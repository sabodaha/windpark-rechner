// German battery inputs <-> URL query: only fields that differ from the base case are written, in engine units (same
// rules as the Ukrainian calculator), with their own storage entry.
import { decodeInputs, encodeInputs, ignoredParams, inputStore, linkHasInputs } from "../field-kit";
import { DE_FIELDS } from "./fields";
import type { DeInputs } from "./types";

/** Where the German calculator keeps the inputs when the visitor asks it to remember them (Privacy names this key). */
export const DE_STORAGE_KEY = "battery-storage-calculator-germany:v1:inputs";
const store = inputStore(DE_STORAGE_KEY);

export const encodeDeInputs = (inputs: DeInputs, base: DeInputs): string => encodeInputs(DE_FIELDS, inputs, base);
export const decodeDeInputs = (query: string, base: DeInputs): DeInputs | null => decodeInputs(DE_FIELDS, query, base);
export const ignoredDeParams = (query: string): string[] => ignoredParams(DE_FIELDS, query);
export const deLinkHasInputs = linkHasInputs;
export const saveDeInputs = store.save;
export const clearDeInputs = store.clear;
export const loadDeInputs = store.load;
