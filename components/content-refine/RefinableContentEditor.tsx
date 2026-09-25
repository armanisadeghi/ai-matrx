"use client";

// RefinableContentEditor — the standard "refine this content before saving"
// surface: view-mode toggle (plain / split / preview), strip-thinking, copy,
// trim sliders, live char count, and the universal NoteEditorCore body.
//
// Pair with useRefinableContent (which owns the transform state). The
// consuming feature keeps its own destination fields (folder, project, name…)
// and footer; this component only owns the content-refinement strip.
// Reference consumers: QuickNoteSaveCore (notes), TaskQuickCreateCore (tasks).

import React, { useState } from "react";
import { FileText, Eye, Columns2, Copy, RotateCcw, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import IconButton from "@/components/official/IconButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TrimControl } from "./TrimControl";
import { useTrimEdgeScrollIntent } from "@/components/matrx/useTrimEdgeScrollIntent";
import {
  NoteEditorCore,
  type EditorMode,
} from "@/features/notes/components/NoteEditorCore";
import type { RefinableContent } from "./useRefinableContent";
import type { ImagePolicyDeclaration } from "@/components/rich-content/prose/remote-image-policy";

const VIEW_MODES: Array<{
  value: EditorMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "plain", label: "Edit only", icon: FileText },
  { value: "split", label: "Split view", icon: Columns2 },
  { value: "preview", label: "Preview only", icon: Eye },
];

export interface RefinableContentEditorProps {
  refine: RefinableContent;
  /** Initial view mode (default "split"). */
  initialEditorMode?: EditorMode;
  /** Locks the editor into preview and hides the toolbar + trim rows. */
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * Appended to the transform-driven reset key — bump when an external event
   * (e.g. a completed save) should discard in-editor state.
   */
  resetKeySuffix?: string;
  /** Extra toolbar controls, rendered before the char-count badge. */
  toolbarEnd?: React.ReactNode;
  /**
   * WHO WROTE the content shown — "self" | "other" | "ai" (or "inherit").
   * Decides whether remote images load by themselves; forwarded to the
   * renderer (components/rich-content/prose/remote-image-policy.tsx).
   */
  imagePolicy?: ImagePolicyDeclaration;
}

export function RefinableContentEditor({
  refine,
  initialEditorMode = "split",
  readOnly = false,
  placeholder = "Enter content...",
  className,
  resetKeySuffix,
  toolbarEnd,
  imagePolicy,
}: RefinableContentEditorProps) {
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);

  const {
    workingContent,
    setEditedContent,
    stripThinkingEnabled,
    setStripThinkingEnabled,
    canStripThinking,
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    maxTrim,
    resetKey,
    rawLength,
    charCount,
  } = refine;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(workingContent).catch(() => {});
    }
  };

  const trimMax = Math.max(0, maxTrim);
  const trimScroll = useTrimEdgeScrollIntent(
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex flex-col min-h-0 h-full gap-2", className)}>
        {!readOnly && (
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {/* Icon-only view toggle */}
            <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 h-8">
              {VIEW_MODES.map((m) => {
                const Icon = m.icon;
                const active = editorMode === m.value;
                return (
                  <Tooltip key={m.value}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setEditorMode(m.value)}
                        className={cn(
                          "h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        aria-label={m.label}
                        aria-pressed={active}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-[9999]">
                      {m.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Remove thinking */}
            <IconButton
              icon={Rocket}
              size="md"
              variant={stripThinkingEnabled ? "default" : "outline"}
              onClick={() => setStripThinkingEnabled((v) => !v)}
              disabled={!canStripThinking}
              tooltip={
                canStripThinking
                  ? stripThinkingEnabled
                    ? "Restore <thinking> / <reasoning> blocks"
                    : "Remove <thinking> and <reasoning> blocks"
                  : "No <thinking> or <reasoning> tags detected"
              }
              className="rounded-md"
            />

            {/* Copy */}
            <IconButton
              icon={Copy}
              size="md"
              variant="outline"
              onClick={handleCopy}
              disabled={!workingContent}
              tooltip="Copy current content to clipboard"
              className="rounded-md"
            />

            {/* Reset trim */}
            <IconButton
              icon={RotateCcw}
              size="md"
              variant="outline"
              onClick={() => {
                trimScroll.requestEdge("start");
                setTrimStart(0);
                setTrimEnd(0);
              }}
              disabled={trimStart === 0 && trimEnd === 0}
              tooltip="Reset trim sliders to 0"
              className="rounded-md"
            />

            <div className="ml-auto flex items-center gap-2">
              {toolbarEnd}
              <Badge
                variant="secondary"
                className="text-[10px] font-mono rounded-md"
              >
                {charCount.toLocaleString()} chars
                {charCount !== rawLength && (
                  <span className="ml-1 text-muted-foreground">
                    / {rawLength.toLocaleString()}
                  </span>
                )}
              </Badge>
            </div>
          </div>
        )}

        {!readOnly && (
          <TrimControl
            label="Trim start"
            max={Math.max(0, trimMax - trimEnd)}
            value={trimStart}
            onChange={trimScroll.setTrimStart}
            tooltip="Drag to trim characters from the start of the content"
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col border border-border rounded-md overflow-hidden bg-background">
          <NoteEditorCore imagePolicy={imagePolicy}
            content={workingContent}
            onChange={setEditedContent}
            onChangeFlush={setEditedContent}
            editorMode={readOnly ? "preview" : editorMode}
            placeholder={placeholder}
            className="flex-1 min-h-0"
            resetKey={`${resetKey}:${resetKeySuffix ?? ""}`}
            scrollIntent={trimScroll.intent}
            embedded
          />
        </div>

        {!readOnly && (
          <TrimControl
            label="Trim end"
            max={Math.max(0, trimMax - trimStart)}
            value={trimEnd}
            onChange={trimScroll.setTrimEnd}
            tooltip="Drag to trim characters from the end of the content"
          />
        )}
      </div>
    </TooltipProvider>
  );
}
