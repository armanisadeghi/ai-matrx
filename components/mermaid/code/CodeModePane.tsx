"use client";

/**
 * CODE mode — raw mermaid source for advanced users: CodeMirror editor with a
 * lint gutter fed by the renderer's diagnostics, live preview (last-good kept
 * while invalid), split on desktop / stacked on mobile. Saving invalid source
 * is allowed (it's the user's text) — the warning badge stays honest.
 */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";

import { useIsMobile } from "@/hooks/use-mobile";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { cn } from "@/lib/utils";

import { MermaidRenderer } from "../MermaidRenderer";
import type { LadderResult } from "../sanitize";
import type { MermaidEditorAction } from "../workbench/useMermaidEditor";
import type { MermaidRenderOptions } from "../types";

const COMMIT_DEBOUNCE_MS = 400;

interface CodeModePaneProps {
  source: string;
  options: MermaidRenderOptions;
  dispatch: React.Dispatch<MermaidEditorAction>;
}

export function CodeModePane({ source, options, dispatch }: CodeModePaneProps) {
  const isMobile = useIsMobile();
  const isDark = useThemeMode() === "dark";
  const [draft, setDraft] = useState(source);
  const [ladder, setLadder] = useState<LadderResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold the not-yet-committed value + a live dispatch so the unmount cleanup
  // can flush it — closing the workbench within the debounce window must never
  // silently drop the last keystrokes.
  const pendingValueRef = useRef<string | null>(null);
  const dispatchRef = useRef(dispatch);
  useEffect(() => {
    dispatchRef.current = dispatch;
  });

  // External source changes (undo, ops from other modes, AI apply) win over the
  // local draft. React's render-phase state-adjustment pattern (not an effect)
  // so we never stomp mid-typing edits with a cascading-render effect — when the
  // user's own debounced edit commits, `source` already equals `draft`, so the
  // setDraft below is a no-op.
  const [syncedSource, setSyncedSource] = useState(source);
  if (source !== syncedSource) {
    setSyncedSource(source);
    setDraft(source);
  }

  const handleChange = (value: string) => {
    setDraft(value);
    pendingValueRef.current = value;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      pendingValueRef.current = null;
      dispatch({ type: "SET_SOURCE", source: value });
    }, COMMIT_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      // Flush a pending edit so an unmount mid-debounce doesn't lose it.
      if (pendingValueRef.current != null) {
        dispatchRef.current({ type: "SET_SOURCE", source: pendingValueRef.current });
      }
    };
  }, []);

  const isInvalid = ladder ? !ladder.valid : false;

  const mermaidLinter = linter((view) => {
    if (!ladder || ladder.valid || !ladder.error) return [];
    const text = view.state.doc;
    const lineMatch = /line (\d+)/i.exec(ladder.error);
    const lineNo = lineMatch ? Math.min(Number(lineMatch[1]), text.lines) : 1;
    const line = text.line(Math.max(1, lineNo));
    const diagnostic: CmDiagnostic = {
      from: line.from,
      to: line.to,
      severity: "error",
      message: humanizeMermaidError(ladder.error),
    };
    return [diagnostic];
  });

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col">
      <CodeMirror
        value={draft}
        onChange={handleChange}
        height="100%"
        style={{ flex: 1, minHeight: 0, fontSize: 13 }}
        theme={isDark ? "dark" : "light"}
        extensions={[lintGutter(), mermaidLinter, EditorView.lineWrapping]}
        basicSetup={{ foldGutter: false, highlightActiveLine: true }}
        className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-editor]:bg-card [&_.cm-scroller]:font-mono"
        aria-label="Mermaid source"
      />
      {isInvalid && ladder?.error && (
        <div className="flex items-start gap-1.5 border-t border-border bg-destructive/5 px-3 py-1.5">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-xs text-muted-foreground">{humanizeMermaidError(ladder.error)}</p>
        </div>
      )}
    </div>
  );

  const preview = (
    <div className="min-h-0 flex-1 overflow-auto bg-textured">
      <MermaidRenderer
        source={draft}
        options={options}
        isStreamActive={false}
        onLadderResult={setLadder}
      />
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {editor}
        <button
          type="button"
          className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          Preview
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", previewOpen && "rotate-180")} />
        </button>
        {previewOpen && <div className="max-h-[40dvh] min-h-32 overflow-auto border-t border-border">{preview}</div>}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-2">
      <div className="min-h-0 border-r border-border">{editor}</div>
      {preview}
    </div>
  );
}

/** Translate mermaid's parser-speak into something a human can act on. */
function humanizeMermaidError(error: string): string {
  const firstLine = error.split("\n")[0];
  return firstLine
    .replace(/^Parse error on line (\d+):?/i, "Line $1 has a syntax problem:")
    .replace(/Expecting .*got\s*'([^']*)'/i, 'unexpected "$1"')
    .slice(0, 200);
}
