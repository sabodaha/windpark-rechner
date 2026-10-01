import { describe, expect, it } from "vitest";
import { VERIFIED_VARIANTS } from "../src/lib/workbook/verification";
import { USER_EDITS, VARIANTS } from "../scripts/workbook/variants";

describe("workbook verification", () => {
  it("the pages quote the number of variants Excel recalculates", () => {
    expect(Object.keys(VARIANTS)).toHaveLength(VERIFIED_VARIANTS);
    for (const e of Object.values(USER_EDITS)) if (e.same) expect(VARIANTS[e.same], e.same).toBeDefined();
  });
});
