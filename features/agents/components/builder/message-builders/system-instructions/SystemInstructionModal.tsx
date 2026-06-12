"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SystemInstructionEditor } from "./SystemInstructionEditor";

interface SystemInstructionModalProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SystemInstructionModal({
  conversationId,
  open,
  onOpenChange,
}: SystemInstructionModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Structured System Instruction</DialogTitle>
        </DialogHeader>
        <SystemInstructionEditor conversationId={conversationId} />
      </DialogContent>
    </Dialog>
  );
}
