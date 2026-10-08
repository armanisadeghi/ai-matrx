// Lane HR-360 (2026-10-08) — the HR position/transfer form can set who someone reports to.
// Red before: no managerPatch, and the form never sent manager_employment_id.

import { managerPatch } from "../managerPatch";

const ELENA = "a1b2c3d4-0000-4000-8000-000000000001";
const ARMANI = "a1b2c3d4-0000-4000-8000-000000000002";

describe("a position change can set who they report to", () => {
  it("sends the manager when one is picked", () => {
    expect(managerPatch(null, ARMANI, ELENA)).toEqual({ manager_employment_id: ARMANI });
  });
  it("an untouched picker never clears the manager", () => {
    expect(managerPatch(ARMANI, ARMANI, ELENA)).toEqual({});
  });
  it("clearing the picker clears the manager", () => {
    expect(managerPatch(ARMANI, null, ELENA)).toEqual({ manager_employment_id: null });
  });
  it("nobody is made their own manager", () => {
    expect(managerPatch(null, ELENA, ELENA)).toEqual({});
  });
});
