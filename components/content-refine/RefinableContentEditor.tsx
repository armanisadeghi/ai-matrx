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
import * as SliderPrimitive from "@radix-ui/react-slider";
import IconButton from "@/components/official/IconButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  NoteEditorCore,
  type EditorMode,
} from "@/features/notes/components/NoteEditorCore";
import type { RefinableContent } from "./useRefinableContent";

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
}

export function RefinableContentEditor({
  refine,
  initialEditorMode = "split",
  readOnly = false,
  placeholder = "Enter content...",
  className,
  resetKeySuffix,
  toolbarEnd,
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
          <TrimRow
            label="Trim start"
            max={Math.max(0, trimMax - trimEnd)}
            value={trimStart}
            onChange={setTrimStart}
            tooltip="Drag to trim characters from the start of the content"
          />
        )}

        <div className="flex-1 min-h-0 flex flex-col border border-border rounded-md overflow-hidden bg-background">
          <NoteEditorCore
            content={workingContent}
            onChange={setEditedContent}
            onChangeFlush={setEditedContent}
            editorMode={readOnly ? "preview" : editorMode}
            placeholder={placeholder}
            className="flex-1 min-h-0"
            resetKey={`${resetKey}:${resetKeySuffix ?? ""}`}
          />
        </div>

        {!readOnly && (
          <TrimRow
            label="Trim end"
            max={Math.max(0, trimMax - trimStart)}
            value={trimEnd}
            onChange={setTrimEnd}
            tooltip="Drag to trim characters from the end of the content"
          />
        )}
      </div>
    </TooltipProvider>
  );
}

interface TrimRowProps {
  label: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
}

function TrimRow({ label, max, value, onChange, tooltip }: TrimRowProps) {
  const safeMax = Math.max(0, max);
  const clamped = Math.min(value, safeMax);
  const disabled = safeMax === 0;

  const labelEl = (
    <span
      className={cn(
        "text-xs shrink-0 w-20 tabular-nums select-none font-medium",
        disabled ? "text-muted-foreground/60" : "text-foreground",
      )}
    >
      {label}
    </span>
  );

  return (
    <div className="flex items-center gap-3 shrink-0 w-full min-w-0 h-8">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
          <TooltipContent side="top" className="z-[9999]">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        labelEl
      )}

      <SliderPrimitive.Root
        min={0}
        max={safeMax || 1}
        step={1}
        value={[clamped]}
        onValueChange={(vals) => onChange(vals[0] ?? 0)}
        disabled={disabled}
        className={cn(
          "relative flex items-center select-none touch-none flex-1 min-w-0 h-5 cursor-pointer",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <SliderPrimitive.Track className="relative grow h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 border border-border overflow-hidden">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="block h-4 w-4 rounded-full bg-primary border-2 border-background shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none cursor-grab active:cursor-grabbing active:scale-110"
          aria-label={label}
        />
      </SliderPrimitive.Root>

      <input
        type="number"
        min={0}
        max={safeMax}
        value={clamped}
        onChange={(e) => {
          const n = Number(e.target.value) || 0;
          onChange(Math.max(0, Math.min(n, safeMax)));
        }}
        disabled={disabled}
        className={cn(
          "h-7 w-20 shrink-0 rounded-md border border-border bg-background px-2 text-xs tabular-nums",
          "text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      />
      <span
        className={cn(
          "text-[10px] tabular-nums shrink-0 w-14 text-right",
          disabled ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        / {safeMax.toLocaleString()}
      </span>
    </div>
  );
}
