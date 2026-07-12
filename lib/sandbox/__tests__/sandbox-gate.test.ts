// @ts-nocheck

/**
 * The load-bearing invariant of the sandbox pre-send gate:
 *
 *   A conversation is "bound to a sandbox" IFF its own record says so
 *   (`sandboxBinding` ← `cx_conversation.sandbox_instance_id`). The per-surface
 *   preference is a SEED for new conversations, never a binding.
 *
 * The regression these tests exist to prevent: a stale
 * `activeAgentSandboxBySurface["chat-route"]` preference — pointing at a box
 * that was killed weeks ago, and which nothing ever clears — made a brand-new
 * /chat/new conversation claim it was "bound to a sandbox", and the gate blocked
 * the very first message on a box that conversation had never used.
 */

import {
  getConversationSandboxBinding,
  getSurfaceSeedRef,
  getEffectiveSandboxRef,
} from "../active-binding";
import { ensureSandboxOrDecide } from "@/features/agents/redux/execution-system/thunks/sandbox-gate.thunk";
import { openSandboxGate } from "@/components/dialogs/sandbox-gate/SandboxGateHost";

jest.mock("@/components/dialogs/sandbox-gate/SandboxGateHost", () => ({
  openSandboxGate: jest.fn(),
}));

// The network edge: "can a live token be minted for the resolved box right now?"
jest.mock("../active-binding", () => ({
  ...jest.requireActual("../active-binding"),
  getActiveSandboxBinding: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getActiveSandboxBinding } = require("../active-binding");

const LIVE_BOX = { rowId: "box-live", proxyUrl: "https://orch/sandboxes/sbx-1/proxy" };
const DEAD_BOX = { rowId: "box-dead", proxyUrl: "https://orch/sandboxes/sbx-0/proxy" };

/** Minimal RootState slice-set the resolvers actually read. */
function makeState({ binding = null, surfaceSeed = null, isEphemeral = false } = {}) {
  return {
    conversations: {
      byConversationId: {
        "conv-1": {
          conversationId: "conv-1",
          sourceFeature: "chat-route",
          isEphemeral,
          cacheOnly: false,
          sandboxBinding: binding,
          sandboxBindingPersisted: !!binding,
        },
      },
    },
    userPreferences: {
      coding: {
        activeAgentSandboxBySurface: surfaceSeed
          ? { "chat-route": surfaceSeed }
          : {},
      },
    },
    chatIncognito: { active: false },
    codeWorkspace: {},
  };
}

describe("sandbox binding resolution — the record is the source of truth", () => {
  it("a stale surface preference is NOT a binding (the /chat/new false-positive)", () => {
    const state = makeState({ binding: null, surfaceSeed: DEAD_BOX });

    // This is the whole bug in one assertion: the conversation is NOT bound.
    expect(getConversationSandboxBinding(state, "conv-1")).toBeNull();

    // The preference still exists — it just isn't a binding. It's a seed.
    expect(getSurfaceSeedRef(state, "conv-1")).toMatchObject({
      rowId: "box-dead",
      source: "surface-seed",
    });
  });

  it("the conversation's own record IS a binding", () => {
    const state = makeState({ binding: LIVE_BOX });
    expect(getConversationSandboxBinding(state, "conv-1")).toMatchObject({
      rowId: "box-live",
      source: "conversation",
    });
  });

  it("the binding wins over a seed, and a seed arms an unbound conversation", () => {
    expect(
      getEffectiveSandboxRef(makeState({ binding: LIVE_BOX, surfaceSeed: DEAD_BOX }), "conv-1"),
    ).toMatchObject({ rowId: "box-live", source: "conversation" });

    expect(
      getEffectiveSandboxRef(makeState({ surfaceSeed: LIVE_BOX }), "conv-1"),
    ).toMatchObject({ rowId: "box-live", source: "surface-seed" });
  });

  it("an ephemeral conversation never binds a box", () => {
    const state = makeState({ binding: LIVE_BOX, isEphemeral: true });
    expect(getEffectiveSandboxRef(state, "conv-1")).toBeNull();
  });
});

describe("ensureSandboxOrDecide — who gets gated", () => {
  const run = async (state) => {
    const dispatch = jest.fn((action) =>
      typeof action === "function"
        ? Object.assign(Promise.resolve(undefined), { unwrap: () => Promise.resolve(undefined) })
        : action,
    );
    const result = await ensureSandboxOrDecide({ conversationId: "conv-1" })(
      dispatch,
      () => state,
      undefined,
    );
    return { outcome: result.payload, dispatch };
  };

  beforeEach(() => jest.clearAllMocks());

  it("NEVER opens the gate for a new conversation whose surface seed is dead", async () => {
    getActiveSandboxBinding.mockResolvedValue(null); // box can't be minted — it's gone
    const { outcome } = await run(makeState({ binding: null, surfaceSeed: DEAD_BOX }));

    // The message goes out (unbound). No modal. This is the reported bug.
    expect(openSandboxGate).not.toHaveBeenCalled();
    expect(outcome).toBe("proceed");
  });

  it("opens the gate for a BOUND conversation whose box can't be resolved", async () => {
    getActiveSandboxBinding.mockResolvedValue(null);
    openSandboxGate.mockResolvedValue("cancel");
    const { outcome } = await run(makeState({ binding: DEAD_BOX }));

    // This conversation really did have a sandbox — protect it.
    expect(openSandboxGate).toHaveBeenCalledWith({ conversationId: "conv-1" });
    expect(outcome).toBe("blocked");
  });

  it("proceeds with no gate and no network for an unbound, unseeded conversation", async () => {
    const { outcome } = await run(makeState());
    expect(getActiveSandboxBinding).not.toHaveBeenCalled();
    expect(openSandboxGate).not.toHaveBeenCalled();
    expect(outcome).toBe("proceed");
  });

  it("promotes a LIVE seed onto the conversation record before sending", async () => {
    getActiveSandboxBinding.mockResolvedValue({ sandbox_id: "sbx-1" });
    const { outcome, dispatch } = await run(makeState({ surfaceSeed: LIVE_BOX }));

    expect(outcome).toBe("proceed");
    expect(openSandboxGate).not.toHaveBeenCalled();
    // A thunk was dispatched to write the binding (promote) — the DB gets the
    // box before the request goes out, so the server's own check agrees.
    expect(dispatch.mock.calls.some(([a]) => typeof a === "function")).toBe(true);
  });
});
