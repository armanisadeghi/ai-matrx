import { captureMessagingError } from "./captureMessagingError";
import { wrapClientForCapture } from "./supabaseErrorCapture";
import { clearCapturedErrors, getSnapshot } from "./errorCaptureStore";

beforeEach(clearCapturedErrors);

it("enriches the original database incident rather than mirroring it through the engine", async () => {
  const failure = { code: "42501", message: "owner_only: private conversation", details: "Recipient cannot share", hint: "Owner only" };
  const client = wrapClientForCapture({ schema: (_schema: string) => ({ from: (_relation: string) => ({
    update: () => Promise.resolve({ data: null, error: failure, status: 403 }),
  }) }) });
  await client.schema("communication").from("dm_conversation_participants").update();
  const original = getSnapshot()[0];
  captureMessagingError({ level: "error", message: "markRead: denied", operation: "markRead",
    conversationId: "conversation-ada", error: new Error("markRead: denied", { cause: failure }) }, "Couldn't mark messages as read");
  expect(getSnapshot()).toHaveLength(1);
  expect(getSnapshot()[0]).toMatchObject({ id: original.id, count: 1,
    source: "supabase-postgrest", code: "42501", status: 403,
    details: "Recipient cannot share", hint: "Owner only", conversationId: "conversation-ada",
    userMessage: "Couldn't mark messages as read", tier: "red" });
});

it("captures a zero-row refusal with the write operation and conversation identity", () => {
  captureMessagingError({ level: "error", message: "markRead: participant update returned no live row",
    operation: "markRead", code: "write-not-applied", conversationId: "conversation-grace" }, "Read state was not saved");
  expect(getSnapshot()).toHaveLength(1);
  expect(getSnapshot()[0]).toMatchObject({ source: "messaging", operation: "update",
    schema: "communication", relation: "dm_conversation_participants", code: "write-not-applied",
    conversationId: "conversation-grace", userMessage: "Read state was not saved", tier: "red" });
});
