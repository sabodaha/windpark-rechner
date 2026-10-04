// The German battery calculator's worker: keeps the revenue library and runs the engine off the page's main thread, so
// the inputs stay responsive while the break-even toll price and the sensitivity take their seconds. The Ukrainian
// library is fetched only when the comparison is asked for (spec §11; Privacy says so).
import { BESS_FILES } from "../data";
import { parseLibrary, type Library, type LibraryManifest } from "../engine";
import { DE_FILES } from "./data";
import { parseDeLibrary, type DeLibrary, type DeLibraryManifest } from "./library";
import type { DeWorkerRequest, DeWorkerResponse } from "./protocol";
import { computeDeCompare, computeDeCore, computeDeExtras, computeDePath, computeDeSensitivity } from "./view";

const scope = globalThis as unknown as {
  postMessage(message: DeWorkerResponse): void;
  onmessage: ((e: MessageEvent<DeWorkerRequest>) => void) | null;
};

/** Both files of a library from this site; a failed load is retried with the next request. */
function files<M>(manifest: string, payload: string): Promise<[M, ArrayBuffer]> {
  return Promise.all([
    fetch(manifest).then((r) => {
      if (!r.ok) throw new Error(`library manifest: HTTP ${r.status}`);
      return r.json() as Promise<M>;
    }),
    fetch(payload).then((r) => {
      if (!r.ok) throw new Error(`library data: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
}

let deLibrary: Promise<DeLibrary> | null = null;
let uaLibrary: Promise<Library> | null = null;

function loadDe(): Promise<DeLibrary> {
  deLibrary ??= files<DeLibraryManifest>(DE_FILES.manifest, DE_FILES.payload)
    .then(([m, p]) => parseDeLibrary(m, p))
    .catch((e: unknown) => {
      deLibrary = null;
      throw e;
    });
  return deLibrary;
}

function loadUa(): Promise<Library> {
  uaLibrary ??= files<LibraryManifest>(BESS_FILES.manifest, BESS_FILES.payload)
    .then(([m, p]) => parseLibrary(m, p))
    .catch((e: unknown) => {
      uaLibrary = null;
      throw e;
    });
  return uaLibrary;
}

scope.onmessage = async (e) => {
  const req = e.data;
  try {
    const lib = await loadDe();
    let value: unknown;
    if (req.kind === "core") value = computeDeCore(req.inputs, lib);
    else if (req.kind === "extras") value = computeDeExtras(req.inputs, lib);
    else if (req.kind === "path") value = computeDePath(req.inputs, lib, req.path, req.own);
    else if (req.kind === "sensitivity") value = computeDeSensitivity(req.inputs, lib, req.funding);
    else value = computeDeCompare(req.inputs, lib, await loadUa());
    scope.postMessage({ id: req.id, ok: true, value });
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
