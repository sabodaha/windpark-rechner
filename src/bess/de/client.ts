// The page's side of the German calculator's worker (queueing in ../job-queue.ts): the main run first, then the
// break-even toll price, then what the open tab asks for.
import { JobQueue } from "../job-queue";
import type { DeJobKind } from "./protocol";
import type { DeInputs, DeLockedFunding } from "./types";
import type { DeCompare, DeCore, DeExtras, DeSensitivity } from "./view";

export { SUPERSEDED, type Superseded } from "../job-queue";

type Payload = { inputs: DeInputs; funding?: DeLockedFunding | null };

const PRIORITY: DeJobKind[] = ["core", "extras", "sensitivity", "compare"];

export class DeClient extends JobQueue<DeJobKind, Payload> {
  constructor() {
    super(PRIORITY, () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  }

  core(inputs: DeInputs) {
    return this.submit<DeCore>("core", { inputs });
  }

  extras(inputs: DeInputs) {
    return this.submit<DeExtras>("extras", { inputs });
  }

  sensitivity(inputs: DeInputs, funding: DeLockedFunding | null) {
    return this.submit<DeSensitivity>("sensitivity", { inputs, funding });
  }

  compare(inputs: DeInputs) {
    return this.submit<DeCompare>("compare", { inputs });
  }
}
