// The page's side of a calculator worker. One request runs at a time; of the requests waiting, only the newest of each
// kind is kept (an older one resolves as SUPERSEDED), and kinds go in the order given (the main run first).

export const SUPERSEDED = Symbol("superseded");
export type Superseded = typeof SUPERSEDED;

interface Job<K extends string, P> {
  kind: K;
  payload: P;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

export class JobQueue<K extends string, P extends object> {
  private worker: Worker | null = null;
  private running: { id: number; job: Job<K, P> } | null = null;
  private waiting = new Map<K, Job<K, P>>();
  private nextId = 1;

  /** `spawn` creates the worker; it lives in the calculator's own client file, where the bundler finds the worker. */
  constructor(
    private readonly priority: K[],
    private readonly spawn: () => Worker,
  ) {}

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.running = null;
    for (const job of this.waiting.values()) job.resolve(SUPERSEDED);
    this.waiting.clear();
  }

  protected submit<T>(kind: K, payload: P): Promise<T | Superseded> {
    return new Promise((resolve, reject) => {
      this.waiting.get(kind)?.resolve(SUPERSEDED);
      this.waiting.set(kind, { kind, payload, resolve: resolve as (v: unknown) => void, reject });
      this.pump();
    });
  }

  private start(): Worker {
    if (!this.worker) {
      const w = this.spawn();
      w.onmessage = (e: MessageEvent<Response>) => this.done(e.data);
      w.onerror = (e) => this.crash(e.message || "The calculation could not start.");
      this.worker = w;
    }
    return this.worker;
  }

  private pump() {
    if (this.running) return;
    for (const kind of this.priority) {
      const job = this.waiting.get(kind);
      if (!job) continue;
      this.waiting.delete(kind);
      const id = this.nextId++;
      this.running = { id, job };
      try {
        this.start().postMessage({ id, kind, ...job.payload });
      } catch (e) {
        this.running = null;
        job.reject(e instanceof Error ? e : new Error(String(e)));
        continue;
      }
      return;
    }
  }

  private done(res: Response) {
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
