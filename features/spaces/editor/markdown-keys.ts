// features/spaces/editor/markdown-keys.ts — the Notion Markdown shortcuts BlockNote has no rule for (D10).
// BlockNote turns "# ", "## ", "### ", "- ", "* ", "1. ", "[] ", "> " (toggle, as Notion) and "---" by
// itself. Notion also turns:   ``` → code block      " + space → quote
import type { SpacesEditor } from "./schema";

type Shortcut = { before: string; key: string; type: string; props?: Record<string, unknown> };

export const MARKDOWN_SHORTCUTS: Shortcut[] = [
  { before: "``", key: "`", type: "codeBlock" },
  { before: '"', key: " ", type: "quote" },
];

/** The shortcut a key completes on a text line that holds only `before` (caret at its end), if any. */
export function shortcutFor(lineText: string, caretAtEnd: boolean, key: string, blockType: string): Shortcut | null {
  if (blockType !== "paragraph" || !caretAtEnd) return null;
  return MARKDOWN_SHORTCUTS.find((s) => s.key === key && s.before === lineText) ?? null;
}

/** Apply the shortcut the pressed key completes. Answers whether it did (the key is then consumed). */
export function applyMarkdownKey(editor: SpacesEditor, key: string): boolean {
  const state = editor.prosemirrorState;
  const { from, to, $from } = state.selection;
  if (from !== to) return false;
  const block = editor.getTextCursorPosition().block;
  const text = $from.parent.textContent;
  const shortcut = shortcutFor(text, $from.parentOffset === text.length, key, block.type);
  if (!shortcut) return false;
  editor.updateBlock(block.id, { type: shortcut.type, props: shortcut.props ?? {}, content: [] } as never);
  editor.setTextCursorPosition(block.id, "start");
  return true;
}
