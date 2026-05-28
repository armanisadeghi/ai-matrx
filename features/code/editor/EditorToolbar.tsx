"use client";

import React from "react";
import { Brain, MessageSquare, PanelBottom, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectRightOpen, setRightOpen } from "../redux/codeWorkspaceSlice";
import {
  selectTerminalOpen,
  setOpen as setTerminalOpen,
} from "../redux/terminalSlice";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";

interface EditorToolbarProps {
  rightSlotAvailable: boolean;
  /** Trigger a save of the currently active editor tab. */
  onSaveActiveTab?: () => void;
  /** The active tab has unsaved edits — used to spotlight the save button. */
  hasDirtyActiveTab?: boolean;
  /** Whether there's an active tab at all (disables save when false). */
  hasActiveTab?: boolean;
  /** ISO string of the active tab's last successful save during this
   *  session, surfaced as a "Saved 12s ago" indicator. */
  lastSavedAt?: string;
  /** Capture the current Monaco selection and ship it to the agent's
   *  instanceContext as a one-off `editor.selection.<id>` entry. */
  onSendSelectionAsContext?: () => void;
  /** Disables the selection-context button when there's no chat instance
   *  to publish to (or no active tab). */
  canSendSelectionAsContext?: boolean;
  /** cld_files UUID for the active tab when it's backed by a cloud-stored
   *  file. Surfaces the "Process for RAG" affordance so the user can
   *  index the file from where they're editing it, without round-tripping
   *  through the files surface. Undefined for purely filesystem-backed
   *  tabs — there's no DB row to ingest. */
  activeCloudFileId?: string | null;
  className?: string;
}

/**
 * VSCode-style compact toolbar on the right end of the editor tab strip —
 * gives the user obvious toggle handles for the terminal, chat panel, and
 * chat-history panel. Complements the buttons already in the StatusBar.
 */
export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  rightSlotAvailable,
  onSaveActiveTab,
  hasDirtyActiveTab = false,
  hasActiveTab = false,
  lastSavedAt,
  onSendSelectionAsContext,
  canSendSelectionAsContext = false,
  activeCloudFileId,
  className,
}) => {
  const dispatch = useAppDispatch();
  const terminalOpen = useAppSelector(selectTerminalOpen);
  const rightOpen = useAppSelector(selectRightOpen);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 border-l border-neutral-200 bg-neutral-100 px-1 dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
    >
      {onSaveActiveTab && (
        <ToolbarButton
          icon={Save}
          active={hasDirtyActiveTab}
          disabled={!hasActiveTab}
          label={
            hasDirtyActiveTab
              ? "Save (\u2318S)"
              : hasActiveTab
                ? "All changes saved"
                : "No file open"
          }
          onClick={onSaveActiveTab}
        />
      )}
      {hasActiveTab && lastSavedAt ? (
        <LastSavedIndicator iso={lastSavedAt} dirty={hasDirtyActiveTab} />
      ) : null}
      {onSendSelectionAsContext && (
        <ToolbarButton
          icon={Brain}
          active={false}
          disabled={!canSendSelectionAsContext}
          label={
            canSendSelectionAsContext
              ? "Send selection as context (\u2318\u21E7L)"
              : "Open a chat to send selection"
          }
          onClick={onSendSelectionAsContext}
        />
      )}
      {activeCloudFileId && (
        <ProcessForRagButton
          sourceKind="cld_file"
          sourceId={activeCloudFileId}
          iconOnly
          className="ml-0.5 h-6 w-6 border-0 bg-transparent hover:bg-neutral-200 dark:hover:bg-neutral-800"
        />
      )}
      <ToolbarButton
        icon={PanelBottom}
        active={terminalOpen}
        label={terminalOpen ? "Close Panel (Ctrl+`)" : "Open Panel (Ctrl+`)"}
        onClick={() => dispatch(setTerminalOpen(!terminalOpen))}
      />
      {rightSlotAvailable && (
        <ToolbarButton
          icon={MessageSquare}
          active={rightOpen}
          label={rightOpen ? "Hide Chat" : "Show Chat"}
          onClick={() => dispatch(setRightOpen(!rightOpen))}
        />
      )}
    </div>
  );
};

function LastSavedIndicator({ iso, dirty }: { iso: string; dirty: boolean }) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    // Re-render every 30s so the relative timestamp stays fresh while
    // the tab is open. Cheap because the parent doesn't re-render unless
    // the active tab actually changes.
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const ts = new Date(iso);
  const fullLabel = ts.toLocaleString();
  const relative = formatRelative(ts);
  return (
    <span
      className={cn(
        "ml-1 hidden whitespace-nowrap px-1 text-[11px] sm:inline",
        dirty
          ? "text-amber-600 dark:text-amber-400"
          : "text-neutral-500 dark:text-neutral-400",
      )}
      title={
        dirty
          ? `Saved ${fullLabel} — unsaved edits since`
          : `Saved ${fullLabel}`
      }
      aria-label={
        dirty
          ? `Last saved ${fullLabel}, with unsaved edits`
          : `Last saved ${fullLabel}`
      }
    >
      {dirty ? "Edits since " : "Saved "}
      {relative}
    </span>
  );
}

function formatRelative(when: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled = false,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
        active &&
          "bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
        disabled &&
          "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-neutral-500 dark:hover:bg-transparent dark:hover:text-neutral-400",
      )}
    >
      <Icon size={14} />
    </button>
  );
}
