"use client";

/**
 * SmartCodeEditorModal — thin Dialog wrapper around `SmartCodeEditor`.
 *
 * Kept for backwards compatibility. The window surface
 * (`features/window-panels/windows/smart-code-editor/SmartCodeEditorWindow`)
 * is the primary UX going forward; this modal just renders the same 4-column
 * editor inside a Dialog.
 */

import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SmartCodeEditor } from "./SmartCodeEditor";
import type { CodeEditorAgentConfig, CodeFile } from "../types";

export interface SmartCodeEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  agents: CodeEditorAgentConfig[];
  defaultPickerMandateKey?: string;

  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string, fileId: string | null) => void;

  files?: CodeFile[];
  initialActiveFilePath?: string;

  filePath?: string;
  selection?: string;
  diagnostics?: string;
  workspaceName?: string;
  workspaceFolders?: string;
  gitBranch?: string;
  gitStatus?: string;
  agentSkills?: string;

  title?: string;
}

export function SmartCodeEditorModal({
  open,
  onOpenChange,
  agents,
  defaultPickerMandateKey,
  initialCode = "",
  language = "plaintext",
  onCodeChange,
  files,
  initialActiveFilePath,
  filePath,
  selection,
  diagnostics,
  workspaceName,
  workspaceFolders,
  gitBranch,
  gitStatus,
  agentSkills,
  title,
}: SmartCodeEditorModalProps) {
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90dvh] p-0 gap-0">
        <SmartCodeEditor
          agents={agents}
          defaultPickerMandateKey={defaultPickerMandateKey}
          initialCode={initialCode}
          language={language}
          onCodeChange={onCodeChange}
          files={files}
          initialActiveFilePath={initialActiveFilePath}
          filePath={filePath}
          selection={selection}
          diagnostics={diagnostics}
          workspaceName={workspaceName}
          workspaceFolders={workspaceFolders}
          gitBranch={gitBranch}
          gitStatus={gitStatus}
          agentSkills={agentSkills}
          title={title}
        />
      </DialogContent>
    </Dialog>
  );
}
