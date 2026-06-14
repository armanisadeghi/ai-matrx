"use client";

import { useState, useEffect } from "react";
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
import { AgentSettingsCore } from "./AgentSettingsCore";

interface AgentSettingsModalProps {
  agentId: string;
  /** When provided, puts the modal into controlled mode (hides the trigger button). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AgentSettingsModal({
  agentId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: AgentSettingsModalProps) {
  const isMobile = useIsMobile();
  const isControlled = controlledOpen !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (controlledOnOpenChange ?? setInternalOpen)
    : setInternalOpen;

  // Edits made in this panel are written live to the agent record (Redux) and
  // tracked there as dirty — saved or discarded by the agent-level save/undo
  // flow, exactly like editing the system prompt or any other field. This
  // panel does NOT own its own revert, so "Close" closes without undoing.
  //
  // The one thing that IS panel-local and lost on close is an unapplied JSON
  // editor buffer (Raw Editable / Output Schema text not yet Applied). The
  // core reports that here so we can warn before closing.
  const [hasUnappliedEdits, setHasUnappliedEdits] = useState(false);
  const [showUnappliedConfirm, setShowUnappliedConfirm] = useState(false);

  useEffect(() => {
    if (isControlled && !controlledOpen) {
      setHasUnappliedEdits(false);
      setShowUnappliedConfirm(false);
    }
  }, [isControlled, controlledOpen]);

  const handleOpen = () => {
    setHasUnappliedEdits(false);
    setShowUnappliedConfirm(false);
    setOpen(true);
  };

  const closeClean = () => {
    setHasUnappliedEdits(false);
    setShowUnappliedConfirm(false);
    setOpen(false);
  };

  // Close request from the Close button, the header X, Escape, or an outside
  // click. Intercept only when an unapplied editor buffer would be lost.
  const handleRequestClose = () => {
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
    <div className="flex items-center justify-end px-4 py-1.5 border-t border-border bg-gray-50 dark:bg-gray-900/50 flex-shrink-0 gap-2">
      {hasUnappliedEdits && (
        <span className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 mr-auto">
          <AlertTriangle className="h-3 w-3" />
          Unapplied editor edits
        </span>
      )}
      <Button
        size="sm"
        variant={hasUnappliedEdits ? "destructive" : "default"}
        onClick={handleRequestClose}
        className="h-7 text-xs"
      >
        Close
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          open={open}
          onOpenChange={(o) => {
            if (!o) handleRequestClose();
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
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleRequestClose();
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
    </>
  );
}
