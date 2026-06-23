"use client";

import {
  FileText,
  SplitSquareHorizontal,
  PilcrowRight,
  Columns,
  Eye,
  History,
  ChevronDown,
  Check,
  GitCompare,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/features/notes/components/NoteEditorCore";
import {
  setWorkingDocEditorMode,
  setWorkingDocHistoryOpen,
  setWorkingDocMainView,
  useWorkingDocViewState,
} from "./workingDocumentViewStore";

export const WORKING_DOC_VIEW_MODES = [
  { mode: "plain" as const, label: "Edit", icon: FileText },
  { mode: "split" as const, label: "Split", icon: SplitSquareHorizontal },
  { mode: "wysiwyg" as const, label: "Rich", icon: PilcrowRight },
  { mode: "markdown-split" as const, label: "MD Split", icon: Columns },
  { mode: "preview" as const, label: "Preview", icon: Eye },
];

interface WorkingDocumentViewControlsProps {
  conversationId: string;
  className?: string;
}

export function WorkingDocumentViewControls({
  conversationId,
  className,
}: WorkingDocumentViewControlsProps) {
  const { mainView, editorMode, historyOpen, hasUnseenChange, saving } =
    useWorkingDocViewState(conversationId);

  const current =
    WORKING_DOC_VIEW_MODES.find((m) => m.mode === editorMode) ??
    WORKING_DOC_VIEW_MODES[0];
  const CurrentIcon = current.icon;
  const editorActive = mainView === "editor";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {saving && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {hasUnseenChange && editorActive && (
        <span className="hidden text-[10px] text-primary sm:inline">
          Agent edited
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Change view mode"
            disabled={!editorActive}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
              editorActive
                ? "bg-accent/50 text-foreground hover:bg-accent"
                : "cursor-not-allowed text-muted-foreground/50",
            )}
          >
            <CurrentIcon />
            <span>{current.label}</span>
            <ChevronDown className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[150px]">
          {WORKING_DOC_VIEW_MODES.map(({ mode, label, icon: Icon }) => (
            <DropdownMenuItem
              key={mode}
              onSelect={() => {
                setWorkingDocMainView(conversationId, "editor");
                setWorkingDocEditorMode(conversationId, mode);
              }}
              className={cn(
                "gap-2 text-xs",
                editorMode === mode &&
                  editorActive &&
                  "bg-accent text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
              {editorMode === mode && editorActive && (
                <Check className="ml-auto h-3 w-3 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() =>
          setWorkingDocMainView(
            conversationId,
            mainView === "agent-diff" ? "editor" : "agent-diff",
          )
        }
        title={
          mainView === "agent-diff"
            ? "Back to editor"
            : "View the agent's latest changes"
        }
        className={cn(
          "relative flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
          mainView === "agent-diff"
            ? "bg-accent text-foreground"
            : hasUnseenChange
              ? "text-primary hover:bg-accent/50"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <GitCompare />
        {hasUnseenChange && mainView !== "agent-diff" && (
          <span className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setWorkingDocHistoryOpen(conversationId, !historyOpen)}
        title="Version history"
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
          historyOpen
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <History />
      </button>
    </div>
  );
}

export type { EditorMode };
