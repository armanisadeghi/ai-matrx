// components/rich-editor/visual/decorations.ts
//
// Everything the visual editor DRAWS without touching the document:
//   · heading ids (github-slugger — the renderer's anchors) for the outline and
//     "copy link to heading"
//   · GFM task boxes (a real checkbox widget; ticking flips only `[ ]`/`[x]`)
//   · footnote references `[^n]` as superscript chips, definitions styled
//   · find & replace matches (fed through plugin meta by the find panel)
// Decorations never enter the stored bytes; they are recomputed from the doc.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { headingPlainText, slugsFor } from "../core/outline";
import { TASK_DONE, TASK_OPEN } from "../core/commands";

export interface FindHighlight {
  from: number;
  to: number;
  current: boolean;
}

export const findHighlightKey = new PluginKey<FindHighlight[]>("richEditorFind");
const decorationsKey = new PluginKey<DecorationSet>("richEditorDecorations");

function taskCheckbox(checked: boolean, pos: number): HTMLElement {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.className = "rich-editor-task-box";
  box.setAttribute("aria-label", checked ? "Mark as not done" : "Mark as done");
  box.dataset.itemPos = String(pos);
  box.contentEditable = "false";
  return box;
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  const headings: Array<{ pos: number; size: number; text: string }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({ pos, size: node.nodeSize, text: headingPlainText(node.textContent) });
      return false;
    }
    if (node.type.name === "listItem" && typeof node.attrs.mdTask === "string") {
      const checked = /\[[xX]\]/.test(node.attrs.mdTask);
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: `rich-editor-task-item${checked ? " is-checked" : ""}`,
        }),
        Decoration.widget(pos + 1, () => taskCheckbox(checked, pos), {
          side: -1,
          key: `task-${pos}-${checked}`,
          ignoreSelection: true,
        }),
      );
    }
    if (node.isText && node.text && node.text.includes("[^")) {
      for (const match of node.text.matchAll(/\[\^[^\]\s]+\](:)?/g)) {
        const from = pos + (match.index ?? 0);
        decorations.push(
          Decoration.inline(from, from + match[0].length, {
            class: match[1] ? "rich-editor-footnote-def" : "rich-editor-footnote-ref",
          }),
        );
      }
    }
    return true;
  });
  const slugs = slugsFor(headings.map((heading) => heading.text));
  headings.forEach((heading, index) => {
    decorations.push(
      Decoration.node(heading.pos, heading.pos + heading.size, {
        id: slugs[index] ?? "",
        "data-heading-slug": slugs[index] ?? "",
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

function findDecorations(state: EditorState): DecorationSet {
  const highlights = findHighlightKey.getState(state) ?? [];
  if (!highlights.length) return DecorationSet.empty;
  return DecorationSet.create(
    state.doc,
    highlights
      .filter((highlight) => highlight.to <= state.doc.content.size)
      .map((highlight) =>
        Decoration.inline(highlight.from, highlight.to, {
          class: highlight.current ? "rich-editor-find-current" : "rich-editor-find-match",
        }),
      ),
  );
}

export const RichDecorations = Extension.create({
  name: "richDecorations",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<DecorationSet>({
        key: decorationsKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? buildDecorations(tr.doc) : previous),
        },
        props: {
          decorations: (state) => decorationsKey.getState(state),
          handleDOMEvents: {
            mousedown: (_view, event) => {
              const target = event.target as HTMLElement | null;
              if (target?.classList.contains("rich-editor-task-box")) {
                event.preventDefault();
                const pos = Number(target.dataset.itemPos);
                const item = editor.state.doc.nodeAt(pos);
                if (item?.type.name === "listItem" && editor.isEditable) {
                  const checked = /\[[xX]\]/.test(String(item.attrs.mdTask));
                  editor.commands.command(({ tr }) => {
                    tr.setNodeMarkup(pos, undefined, { ...item.attrs, mdTask: checked ? TASK_OPEN : TASK_DONE });
                    return true;
                  });
                }
                return true;
              }
              return false;
            },
          },
        },
      }),
      new Plugin<FindHighlight[]>({
        key: findHighlightKey,
        state: {
          init: () => [],
          apply: (tr, previous) => {
            const next = tr.getMeta(findHighlightKey) as FindHighlight[] | undefined;
            if (next) return next;
            if (!tr.docChanged) return previous;
            return previous
              .map((highlight) => ({
                ...highlight,
                from: tr.mapping.map(highlight.from),
                to: tr.mapping.map(highlight.to),
              }))
              .filter((highlight) => highlight.to > highlight.from);
          },
        },
        props: { decorations: findDecorations },
      }),
    ];
  },
});
