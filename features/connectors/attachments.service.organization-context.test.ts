// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, `authHeaders` read `requireOrganizationContext(selectOrganizationId(
// store.getState()))` itself, so attaching a resource with no organization
// selected threw `organization_context_required` and the picker never opened.
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  }),
}));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

import {
  CHOSEN_ORG,
  mockFetchJson,
  mountPickerAnswering,
  organizationHeaderOf,
  resetGate,
  selectOrganization,
} from "@/lib/organization/__tests__/gate-harness";
import {
  attachConversationResource,
  fetchConversationAttachments,
} from "./attachments.service";

describe("conversation attachments — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("attaching with no organization selected asks, then the SAME call continues with the answer", async () => {
    const fetchMock = mockFetchJson({ association_id: "a-1" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await attachConversationResource("conv-1", {
      provider: "google_drive",
      resource_ref: "file-quarterly-plan",
      resource_type: "google_doc",
      display_name: "Quarterly plan",
      link: null,
      metadata: null,
    } as unknown as Parameters<typeof attachConversationResource>[1]);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("a background list read never opens the picker and refuses before networking", async () => {
    const fetchMock = mockFetchJson([]);
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(fetchConversationAttachments("conv-1")).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
