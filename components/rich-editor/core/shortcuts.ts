// components/rich-editor/core/shortcuts.ts
//
// THE keyboard shortcut table — one list the keymap binds and the help sheet
// (⌘/) shows, so the two can never disagree. Keys use ProseMirror names
// ("Mod" = ⌘ on Apple, Ctrl elsewhere). The reference column says which
// champion the binding matches: Google Docs and Notion are the two editors
// people's hands already know; where they differ both bindings are live.

export type ShortcutGroup = "Text" | "Blocks" | "Insert" | "Document" | "Views";

export interface ShortcutSpec {
  id: string;
  label: string;
  keys: readonly string[];
  group: ShortcutGroup;
  reference: string;
}

export const RICH_EDITOR_SHORTCUTS: readonly ShortcutSpec[] = [
  { id: "bold", label: "Bold", keys: ["Mod-b"], group: "Text", reference: "Docs · Notion" },
  { id: "italic", label: "Italic", keys: ["Mod-i"], group: "Text", reference: "Docs · Notion" },
  { id: "strike", label: "Strikethrough", keys: ["Mod-Shift-s", "Alt-Shift-5"], group: "Text", reference: "Notion · Docs" },
  { id: "code", label: "Inline code", keys: ["Mod-e"], group: "Text", reference: "Notion" },
  { id: "link", label: "Add or edit link", keys: ["Mod-k"], group: "Text", reference: "Docs · Notion" },
  { id: "paragraph", label: "Normal text", keys: ["Mod-Alt-0", "Mod-Shift-0"], group: "Blocks", reference: "Docs · Notion" },
  { id: "heading1", label: "Heading 1", keys: ["Mod-Alt-1", "Mod-Shift-1"], group: "Blocks", reference: "Docs · Notion" },
  { id: "heading2", label: "Heading 2", keys: ["Mod-Alt-2", "Mod-Shift-2"], group: "Blocks", reference: "Docs · Notion" },
  { id: "heading3", label: "Heading 3", keys: ["Mod-Alt-3", "Mod-Shift-3"], group: "Blocks", reference: "Docs · Notion" },
  { id: "heading4", label: "Heading 4", keys: ["Mod-Alt-4"], group: "Blocks", reference: "Docs" },
  { id: "heading5", label: "Heading 5", keys: ["Mod-Alt-5"], group: "Blocks", reference: "Docs" },
  { id: "heading6", label: "Heading 6", keys: ["Mod-Alt-6"], group: "Blocks", reference: "Docs" },
  { id: "orderedList", label: "Numbered list", keys: ["Mod-Shift-7"], group: "Blocks", reference: "Docs · Notion" },
  { id: "bulletList", label: "Bulleted list", keys: ["Mod-Shift-8"], group: "Blocks", reference: "Docs · Notion" },
  { id: "taskList", label: "Checklist", keys: ["Mod-Shift-9"], group: "Blocks", reference: "Docs" },
  { id: "moveUp", label: "Move block up", keys: ["Mod-Shift-ArrowUp"], group: "Blocks", reference: "Notion" },
  { id: "moveDown", label: "Move block down", keys: ["Mod-Shift-ArrowDown"], group: "Blocks", reference: "Notion" },
  { id: "codeBlock", label: "Code block", keys: ["Mod-Alt-c"], group: "Insert", reference: "Notion" },
  { id: "inlineMath", label: "Inline equation", keys: ["Mod-Shift-m"], group: "Insert", reference: "Notion (⌘⇧E)" },
  { id: "slash", label: "Insert anything", keys: ["/"], group: "Insert", reference: "Notion" },
  { id: "variable", label: "Insert a variable", keys: ["{{"], group: "Insert", reference: "AI Matrx" },
  { id: "undo", label: "Undo", keys: ["Mod-z"], group: "Document", reference: "Docs · Notion" },
  { id: "redo", label: "Redo", keys: ["Mod-Shift-z", "Mod-y"], group: "Document", reference: "Docs · Notion" },
  { id: "find", label: "Find", keys: ["Mod-f"], group: "Document", reference: "Docs" },
  { id: "replace", label: "Find and replace", keys: ["Mod-h", "Mod-Shift-h"], group: "Document", reference: "Docs" },
  { id: "save", label: "Save", keys: ["Mod-s"], group: "Document", reference: "Docs · Notion" },
  { id: "wordCount", label: "Word count", keys: ["Mod-Shift-c"], group: "Document", reference: "Docs" },
  { id: "outline", label: "Show outline", keys: ["Mod-Alt-h"], group: "Views", reference: "Docs" },
  { id: "focus", label: "Focus mode", keys: ["Mod-Shift-f"], group: "Views", reference: "iA Writer · Docs" },
  { id: "cycleView", label: "Visual → Source → Preview", keys: ["Mod-Shift-e"], group: "Views", reference: "AI Matrx" },
  { id: "help", label: "Keyboard shortcuts", keys: ["Mod-/"], group: "Views", reference: "Docs" },
];

/** Keys that are typed characters, not chords (handled by input rules/menus). */
export const TYPED_TRIGGERS = new Set(["/", "{{"]);

/** Human-readable key label for the platform. */
export function formatKeys(keys: string, apple: boolean): string {
  return keys
    .split("-")
    .map((part) => {
      if (part === "Mod") return apple ? "⌘" : "Ctrl";
      if (part === "Alt") return apple ? "⌥" : "Alt";
      if (part === "Shift") return apple ? "⇧" : "Shift";
      if (part === "ArrowUp") return "↑";
      if (part === "ArrowDown") return "↓";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(apple ? "" : "+");
}
