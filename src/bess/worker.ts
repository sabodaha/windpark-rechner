// The battery calculator's worker: keeps the revenue library and runs the engine off the page's main thread, so the
// inputs stay responsive while break-even and sensitivity runs take their half second.
import { BESS_FILES } from "./data";
import { parseLibrary, type Library, type LibraryManifest } from "./engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { computeCore, computeExtras, computeTornado } from "./view";

const scope = globalThis as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

let library: Promise<Library> | null = null;

/** Both files from this site; a failed load is retried with the next request. */
function load(): Promise<Library> {
  library ??= Promise.all([
    fetch(BESS_FILES.manifest).then((r) => {
      if (!r.ok) throw new Error(`library manifest: HTTP ${r.status}`);
      return r.json() as Promise<LibraryManifest>;
    }),
    fetch(BESS_FILES.payload).then((r) => {
      if (!r.ok) throw new Error(`library data: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
  ])
    .then(([manifest, payload]) => parseLibrary(manifest, payload))
    .catch((e: unknown) => {
      library = null;
      throw e;
    });
  return library;
}

scope.onmessage = async (e) => {
  const req = e.data;
  try {
    const lib = await load();
    const value =
      req.kind === "core"
        ? computeCore(req.inputs, lib)
        : req.kind === "extras"
          ? computeExtras(req.inputs, lib, req.funding)
          : computeTornado(req.inputs, lib, req.funding);
    scope.postMessage({ id: req.id, ok: true, value });
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
