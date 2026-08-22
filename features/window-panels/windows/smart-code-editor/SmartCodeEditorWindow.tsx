"use client";

/**
 * SmartCodeEditorWindow
 *
 * Thin `WindowPanel` shell around `SmartCodeEditor`. The 4-column editor
 * owns all launch / widget-handle / conversation lifecycle internally.
 *
 * This window exists to:
 *   1. Host `SmartCodeEditor` inside a draggable/resizable floating panel.
 *   2. Emit typed events via a callback group (code-change, window-close)
 *      so callers can observe editor state without touching Redux.
 *
 * Registered as `ephemeral: true` — reload discards any live drafts because
 * they belong to a session that can't be restored.
 */

import React, { useCallback, useRef, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SmartCodeEditor } from "@/features/code-editor/agent-code-editor/components/SmartCodeEditor";
import type {
  CodeEditorAgentConfig,
  CodeFile,
} from "@/features/code-editor/agent-code-editor/types";
import { useSmartCodeEditorEmitter } from "./useSmartCodeEditorEmitter";

export interface SmartCodeEditorWindowProps {
  windowInstanceId: string;
  callbackGroupId?: string | null;

  /** The agents available in the history-panel picker. Required. */
  agents: CodeEditorAgentConfig[];
  /** Picker-default job (mandate key). Defaults to `agents[0]`. */
  defaultPickerMandateKey?: string;

  /** Single-file mode: starting editor content. */
  initialCode?: string;
  language?: string;

  /** Multi-file mode — when provided, shows the Files column. */
  files?: CodeFile[];
  initialActiveFilePath?: string;

  // Optional IDE context
  filePath?: string;
  selection?: string;
  diagnostics?: string;
  workspaceName?: string;
  workspaceFolders?: string;
  gitBranch?: string;
  gitStatus?: string;
  agentSkills?: string;

  title?: string | null;

  onClose: () => void;
}

export function SmartCodeEditorWindow({
  windowInstanceId,
  callbackGroupId,
  agents,
  defaultPickerMandateKey,
  initialCode = "",
  language = "plaintext",
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
  onClose,
}: SmartCodeEditorWindowProps) {
  // The window tracks the "latest code" only for emitter purposes
  // (window-close needs to report final code). SmartCodeEditor owns real
  // editor state internally.
  const codeRef = useRef<string>(initialCode);
  const [, forceRender] = useState(0);

  const { emit } = useSmartCodeEditorEmitter(
    callbackGroupId,
    windowInstanceId,
    () => codeRef.current,
  );

  const handleCodeChange = useCallback(
    (next: string, _fileId: string | null) => {
      codeRef.current = next;
      emit({ type: "code-change", code: next });
      // No forceRender — SmartCodeEditor already re-renders via its own state.
      void forceRender;
    },
    [emit],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      agents: agents.map((a) => ({ mandateKey: a.mandateKey, name: a.name })),
      language,
      title: title ?? null,
    }),
    [agents, language, title],
  );

  return (
    <WindowPanel
      id={`smart-code-editor-window-${windowInstanceId}`}
      title={title ?? "Smart Code Editor"}
      overlayId="smartCodeEditorWindow"
      minWidth={900}
      minHeight={500}
      width={1280}
      height={760}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      bodyClassName="p-0 overflow-hidden"
    >
      <SmartCodeEditor
        agents={agents}
        defaultPickerMandateKey={defaultPickerMandateKey}
        initialCode={initialCode}
        language={language}
        onCodeChange={handleCodeChange}
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
        title={title ?? undefined}
      />
    </WindowPanel>
  );
}

export default SmartCodeEditorWindow;
