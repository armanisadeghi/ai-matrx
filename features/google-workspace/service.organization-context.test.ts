// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, effectiveOrganizationId() was a synchronous bare-kernel read of the
// selection: creating a Google Doc with no organization selected threw and the
// picker never opened. The answer must reach BOTH the body and the header.
const getState = jest.fn();
const postGoogleBackend = jest.fn();

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));
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
import { createGoogleDocument, sendReviewedGmail } from "./service";

describe("Google Workspace writes — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    selectOrganization(getState, null);
    postGoogleBackend.mockRejectedValue(new Error("stop after the request is built"));
  });
  afterEach(resetGate);

  it("creating a Doc with no organization selected asks, then the SAME call carries the answer in body and header", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await createGoogleDocument("conn-1", "Spring launch brief", "Draft").catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(postGoogleBackend).toHaveBeenCalledTimes(1);
    const [path, body, , headerOrganization] = postGoogleBackend.mock.calls[0];
    expect(path).toBe("/api/google-workspace/documents/create");
    expect(body).toMatchObject({ organization_id: CHOSEN_ORG });
    expect(headerOrganization).toBe(CHOSEN_ORG);
  });

  it("a reviewed send tied to a CRM record uses the record's organization and never asks", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await sendReviewedGmail({
      context: { organizationId: SELECTED_ORG },
    } as unknown as Parameters<typeof sendReviewedGmail>[0]).catch(() => undefined);

    expect(opened).not.toHaveBeenCalled();
    expect(postGoogleBackend.mock.calls[0]?.[3]).toBe(SELECTED_ORG);
  });
});
