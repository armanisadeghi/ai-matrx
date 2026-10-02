/**
 * W-32 (PB-03, 2026-10-01): a shortcut fired TWICE. `launchAgentExecution`
 * dispatched `executeInstance` and the overlay it opened mounted
 * `AgentRunner`, whose auto-run effect dispatched it again. Both were admitted
 * because the door's concurrent-turn guard ran AFTER its first await (the
 * organization gate) — during that wait the conversation still read "ready".
 * The second request saw the first's optimistic bubble, went out as a
 * continuation with no user input, and the provider answered "at least one
 * message is required" — saved as an error turn.
 *
 * What is pinned, against the REAL `executeInstance` thunk:
 *   1. two dispatches in the same moment → exactly one reaches the network
 *      path (observed at the organization gate, the first await);
 *   2. the claim is handed back on every exit, so the next real turn runs;
 *   3. a follow-up turn with no user input is refused at the door and never
 *      sent; turn 1 and a retry are not refused.
 */

// The first await of the door. Mocked so the test can hold dispatch #1 inside
// it — the exact window in which dispatch #2 used to be admitted.
const gateCalls: string[] = [];
let releaseGate: (() => void) | null = null;
let gateMode: "hold" | "throw" = "hold";
jest.mock("../../utils/required-organization", () => ({
  ensureExecutionOrganization: jest.fn((_state: unknown, id: string) => {
    gateCalls.push(id);
    if (gateMode === "throw") {
      return Promise.reject(new Error("stop after the gate"));
    }
    return new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
  }),
  executionOrganizationForRequest: jest.fn(() => {
    // Stop the thunk right after the gate — what follows is not under test.
    throw new Error("stop after the gate");
  }),
}));

let __uuid = 0;
jest.mock("uuid", () => ({ v4: () => `uuid-stub-${++__uuid}` }));

import {
  executeInstance,
  isEmptyUserInput,
  refusesEmptyTurn,
} from "../execute-instance.thunk";
import { isExecutionClaimed } from "../submit-claims";
import type { ChatRootState } from "../../../../../store/root-state";

type AnyAction = { type: string; payload?: unknown };

function harness(conversationId: string) {
  const state = {
    conversations: {
      byConversationId: {
        [conversationId]: { conversationId, status: "ready" },
      },
    },
    instanceUserInput: { byConversationId: {} },
  };
  const actions: AnyAction[] = [];
  const getState = () => state as unknown as ChatRootState;
  const dispatch: (action: unknown) => unknown = jest.fn((action: unknown) => {
    if (typeof action === "function") {
      return (action as (d: unknown, g: unknown, e: unknown) => unknown)(
        dispatch,
        getState,
        undefined,
      );
    }
    actions.push(action as AnyAction);
    return action;
  });
  const fire = () =>
    executeInstance({ conversationId })(
      dispatch as never,
      getState,
      undefined,
    );
  return { fire, actions };
}

beforeEach(() => {
  gateCalls.length = 0;
  releaseGate = null;
  gateMode = "hold";
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.warn as jest.Mock).mockRestore();
  (console.error as jest.Mock).mockRestore();
});

describe("a trigger fires exactly once", () => {
  it("the launcher's send and the overlay's auto-run in the same moment → one admitted", async () => {
    const { fire } = harness("conv-once");

    const first = fire(); // the launcher
    const second = fire(); // AgentRunner's auto-run effect

    const secondResult = await second;
    expect(secondResult.meta.requestStatus).toBe("rejected");
    expect(secondResult.payload).toMatch(/Duplicate submit refused/);

    // Only the first ever reached the door's first await.
    expect(gateCalls).toEqual(["conv-once"]);
    expect(isExecutionClaimed("conv-once")).toBe(true);

    releaseGate?.();
    await first;
    // Every exit hands the claim back; the next real turn is not locked out.
    expect(isExecutionClaimed("conv-once")).toBe(false);
  });

  it("after the first dispatch ends, a later turn is admitted", async () => {
    gateMode = "throw";
    const { fire } = harness("conv-later");
    await fire();
    await fire();
    expect(gateCalls).toEqual(["conv-later", "conv-later"]);
    expect(isExecutionClaimed("conv-later")).toBe(false);
  });
});

describe("an empty user message never becomes a request", () => {
  const followUp = {
    retry: false,
    hasPriorTurns: true,
    cacheOnly: true,
    isEphemeral: false,
  };

  it.each([
    ["no input", undefined],
    ["empty string", ""],
    ["whitespace", "  \n "],
    ["empty parts", []],
    ["blank text part", [{ type: "text", text: "  " }]],
  ])("refuses a follow-up turn with %s", (_label, userInput) => {
    expect(refusesEmptyTurn({ ...followUp, userInput })).toBe(true);
  });

  it("sends a follow-up turn that has text or an attachment", () => {
    expect(refusesEmptyTurn({ ...followUp, userInput: "hi" })).toBe(false);
    expect(
      refusesEmptyTurn({
        ...followUp,
        userInput: [{ type: "image", file_id: "f1" }],
      }),
    ).toBe(false);
  });

  it("never refuses turn 1 (the agent's own messages build it) or a retry", () => {
    expect(
      refusesEmptyTurn({ ...followUp, hasPriorTurns: false, userInput: undefined }),
    ).toBe(false);
    expect(
      refusesEmptyTurn({ ...followUp, retry: true, userInput: undefined }),
    ).toBe(false);
    expect(
      refusesEmptyTurn({ ...followUp, isEphemeral: true, userInput: undefined }),
    ).toBe(false);
  });

  it("reads emptiness from what a provider can read", () => {
    expect(isEmptyUserInput([{ type: "text", text: "x" }])).toBe(false);
    expect(isEmptyUserInput(null)).toBe(true);
  });
});
