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
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { createRichEditorExtensions } from "../core/extensions";
import {
  fenceFromParagraph,
  insertCodeBlock,
  insertInlineIsland,
  insertInlineMath,
  insertVariable,
  moveBlock,
  TASK_OPEN,
  toggleTaskList,
} from "../core/commands";
import { RICH_EDITOR_SHORTCUTS, TYPED_TRIGGERS } from "../core/shortcuts";
import { toVariableName, type DeclaredVariable } from "../core/variables";
import { IslandBlockView } from "./nodes/IslandBlockView";
import { SourceLockedView } from "./nodes/SourceLockedView";
import { InlineIslandView } from "./nodes/InlineIslandView";
import { CalloutView } from "./nodes/CalloutView";
import { RichDecorations } from "./decorations";
import { markAutoEdit } from "./auto-edit";
import { filterSlashItems, type SlashHost } from "./slash-items";
import { suggestionRenderer, type MenuItem } from "./menus/SuggestionMenu";

/** What the keymap and menus reach outside the document for. */
export interface RichShellActions {
  save: () => void;
  find: () => void;
  replace: () => void;
  toggleOutline: () => void;
  toggleFocus: () => void;
  cycleView: () => void;
  showHelp: () => void;
  showWordCount: () => void;
  editLink: () => void;
  pickKind: () => Promise<string | null>;
  pickImage: () => void;
  uploadImage: (file: File) => Promise<string | null>;
  variables: () => readonly DeclaredVariable[] | null;
  declareVariable: (name: string) => void;
}

type Handler = (editor: Editor, shell: RichShellActions) => boolean;

/** Every shortcut id in the table → what it does. Exported so a test proves none is unbound. */
export const SHORTCUT_HANDLERS: Record<string, Handler> = {
  bold: (e) => e.chain().focus().toggleBold().run(),
  italic: (e) => e.chain().focus().toggleItalic().run(),
  strike: (e) => e.chain().focus().toggleStrike().run(),
  code: (e) => e.chain().focus().toggleCode().run(),
  link: (_e, shell) => (shell.editLink(), true),
  paragraph: (e) => e.chain().focus().setParagraph().run(),
  heading1: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  heading2: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  heading3: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  heading4: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
  heading5: (e) => e.chain().focus().toggleHeading({ level: 5 }).run(),
  heading6: (e) => e.chain().focus().toggleHeading({ level: 6 }).run(),
  orderedList: (e) => e.chain().focus().toggleOrderedList().run(),
  bulletList: (e) => e.chain().focus().toggleBulletList().run(),
  taskList: (e) => toggleTaskList(e),
  moveUp: (e) => moveBlock(e, "up"),
  moveDown: (e) => moveBlock(e, "down"),
  codeBlock: (e) => {
    markAutoEdit(e, insertCodeBlock(e));
    return true;
  },
  inlineMath: (e) => {
    const { from, to } = e.state.selection;
    return insertInlineMath(e, from === to ? "x" : e.state.doc.textBetween(from, to));
  },
  undo: (e) => e.commands.undo(),
  redo: (e) => e.commands.redo(),
  find: (_e, shell) => (shell.find(), true),
  replace: (_e, shell) => (shell.replace(), true),
  save: (_e, shell) => (shell.save(), true),
  wordCount: (_e, shell) => (shell.showWordCount(), true),
  outline: (_e, shell) => (shell.toggleOutline(), true),
  focus: (_e, shell) => (shell.toggleFocus(), true),
  cycleView: (_e, shell) => (shell.cycleView(), true),
  help: (_e, shell) => (shell.showHelp(), true),
};

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

  return [...base, keymap, slash, variables, imagePaste, RichDecorations];
}
