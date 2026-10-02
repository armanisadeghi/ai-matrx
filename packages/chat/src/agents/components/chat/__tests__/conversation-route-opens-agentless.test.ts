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

  // 2026-09-21 (f5e4880edf): the SSR seed moved from the UNBOUNDED
  // `resolveMandateServer` to `resolveMandateSeed`, which carries the 2.5 s
  // deadline and an abort. `resolveMandateServer` now has exactly one caller —
  // `features/mandates/seed.server.ts` — because a first-paint read that hangs
  // took `/staff` down with a 504 on six consecutive production loads. So this
  // asserts the BOUNDED seam, and also that the route never reaches past it.
  it("opens an agent-less conversation under the default chat mandate", () => {
    expect(page).toContain("resolveMandateSeed(DEFAULT_NEW_CHAT_MANDATE_KEY)");
    expect(page).not.toContain("resolveMandateServer(");
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
