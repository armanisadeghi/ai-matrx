/**
 * Regression guard for the authenticated agent-stream admission boundary.
 * The resolver itself must stamp the durable conversation organization (or
 * the active organization for a new conversation) before any transport runs.
 */

import type { ChatRootState } from "../../../../../store/root-state";

jest.mock("@host/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: () => "https://backend.test",
  selectActiveServer: () => "production",
}));
jest.mock("@host/lib/redux/slices/userSlice", () => ({
  selectAccessToken: (state: ChatRootState) =>
    (state as unknown as { token: string | null }).token,
  selectFingerprintId: () => null,
}));
jest.mock("@host/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (state: ChatRootState) =>
    (state as unknown as { selectedOrganizationId: string | null })
      .selectedOrganizationId,
}));
jest.mock("@host/lib/sandbox/active-binding", () => ({
  resolveAgentSandboxRef: () => null,
  getEffectiveSandboxRef: () => null,
}));
jest.mock("@host/lib/local-engine/discovery", () => ({
  discoverLocalEngine: jest.fn(),
  getCachedLocalEngine: () => null,
  supportsLocalAgentExecution: () => false,
}));
// The org seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("../../../../../host/org", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  selectOrganizationId: (state: ChatRootState) =>
    (state as unknown as { selectedOrganizationId: string | null })
      .selectedOrganizationId,
}))(),
  };
  const moved = ["selectOrganizationId","selectOrganizationName","ensureOrgId","getActiveOrgId","isOrganizationSelectionCancelled","ensureOrganizationContext","ensureOrganizationForRequest"];
  return {
    ...jest.requireActual("../../../../../host/org"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

import { resolveBackendForConversation } from "../resolve-base-url";

const CONVERSATION_ORG = "11111111-1111-4111-8111-111111111111";
const SELECTED_ORG = "22222222-2222-4222-8222-222222222222";

function state(options: {
  conversationOrganizationId?: string | null;
  selectedOrganizationId?: string | null;
}): ChatRootState {
  return {
    token: "authenticated-jwt",
    selectedOrganizationId: options.selectedOrganizationId ?? null,
    instanceUIState: { byConversationId: {} },
    conversations: {
      byConversationId: {
        "conversation-1": {
          organizationId: options.conversationOrganizationId ?? null,
        },
      },
    },
  } as unknown as ChatRootState;
}

describe("resolveBackendForConversation organization admission", () => {
  it("stamps the persisted conversation organization ahead of the active selection", () => {
    const resolved = resolveBackendForConversation(
      state({
        conversationOrganizationId: CONVERSATION_ORG,
        selectedOrganizationId: SELECTED_ORG,
      }),
      "conversation-1",
    );

    expect(resolved?.headers).toMatchObject({
      Authorization: "Bearer authenticated-jwt",
      "X-Organization-Id": CONVERSATION_ORG,
    });
  });

  it("stamps the active organization for a not-yet-persisted conversation", () => {
    const resolved = resolveBackendForConversation(
      state({ selectedOrganizationId: SELECTED_ORG }),
      "conversation-1",
    );

    expect(resolved?.headers["X-Organization-Id"]).toBe(SELECTED_ORG);
  });
});
