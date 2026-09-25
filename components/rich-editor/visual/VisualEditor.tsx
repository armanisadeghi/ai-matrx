"use client";

// components/rich-editor/visual/VisualEditor.tsx
//
// The visual (Tiptap 3) view. It loads the text ONCE per mount into the
// visual document, captures the editor's own loaded document as the baseline,
// and reports the text back through serializeVisualDocument — unchanged
// blocks as their stored bytes, only edited blocks re-written. The host
// remounts it (new key) when the text changed outside it (the source view, an
// AI action, dictation), so its baseline is always the text it was given.

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { getSchema, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { cn } from "@/lib/utils";
import { createRichEditorExtensions } from "../core/extensions";
import {
  buildVisualDocument,
  captureBaseline,
  serializeVisualDocument,
  type VisualBaseline,
  type VisualLoadStats,
} from "../core/visual-document";
import { findInDoc, replaceInDoc, type VisualMatch } from "../core/visual-find";
import type { FindOptions } from "../core/find-replace";
import { createVisualExtensions, type RichShellActions } from "./visual-extensions";
import { findHighlightKey } from "./decorations";
import { BlockHandle } from "./BlockHandle";
import { SelectionToolbar } from "./SelectionToolbar";
import { useRichEditorContext } from "../RichEditorContext";

const HEADLESS_SCHEMA = getSchema(createRichEditorExtensions());
const REPORT_DELAY_MS = 120;

export interface ViewFindState {
  count: number;
  current: number;
  skippedProtected: number;
  error: string | null;
}

/** What the shell drives in whichever view is showing. */
export interface EditorViewHandle {
  focus: () => void;
  selectedText: () => string;
  /** Replace the selection with literal text (markdown typed by an AI stays markdown). */
  replaceSelection: (text: string) => void;
  insertText: (text: string, where: "before" | "after") => void;
  /** Flush pending text now (before a save or a view switch). */
  flush: () => string;
  scrollToHeading: (slug: string, offset: number) => void;
  find: (query: string, options: FindOptions, step?: 1 | -1) => ViewFindState;
  replaceCurrent: (query: string, replacement: string, options: FindOptions) => string[];
  replaceAll: (query: string, replacement: string, options: FindOptions) => string[];
  clearFind: () => void;
  editLink: (href: string | null) => void;
  currentLink: () => string | null;
}

export interface VisualEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  onLoadStats?: (stats: VisualLoadStats) => void;
  shell: RichShellActions;
  placeholder?: string;
  focusMode: boolean;
  handleRef: Ref<EditorViewHandle>;
}

export function VisualEditor({
  initialText,
  onChange,
  onLoadStats,
  shell,
  placeholder,
  focusMode,
  handleRef,
}: VisualEditorProps) {
  const context = useRichEditorContext();
  const container = useRef<HTMLDivElement>(null);
  const [load] = useState(() => buildVisualDocument(initialText, HEADLESS_SCHEMA));
  const baseline = useRef<VisualBaseline | null>(null);
  const timer = useRef<number | null>(null);
  const lastReported = useRef(initialText);
  const findState = useRef<{ matches: VisualMatch[]; index: number }>({ matches: [], index: -1 });

  const report = (editor: Editor): string => {
    if (!baseline.current) return lastReported.current;
    const text = serializeVisualDocument(editor.state.doc, baseline.current);
    if (text !== lastReported.current) {
      lastReported.current = text;
      onChange(text);
    }
    return text;
  };

  const [extensions] = useState(() => createVisualExtensions({ placeholder, shell }));
  const editor = useEditor({
    extensions,
    content: load.json,
    immediatelyRender: false,
    editable: !context.readOnly,
    editorProps: {
      attributes: {
        class: cn(
          "rich-editor-prose prose prose-sm sm:prose-base dark:prose-invert max-w-none min-h-[60dvh] px-8 py-6 outline-none sm:px-12",
        ),
        spellcheck: "true",
        "aria-label": "Document",
      },
    },
    onCreate: ({ editor: created }) => {
      baseline.current = captureBaseline(created.state.doc, load.plan);
      onLoadStats?.(load.plan.stats);
    },
    onUpdate: ({ editor: updated }) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        report(updated);
      }, REPORT_DELAY_MS);
    },
  });

  useEffect(() => {
    editor?.setEditable(!context.readOnly);
  }, [editor, context.readOnly]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const setHighlights = (current: number) => {
    if (!editor) return;
    const { matches } = findState.current;
    editor.view.dispatch(
      editor.state.tr.setMeta(
        findHighlightKey,
        matches.map((match, index) => ({ from: match.from, to: match.to, current: index === current })),
      ),
    );
  };

  useImperativeHandle(handleRef, (): EditorViewHandle => ({
    focus: () => editor?.commands.focus(),
    selectedText: () => {
      if (!editor) return "";
      const { from, to } = editor.state.selection;
      return editor.state.doc.textBetween(from, to, "\n");
    },
    replaceSelection: (text) => {
      if (!editor) return;
      editor.chain().focus().command(({ tr }) => {
        const paragraphs = text.split(/\n{2,}/);
        if (paragraphs.length <= 1) {
          tr.insertText(text, tr.selection.from, tr.selection.to);
          return true;
        }
        tr.insertText(paragraphs[0] ?? "", tr.selection.from, tr.selection.to);
        for (const paragraph of paragraphs.slice(1)) {
          tr.split(tr.selection.from);
          tr.insertText(paragraph, tr.selection.from);
        }
        return true;
      }).run();
    },
    insertText: (text, where) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      editor.commands.setTextSelection(where === "before" ? from : to);
      editor.commands.command(({ tr }) => {
        const at = tr.selection.from;
        tr.split(at);
        tr.insertText(text, tr.selection.from);
        return true;
      });
    },
    flush: () => {
      if (!editor) return lastReported.current;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      return report(editor);
    },
    scrollToHeading: (slug) => {
      const element = container.current?.querySelector(`[data-heading-slug="${CSS.escape(slug)}"]`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (editor && element) {
        const pos = editor.view.posAtDOM(element, 0);
        editor.chain().setTextSelection(pos).focus(undefined, { scrollIntoView: false }).run();
      }
    },
    find: (query, options, step) => {
      if (!editor) return { count: 0, current: -1, skippedProtected: 0, error: null };
      const result = findInDoc(editor.state.doc, query, options);
      const previous = findState.current;
      const cursor = editor.state.selection.from;
      let index = result.matches.findIndex((match) => match.from >= cursor);
      if (index === -1) index = result.matches.length ? 0 : -1;
      if (step && previous.index >= 0 && result.matches.length) {
        index = (previous.index + step + result.matches.length) % result.matches.length;
      }
      findState.current = { matches: result.matches, index };
      setHighlights(index);
      const match = result.matches[index];
      if (match && step) {
        editor.view.dispatch(
          editor.state.tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to)).scrollIntoView(),
        );
      }
      return { count: result.matches.length, current: index, skippedProtected: result.skippedProtected, error: result.error };
    },
    replaceCurrent: (query, replacement, options) => {
      if (!editor) return [];
      const match = findState.current.matches[findState.current.index];
      if (!match) return [];
      let changed: string[] = [];
      editor.commands.command(({ tr }) => {
        changed = replaceInDoc(tr, [match], query, replacement, options);
        return true;
      });
      return changed;
    },
    replaceAll: (query, replacement, options) => {
      if (!editor) return [];
      const { matches } = findInDoc(editor.state.doc, query, options);
      let changed: string[] = [];
      editor.commands.command(({ tr }) => {
        changed = replaceInDoc(tr, matches, query, replacement, options);
        return true;
      });
      return changed;
    },
    clearFind: () => {
      findState.current = { matches: [], index: -1 };
      setHighlights(-1);
    },
    editLink: (href) => {
      if (!editor) return;
      if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      else editor.chain().focus().extendMarkRange("link").unsetLink().run();
    },
    currentLink: () => (editor?.getAttributes("link").href as string | undefined) ?? null,
  }));

  return (
    <div
      ref={container}
      className={cn("rich-editor-visual relative h-full overflow-y-auto", focusMode && "rich-editor-focus")}
      data-testid="rich-editor-visual"
    >
      <BlockHandle editor={editor} container={container} />
      <EditorContent editor={editor} className="mx-auto max-w-3xl pb-[40dvh]" />
      {editor && (
        <SelectionToolbar
          editor={editor}
          onEditLink={shell.editLink}
          offerVariables={context.variables !== null}
        />
      )}
    </div>
  );
}
