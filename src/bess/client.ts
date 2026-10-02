// The page's side of the worker. One request runs at a time; of the requests waiting, only the newest of each kind
// is kept (an older one resolves as SUPERSEDED), and the main run goes before break-even and sensitivity.
import type { BessInputs, LockedFunding } from "./engine";
import type { JobKind, WorkerRequest, WorkerResponse } from "./protocol";
import type { BessCore, BessExtras, BessTornado } from "./view";

export const SUPERSEDED = Symbol("superseded");
export type Superseded = typeof SUPERSEDED;

type Payload = { inputs: BessInputs; funding?: LockedFunding };
interface Job {
  kind: JobKind;
  payload: Payload;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const PRIORITY: JobKind[] = ["core", "extras", "tornado"];

export class BessClient {
  private worker: Worker | null = null;
  private running: { id: number; job: Job } | null = null;
  private waiting = new Map<JobKind, Job>();
  private nextId = 1;

  core(inputs: BessInputs) {
    return this.submit<BessCore>("core", { inputs });
  }

  extras(inputs: BessInputs, funding: LockedFunding) {
    return this.submit<BessExtras>("extras", { inputs, funding });
  }

  tornado(inputs: BessInputs, funding: LockedFunding) {
    return this.submit<BessTornado>("tornado", { inputs, funding });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.running = null;
    for (const job of this.waiting.values()) job.resolve(SUPERSEDED);
    this.waiting.clear();
  }

  private submit<T>(kind: JobKind, payload: Payload): Promise<T | Superseded> {
    return new Promise((resolve, reject) => {
      this.waiting.get(kind)?.resolve(SUPERSEDED);
      this.waiting.set(kind, { kind, payload, resolve: resolve as (v: unknown) => void, reject });
      this.pump();
    });
  }

  private start(): Worker {
    if (!this.worker) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.done(e.data);
      w.onerror = (e) => this.crash(e.message || "The calculation could not start.");
      this.worker = w;
    }
    return this.worker;
  }

  private pump() {
    if (this.running) return;
    for (const kind of PRIORITY) {
      const job = this.waiting.get(kind);
      if (!job) continue;
      this.waiting.delete(kind);
      const id = this.nextId++;
      this.running = { id, job };
      try {
        this.start().postMessage({ id, kind, ...job.payload } as WorkerRequest);
      } catch (e) {
        this.running = null;
        job.reject(e instanceof Error ? e : new Error(String(e)));
        continue;
      }
      return;
    }
  }

  private done(res: WorkerResponse) {
    const r = this.running;
    if (!r || r.id !== res.id) return;
    this.running = null;
    if (res.ok) r.job.resolve(res.value);
    else r.job.reject(new Error(res.error));
    this.pump();
  }

  /** The worker failed to load or died: fail what is pending; the next request starts a new worker. */
  private crash(message: string) {
    this.worker?.terminate();
    this.worker = null;
    const r = this.running;
    this.running = null;
    r?.job.reject(new Error(message));
    for (const job of this.waiting.values()) job.reject(new Error(message));
    this.waiting.clear();
  }
}
