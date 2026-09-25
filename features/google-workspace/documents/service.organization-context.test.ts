// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, refreshGoogleDocument fell back to requireOrganizationContext(
// args.organizationId ?? selectOrganizationId(store)) — opening a picked file
// that has no Record yet (the birth door) with no organization selected was a
// bare refusal and the picker never opened.
const getState = jest.fn();
const postGoogleBackend = jest.fn();

jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
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
import { refreshGoogleDocument } from "./service";

describe("Google document refresh — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    selectOrganization(getState, null);
    postGoogleBackend.mockRejectedValue(new Error("stop after the request is built"));
  });
  afterEach(resetGate);

  it("the birth door with no organization selected asks, then the SAME refresh carries the answer", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await refreshGoogleDocument({ fileId: "doc-file-1" }).catch(() => undefined);

    expect(opened).toHaveBeenCalledTimes(1);
    const [, body, , headerOrganization] = postGoogleBackend.mock.calls[0];
    expect(body).toMatchObject({ organization_id: CHOSEN_ORG, file_id: "doc-file-1" });
    expect(headerOrganization).toBe(CHOSEN_ORG);
  });

  it("a record's own organization wins and never asks", async () => {
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await refreshGoogleDocument({ fileId: "doc-file-1", organizationId: SELECTED_ORG }).catch(() => undefined);

    expect(opened).not.toHaveBeenCalled();
    expect(postGoogleBackend.mock.calls[0][3]).toBe(SELECTED_ORG);
  });
});
