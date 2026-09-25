// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, organizationContextHeaders fed `override ?? selectOrganizationId`
// to the bare kernel synchronously: disconnecting Google (and every Google
// write) with no organization selected threw and the picker never opened.
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
import { listGmailLabels, modifyGmailMessage, postGoogleBackend } from "./service";

describe("Google backend transport — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("a Google write with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({ ok: true });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await postGoogleBackend(
      "/api/google-integrations/disconnect",
      { connection_id: "conn-1" },
      "Unable to disconnect Google.",
    );

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("a read-shaped POST (Gmail search on mount) never opens the picker", async () => {
    const fetchMock = mockFetchJson({ messages: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(
      postGoogleBackend(
        "/api/google-integrations/gmail/search",
        { query: "invoice" },
        "Unable to search Gmail.",
      ),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one explicit Gmail change and loads labels through the same authenticated transport", async () => {
    selectOrganization(getState, CHOSEN_ORG);
    const fetchMock = mockFetchJson({ message_id: "message-1", label_ids: ["STARRED"] });
    await modifyGmailMessage({
      connectionId: "personal-connection",
      messageId: "message-1",
      action: "star",
    });
    const [modifyUrl, modifyInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(modifyUrl).toContain("/api/google-integrations/gmail/modify");
    expect(JSON.parse(modifyInit.body as string)).toMatchObject({
      connection_id: "personal-connection",
      message_id: "message-1",
      action: "star",
    });
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);

    mockFetchJson({ labels: [{ id: "Label_1", name: "Projects", type: "user" }], has_more: false });
    const labels = await listGmailLabels("personal-connection");
    expect(labels.labels[0].name).toBe("Projects");
  });
});
