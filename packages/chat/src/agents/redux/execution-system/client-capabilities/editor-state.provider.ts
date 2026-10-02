/**
 * editor-state capability — bound when a code-editor surface is the active
 * caller. Payload is `IdeState` (active file, selection, diagnostics, git,
 * workspace). Auto-brings the `vsc_get_state` tool online server-side.
 *
 * Reads from `editorState.byConversationId[conversationId]`, populated by
 * `useIdeContextSync` in the agent code editor surface. Returns `null`
 * when no editor data is bound, which keeps the capability out of the
 * request envelope entirely (no false declaration for non-editor surfaces).
 */

import { selectEditorState } from "../../../../code-editor/redux/editor-state.slice";
import { registerClientCapability } from "./registry";

registerClientCapability({
  name: "editor-state",
  selectPayload: (state, conversationId) =>
    selectEditorState(state, conversationId),
});
