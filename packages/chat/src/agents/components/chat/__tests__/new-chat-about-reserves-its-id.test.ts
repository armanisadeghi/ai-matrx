/**
 * "New chat about this" must give the new chat its identity BEFORE it opens, so
 * the chip is keyed to that chat and survives a reload (live walk 2026-10-05: the
 * chip vanished from the new chat and landed in the source chat instead).
 * Use case: Dana selects a sentence in the reminder plan, "New chat about this", reloads.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getReservedFreshChatHref, reservedConversationIdOf } from "../begin-fresh-chat";

const ID = "8e922e0a-3838-4070-91af-b4181b202eb8";

it("the href carries the reserved id, and only a real uuid is accepted back", () => {
  expect(getReservedFreshChatHref(undefined, null, ID)).toBe(`/chat/new?c=${ID}`);
  expect(getReservedFreshChatHref("agent-1", "agent-2", ID)).toBe(`/chat/a/agent-1?c=${ID}`);
  expect(reservedConversationIdOf(ID)).toBe(ID);
  expect(reservedConversationIdOf("not-a-uuid")).toBeNull();
  expect(reservedConversationIdOf(null)).toBeNull();
});

it("is wired: the door navigates to the reserved href and the room's launcher mints that id", () => {
  const door = readFileSync(join(__dirname, "../new-chat-about.ts"), "utf8");
  expect(door).toContain("getReservedFreshChatHref(");
  const room = readFileSync(join(__dirname, "../ChatRoomClient.tsx"), "utf8");
  expect(room).toContain("reservedConversationId: isFreshRoute ? reservedConversationId : null");
  const launcher = readFileSync(join(__dirname, "../../../hooks/useAgentLauncher.ts"), "utf8");
  expect(launcher).toContain("reservedId ?? generateConversationId()");
});
