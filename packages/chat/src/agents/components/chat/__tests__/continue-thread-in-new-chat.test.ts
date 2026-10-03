/**
 * @jest-environment jsdom
 *
 * "Continue in new chat" on a comment thread — an agent takes the thread over
 * (threads design F5, 2026-10-03). The ONE door (`openNewChatAbout`) hands the
 * new chat exactly one comment remark carrying the ROOT comment's id, its words
 * and the thread so far; the chat goes to the agent that replied (else the
 * default new-chat agent) and is sent at once. A passage ("New chat about
 * this") still waits for the person's words.
 *
 * Use case: Dana's thread on the scrap-intake answer — "Truck scale or floor
 * scale?" / the intake agent's "The truck scale." — continues in a new chat
 * with the intake agent.
 */

jest.mock("../../../../host/org", () => ({ ensureOrgId: jest.fn(async () => "org-allgreen") }));
jest.mock("../../../../mandates/service", () => ({ resolveMandate: jest.fn(async () => ({ agentId: "agent-default-chat" })) }));

import { openNewChatAbout, type NewChatThread } from "../new-chat-about";
import { consumeChatDraftTransfer } from "../chat-draft-transfer";
import { readStoredRemarks } from "../../../redux/execution-system/instance-resources/remarks";
import { remarkToWire } from "../../../redux/execution-system/instance-resources/remarks-wire";

const IDENTITY = { userId: "user-dana", organizationId: "org-allgreen" };
const THREAD: NewChatThread = {
  rootCommentId: "root-7",
  messageId: "answer-1",
  conversationId: "conv-intake",
  quote: "Weigh every inbound load of scrap aluminum",
  body: "Truck scale or floor scale?",
  replies: [{ authorName: "Scrap Intake Advisor", authorKind: "agent", body: "The truck scale.", createdAt: "2026-10-03T10:01:00Z" }],
};

beforeEach(() => window.sessionStorage.clear());

async function open(args: Partial<Parameters<typeof openNewChatAbout>[0]>) {
  const dispatch = jest.fn();
  const navigate = jest.fn();
  await openNewChatAbout({ identity: IDENTITY, dispatch, navigate, ...args } as Parameters<typeof openNewChatAbout>[0]);
  return { dispatch, navigate };
}

it("hands the thread to the agent that replied, as one root comment remark, and sends at once", async () => {
  const { navigate } = await open({ thread: THREAD, agentId: "agent-intake" });
  expect(navigate).toHaveBeenCalledWith("/chat/a/agent-intake");
  const transfer = consumeChatDraftTransfer("agent-intake", IDENTITY)!;
  expect(transfer.autoSend).toBe(true);
  expect(transfer.text).toBe("");
  const remarks = readStoredRemarks(transfer.remarks);
  expect(remarks).toHaveLength(1);
  expect(remarks[0]!.item).toMatchObject({
    kind: "comment",
    commentId: "root-7",
    target: { conversationId: "conv-intake", messageId: "answer-1" },
    quote: THREAD.quote,
    body: THREAD.body,
    thread: THREAD.replies,
  });
  // On the wire it is the ROOT comment — the agent's replies land in the original thread.
  // The thread rides in the server's RemarkThreadEntry shape, oldest first.
  expect(remarkToWire(remarks[0]!.item)).toEqual({
    kind: "comment",
    comment_id: "root-7",
    target: { message_id: "answer-1" },
    quote: THREAD.quote,
    body: THREAD.body,
    thread: [{ author_name: "Scrap Intake Advisor", author_kind: "agent", body: "The truck scale.", created_at: "2026-10-03T10:01:00Z" }],
  });
});

it("with no agent named, the default new-chat agent takes it", async () => {
  const { navigate } = await open({ thread: THREAD, agentId: null });
  expect(navigate).toHaveBeenCalledWith("/chat/new");
  expect(consumeChatDraftTransfer("agent-default-chat", IDENTITY)?.autoSend).toBe(true);
});

it("a passage still waits for the person's words", async () => {
  await open({ passage: { quote: "Retention is the real problem", conversationId: "conv-1", messageId: "answer-9" } });
  const transfer = consumeChatDraftTransfer("agent-default-chat", IDENTITY)!;
  expect(transfer.autoSend).toBeUndefined();
});
