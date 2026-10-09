/**
 * AN ACTION'S `visible` ANSWERS ON AN EMPTY HOST STATE — never throws (audit9 B14).
 *
 * The live Applet build window logged `TypeError: Cannot read properties of undefined (reading
 * 'byConversationId') at Object.visible` on every build: an assistant message rendered where the action
 * context's `getState()` answered a state without the chat slices (the host-state binding's own fallback
 * is `() => ({})`), and four `visible` predicates read `state.messages.byConversationId[…]` /
 * `state.conversations.byConversationId[…]` bare. A predicate that cannot read the store hides its
 * action; it never throws out of the menu.
 *
 * Red before the fix (both predicates threw), green after. The run paths of copy-with-thinking and the
 * full-screen editor read the same slices and were guarded in the same change.
 */

import "../handlers/ai";
import "../handlers/edit";
import { getAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import type { RichDocumentActionContext } from "@ai-matrx/rich-content/rich-document/types";
import { chatContext } from "../../test-utils/chatContext";

// The predicates that read the store's chat slices directly.
const STORE_READING_PREDICATES = ["edit", "save-run-as-shortcut"];

describe("visible() on a host state with no chat slices", () => {
  it.each(STORE_READING_PREDICATES)("%s hides itself instead of throwing", (id) => {
    const ctx: RichDocumentActionContext = {
      ...chatContext("assistant"),
      getState: () => ({}) as ReturnType<RichDocumentActionContext["getState"]>,
    };
    const action = getAction(id);
    expect(action?.visible).toBeDefined();
    expect(() => action?.visible?.(ctx)).not.toThrow();
    expect(action?.visible?.(ctx)).toBe(false);
  });
});
