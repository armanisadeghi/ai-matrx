"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeWorkspace, type CodeWorkspaceProps } from "../CodeWorkspace";

interface CodeWorkspaceModalProps extends CodeWorkspaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export const CodeWorkspaceModal: React.FC<CodeWorkspaceModalProps> = ({
  open,
  onOpenChange,
  title = "Code Workspace",
  ...workspaceProps
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] h-[85dvh] p-0 overflow-hidden"
      >
        <DialogHeader className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800">
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 h-full">
          <CodeWorkspace {...workspaceProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CodeWorkspaceModal;
