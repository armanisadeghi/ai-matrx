"use client";

import { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentSettings,
  selectAgentModelId,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentSettings,
  setAgentField,
} from "@/features/agents/redux/agent-definition/slice";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { AgentSettingsCore } from "./AgentSettingsCore";

interface AgentSettingsModalProps {
  agentId: string;
  /** When provided, puts the modal into controlled mode (hides the trigger button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface SettingsSnapshot {
  settings: FeLlmParams;
  modelId: string | null;
}

export function AgentSettingsModal({
  agentId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: AgentSettingsModalProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const isControlled = controlledOpen !== undefined;

  const currentSettings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );
  const currentModelId = useAppSelector((state) =>
    selectAgentModelId(state, agentId),
  );

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? setInternalOpen)
    : setInternalOpen;

  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const discardedRef = useRef(false);
  // Unapplied edits in a JSON editor (Raw Editable / Output Schema) that would
  // be lost on close unless the user clicks Apply. Reported up by the core.
  const [hasUnappliedEdits, setHasUnappliedEdits] = useState(false);
  const [showUnappliedConfirm, setShowUnappliedConfirm] = useState(false);

  useEffect(() => {
    if (isControlled && controlledOpen && !snapshot) {
      setSnapshot({
        settings: currentSettings ?? {},
        modelId: currentModelId ?? null,
      });
    }
    if (isControlled && !controlledOpen) {
      setSnapshot(null);
      setHasUnappliedEdits(false);
      setShowUnappliedConfirm(false);
    }
  }, [isControlled, controlledOpen, currentSettings, currentModelId, snapshot]);

  const handleOpen = () => {
    setSnapshot({
      settings: currentSettings ?? {},
      modelId: currentModelId ?? null,
    });
    setHasUnappliedEdits(false);
    setShowUnappliedConfirm(false);
    setOpen(true);
  };

  const hasChanges = () => {
    if (!snapshot) return false;
    const settingsChanged =
      JSON.stringify(currentSettings ?? {}) !==
      JSON.stringify(snapshot.settings);
    const modelChanged = (currentModelId ?? null) !== snapshot.modelId;
    return settingsChanged || modelChanged;
  };

  const revertToSnapshot = () => {
    if (!snapshot) return;
    dispatch(setAgentSettings({ id: agentId, settings: snapshot.settings }));
    if (snapshot.modelId !== null) {
      dispatch(
        setAgentField({
          id: agentId,
          field: "modelId",
          value: snapshot.modelId,
        }),
      );
    }
  };

  const handleCancelClick = () => {
    if (hasChanges()) {
      setOpen(false);
      setShowCancelConfirm(true);
    } else {
      setOpen(false);
    }
  };

  const handleKeepEditing = () => {
    setShowCancelConfirm(false);
    setOpen(true);
  };

  const handleConfirmCancel = () => {
    discardedRef.current = true;
    revertToSnapshot();
    setShowCancelConfirm(false);
    setSnapshot(null);
    setHasUnappliedEdits(false);
    setShowUnappliedConfirm(false);
  };

  // Close the panel keeping applied changes (unapplied editor buffers are
  // discarded — that's what the confirm warns about).
  const closeClean = () => {
    setSnapshot(null);
    setHasUnappliedEdits(false);
    setShowUnappliedConfirm(false);
    setOpen(false);
  };

  const handleDone = () => {
    if (hasUnappliedEdits) {
      setShowUnappliedConfirm(true);
      return;
    }
    closeClean();
  };

  const trigger = isControlled ? null : (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleOpen}
      title="Model settings"
    >
      <SlidersHorizontal className="h-4 w-4" />
    </Button>
  );

  const footer = showUnappliedConfirm ? (
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-red-50 dark:bg-red-950/30 flex-shrink-0 gap-2">
      <span className="flex items-center gap-1.5 min-w-0 text-xs text-red-700 dark:text-red-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          You have unapplied editor changes — they&apos;ll be lost.
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUnappliedConfirm(false)}
          className="h-7 text-xs"
        >
          Keep editing
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={closeClean}
          className="h-7 text-xs"
        >
          Discard &amp; close
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-gray-50 dark:bg-gray-900/50 flex-shrink-0 gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCancelClick}
        className="h-7 text-xs"
      >
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        {hasUnappliedEdits && (
          <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Unapplied edits
          </span>
        )}
        <Button
          size="sm"
          variant={hasUnappliedEdits ? "destructive" : "default"}
          onClick={handleDone}
          className="h-7 text-xs"
        >
          Done
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          open={open}
          onOpenChange={(o) => {
            if (!o) handleCancelClick();
            else handleOpen();
          }}
        >
          <DrawerContent className="px-4 pb-safe h-[80dvh] flex flex-col">
            <DrawerHeader className="px-0 py-2 flex-shrink-0">
              <DrawerTitle className="text-xs font-semibold uppercase tracking-wide">
                Model Settings
              </DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden pb-2">
              <AgentSettingsCore
              agentId={agentId}
              onUnappliedEditsChange={setHasUnappliedEdits}
            />
            </div>
            {footer}
          </DrawerContent>
        </Drawer>
        <AlertDialog
          open={showCancelConfirm}
          onOpenChange={(o) => {
            if (!o) {
              if (discardedRef.current) {
                discardedRef.current = false;
                return;
              }
              handleKeepEditing();
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your settings changes will be reverted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleKeepEditing}>
                Keep editing
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmCancel}>
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleCancelClick();
          else handleOpen();
        }}
      >
        <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col h-[65dvh] max-h-[65dvh]">
          <DialogHeader className="px-4 py-2.5 border-b border-border flex-shrink-0">
            <DialogTitle className="text-xs font-semibold uppercase tracking-wide">
              Model Settings
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure model settings, view raw JSON, and inspect model
              parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col px-3 py-1 overflow-hidden">
            <AgentSettingsCore
              agentId={agentId}
              onUnappliedEditsChange={setHasUnappliedEdits}
            />
          </div>
          {footer}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={(o) => {
          if (!o) {
            if (discardedRef.current) {
              discardedRef.current = false;
              return;
            }
            handleKeepEditing();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your settings changes will be reverted to what they were when you
              opened this panel. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepEditing}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
