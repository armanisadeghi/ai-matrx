// components/rich-editor/visual/visual-extensions.ts
//
// The browser editor's extension list = the headless schema
// (core/extensions.ts) + node views, the "/" and "{{" menus, the keyboard
// shortcut table, Enter behaviours (``` → code block, checklist continuation),
// image paste/drop upload, and the decorations. The schema is identical to
// the headless one — only views and behaviour are added.

import { Extension, type Editor, type Extensions } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { toast } from "@/lib/toast";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { TrailingNode } from "@tiptap/extensions";
import { createRichEditorExtensions } from "../core/extensions";
import { islandsReleasedByHistory } from "../core/history-approval";
import { fenceFromParagraph, insertInlineIsland, insertVariable, TASK_OPEN } from "../core/commands";
import { RICH_EDITOR_SHORTCUTS, TYPED_TRIGGERS } from "../core/shortcuts";
import { SHORTCUT_HANDLERS, type RichShellActions } from "./shortcut-handlers";
import { variableName, variableSuggestions } from "../core/variables";
import { IslandBlockView } from "./nodes/IslandBlockView";
import { SourceLockedView } from "./nodes/SourceLockedView";
import { InlineIslandView } from "./nodes/InlineIslandView";
import { CalloutView } from "./nodes/CalloutView";
import { RichDecorations } from "./decorations";
import { markAutoEdit } from "./auto-edit";
import { filterSlashItems, type SlashHost } from "./slash-items";
import { suggestionRenderer, type MenuItem } from "./menus/SuggestionMenu";

export type { RichShellActions } from "./shortcut-handlers";

const slashKey = new PluginKey("richEditorSlash");
const variableKey = new PluginKey("richEditorVariable");

/**
 * A node view's own controls (the pencil, copy, delete, pickers) and its
 * embedded editors are not document content: ProseMirror must not treat a
 * click on them as a click on the node. It used to — the first pencil click
 * after load made ProseMirror select the leaf on mouseup against a document
 * the click had just changed, and threw `RangeError: Selection passed to
 * setSelection must point at the current document` (verify-RC-B4 R3-3).
 */
function stopControlEvents({ event }: { event: Event }): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, input, textarea, select, [role='button'], .cm-editor, [data-node-controls]"));
}

/** True while the `/` or `{{` menu is open. */
export function suggestionOpen(state: EditorState): boolean {
  const active = (key: PluginKey) => (key.getState(state) as { active?: boolean } | undefined)?.active === true;
  return active(slashKey) || active(variableKey);
}

function listItemDepth(editor: Editor): number {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "listItem") return depth;
  }
  return -1;
}

export function createVisualExtensions(options: {
  placeholder?: string;
  shell: RichShellActions;
}): Extensions {
  const { shell } = options;
  const base = createRichEditorExtensions({
    placeholder: options.placeholder,
    onPasteNotice: (message) => toast.info(message),
  }).map((extension) => {
    switch (extension.name) {
      case "islandBlock":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(IslandBlockView, { stopEvent: stopControlEvents }) });
      case "sourceLocked":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(SourceLockedView, { stopEvent: stopControlEvents }) });
      case "inlineIsland":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(InlineIslandView, { stopEvent: stopControlEvents }) });
      case "blockquote":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView, { stopEvent: stopControlEvents }) });
      default:
        return extension;
    }
  });

  const keymap = Extension.create({
    name: "richEditorKeymap",
    priority: 1000,
    addKeyboardShortcuts() {
      const bindings: Record<string, () => boolean> = {};
      for (const spec of RICH_EDITOR_SHORTCUTS) {
        const handler = SHORTCUT_HANDLERS[spec.id];
        if (!handler) continue;
        for (const key of spec.keys) {
          if (TYPED_TRIGGERS.has(key)) continue;
          bindings[key] = () => handler(this.editor, shell);
        }
      }
      // Escape leaves focus mode. ProseMirror swallows every Escape (preventDefault),
      // so the shell cannot hear it; the open menus (priority above) still get it first.
      bindings.Escape = () => shell.exitFocus();
      bindings.Enter = () => {
        // An open `/` or `{{` menu owns Enter (it picks the highlighted row) —
        // in a list item too, where the list's own Enter would split the item.
        if (suggestionOpen(this.editor.state)) return false;
        if (fenceFromParagraph(this.editor)) {
          const { from } = this.editor.state.selection;
          markAutoEdit(this.editor, from);
          return true;
        }
        const depth = listItemDepth(this.editor);
        if (depth === -1) return false;
        const item = this.editor.state.selection.$from.node(depth);
        if (typeof item.attrs.mdTask !== "string") return false;
        if (item.textContent.length === 0) return false;
        if (!this.editor.commands.splitListItem("listItem")) return false;
        this.editor.commands.updateAttributes("listItem", { mdTask: TASK_OPEN });
        return true;
      };
      return bindings;
    },
  });

  // The menus outrank every keymap (this editor's 1000 and the list's Enter),
  // so their Enter/arrow handling runs first while they are open.
  const slash = Extension.create({
    name: "richEditorSlash",
    priority: 1100,
    addProseMirrorPlugins() {
      const host: SlashHost = { pickKind: shell.pickKind, pickImage: shell.pickImage };
      return [
        Suggestion<MenuItem, MenuItem>({
          pluginKey: slashKey,
          editor: this.editor,
          char: "/",
          // "/code block" keeps filtering past the space, like Notion.
          allowSpaces: true,
          items: ({ query }) =>
            filterSlashItems(query).map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
              group: item.group,
              icon: item.icon,
            })),
          command: ({ editor, range, props }) => {
            const item = filterSlashItems("").find((candidate) => candidate.id === props.id);
            editor.chain().focus().deleteRange(range).run();
            item?.run(editor, host);
          },
          // With spaces allowed, "/ then prose" that matches nothing must not eat Enter.
          render: suggestionRenderer({ emptyText: "Nothing matches — keep typing or press Escape.", label: "Insert", holdEnterWhenEmpty: false }),
        }),
      ];
    },
  });

  const variables = Extension.create({
    name: "richEditorVariables",
    priority: 1100,
    addProseMirrorPlugins() {
      return [
        Suggestion<MenuItem, MenuItem>({
          pluginKey: variableKey,
          editor: this.editor,
          char: "{{",
          allowedPrefixes: null,
          items: ({ query, editor }) => {
            const inDocument: string[] = [];
            editor.state.doc.descendants((node) => {
              if (node.type.name !== "inlineIsland") return true;
              const name = variableName(String(node.attrs.raw ?? ""))?.trim();
              if (name && !inDocument.includes(name)) inDocument.push(name);
              return false;
            });
            return variableSuggestions(shell.variables() ?? [], inDocument, query).map((suggestion) =>
              suggestion.source === "new"
                ? { id: `new:${suggestion.name}`, title: `Add “${suggestion.name}”`, description: "A new variable", group: "New" }
                : {
                    id: `var:${suggestion.name}`,
                    title: suggestion.name,
                    description: suggestion.description,
                    hint: suggestion.type,
                    group: suggestion.source === "declared" ? "Declared variables" : "In this document",
                  },
            );
          },
          command: ({ editor, range, props }) => {
            const name = props.id.replace(/^(var|new):/, "");
            editor.chain().focus().deleteRange(range).run();
            insertVariable(editor, name);
            if (props.id.startsWith("new:")) shell.declareVariable(name);
          },
          render: suggestionRenderer({
            emptyText: "Type a name for the variable.",
            label: "Variables",
          }),
        }),
      ];
    },
  });

  const imagePaste = Extension.create({
    name: "richEditorImagePaste",
    addProseMirrorPlugins() {
      const editor = this.editor;
      const upload = (files: File[]) => {
        for (const file of files) {
          void shell.uploadImage(file).then((markdown) => {
            if (markdown) insertInlineIsland(editor, markdown, "md_image");
          });
        }
      };
      const images = (list: FileList | null | undefined) =>
        Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
      return [
        new Plugin({
          key: new PluginKey("richEditorImagePaste"),
          props: {
            handlePaste: (_view, event) => {
              const files = images(event.clipboardData?.files);
              if (!files.length) return false;
              event.preventDefault();
              upload(files);
              return true;
            },
            handleDrop: (_view, event) => {
              const files = images((event as DragEvent).dataTransfer?.files);
              if (!files.length) return false;
              event.preventDefault();
              upload(files);
              return true;
            },
          },
        }),
      ];
    },
  });

  /**
   * Typing while a protected block is SELECTED never overwrites it (a locked
   * atom is not a text target): the typed text starts a new paragraph right
   * after the block. Deleting a selected block stays a deliberate key press,
   * and the save gate still names it.
   */
  const protectSelectedIslands = Extension.create({
    name: "richEditorProtectSelectedIslands",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("richEditorProtectSelectedIslands"),
          props: {
            handleTextInput: (view, _from, _to, text) => {
              const { selection } = view.state;
              if (!(selection instanceof NodeSelection)) return false;
              const name = selection.node.type.name;
              if (name !== "islandBlock" && name !== "sourceLocked") return false;
              const paragraph = view.state.schema.nodes.paragraph;
              if (!paragraph) return false;
              const at = selection.to;
              const tr = view.state.tr.insert(at, paragraph.create(null, view.state.schema.text(text)));
              tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length));
              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
        }),
      ];
    },
  });

  // An empty trailing paragraph gives the cursor somewhere to go after a final
  // island; an empty paragraph is never written, so the stored bytes are unmoved.
  // Undo/redo is the person's own act: the island bytes it takes away are
  // approved, so reversing an island edit never asks for consent at save.
  const historyApproval = Extension.create({
    name: "richEditorHistoryApproval",
    onTransaction({ transaction }) {
      for (const raw of islandsReleasedByHistory(transaction)) shell.approveIsland(raw);
    },
  });

  return [
    ...base,
    historyApproval,
    keymap,
    slash,
    variables,
    imagePaste,
    protectSelectedIslands,
    TrailingNode.configure({ node: "paragraph" }),
    RichDecorations,
  ];
}
