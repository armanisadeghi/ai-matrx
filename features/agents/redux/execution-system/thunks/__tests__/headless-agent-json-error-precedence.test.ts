/**
 * A FAILED run reports WHY it failed — never "no structured JSON".
 *
 * Regression for 2026-08-17: `jsonExtractionComplete` is set from the stream's
 * FINAL chunk, which arrives on failed runs too. The wait loop checked it
 * before the request status, so a run that died at the provider was reported —
 * to the user, the console, and the Error Inspector — as a missing-JSON
 * problem. Every FastFire grade in a session showed "grader did not return a
 * structured grade" while the real cause was a Google 400 ("Thinking level
 * MINIMAL is not supported for this model").
 */

import { adoptHeadlessAgentJson } from "../run-headless-agent-json";

const REQUEST_ID = "req-1";
const CONVERSATION_ID = "conv-1";
const PROVIDER_MESSAGE =
  "Google rejected the request: Thinking level MINIMAL is not supported for this model.";

jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.thunks",
  () => ({ destroyInstanceIfAllowed: () => ({ type: "noop" }) }),
);

function stateWith(request: Record<string, unknown>) {
  return {
    activeRequests: {
      byRequestId: { [REQUEST_ID]: request },
      byConversationId: { [CONVERSATION_ID]: [REQUEST_ID] },
      viewerIdsByRequestId: {},
    },
  } as never;
}

const dispatch = (() => ({})) as never;

describe("adoptHeadlessAgentJson error precedence", () => {
  test("a terminal error wins over a finalized-but-empty extraction", async () => {
    const getState = () =>
      stateWith({
        status: "error",
        // Both true at once — exactly the captured production shape.
        jsonExtractionComplete: true,
        extractedJson: [],
        error: { message: PROVIDER_MESSAGE, user_message: PROVIDER_MESSAGE },
      });

    const result = await adoptHeadlessAgentJson(dispatch, getState, {
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
      surfaceKey: "test",
      timeoutMs: 1_000,
      pollIntervalMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe(PROVIDER_MESSAGE);
  });

  test("a genuinely empty SUCCESSFUL run still reports the no-JSON message", async () => {
    const getState = () =>
      stateWith({
        status: "complete",
        jsonExtractionComplete: true,
        extractedJson: [],
      });

    const result = await adoptHeadlessAgentJson(dispatch, getState, {
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
      surfaceKey: "test",
      timeoutMs: 1_000,
      pollIntervalMs: 100,
      failureMessages: { noJson: "no json" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("no json");
  });
});
