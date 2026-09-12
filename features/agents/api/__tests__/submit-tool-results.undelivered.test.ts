/**
 * FORCING TEST — an undelivered tool answer is never abandoned.
 *
 * THE INCIDENT (2026-09-12, conversation a66e995b-…): a delegated
 * `apply_surface_write` was answered honestly by the client, the POST carrying
 * that answer failed, and the answer was DISCARDED. The durable `cx_tool_call`
 * row stayed `delegated`, the hard-suspended server loop waited forever, and
 * the user watched a dead screen.
 *
 * These cases are green only when the real module does both halves of the fix:
 *
 *  1. It pins the CONVERSATION's organization onto the POST. `callApi` is
 *     fail-closed on organization context, so without this an answer sent from
 *     a freshly-opened tab never leaves the browser at all.
 *  2. It HOLDS an undelivered answer and re-sends it, and releases it only on
 *     the one honestly-terminal outcome (404 — the server no longer knows the
 *     call).
 *
 * They fail against the pre-fix module: it sent no `scopeOverrides`, and its
 * terminal branch dropped the answer on the floor.
 */

const mockCallApi = jest.fn((config: unknown) => ({
  kind: "api-call" as const,
  config,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: mockCallApi,
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.slice",
  () => ({
    setInstanceStatus: jest.fn((payload: unknown) => ({
      type: "conversations/setInstanceStatus",
      payload,
    })),
  }),
);

import {
  submitToolResult,
  flushToolResults,
  flushUndeliveredToolResults,
  __getOutboxForTests,
  __resetOutboxForTests,
} from "../submit-tool-results";

const CONVERSATION_ID = "a66e995b-495f-4640-a032-adc846f0cf80";
const CONVERSATION_ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const CALL_ID = "toolu_01YQ1T5sMPZmJvB26JYUKkrE";

function state() {
  return {
    conversations: {
      byConversationId: {
        [CONVERSATION_ID]: { organizationId: CONVERSATION_ORGANIZATION_ID },
      },
    },
    activeRequests: { byRequestId: {} },
    appContext: { organization_id: null },
  };
}

/**
 * A dispatch that runs thunks for real and answers every `callApi` action with
 * the next queued API outcome, recording the config it was called with.
 */
function harness(outcomes: Array<{ data?: unknown; error?: unknown }>) {
  const sent: unknown[] = [];
  const dispatch = ((action: unknown): unknown => {
    if (typeof action === "function") {
      return (action as (d: unknown, g: unknown, e: unknown) => unknown)(
        dispatch,
        () => state(),
        undefined,
      );
    }
    const asCall = action as { kind?: string; config?: unknown };
    if (asCall?.kind === "api-call") {
      sent.push(asCall.config);
      return Promise.resolve(
        outcomes.shift() ?? { data: undefined, error: undefined },
      );
    }
    return action;
  }) as never;
  return { dispatch, sent };
}

const ANSWER = {
  conversationId: CONVERSATION_ID,
  call_id: CALL_ID,
  tool_name: "apply_surface_write",
  is_error: true,
  output: {
    ok: false,
    reason: "surface_write_failed",
    message: 'No mounted surface declares write target "rule_draft".',
  },
  error_message: 'No mounted surface declares write target "rule_draft".',
};

describe("an undelivered tool answer is never abandoned", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetOutboxForTests();
  });

  afterEach(() => {
    __resetOutboxForTests();
  });

  it("pins the conversation's organization onto the answer POST", async () => {
    const { dispatch, sent } = harness([{ data: { continuation_needed: false } }]);

    dispatch(submitToolResult(ANSWER) as never);
    dispatch(flushToolResults() as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(
      expect.objectContaining({
        path: "/ai/conversations/{conversation_id}/tool_results",
        scopeOverrides: { organization_id: CONVERSATION_ORGANIZATION_ID },
      }),
    );
  });

  it("holds the answer when the POST fails terminally, and re-sends it on demand", async () => {
    // A client-side, fail-closed context error: no HTTP status at all — the
    // exact shape `callApi` produces when the organization has not hydrated,
    // and the shape the pre-fix module treated as "give up".
    const { dispatch, sent } = harness([
      {
        error: {
          type: "validation_error",
          code: "organization_context_required",
          message: "This request needs an organization.",
        },
      },
      { data: { continuation_needed: true, user_request_id: "req-1" } },
    ]);

    dispatch(submitToolResult(ANSWER) as never);
    dispatch(flushToolResults() as never);
    // Let the fast path exhaust its retries (1s + 2s + 4s of real backoff is
    // driven by fake timers below in the interest of a fast suite).
    await drainBackoff();

    // THE LOAD-BEARING ASSERTION: the answer is still ours to deliver.
    expect(__getOutboxForTests().get(CONVERSATION_ID)?.has(CALL_ID)).toBe(true);

    // And re-sending it actually re-sends it.
    dispatch(flushUndeliveredToolResults(CONVERSATION_ID) as never);
    await drainBackoff();

    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(__getOutboxForTests().get(CONVERSATION_ID)).toBeUndefined();
  });

  it("releases the answer only on 404 — the server no longer knows the call", async () => {
    const { dispatch } = harness([
      { error: { type: "http_error", status: 404, message: "not_found" } },
    ]);

    dispatch(submitToolResult(ANSWER) as never);
    dispatch(flushToolResults() as never);
    await drainBackoff();

    expect(__getOutboxForTests().get(CONVERSATION_ID)).toBeUndefined();
  });
});

/**
 * The fast path sleeps between attempts with real timers. Rather than mock the
 * clock (which would also freeze the outbox timer this suite inspects), give
 * the retries enough real time to run: 1s + 2s + 4s + slack.
 */
async function drainBackoff(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 8000));
}

jest.setTimeout(30000);
