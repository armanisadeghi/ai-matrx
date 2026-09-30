import { diagnosticToastCopy } from "./diagnostic-copy";

it("keeps a conversation timeout concise and actionable", () => {
  expect(
    diagnosticToastCopy(
      "messaging",
      "listConversations: canceling statement due to statement timeout",
    ),
  ).toEqual({
    title: "Couldn't load conversations",
    description: "Refresh to try again.",
  });
});

it("does not expose call diagnostics or remedies in the toast", () => {
  expect(diagnosticToastCopy("meet", "meet.listMeetings: PGRST205 missing table"))
    .toEqual({
      title: "Couldn't complete that call action",
      description: "Try again in a moment.",
    });
});

it("does not suggest retrying a non-retryable messaging refusal", () => {
  expect(diagnosticToastCopy("messaging", "markRead: denied", { message: "markRead: denied", isRetryable: false }))
    .toEqual({ title: "Couldn't mark messages as read", description: "Open the error details." });
});
