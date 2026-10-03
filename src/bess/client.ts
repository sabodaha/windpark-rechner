// The page's side of the battery calculator's worker (queueing in job-queue.ts): the main run goes before break-even
// and sensitivity.
import type { BessInputs, LockedFunding } from "./engine";
import { JobQueue } from "./job-queue";
import type { JobKind } from "./protocol";
import type { BessCore, BessExtras, BessPStar, BessTornado } from "./view";

export { SUPERSEDED, type Superseded } from "./job-queue";

type Payload = { inputs: BessInputs; funding?: LockedFunding };

const PRIORITY: JobKind[] = ["core", "extras", "pstar", "tornado"];

export class BessClient extends JobQueue<JobKind, Payload> {
  constructor() {
    super(PRIORITY, () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  }

  core(inputs: BessInputs) {
    return this.submit<BessCore>("core", { inputs });
  }

  extras(inputs: BessInputs, funding: LockedFunding) {
    return this.submit<BessExtras>("extras", { inputs, funding });
  }

  tornado(inputs: BessInputs, funding: LockedFunding) {
    return this.submit<BessTornado>("tornado", { inputs, funding });
  }

  pstar(inputs: BessInputs) {
    return this.submit<BessPStar>("pstar", { inputs });
  }
}
