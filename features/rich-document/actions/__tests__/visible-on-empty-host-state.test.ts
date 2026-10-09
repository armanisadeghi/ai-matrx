/**
 * EVERY ACTION'S MENU-TIME CALLBACK ANSWERS ON AN EMPTY HOST STATE — never throws (audit9 B14).
 *
 * The live Applet build window logged `TypeError: Cannot read properties of undefined (reading
 * 'byConversationId') at Object.visible` on every build: an assistant message rendered where the action
 * context's `getState()` answered a state without the chat slices (the host-state binding's own fallback
 * is `() => ({})`), and `visible` predicates read `state.messages.byConversationId[…]` /
 * `state.conversations.byConversationId[…]` bare. A callback that cannot read the store hides (or
 * disables) its action; it never throws out of the menu.
 *
 * The sweep: EVERY registered action, every callback the menu calls before a click (label, visible,
 * disabled, active, stateIcon), for an assistant and a user chat message. Every read goes through
 * `chatStateOf` (actions/utils.ts). Red before (at 2335814b17: continue-in-chat, regenerate-latest,
 * regenerate-response and conversation-pinned-only threw; before that, edit and save-run-as-shortcut),
 * green after.
 */

import "../handlers";
import { getAllActions } from "@ai-matrx/rich-content/rich-document/actions/provider";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";
import { chatContext } from "../../test-utils/chatContext";

const MENU_TIME = ["label", "visible", "disabled", "active", "stateIcon"] as const;

function emptyStateContext(role: "assistant" | "user"): RichDocumentActionContext {
  return { ...chatContext(role), getState: () => ({}) as ReturnType<RichDocumentActionContext["getState"]> };
}

describe("menu-time callbacks on a host state with no chat slices", () => {
  const actions = getAllActions();

  it("the sweep covers the whole registry", () => {
    expect(actions.length).toBeGreaterThan(20);
  });

  const cases = (["assistant", "user"] as const).flatMap((role) => actions.map((a) => [role, a.id] as const));
  it.each(cases)("%s message · %s", (role, id) => {
    const action = actions.find((a) => a.id === id)!;
    const ctx = emptyStateContext(role);
    for (const key of MENU_TIME) {
      const fn = (action as unknown as Record<string, unknown>)[key];
      if (typeof fn === "function") expect(() => (fn as (c: RichDocumentActionContext) => unknown)(ctx)).not.toThrow();
    }
  });
});
