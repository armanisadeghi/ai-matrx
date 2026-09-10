/** @jest-environment node */
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
 *
 * SUTs: the resolvers in `active-binding.ts` and the `ensureSandboxOrDecide`
 * thunk, run against the REAL app store (real reducers, real
 * `setConversationSandbox` — a cacheOnly record keeps the binding in memory,
 * so no DB double is needed). Doubles: `getActiveSandboxBinding` (token mint —
 * network), `openSandboxGate` (the user's modal answer), `fetch`.
 */

import { makeStore } from "@/lib/redux/store";
import {
  createInstance,
  patchConversation,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  getConversationSandboxBinding,
  getSurfaceSeedRef,
  getEffectiveSandboxRef,
  resolveSandboxRefDetails,
  getActiveSandboxBinding,
  type SandboxBindingPayload,
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

const mintMock = jest.mocked(getActiveSandboxBinding);
const gateMock = jest.mocked(openSandboxGate);

const CONVERSATION_ID = "conv-1";

const LIVE_BOX = {
  rowId: "box-live",
  proxyUrl: "https://orch/sandboxes/sbx-1/proxy",
};
const DEAD_BOX = {
  rowId: "box-dead",
  proxyUrl: "https://orch/sandboxes/sbx-0/proxy",
};

const LIVE_MINT = {
  sandbox_id: "sbx-1",
  base_url: "https://orch/sandboxes/sbx-1",
  access_token: "tok-live",
  root_path: "/home/agent",
  target_kind: "sandbox",
} satisfies SandboxBindingPayload;

type StoredRef = { rowId: string; proxyUrl: string; kind?: "local-pc" };

/** A real store holding one chat conversation, optionally bound and/or seeded. */
function makeConversationStore({
  binding = null,
  surfaceSeed = null,
  seedSurface = "chat",
  isEphemeral = false,
}: {
  binding?: StoredRef | null;
  surfaceSeed?: StoredRef | null;
  seedSurface?: string;
  isEphemeral?: boolean;
} = {}) {
  const store = makeStore();
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: "agent-1",
      agentType: "user",
      origin: "manual",
      sourceFeature: "chat",
      isEphemeral,
    }),
  );
  if (binding) {
    store.dispatch(
      patchConversation({
        conversationId: CONVERSATION_ID,
        sandboxBinding: binding,
        sandboxBindingPersisted: true,
      }),
    );
  }
  if (surfaceSeed) {
    store.dispatch(
      setPreference({
        module: "coding",
        preference: "activeAgentSandboxBySurface",
        value: { [seedSurface]: surfaceSeed },
      }),
    );
  }
  return store;
}

type ConversationStore = ReturnType<typeof makeConversationStore>;

const recordBinding = (store: ConversationStore) =>
  store.getState().conversations.byConversationId[CONVERSATION_ID]
    ?.sandboxBinding ?? null;

const runGate = (store: ConversationStore) =>
  store.dispatch(ensureSandboxOrDecide({ conversationId: CONVERSATION_ID })).unwrap();

describe("sandbox binding resolution — the record is the source of truth", () => {
  it("a stale surface preference is NOT a binding (the /chat/new false-positive)", () => {
    const state = makeConversationStore({ surfaceSeed: DEAD_BOX }).getState();

    // This is the whole bug in one assertion: the conversation is NOT bound.
    expect(getConversationSandboxBinding(state, CONVERSATION_ID)).toBeNull();

    // The preference still exists — it just isn't a binding. It's a seed.
    expect(getSurfaceSeedRef(state, CONVERSATION_ID)).toMatchObject({
      rowId: "box-dead",
      source: "surface-seed",
    });
  });

  // Break caught: a seed leaking across surfaces. A box bound from another
  // surface's input must never arm this conversation.
  it("a seed stored for a different surface does not arm this conversation", () => {
    const state = makeConversationStore({
      surfaceSeed: LIVE_BOX,
      seedSurface: "transcript-studio",
    }).getState();

    expect(getSurfaceSeedRef(state, CONVERSATION_ID)).toBeNull();
    expect(getEffectiveSandboxRef(state, CONVERSATION_ID)).toBeNull();
  });

  it("the conversation's own record IS a binding", () => {
    const state = makeConversationStore({ binding: LIVE_BOX }).getState();
    expect(getConversationSandboxBinding(state, CONVERSATION_ID)).toMatchObject({
      rowId: "box-live",
      source: "conversation",
    });
  });

  it("the binding wins over a seed, and a seed arms an unbound conversation", () => {
    expect(
      getEffectiveSandboxRef(
        makeConversationStore({ binding: LIVE_BOX, surfaceSeed: DEAD_BOX }).getState(),
        CONVERSATION_ID,
      ),
    ).toMatchObject({ rowId: "box-live", source: "conversation" });

    expect(
      getEffectiveSandboxRef(
        makeConversationStore({ surfaceSeed: LIVE_BOX }).getState(),
        CONVERSATION_ID,
      ),
    ).toMatchObject({ rowId: "box-live", source: "surface-seed" });
  });

  it("an ephemeral conversation never binds a box", () => {
    const state = makeConversationStore({
      binding: LIVE_BOX,
      isEphemeral: true,
    }).getState();
    expect(getEffectiveSandboxRef(state, CONVERSATION_ID)).toBeNull();
  });

  it("a binding with NO proxyUrl is still a binding (server-written / local-pc)", () => {
    // aidream's own bind endpoint writes cx_conversation.sandbox_instance_id and
    // no metadata at all. Requiring a cached proxyUrl made that look UNBOUND, so
    // the turn went out to the global server with no sandbox and no gate — the
    // silent fallback this whole module exists to prevent. The URL is a routing
    // detail (re-derived at send time), never identity.
    const urlless = { rowId: "box-from-server", proxyUrl: "" };
    expect(
      getConversationSandboxBinding(
        makeConversationStore({ binding: urlless }).getState(),
        CONVERSATION_ID,
      ),
    ).toMatchObject({ rowId: "box-from-server", source: "conversation" });

    const localPc: StoredRef = { rowId: "pc-1", proxyUrl: "", kind: "local-pc" };
    expect(
      getConversationSandboxBinding(
        makeConversationStore({ binding: localPc }).getState(),
        CONVERSATION_ID,
      ),
    ).toMatchObject({
      rowId: "pc-1",
      kind: "local-pc",
      source: "conversation",
    });
  });
});

describe("ensureSandboxOrDecide — who gets gated", () => {
  beforeEach(() => {
    mintMock.mockReset();
    gateMock.mockReset();
  });

  it("NEVER opens the gate for a new conversation whose surface seed is dead", async () => {
    mintMock.mockResolvedValue(null); // box can't be minted — it's gone
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = makeConversationStore({ surfaceSeed: DEAD_BOX });

    // The message goes out (unbound). No modal. This is the reported bug.
    await expect(runGate(store)).resolves.toBe("proceed");
    expect(gateMock).not.toHaveBeenCalled();
    expect(recordBinding(store)).toBeNull();
    warn.mockRestore();
  });

  it("proceeds with no gate and no network for an unbound, unseeded conversation", async () => {
    const store = makeConversationStore();
    await expect(runGate(store)).resolves.toBe("proceed");
    expect(mintMock).not.toHaveBeenCalled();
    expect(gateMock).not.toHaveBeenCalled();
  });

  // Break caught: the promote writing the wrong ref (or none). The record must
  // own exactly the seeded box before the request goes out.
  it("promotes a LIVE seed onto the conversation record before sending", async () => {
    mintMock.mockResolvedValue(LIVE_MINT);
    const store = makeConversationStore({ surfaceSeed: LIVE_BOX });

    await expect(runGate(store)).resolves.toBe("proceed");
    expect(gateMock).not.toHaveBeenCalled();
    expect(recordBinding(store)).toMatchObject({
      rowId: "box-live",
      proxyUrl: "https://orch/sandboxes/sbx-1/proxy",
    });
  });

  // Break caught: gating a bound conversation whose box IS live.
  it("proceeds without the gate for a BOUND conversation whose box is live", async () => {
    mintMock.mockResolvedValue(LIVE_MINT);
    const store = makeConversationStore({ binding: LIVE_BOX });

    await expect(runGate(store)).resolves.toBe("proceed");
    expect(gateMock).not.toHaveBeenCalled();
    expect(recordBinding(store)).toMatchObject({ rowId: "box-live" });
  });

  it("blocks a BOUND conversation whose box can't be resolved when the user cancels", async () => {
    mintMock.mockResolvedValue(null);
    gateMock.mockResolvedValue("cancel");
    const store = makeConversationStore({ binding: DEAD_BOX });

    // This conversation really did have a sandbox — protect it.
    await expect(runGate(store)).resolves.toBe("blocked");
    expect(gateMock).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });
    expect(recordBinding(store)).toMatchObject({ rowId: "box-dead" });
  });

  // Break caught: "detach" sending without unbinding. The record must be
  // unbound and the seed cleared BEFORE the send proceeds, or the server (and
  // the next turn) still see the box the user declined.
  it("unbinds the record and clears the surface seed when the user detaches", async () => {
    mintMock.mockResolvedValue(null);
    gateMock.mockResolvedValue("detach");
    const store = makeConversationStore({ binding: DEAD_BOX, surfaceSeed: DEAD_BOX });

    await expect(runGate(store)).resolves.toBe("proceed");
    expect(recordBinding(store)).toBeNull();
    expect(
      store.getState().userPreferences.coding.activeAgentSandboxBySurface,
    ).toEqual({});
  });

  // Break caught: "attach" proceeding while the box is still not live — the
  // turn would run unbound on a conversation that owns a sandbox.
  it("stays blocked when the user attaches but the box still isn't live", async () => {
    mintMock.mockResolvedValue(null);
    gateMock.mockResolvedValue("attach");
    const store = makeConversationStore({ binding: DEAD_BOX });

    await expect(runGate(store)).resolves.toBe("blocked");
  });
});

describe("resolveSandboxRefDetails — expected stale bindings are not errors", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const respondWith = (status: number) =>
    jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status }));

  it("warns and returns null when the bound sandbox row is gone", async () => {
    global.fetch = respondWith(404);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resolveSandboxRefDetails("gone-box-404")).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stale binding"));
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps unexpected sandbox-detail failures on the error channel", async () => {
    global.fetch = respondWith(500);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(resolveSandboxRefDetails("broken-box-500")).resolves.toBeNull();

    expect(error).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
    expect(warn).not.toHaveBeenCalled();
  });
});
