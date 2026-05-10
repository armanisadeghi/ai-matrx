"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";
import { cn } from "@/lib/utils";
import { useAgentSaveAction } from "./useAgentSaveAction";

interface AgentSaveTapButtonProps {
  agentId: string;
}

/**
 * Mobile-friendly save affordance for the agent header.
 *
 * Renders a single 44pt tap target with state-aware coloring:
 *   - clean    → muted save icon, disabled
 *   - dirty    → primary save icon + amber dot indicator
 *   - new      → primary save icon (no dot — entire agent is unsaved)
 *   - saving   → spinner, disabled
 *
 * Mirrors the desktop `AgentSaveStatus` save semantics (only renders in edit
 * mode, opens the model-missing warning post-save, etc.) but skips the
 * desktop-only diff/version chips that don't fit the constrained mobile bar.
 */
export function AgentSaveTapButton({ agentId }: AgentSaveTapButtonProps) {
  const {
    isDirty,
    isLoading,
    isNewRoute,
    isEditMode,
    canSave,
    handleSave,
    showModelWarning,
    setShowModelWarning,
  } = useAgentSaveAction(agentId);

  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!isEditMode) return null;

  const ariaLabel = isNewRoute
    ? "Save new agent"
    : isDirty
      ? "Save changes"
      : "No unsaved changes";

  const icon = isLoading ? (
    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
  ) : (
    <Save
      className={cn(
        "w-4 h-4",
        canSave ? "text-primary" : "text-muted-foreground/60",
      )}
    />
  );

  // Amber unsaved-state dot — only meaningful for an existing agent that has
  // pending edits. On `/agents/new` the entire record is unsaved, which the
  // primary-tinted icon already communicates without an extra indicator.
  const showDirtyDot = isDirty && !isNewRoute && !isLoading;

  const handleSelectModel = () => {
    setShowModelWarning(false);
    setSettingsOpen(true);
  };

  return (
    <>
      <div className="relative shrink-0">
        <TapTargetButton
          icon={icon}
          ariaLabel={ariaLabel}
          tooltip={false}
          onClick={handleSave}
          disabled={!canSave}
        />
        {showDirtyDot && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
          />
        )}
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
    </>
  );
}
