/**
 * A REASONING ROW NEVER SPLITS A TURN (2026-09-29).
 *
 * On reload of the PR Director conversation 88d030cd-9998-42a7-a9df-0da12de8bd18 the screen said "This run
 * finished without writing an answer" directly above the full answer. The persisted rows (read from
 * chat.message) are: user · output (thinking) · assistant (tool call) · tool · assistant (tool call) · tool ·
 * output (thinking) · assistant (the answer). An OpenAI reasoning item is persisted as its own row with the
 * runtime role "output". The grouping treated that row as a turn boundary, so the turn split in two: the first
 * half ended on a tool-call row, was judged the turn's answer, and was declared answerless.
 *
 * An "output" row is part of the assistant turn it sits in — never a boundary.
 */
// The import chain reaches rich-document's transfer handler, which imports a records-ui subpath (`table-shape`)
// present in the package source (0.93.68) but not yet in the published copy installed here (0.93.67).
// Unrelated to grouping; that one module is stubbed until the release train publishes it.
jest.mock("@/features/rich-document/actions/handlers/transfer", () => ({}));

import { buildDisplayEntries, groupDisplayEntries } from "../display-groups";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

function row(id: string, role: string, position: number, content: unknown[]): MessageRecord {
  return {
    id, conversationId: "88d030cd", agentId: null, role: role as MessageRecord["role"], content: content as MessageRecord["content"],
    contentHistory: null, userContent: null, position, source: "db", status: "active", isVisibleToModel: true,
    isVisibleToUser: true, metadata: {}, createdAt: `2026-09-29T00:00:${String(position).padStart(2, "0")}.000Z`,
    deletedAt: null, _clientStatus: "complete",
  } as MessageRecord;
}

const thinking = [{ type: "thinking", text: "" }];
const call = (name: string) => [{ type: "tool_call", name, call_id: name }];
const result = (name: string) => [{ type: "tool_result", name, call_id: name }];

test("a Director turn with reasoning rows between its tool calls stays ONE turn ending on the answer", () => {
  const rows = [
    row("u", "user", 0, [{ type: "text", text: "Critique this pitch, then check its claims." }]),
    row("o1", "output", 1, thinking),
    row("a1", "assistant", 2, call("custom_tool_5")),
    row("t1", "tool", 3, result("custom_tool_5")),
    row("a2", "assistant", 4, call("custom_tool_6")),
    row("t2", "tool", 5, result("custom_tool_6")),
    row("o2", "output", 6, thinking),
    row("a3", "assistant", 7, [{ type: "text", text: "Asset: you have real, frontline visibility…" }]),
  ];
  const groups = groupDisplayEntries(
    buildDisplayEntries({ messages: rows, isActive: false, latestRequestId: null, isErrorPhase: false }),
  );
  const assistantGroups = groups.filter((g) => g.kind === "assistant");
  expect(assistantGroups).toHaveLength(1);
  const members = (assistantGroups[0] as { members: Array<{ messageId: string | null }> }).members;
  // The last member — the only one judged as the turn's answer — is the row that carries the answer.
  expect(members.map((m) => m.messageId)).toEqual(["a1", "a2", "a3"]);
});
