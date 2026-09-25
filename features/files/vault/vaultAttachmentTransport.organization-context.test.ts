// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, authorizationHeader called requireOrganizationContext(
// requireSelectedOrgId()) — attaching a file to a Vault item with no
// organization selected was a bare refusal and the picker never opened.
const getSession = jest.fn();
const getState = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
  };
  return { createClient: () => client, supabase: client };
});
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
  downloadVaultAttachment,
  uploadVaultAttachment,
} from "./vaultAttachmentTransport";

describe("Vault attachment transport — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("uploading with no organization selected asks, then the SAME upload continues", async () => {
    const fetchMock = mockFetchJson({ attachment_id: "att-1" });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await uploadVaultAttachment(
      "item-1",
      new File(["recovery codes"], "recovery-codes.txt", { type: "text/plain" }),
      { label: "Recovery codes", handling: "sensitive" },
    );

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("a download read never opens the picker", async () => {
    const fetchMock = mockFetchJson({});
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(
      downloadVaultAttachment("item-1", "att-1", "recovery-codes.txt"),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
