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
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { TrailingNode } from "@tiptap/extensions";
import { createRichEditorExtensions } from "../core/extensions";
import { fenceFromParagraph, insertInlineIsland, insertVariable, TASK_OPEN } from "../core/commands";
import { RICH_EDITOR_SHORTCUTS, TYPED_TRIGGERS } from "../core/shortcuts";
import { SHORTCUT_HANDLERS, type RichShellActions } from "./shortcut-handlers";
import { toVariableName } from "../core/variables";
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
  const base = createRichEditorExtensions({ placeholder: options.placeholder }).map((extension) => {
    switch (extension.name) {
      case "islandBlock":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(IslandBlockView) });
      case "sourceLocked":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(SourceLockedView) });
      case "inlineIsland":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(InlineIslandView) });
      case "blockquote":
        return extension.extend({ addNodeView: () => ReactNodeViewRenderer(CalloutView) });
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
      bindings.Enter = () => {
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

  const slash = Extension.create({
    name: "richEditorSlash",
    addProseMirrorPlugins() {
      const host: SlashHost = { pickKind: shell.pickKind, pickImage: shell.pickImage };
      return [
        Suggestion<MenuItem, MenuItem>({
          pluginKey: slashKey,
          editor: this.editor,
          char: "/",
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
          render: suggestionRenderer({ emptyText: "Nothing matches — keep typing or press Escape.", label: "Insert" }),
        }),
      ];
    },
  });

  const variables = Extension.create({
    name: "richEditorVariables",
    addProseMirrorPlugins() {
      return [
        Suggestion<MenuItem, MenuItem>({
          pluginKey: variableKey,
          editor: this.editor,
          char: "{{",
          allowedPrefixes: null,
          items: ({ query }) => {
            const declared = shell.variables() ?? [];
            const q = query.replace(/\}+$/, "").trim().toLowerCase();
            const matches: MenuItem[] = declared
              .filter((variable) => !q || variable.name.toLowerCase().includes(q))
              .map((variable) => ({
                id: `var:${variable.name}`,
                title: variable.name,
                description: variable.description,
                hint: variable.type,
                group: "Declared variables",
              }));
            const name = toVariableName(query.replace(/\}+$/, ""));
            if (name && !declared.some((variable) => variable.name === name)) {
              matches.push({ id: `new:${name}`, title: `Add “${name}”`, description: "A new variable", group: "New" });
            }
            return matches;
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
  return [
    ...base,
    keymap,
    slash,
    variables,
    imagePaste,
    protectSelectedIslands,
    TrailingNode.configure({ node: "paragraph" }),
    RichDecorations,
  ];
}
