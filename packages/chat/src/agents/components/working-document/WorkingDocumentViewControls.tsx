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
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import type { EditorMode } from "./editor-mode";
import {
  setWorkingDocEditorMode,
  setWorkingDocMainView,
  useWorkingDocViewState,
} from "./workingDocumentViewStore";
import { useChatCanvasTab } from "../../../host/canvas";
import { WORKING_DOCUMENT_HISTORY_KIND } from "../../../host/canvas-tabs";

export const WORKING_DOC_VIEW_MODES = [
  { mode: "plain" as const, label: "Edit", icon: FileText },
  { mode: "split" as const, label: "Split", icon: SplitSquareHorizontal },
  { mode: "write" as const, label: "Write", icon: PilcrowRight },
  { mode: "source" as const, label: "Source", icon: Columns },
  { mode: "preview" as const, label: "Preview", icon: Eye },
];

interface WorkingDocumentViewControlsProps {
  conversationId: string;
  className?: string;
  /**
   * Show the agent-diff toggle + "Agent edited" affordance. Only the WORKING
   * document is agent-edited, so the scratchpad (which the agent never writes)
   * passes `false` — otherwise the toggle is a dead control that flips
   * `mainView` to a diff the panel never renders for `kind:"scratch"` AND
   * disables the mode dropdown. Default true.
   */
  showDiff?: boolean;
  /**
   * View-only sharee: hide the one editor's edit modes (Write / Source) — a
   * viewer's writes are RLS-doomed. Plain / Split / Preview all honor readOnly.
   */
  readOnly?: boolean;
}

export function WorkingDocumentViewControls({
  conversationId,
  className,
  showDiff = true,
  readOnly = false,
}: WorkingDocumentViewControlsProps) {
  const { mainView, editorMode, hasUnseenChange, saving } =
    useWorkingDocViewState(conversationId);
  // Version history is the conversation's canvas tab beside the document;
  // the button shows pressed while it is in front.
  const history = useChatCanvasTab({
    kind: WORKING_DOCUMENT_HISTORY_KIND,
    key: conversationId,
  });

  const modes = readOnly
    ? WORKING_DOC_VIEW_MODES.filter(
        (m) => m.mode !== "write" && m.mode !== "source",
      )
    : WORKING_DOC_VIEW_MODES;
  const current =
    modes.find((m) => m.mode === editorMode) ?? modes[0];
  const CurrentIcon = current.icon;
  const editorActive = mainView === "editor";

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {saving && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {showDiff && hasUnseenChange && editorActive && (
        <span className="hidden whitespace-nowrap text-[10px] text-primary @[30rem]/wdhead:inline">
          Agent edited
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            title="Change view mode"
            aria-label={`View: ${current.label}`}
            disabled={!editorActive}
            icon={<CurrentIcon />}
            iconEnd={<ChevronDown />}
          >
            {/* The word goes when the host panel is narrow (its @container);
                the icon and the aria-label still say which view this is. */}
            <span className="hidden @[20rem]/wdhead:inline">{current.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[150px]">
          {modes.map(({ mode, label, icon: Icon }) => (
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

      {showDiff && (
        <Button
          variant="quiet"
          icon={<GitCompare />}
          aria-pressed={mainView === "agent-diff"}
          // Unseen agent changes tint the door instead of a hand-drawn dot.
          tone={hasUnseenChange && mainView !== "agent-diff" ? "primary" : undefined}
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
          aria-label={
            mainView === "agent-diff"
              ? "Back to editor"
              : "View the agent's latest changes"
          }
        />
      )}

      <Button
        variant="quiet"
        icon={<History />}
        onClick={() =>
          history.toggle({ title: "Version history", data: { conversationId } })
        }
        title="Version history"
        aria-label="Version history"
        aria-pressed={history.isVisible}
      />
    </div>
  );
}

export type { EditorMode };
