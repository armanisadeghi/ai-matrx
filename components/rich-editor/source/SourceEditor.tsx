"use client";

// components/rich-editor/source/SourceEditor.tsx
//
// The SOURCE view — CodeMirror 6 live preview. The source text IS the
// document: every keystroke is a byte the person typed, nothing is ever
// re-serialized, and the live preview (live-preview.ts) only decorates.
// Primary editor for prompts, templates and skills. Shares the shortcut
// table, find & replace, the {{variable}} menu and the paste converter with
// the visual view.

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { createPortal } from "react-dom";
import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  redo,
  undo,
} from "@codemirror/commands";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { getSchema } from "@tiptap/core";
import { cn } from "@/lib/utils";
import { createRichEditorExtensions } from "../core/extensions";
import { htmlToMarkdown } from "../core/html-to-markdown";
import { findMatches, replaceMatches, type FindOptions } from "../core/find-replace";
import { continueMarkupOnEnter, makeLink, setLinePrefix, toggleWrap, type SourceEditResult } from "../core/source-format";
import { markdownSourceLanguage } from "./markdown-language";
import { RICH_EDITOR_SHORTCUTS, TYPED_TRIGGERS } from "../core/shortcuts";
import { toVariableName } from "../core/variables";
import { IslandPreview } from "../islands/IslandPreview";
import { useRichEditorContext } from "../RichEditorContext";
import type { EditorViewHandle, ViewFindState } from "../visual/VisualEditor";
import type { RichShellActions } from "../visual/visual-extensions";
import { richEditorTheme, richHighlight } from "./cm-theme";
import {
  IslandPortalRegistry,
  livePreviewExtensions,
  setFindHighlights,
  setIslandRendering,
} from "./live-preview";

const PASTE_SCHEMA = getSchema(createRichEditorExtensions());

export interface SourceEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  shell: RichShellActions;
  placeholder?: string;
  focusMode: boolean;
  renderIslands: boolean;
  handleRef: Ref<EditorViewHandle>;
}

type SourceVerb = (view: EditorView) => boolean;

function applyResult(view: EditorView, result: SourceEditResult): boolean {
  view.dispatch({
    changes: result.changes,
    selection: EditorSelection.single(result.anchor, result.head),
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

function wrap(marker: string): SourceVerb {
  return (view) => {
    const { from, to } = view.state.selection.main;
    return applyResult(view, toggleWrap(view.state.doc.toString(), from, to, marker));
  };
}

function prefix(value: string | null): SourceVerb {
  return (view) => {
    const { from, to } = view.state.selection.main;
    return applyResult(view, setLinePrefix(view.state.doc.toString(), from, to, value));
  };
}

export function SourceEditor({
  initialText,
  onChange,
  shell,
  placeholder,
  focusMode,
  renderIslands,
  handleRef,
}: SourceEditorProps) {
  const context = useRichEditorContext();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [registry] = useState(() => new IslandPortalRegistry());
  const portals = useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const findState = useRef<{ matches: Array<{ start: number; end: number }>; index: number }>({ matches: [], index: -1 });

  const emitChange = useEffectEvent((text: string) => onChange(text));
  const getShell = useEffectEvent(() => shell);
  const getVariables = useEffectEvent(() => context.variables);
  const initial = useEffectEvent(() => initialText);

  useEffect(() => {
    if (!host.current) return;
    const verbs: Record<string, SourceVerb> = {
      bold: wrap("**"),
      italic: wrap("*"),
      strike: wrap("~~"),
      code: wrap("`"),
      link: (v) => {
        const { from, to } = v.state.selection.main;
        return applyResult(v, makeLink(v.state.doc.toString(), from, to));
      },
      paragraph: prefix(null),
      heading1: prefix("# "),
      heading2: prefix("## "),
      heading3: prefix("### "),
      heading4: prefix("#### "),
      heading5: prefix("##### "),
      heading6: prefix("###### "),
      orderedList: prefix("1. "),
      bulletList: prefix("- "),
      taskList: prefix("- [ ] "),
      moveUp: moveLineUp,
      moveDown: moveLineDown,
      codeBlock: (v) => {
        const { from, to } = v.state.selection.main;
        const selected = v.state.sliceDoc(from, to);
        const insert = `\`\`\`\n${selected}\n\`\`\``;
        v.dispatch({ changes: { from, to, insert }, selection: { anchor: from + 3 } });
        return true;
      },
      inlineMath: wrap("$"),
      undo,
      redo,
      find: () => (getShell().find(), true),
      replace: () => (getShell().replace(), true),
      save: () => (getShell().save(), true),
      wordCount: () => (getShell().showWordCount(), true),
      outline: () => (getShell().toggleOutline(), true),
      focus: () => (getShell().toggleFocus(), true),
      cycleView: () => (getShell().cycleView(), true),
      help: () => (getShell().showHelp(), true),
    };
    const bindings = RICH_EDITOR_SHORTCUTS.flatMap((spec) =>
      spec.keys
        .filter((key) => !TYPED_TRIGGERS.has(key) && verbs[spec.id])
        .map((key) => ({ key, run: verbs[spec.id] as SourceVerb, preventDefault: true })),
    );

    const variableCompletion = (completion: CompletionContext): CompletionResult | null => {
      const match = completion.matchBefore(/\{\{[^{}\n]*/);
      if (!match) return null;
      const declared = getVariables() ?? [];
      const typed = match.text.slice(2);
      const options = declared.map((variable) => ({
        label: `{{${variable.name}}}`,
        detail: variable.type,
        info: variable.description,
        apply: `{{${variable.name}}}`,
      }));
      const fresh = toVariableName(typed);
      if (fresh && !declared.some((variable) => variable.name === fresh)) {
        options.push({ label: `{{${fresh}}}`, detail: "new variable", info: undefined, apply: `{{${fresh}}}` });
      }
      return { from: match.from, options, validFor: /^\{\{[^{}\n]*$/ };
    };

    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial(),
        extensions: [
          history(),
          Prec.high(keymap.of(bindings)),
          keymap.of([
            {
              key: "Enter",
              run: (v) => {
                const { from, to } = v.state.selection.main;
                if (from !== to) return false;
                const result = continueMarkupOnEnter(v.state.doc.toString(), from);
                return result ? applyResult(v, result) : false;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          markdownSourceLanguage,
          richHighlight,
          richEditorTheme,
          EditorView.lineWrapping,
          cmPlaceholder(placeholder ?? "Write…"),
          EditorView.editable.of(!context.readOnly),
          EditorView.contentAttributes.of({ "aria-label": "Document source", spellcheck: "true" }),
          autocompletion({ override: [variableCompletion], activateOnTyping: true }),
          livePreviewExtensions({ registry, getVariables: () => getVariables() }),
          EditorView.domEventHandlers({
            paste: (event, v) => {
              const html = event.clipboardData?.getData("text/html");
              const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
              if (images.length) {
                event.preventDefault();
                for (const image of images) {
                  void getShell().uploadImage(image).then((markdownImage) => {
                    if (!markdownImage) return;
                    const { from, to } = v.state.selection.main;
                    v.dispatch({ changes: { from, to, insert: markdownImage } });
                  });
                }
                return true;
              }
              if (!html || !html.trim()) return false;
              event.preventDefault();
              const converted = htmlToMarkdown(html, PASTE_SCHEMA);
              const { from, to } = v.state.selection.main;
              v.dispatch({
                changes: { from, to, insert: converted },
                selection: { anchor: from + converted.length },
                userEvent: "input.paste",
              });
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) emitChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
  }, [registry, context.readOnly, placeholder]);

  useEffect(() => {
    view.current?.dispatch({ effects: setIslandRendering.of(renderIslands) });
  }, [renderIslands]);

  const highlight = (current: number) => {
    view.current?.dispatch({
      effects: setFindHighlights.of(
        findState.current.matches.map((match, index) => ({ from: match.start, to: match.end, current: index === current })),
      ),
    });
  };

  useImperativeHandle(handleRef, (): EditorViewHandle => ({
    focus: () => view.current?.focus(),
    selectedText: () => {
      const v = view.current;
      if (!v) return "";
      const { from, to } = v.state.selection.main;
      return v.state.sliceDoc(from, to);
    },
    replaceSelection: (text) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from, head: from + text.length } });
    },
    insertText: (text, where) => {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      const at = where === "before" ? from : to;
      const insert = where === "before" ? `${text}\n\n` : `\n\n${text}`;
      v.dispatch({ changes: { from: at, insert } });
    },
    flush: () => view.current?.state.doc.toString() ?? initialText,
    scrollToHeading: (_slug, offset) => {
      const v = view.current;
      if (!v) return;
      v.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: "start" }) });
      v.focus();
    },
    find: (query, options: FindOptions, step): ViewFindState => {
      const v = view.current;
      if (!v) return { count: 0, current: -1, skippedProtected: 0, error: null };
      const result = findMatches(v.state.doc.toString(), query, options);
      const cursor = v.state.selection.main.from;
      let index = result.matches.findIndex((match) => match.start >= cursor);
      if (index === -1) index = result.matches.length ? 0 : -1;
      const previous = findState.current;
      if (step && previous.index >= 0 && result.matches.length) {
        index = (previous.index + step + result.matches.length) % result.matches.length;
      }
      findState.current = { matches: result.matches, index };
      highlight(index);
      const match = result.matches[index];
      if (match && step) {
        v.dispatch({ selection: { anchor: match.start, head: match.end }, scrollIntoView: true });
      }
      return { count: result.matches.length, current: index, skippedProtected: result.skippedProtected, error: result.error };
    },
    replaceCurrent: (query, replacement, options) => {
      const v = view.current;
      const match = findState.current.matches[findState.current.index];
      if (!v || !match) return [];
      const text = v.state.doc.toString();
      const found = findMatches(text, query, options).matches.find((candidate) => candidate.start === match.start);
      if (!found) return [];
      const next = replaceMatches(text, [found], query, replacement, options);
      const insert = next.slice(found.start, next.length - (text.length - found.end));
      v.dispatch({ changes: { from: found.start, to: found.end, insert } });
      return found.islandRaw ? [found.islandRaw] : [];
    },
    replaceAll: (query, replacement, options) => {
      const v = view.current;
      if (!v) return [];
      const text = v.state.doc.toString();
      const { matches } = findMatches(text, query, options);
      const changes = matches.map((match) => {
        const next = replaceMatches(text, [match], query, replacement, options);
        return { from: match.start, to: match.end, insert: next.slice(match.start, next.length - (text.length - match.end)) };
      });
      v.dispatch({ changes });
      return matches.flatMap((match) => (match.islandRaw ? [match.islandRaw] : []));
    },
    clearFind: () => {
      findState.current = { matches: [], index: -1 };
      highlight(-1);
    },
    editLink: (href) => {
      const v = view.current;
      if (!v || !href) return;
      const { from, to } = v.state.selection.main;
      applyResult(v, makeLink(v.state.doc.toString(), from, to, href));
    },
    currentLink: () => null,
  }));

  return (
    <div className={cn("rich-editor-source relative h-full overflow-y-auto", focusMode && "rich-editor-focus")}>
      <div ref={host} className="mx-auto min-h-full max-w-3xl pb-[40dvh]" data-testid="rich-editor-source" />
      {portals.map((portal, index) =>
        createPortal(
          <div className="cm-rich-island-body pointer-events-none">
            <IslandPreview raw={portal.raw} islandType={portal.islandType} />
          </div>,
          portal.element,
          `island-${index}`,
        ),
      )}
    </div>
  );
}
