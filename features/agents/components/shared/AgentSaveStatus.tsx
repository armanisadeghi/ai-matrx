"use client";

import { Badge, Button } from "@ai-matrx/design-system/controls";
import { useState } from "react";
import { Save, Loader2, AlertTriangle, Eye, Undo2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { TopTierModelBadge } from "@/features/ai-models/TopTierModelBadge";
import {
  resetAllAgentFields,
} from "@/features/agents/redux/agent-builder.slice";
import { useChatCanvasTab } from "@ai-matrx/chat/host/canvas";
import { AGENT_UNSAVED_CHANGES_KIND } from "@ai-matrx/chat/host/canvas-tabs";
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
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";
import { useAgentSaveAction } from "./useAgentSaveAction";

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

  const dispatch = useAppDispatch();
  const modelId = useAppSelector((state) => selectAgentById(state, agentId)?.modelId ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
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
        <TopTierModelBadge modelId={modelId} />
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
            {!isNewRoute && (
              <Button variant="quiet" icon={<Undo2 />} onClick={() => setConfirmDiscardOpen(true)} disabled={isLoading} title="Discard unsaved changes" aria-label="Discard unsaved changes" />
            )}
            {!isNewRoute && (
              <Button variant="quiet" pressed={diffTab.isVisible} icon={<Eye />} onClick={() => diffTab.toggle({ title: "Unsaved changes", data: { agentId } })} title="View unsaved changes" aria-label="View unsaved changes" />
            )}
          </>
        )}

        {isEditMode && (
          <Button variant="quiet" icon={isLoading ? <Loader2 className="animate-spin" /> : <Save />} onClick={handleSave} disabled={!canSave} title={
              isReadOnlySave
                ? "View only — create your copy to save changes"
                : isNewRoute
                  ? "Save new agent"
                  : isDirty
                    ? "Save changes"
                    // read-gate-exempt: save-button tooltip from local dirty-state tracking, not a read's empty answer
                    : "No unsaved changes"
            } aria-label={
              isReadOnlySave
                ? "View only — create your copy to save changes"
                : isNewRoute
                  ? "Save new agent"
                  : isDirty
                    ? "Save changes"
                    // read-gate-exempt: save-button tooltip from local dirty-state tracking, not a read's empty answer
                    : "No unsaved changes"
            } />
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

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent goes back to its last saved version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dispatch(resetAllAgentFields({ id: agentId }))}
            >
              Discard
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
