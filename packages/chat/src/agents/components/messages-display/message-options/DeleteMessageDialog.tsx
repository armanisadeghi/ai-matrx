"use client";

/**
 * DeleteMessageDialog — destructive-vs-fork choice for a single message.
 *
 * "Move to Trash" runs `deleteMessage` (in-place soft-delete + tool-call
 * cascade). "Fork without this message" forks at position - 1 then deletes
 * the message on the fork — preserving the original branch. Cancel closes.
 *
 * The dialog body lists what cascades. Counted from the observability
 * tool-calls slice keyed by messageId; no fetch.
 *
 * Mobile: Drawer. Desktop: AlertDialog.
 */

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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectToolCallsForMessage } from "@/features/agents/redux/execution-system/observability/observability.selectors";

interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  /**
   * Whether the "Fork without this message" path makes sense. Hidden if
   * the message has no prior position (e.g. it's the first user message
   * in the conversation — forking before it produces an empty branch).
   */
  canFork: boolean;
  onConfirmDelete: () => void;
  onConfirmFork: () => void;
}

export function DeleteMessageDialog({
  open,
  onOpenChange,
  messageId,
  canFork,
  onConfirmDelete,
  onConfirmFork,
}: DeleteMessageDialogProps) {
  const isMobile = useIsMobile();
  const cascadedToolCalls = useAppSelector(
    selectToolCallsForMessage(messageId),
  );

  const title = "Move this message to Trash?";
  const description = (() => {
    if (cascadedToolCalls.length === 0) {
      return "The message leaves the conversation and the model no longer sees it. You can restore it from Trash.";
    }
    const noun = cascadedToolCalls.length === 1 ? "tool call" : "tool calls";
    return `The message and ${cascadedToolCalls.length} attached ${noun} leave the conversation and the model no longer sees them. You can restore them from Trash.`;
  })();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-safe">
            <Button
              variant="destructive"
              onClick={() => {
                onOpenChange(false);
                onConfirmDelete();
              }}
            >
              Move to Trash
            </Button>
            {canFork && (
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                  onConfirmFork();
                }}
              >
                Fork without this message
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {canFork && (
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                onConfirmFork();
              }}
            >
              Fork without this message
            </Button>
          )}
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              onConfirmDelete();
            }}
          >
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
