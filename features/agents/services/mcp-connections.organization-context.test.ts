// ORG-GATE-AUDIT regression — see lib/organization/__tests__/gate-harness.ts.
// Pre-fix, authHeaders fed `explicit ?? selectOrganizationId(store)` to the
// bare kernel: invoking an MCP tool with no organization selected was a bare
// refusal and the picker never opened.
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
  discoverMcpServerTools,
  invokeMcpServerTool,
} from "./mcp-connections.service";

describe("MCP connections — organization gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetGate();
    getSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
    selectOrganization(getState, null);
  });
  afterEach(resetGate);

  it("invoking a tool with no organization selected asks, then the SAME call continues", async () => {
    const fetchMock = mockFetchJson({ ok: true, content: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await invokeMcpServerTool("server-linear", "list_issues", { team: "ENG" });

    expect(opened).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(organizationHeaderOf(fetchMock)).toBe(CHOSEN_ORG);
  });

  it("tool discovery (a read) never opens the picker", async () => {
    const fetchMock = mockFetchJson({ server_id: "s", server_slug: null, tools: [] });
    const opened = mountPickerAnswering(CHOSEN_ORG);

    await expect(discoverMcpServerTools("server-linear")).rejects.toMatchObject({
      code: "organization_context_required",
    });
    expect(opened).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
