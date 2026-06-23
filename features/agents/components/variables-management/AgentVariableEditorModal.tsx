"use client";

/**
 * AgentVariableEditorModal
 *
 * Edit-only modal wrapper around AgentVariableEditor. The variable must
 * already exist in Redux when this opens — callers that want to "add" a
 * variable should create it via the slice first, then open this modal.
 *
 * When `justCreated` is true the footer shows a Discard action (wired via
 * `onDiscard`) to delete the freshly-created entity.
 */

import React from "react";
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
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/ButtonMine";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentVariableEditor } from "./AgentVariableEditor";
import { useIsMobile } from "@/hooks/use-mobile";

interface AgentVariableEditorModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  variableName: string;
  existingNames: string[];
  /** True when the variable was just instant-created by the caller. */
  justCreated?: boolean;
  /** Called when the user clicks the Discard footer button. */
  onDiscard?: () => void;
  /** Called after a successful rename inside the editor. */
  onRenamed?: (newName: string) => void;
}

export function AgentVariableEditorModal({
  agentId,
  isOpen,
  onClose,
  variableName,
  existingNames,
  justCreated,
  onDiscard,
  onRenamed,
}: AgentVariableEditorModalProps) {
  const isMobile = useIsMobile();

  const title = justCreated ? "New Variable" : "Edit Variable";

  const content = (
    <>
      <AgentVariableEditor
        agentId={agentId}
        variableName={variableName}
        existingNames={existingNames}
        onRenamed={onRenamed}
      />

      <div className="flex justify-end gap-2 pt-4">
        {justCreated && onDiscard && (
          <Button
            variant="outline"
            onClick={() => {
              onDiscard();
              onClose();
            }}
          >
            Discard
          </Button>
        )}
        <Button variant={justCreated ? "default" : "outline"} onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="px-4 pb-safe max-h-[90dvh]">
          <DrawerHeader className="px-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              <span className="sr-only">Variable editor</span>
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="min-w-0 flex-1 overflow-y-auto pb-4">
            {content}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-0 sm:max-w-[500px] max-h-[90dvh] overflow-hidden flex flex-col p-3">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="sr-only">Variable editor</span>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-w-0 flex-1 overflow-y-auto pr-1">
          <div className="min-w-0 py-1">{content}</div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
