// Messages between the German battery calculator and its worker. The worker loads the German revenue library once —
// and the Ukrainian one only for the comparison — and answers one request at a time; the page decides what to ask next.
import type { DeInputs, DeLockedFunding } from "./types";

export type DeJobKind = "core" | "extras" | "sensitivity" | "compare";

export type DeWorkerRequest =
  | { id: number; kind: "core" | "extras" | "compare"; inputs: DeInputs }
  | { id: number; kind: "sensitivity"; inputs: DeInputs; funding: DeLockedFunding | null };

export type DeWorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
