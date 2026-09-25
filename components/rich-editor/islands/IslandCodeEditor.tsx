"use client";

// components/rich-editor/islands/IslandCodeEditor.tsx
//
// An island's OWN editor: a small CodeMirror 6 view over the island's exact
// bytes. Every keystroke hands the new raw text up (the host writes it into the
// island through the one explicit island edit); nothing here parses or
// normalizes. Escape or ⌘/Ctrl+Enter hands focus back to the document.

import { useEffect, useEffectEvent, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { cn } from "@/lib/utils";
import { monoTheme, richEditorTheme, richHighlight } from "../source/cm-theme";
import type { IslandEditorLanguage } from "./island-meta";

export interface IslandCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: IslandEditorLanguage;
  /** Leave the island editor (Escape, ⌘/Ctrl+Enter). */
  onExit?: () => void;
  autoFocus?: boolean;
  ariaLabel: string;
  className?: string;
}

export function IslandCodeEditor({
  value,
  onChange,
  language,
  onExit,
  autoFocus,
  ariaLabel,
  className,
}: IslandCodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const emitChange = useEffectEvent((next: string) => onChange(next));
  const emitExit = useEffectEvent((): boolean => {
    onExit?.();
    return Boolean(onExit);
  });
  const initialValue = useEffectEvent(() => value);

  useEffect(() => {
    if (!host.current) return;
    const exit = () => emitExit();
    const instance = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue(),
        extensions: [
          history(),
          keymap.of([
            { key: "Escape", run: exit },
            { key: "Mod-Enter", run: exit },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          language === "json" ? json() : markdown(),
          richHighlight,
          richEditorTheme,
          monoTheme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) emitChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = instance;
    if (autoFocus) instance.focus();
    return () => {
      instance.destroy();
      view.current = null;
    };
  }, [language, autoFocus, ariaLabel]);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current !== value) {
      instance.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      ref={host}
      className={cn("rounded-md border border-border bg-background/60 text-sm", className)}
      onKeyDown={(event) => event.stopPropagation()}
    />
  );
}
