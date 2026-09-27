/**
 * The Conversation embed opens the chat through the ONE read-only sequence and
 * lands on the matched message: an older message is paged in, every group is
 * drawn, and the matched group is scrolled to the middle and marked.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = { messages: { byConversationId: {} as Record<string, { byId: Record<string, unknown> }> } };
const dispatched: unknown[] = [];
// Stable across renders, like the real hooks.
const mockDispatch = (a: unknown) => {
  dispatched.push(a);
  return a;
};
const mockStore = { getState: () => state };
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppStore: () => mockStore,
}));
let row: { initial_agent_id: string | null } | null = { initial_agent_id: "agent-1" };
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => {
    const chain = {
      schema: () => chain,
      from: () => chain,
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return chain;
  },
}));
const hydrate = jest.fn(async () => undefined);
jest.mock("@/features/agents/components/messages-display/hydrateConversationForReading", () => ({
  hydrateConversationForReading: (...a: unknown[]) => hydrate(...(a as [])),
}));
const loadFull = jest.fn(async () => ({ complete: true, loaded: 3 }));
jest.mock("@/features/agents/conversation-export/load-full-history", () => ({
  loadFullConversationHistory: (...a: unknown[]) => loadFull(...(a as [])),
}));
jest.mock("@/features/agents/redux/execution-system/messages/messages.slice", () => ({
  setVisibleGroupLimit: (p: unknown) => ({ type: "setVisibleGroupLimit", payload: p }),
}));
jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: ({ token }: { token: string }) => <div data-testid="gate">{token}</div>,
}));
// The transcript as the real display draws it: one wrapper per group, tagged
// with every message id it shows.
jest.mock("@/features/agents/components/messages-display/AgentConversationDisplay", () => ({
  AgentConversationDisplay: () => (
    <div>
      <div data-message-group="" data-message-ids="u1" id="g-user" />
      <div data-message-group="" data-message-ids="a1 a2" id="g-answer" />
    </div>
  ),
}));

import { ConversationEmbed } from "@/features/knowledge/hub/embeds/ConversationEmbed";

let host: HTMLDivElement;
let root: Root;
const scrolled: string[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this.id);
  };
});
beforeEach(() => {
  scrolled.length = 0;
  dispatched.length = 0;
  hydrate.mockClear();
  loadFull.mockClear();
  row = { initial_agent_id: "agent-1" };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function flush(frames = 5) {
  for (let i = 0; i < frames; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

it("opens through the read-only sequence and scrolls to the matched message's group", async () => {
  act(() => root.render(<ConversationEmbed conversationId="cv-1" messageId="a1" />));
  await flush();
  expect(hydrate).toHaveBeenCalledWith(expect.anything(), expect.any(Function), {
    conversationId: "cv-1",
    agentId: "agent-1",
    surfaceKey: "knowledge-hub-peek",
  });
  // Not in the first page → paged back, and every group drawn.
  expect(loadFull).toHaveBeenCalledTimes(1);
  expect(dispatched).toContainEqual({ type: "setVisibleGroupLimit", payload: { conversationId: "cv-1", limit: null } });
  expect(scrolled).toEqual(["g-answer"]);
  expect(host.querySelector("#g-answer")?.hasAttribute("data-peek-match")).toBe(true);
  expect(host.textContent).toContain("Opened at the matching message.");
});

it("a Chats hit (no matched message) opens the chat without paging or scrolling", async () => {
  act(() => root.render(<ConversationEmbed conversationId="cv-1" messageId={null} />));
  await flush();
  expect(hydrate).toHaveBeenCalled();
  expect(loadFull).not.toHaveBeenCalled();
  expect(scrolled).toEqual([]);
  expect(host.querySelector("#g-user")).not.toBeNull();
});

it("a chat that cannot be read hands off to the access gate", async () => {
  row = null;
  act(() => root.render(<ConversationEmbed conversationId="gone" messageId={null} />));
  await flush();
  expect(host.querySelector("[data-testid=gate]")?.textContent).toBe("conversation");
  expect(hydrate).not.toHaveBeenCalled();
});
