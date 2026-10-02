// Messages between the battery calculator and its worker. The worker loads the revenue library once and answers one
// request at a time; the page decides what to ask next (see client.ts).
import type { BessInputs, LockedFunding } from "./engine";

export type JobKind = "core" | "extras" | "tornado";

export type WorkerRequest =
  | { id: number; kind: "core"; inputs: BessInputs }
  | { id: number; kind: "extras" | "tornado"; inputs: BessInputs; funding: LockedFunding };

export type WorkerResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };
