// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, mintStreamTicket and startRun called requireOrganizationContext(
// peekSelectedOrganizationId()) — pressing Take control with no organization
// selected was a bare refusal and the picker never opened. The automatic
// open on mount must still never ask.
const getState = jest.fn();
const postJson = jest.fn();

jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  requestRaw: jest.fn(),
  postJson: (...args: unknown[]) => postJson(...args),
}));
jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => "ready",
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

import {
  CHOSEN_ORG,
  SELECTED_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import { mintStreamTicket } from "./service";

describe("Cloud Browser — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    selectOrganization(getState, null);
    postJson.mockRejectedValue(new Error("stop after the request is built"));
  });
  afterEach(resetGate);

  it("Take control with no organization selected asks, then the SAME connect continues with the answer", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await mintStreamTicket("run-1", "control", true).catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(postJson.mock.calls[0][2]).toEqual({ organizationId: CHOSEN_ORG });
  });

  it("the automatic open on mount never raises the picker", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(mintStreamTicket("run-1", "control", false)).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(opened).not.toHaveBeenCalled();
    expect(postJson).not.toHaveBeenCalled();
  });
});
