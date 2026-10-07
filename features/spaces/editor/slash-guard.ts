// features/spaces/editor/slash-guard.ts — a "/" typed in the page always opens the "/" menu (round 26, D4/D5).
//
// BlockNote opens its suggestion menu from ProseMirror's handleTextInput. A "/" that reaches the document
// another way (the caret came back after the block menu took focus, the browser handed the key over as a
// DOM change) went in as plain text and "/Page" stayed on the page. After every "/" keypress the page
// checks: a "/" right before a collapsed caret, outside code, and no menu open → the menu opens on it.
import type { EditorState, Plugin, PluginKey } from "prosemirror-state";

import type { SpacesEditor } from "./schema";

function suggestionPlugin(state: EditorState): Plugin | null {
  return state.plugins.find((p) => String((p as unknown as { key: string }).key).startsWith("SuggestionMenuPlugin")) ?? null;
}

/** Whether a "/" menu should be opened on the "/" before the caret now (it did not open by itself). */
export function slashMissed(state: EditorState): boolean {
  const plugin = suggestionPlugin(state);
  if (!plugin || plugin.getState(state)) return false;
  const { from, to, $from } = state.selection;
  if (from !== to || from < 1 || $from.parent.type.spec.code) return false;
  return state.doc.textBetween(from - 1, from) === "/";
}

/** Open the "/" menu on the "/" just typed when BlockNote did not. Answers whether it opened it. */
export function openMissedSlash(editor: SpacesEditor): boolean {
  const view = editor.prosemirrorView;
  if (!view || !slashMissed(view.state)) return false;
  const key = (suggestionPlugin(view.state)!.spec.key ?? null) as PluginKey | null;
  if (!key) return false;
  view.dispatch(view.state.tr.setMeta(key, { triggerCharacter: "/" }));
  return true;
}
