// components/markdown-studio/EditorPanel.tsx
// The Markdown Studio's source pane. The editor IS the rich editor's Source
// view (CodeMirror 6 — virtualized, so a megabyte document types as fast as a
// page), never a second plain textarea: one source editor on the platform.
// Header counts and the footer block atlas read a DEFERRED copy of the text.

"use client";

import React, { useMemo } from "react";
import { Eye, Hash, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { BlockStatsCard } from "./BlockStatsCard";
import { runV2Parser } from "@/components/admin/markdown-tester/utils/run-v2-parser";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { SourceEditor } from "@/components/rich-editor/source/SourceEditor";
import type { EditorViewHandle } from "@/components/rich-editor/visual/VisualEditor";
import type { RichShellActions } from "@/components/rich-editor/visual/shortcut-handlers";
import "@/components/rich-editor/rich-editor.css";

interface EditorPanelProps {
  content: string;
  onChange: (value: string) => void;
  onScroll?: () => void;
  onClear: () => void;
  /** The source editor's handle: selection, write-back, scroll geometry. */
  editorRef: React.RefObject<EditorViewHandle | null>;
  /** ⌘S inside the editor saves the studio's sample. */
  onSave?: () => void;
  /**
   * Phones show one pane at a time: when given, the header carries a
   * "Preview" button — no tab strip row above the panes (UI audit B).
   */
  onShowPreview?: () => void;
  /**
   * A DEFERRED copy of the buffer for the counts and the block atlas — on a
   * multi-megabyte document they re-split the whole text, and that must
   * never sit between a keystroke and its paint.
   */
  statsContent?: string;
  /** The studio's surface scope — what the right-click AI actions see. */
  getScope?: () => ApplicationScope;
}

export function EditorPanel({
  content,
  onChange,
  onScroll,
  onClear,
  editorRef,
  onSave,
  onShowPreview,
  statsContent,
  getScope,
}: EditorPanelProps) {
  const counted = statsContent ?? content;
  // The rich editor's shortcut verbs that belong to its own chrome (find,
  // outline, focus, views…) have no chrome here; each says where it lives.
  const notHere = (what: string) => () =>
    toast.info(`${what} lives in the Editor view — switch with the header toggle.`);
  const shell: RichShellActions = {
    save: () => onSave?.(),
    find: notHere("Find & replace"),
    replace: notHere("Find & replace"),
    toggleOutline: notHere("The outline"),
    toggleFocus: notHere("Focus mode"),
    exitFocus: () => false,
    cycleView: notHere("Switching views"),
    showHelp: notHere("The shortcut list"),
    showWordCount: () => toast.info(`${counted.trim() ? counted.trim().split(/\s+/).length : 0} words · ${counted.length} characters`),
    editLink: notHere("Link editing"),
    pickKind: async () => null,
    pickImage: notHere("Inserting an image"),
    uploadImage: async () => {
      toast.info("Paste images in the Editor view — this pane holds text.");
      return null;
    },
    variables: () => null,
    declareVariable: () => undefined,
    approveIsland: () => undefined,
  };
  const stats = useMemo(() => {
    const lines = counted.split("\n").length;
    const chars = counted.length;
    const words = counted.trim() ? counted.trim().split(/\s+/).length : 0;
    return { lines, chars, words };
  }, [counted]);

  const detectedBlocks = useMemo(() => {
    if (!counted.trim()) return [];
    return runV2Parser(counted);
  }, [counted]);

  return (
    <div className="@container flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card/30">
      {/* Header — ONE row at every width: nothing wraps, the counts step
          down (lines only) when the pane is narrow (a phone), measured on the
          pane itself, never the screen. */}
      <div className="flex min-w-0 items-center justify-between gap-2 whitespace-nowrap border-b border-border px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium tracking-wide">Source</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] font-mono"
          >
            <Hash className="h-2.5 w-2.5 mr-0.5" />
            {stats.lines} {stats.lines === 1 ? "line" : "lines"}
          </Badge>
          <Badge
            variant="outline"
            className="hidden h-5 px-1.5 text-[10px] font-mono @sm:inline-flex"
          >
            {stats.words} {stats.words === 1 ? "word" : "words"}
          </Badge>
          <Badge
            variant="outline"
            className="hidden h-5 px-1.5 text-[10px] font-mono @sm:inline-flex"
          >
            {stats.chars} chars
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClear}
            aria-label="Clear editor"
            title="Clear editor"
            disabled={!content}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          {onShowPreview && (
            <button
              type="button"
              onClick={onShowPreview}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground lg:hidden"
              title="Show the preview"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          )}
        </div>
      </div>

      {/* Editor — right-click: content blocks and AI actions that replace,
          insert before or insert after, through THE shared editable menu. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <EditableContextMenu
          sourceFeature="documents"
          surfaceName="matrx-user/markdown-studio"
          contentSource={{ type: "raw" }}
          getApplicationScope={getScope}
          onContentInserted={() => setTimeout(() => editorRef.current?.focus(), 100)}
          insertAtCaret={(text) => {
            const editor = editorRef.current;
            if (!editor) return false;
            editor.replaceSelection(text);
            return true;
          }}
          onTextReplace={(text) => editorRef.current?.replaceSelection(text)}
          onTextInsertBefore={(text) => editorRef.current?.insertText(text, "before")}
          onTextInsertAfter={(text) => editorRef.current?.insertText(text, "after")}
        >
          {/* A host element: the menu's trigger slots its handlers onto one DOM child. */}
          <div className="h-full min-h-0 [&_.cm-editor]:min-h-full">
            <SourceEditor
              initialText={content}
              value={content}
              onChange={onChange}
              shell={shell}
              placeholder="Type or paste markdown. Right-click for content blocks and AI actions · ⌘K samples · ⌘S save · ⌘Enter run the comparison"
              focusMode={false}
              renderIslands={false}
              handleRef={editorRef}
              layout="pane"
              onScroll={onScroll}
            />
          </div>
        </EditableContextMenu>
      </div>

      {/* Footer — block atlas */}
      <div className="border-t border-border bg-background/40 p-2">
        <BlockStatsCard blocks={detectedBlocks} />
      </div>
    </div>
  );
}
