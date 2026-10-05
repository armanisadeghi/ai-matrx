"use client";

import { Badge } from "@ai-matrx/design-system/controls";
import { useState } from "react";
import { Save, Loader2, AlertTriangle, Eye } from "lucide-react";
import { useChatCanvasTab } from "../../../host/canvas";
import { AGENT_UNSAVED_CHANGES_KIND } from "../../../host/canvas-tabs";
import { cn } from "@ai-matrx/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ai-matrx/design-system";
import { AgentSettingsModal } from "@ai-matrx/chat/host/ui-slots";
import { useAgentSaveAction } from "./useAgentSaveAction";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

export function AgentSaveStatus({
  agentId,
  editModeOverride,
  versionClassName,
}: {
  agentId: string;
  /** When true, expose save affordances outside `/agents/.../build` (e.g. window panels). */
  editModeOverride?: boolean;
  /** Extra classes for the version pill — a host header folds it away when narrow. */
  versionClassName?: string;
}) {
  const {
    isDirty,
    isLoading,
    version,
    isNewRoute,
    isEditMode,
    canSave,
    isReadOnly,
    isReadOnlySave,
    handleSave,
    showModelWarning,
    setShowModelWarning,
    readOnlySavePrompt,
    duplicateDialog,
    reachBadge,
    available,
  } = useAgentSaveAction(agentId, { editModeOverride });

  const [settingsOpen, setSettingsOpen] = useState(false);
  // The unsaved-changes diff is the agent's canvas tab; the eye toggles it.
  const diffTab = useChatCanvasTab({ kind: AGENT_UNSAVED_CHANGES_KIND, key: agentId });

  const handleSelectModel = () => {
    setShowModelWarning(false);
    setSettingsOpen(true);
  };

  // No builder door in this host: nothing here can save, so nothing is drawn (reported once).
  if (!available) return null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {version != null && (
          <span
            className={cn(
              "text-[10px] font-medium text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/60",
              versionClassName,
            )}
          >
            v{version}
          </span>
        )}

        {isEditMode && isReadOnly && (
          <Badge tone="warning">View only</Badge>
        )}

        {isEditMode && isDirty && (
          <>
            <Badge tone="warning">{isNewRoute ? "Not saved" : "Unsaved"}</Badge>
            <ErrorAlchemyMenu />
            {!isNewRoute && (
              <button
                onClick={() => diffTab.toggle({ title: "Unsaved changes", data: { agentId } })}
                aria-pressed={diffTab.isVisible}
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-md transition-colors text-amber-500 hover:bg-amber-500/10 active:bg-amber-500/20",
                  diffTab.isVisible && "bg-amber-500/15",
                )}
                title="View unsaved changes"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}

        {isEditMode && (
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "flex items-center justify-center w-6 h-6 rounded-md transition-colors",
              canSave
                ? "text-primary hover:bg-primary/10 active:bg-primary/20"
                : "text-muted-foreground/40 cursor-not-allowed",
            )}
            title={
              isReadOnlySave
                ? "View only — create your copy to save changes"
                : isNewRoute
                  ? "Save new agent"
                  : isDirty
                    ? "Save changes"
                    // read-gate-exempt: save-button tooltip from local dirty-state tracking, not a read's empty answer
                    : "No unsaved changes"
            }
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {isEditMode && reachBadge}
      </div>

      <AlertDialog open={showModelWarning} onOpenChange={setShowModelWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              No Model Selected
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your agent was saved, but{" "}
              <strong>no model has been selected</strong>. A model is required
              for the agent to run. Would you like to select one now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ignore for Now</AlertDialogCancel>
            <AlertDialogAction onClick={handleSelectModel}>
              Select a Model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentSettingsModal
        agentId={agentId}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      {readOnlySavePrompt}
      {duplicateDialog}
    </>
  );
}
