/** @jest-environment node */
/**
 * Locks in the fix for lib/api/context-api.ts's fetchContextState thunk —
 * census hard case #3 (common-docs/projects/no-db-assigned-org/census/
 * matrx-frontend-senders.md §10): it carries a real Bearer token (an
 * authenticated request) but had NO organization concept anywhere in the
 * file, so it always reached the server unscoped. Under aidream commit
 * 8e5ee0b93's AuthMiddleware admission gate this would 400. The fix makes
 * it refuse BEFORE any networking when no organization is selected, and
 * attach X-Organization-Id once one is.
 */

import type { RootState } from "@/lib/redux/store";

// The thunk's transport is the host door; what this file locks is the
// organization the thunk hands it (the door's own header stamping is covered
// by the python-client tests).
const getJson = jest.fn();
jest.mock("@/lib/python-client", () => ({
  getJson: (...args: unknown[]) => getJson(...args),
}));

import { fetchContextState } from "@/lib/api/context-api";

function fakeState(organizationId: string | null): RootState {
  return {
    userAuth: { accessToken: "test-token" },
    appContext: { organization_id: organizationId },
    adminPreferences: { serverOverride: null },
  } as unknown as RootState;
}

const PAYLOAD = {
  conversation_id: "conv-1",
  last_request_input_tokens: 0,
  last_request_cached_tokens: 0,
  last_request_output_tokens: 0,
  total_chars_visible_to_model: 0,
  message_count_visible: 0,
  cache_state: {},
  last_trim_summary: null,
  last_raw_usage: null,
  measured_at: "2026-08-30T00:00:00Z",
};

describe("fetchContextState organization admission (sender-side, fail-closed)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getJson.mockResolvedValue({ data: PAYLOAD, meta: {} });
  });

  it("READ: with no organization selected the GET is still sent, naming no organization", async () => {
    const dispatch = jest.fn();

    await fetchContextState({ conversationId: "conv-1" })(
      dispatch,
      () => fakeState(null),
      undefined,
    );

    expect(getJson).toHaveBeenCalledTimes(1);
    const [path, opts] = getJson.mock.calls[0] as [string, { organizationId?: string }];
    expect(path).toBe("/cx/conversations/conv-1/context-state");
    expect(opts.organizationId).toBeUndefined();
  });

  it("CONTROL: names the selected organization and fulfils when one is selected", async () => {
    const orgId = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
    const dispatch = jest.fn();

    const action = await fetchContextState({ conversationId: "conv-1" })(
      dispatch,
      () => fakeState(orgId),
      undefined,
    );

    expect(getJson).toHaveBeenCalledTimes(1);
    const [, opts] = getJson.mock.calls[0] as [string, { organizationId?: string }];
    expect(opts.organizationId).toBe(orgId);
    expect(action.type).toBe("contextState/fetch/fulfilled");
  });
});
