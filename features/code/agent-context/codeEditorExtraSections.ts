/**
 * Monaco IDE actions injected into the `/code` workspace context menu via
 * `extraSections`. The Radix wrapper owns right-click (so agent shortcuts
 * show), which disables Monaco's native context menu — these items restore
 * Format / Find / Go to Line / Command Palette without forking the menu.
 */

import {
  AlignLeft,
  Command,
  Navigation,
  Search,
  TextSelect,
  WrapText,
} from "lucide-react";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import type { StandaloneCodeEditor } from "../editor/MonacoEditor";

export interface CodeEditorExtraSectionsConfig {
  /** Live Monaco instance; actions no-op when null. */
  getEditor: () => StandaloneCodeEditor | null;
  /** True when the buffer has a non-empty selection (gates Format Selection). */
  hasSelection?: boolean;
}

function runMonacoAction(
  getEditor: () => StandaloneCodeEditor | null,
  actionId: string,
): void {
  const editor = getEditor();
  if (!editor) return;
  void editor.getAction(actionId)?.run();
}

/**
 * Editor-ops section slotted after clipboard so Format sits near Cut/Copy/Paste.
 */
export function createCodeEditorExtraSections(
  config: CodeEditorExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const { getEditor, hasSelection = false } = config;

  return [
    {
      id: "code-editor-ops",
      label: "Editor",
      anchor: "after-clipboard",
      items: [
        {
          kind: "item",
          id: "format-document",
          label: "Format Document",
          icon: AlignLeft,
          hint: "⇧⌥F",
          onSelect: () =>
            runMonacoAction(getEditor, "editor.action.formatDocument"),
        },
        {
          kind: "item",
          id: "format-selection",
          label: "Format Selection",
          icon: TextSelect,
          disabled: !hasSelection,
          onSelect: () =>
            runMonacoAction(getEditor, "editor.action.formatSelection"),
        },
        { kind: "separator", id: "editor-ops-sep-1" },
        {
          kind: "item",
          id: "find",
          label: "Find",
          icon: Search,
          hint: "⌘F",
          onSelect: () => runMonacoAction(getEditor, "actions.find"),
        },
        {
          kind: "item",
          id: "go-to-line",
          label: "Go to Line…",
          icon: Navigation,
          hint: "⌃G",
          onSelect: () => runMonacoAction(getEditor, "editor.action.gotoLine"),
        },
        {
          kind: "item",
          id: "toggle-word-wrap",
          label: "Toggle Word Wrap",
          icon: WrapText,
          hint: "⌥Z",
          onSelect: () =>
            runMonacoAction(getEditor, "editor.action.toggleWordWrap"),
        },
        { kind: "separator", id: "editor-ops-sep-2" },
        {
          kind: "item",
          id: "command-palette",
          label: "Command Palette…",
          icon: Command,
          hint: "F1",
          onSelect: () =>
            runMonacoAction(getEditor, "editor.action.quickCommand"),
        },
      ],
    },
  ];
}
