import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../../..");
const page = readFileSync(
  join(root, "app/(core)/chat/[conversationId]/page.tsx"),
  "utf8",
);
const room = readFileSync(join(__dirname, "../ChatConversationRoom.tsx"), "utf8");
const persistence = readFileSync(
  join(
    root,
    "features/agents/redux/execution-system/conversations/conversation-persistence.ts",
  ),
  "utf8",
);

// 2026-09-08: `/chat/[id]` treated a NULL `initial_agent_id` as "not found"
// and hard-redirected to `/chat/new`. 6,288 live conversations (model-direct
// API turns, coding-session mirrors, workflow + proof runs) were dead ends
// from the sidebar, and a genuine access failure was indistinguishable from a
// missing row. The route may never redirect on an empty read again.
describe("/chat/[conversationId] opens every readable conversation", () => {
  it("never redirects away from a conversation it could not read", () => {
    expect(page).not.toContain("redirect(");
    expect(page).not.toContain('from "next/navigation"');
  });

  it("asks the platform (AccessGate) instead of guessing why a read came back empty", () => {
    expect(page).toContain('<AccessGate');
    expect(page).toContain('token="conversation"');
    // The failed read must scream server-side, never be swallowed.
    expect(page).toContain("console.error(");
  });

  it("opens an agent-less conversation under the default chat mandate", () => {
    expect(page).toContain("resolveMandateServer(DEFAULT_NEW_CHAT_MANDATE_KEY)");
    expect(page).toContain("<ChatConversationRoom");
    expect(room).toContain("mandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}");
    expect(room).toContain("useMandate(DEFAULT_NEW_CHAT_MANDATE_KEY)");
    expect(room).toContain("<ChatMandateUnavailable");
  });

  it("keeps the promotion gate mirroring the SSR read: the row, not the agent", () => {
    expect(persistence).not.toContain("data.initial_agent_id");
    expect(persistence).toContain("if (data) return true;");
  });
});
