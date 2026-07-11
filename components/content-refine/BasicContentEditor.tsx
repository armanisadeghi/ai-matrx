"use client";

/**
 * BasicContentEditor — edit / split / preview for markdown-ish text, without
 * the trim / strip-thinking toolbar used by save flows (QuickNoteSaveCore,
 * TaskQuickCreateCore). Pair with controlled `content` + `onChange`; the
 * parent owns persistence.
 */

import { useState, type ComponentType } from "react";
import { FileText, Eye, Columns2 } from "lucide-react";
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

const VIEW_MODES: Array<{
  value: EditorMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { value: "plain", label: "Edit", icon: FileText },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "preview", label: "Preview", icon: Eye },
];

export interface BasicContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  /** Called on discrete edits (preview pane, voice) — defaults to `onChange`. */
  onChangeFlush?: (content: string) => void;
  initialEditorMode?: EditorMode;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** Bump to reset in-editor state after an external content swap. */
  resetKey?: string;
}

export function BasicContentEditor({
  content,
  onChange,
  onChangeFlush,
  initialEditorMode = "split",
  readOnly = false,
  placeholder = "Enter content…",
  className,
  resetKey,
}: BasicContentEditorProps) {
  const [editorMode, setEditorMode] = useState<EditorMode>(initialEditorMode);

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex min-h-0 h-full flex-col gap-2", className)}>
        {!readOnly && (
          <div className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-md border border-border bg-background p-0.5 h-8">
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
                        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
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
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background">
          <NoteEditorCore
            content={content}
            onChange={onChange}
            onChangeFlush={onChangeFlush ?? onChange}
            editorMode={readOnly ? "preview" : editorMode}
            placeholder={placeholder}
            className="min-h-0 flex-1"
            resetKey={resetKey}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
