import { configureStore } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { selectInboxItems } from "../inbox.selectors";
import conversationInboxReducer, { addInboxItem } from "../inbox.slice";

test("inbox items retain their state reference without an identity-selector warning", () => {
  const store = configureStore({
    reducer: { conversationInbox: conversationInboxReducer },
  });
  store.dispatch(
    addInboxItem({
      injectionId: "injection-selector-warning",
      conversationId: "conversation-selector-warning",
      mode: "queue",
      kind: "user_message",
      text: "Continue with the queued instruction.",
      status: "pending",
      isVisibleToUser: true,
      queuedAt: "2026-09-15T23:00:00.000Z",
    }),
  );
  const state = store.getState() as unknown as RootState;
  const stateItems = state.conversationInbox.byConversationId[
    "conversation-selector-warning"
  ];
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  const selected = selectInboxItems("conversation-selector-warning")(state);

  const identityWarnings = warn.mock.calls.filter(([message]) =>
    String(message).includes(
      "The result function returned its own inputs without modification",
    ),
  );
  warn.mockRestore();
  expect(selected).toBe(stateItems);
  expect(identityWarnings).toHaveLength(0);
});
