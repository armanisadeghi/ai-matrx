"use client";

/**
 * useOpenSmartCodeEditorWindow
 *
 * Imperative opener for the 4-column `SmartCodeEditorWindow`. Callers pass
 * an `agents` list (with `codeVariableKey` mapping), optional `files` for
 * multi-file mode, and optional IDE context values. Returns a handle that
 * can close the window or detach the callback group.
 *
 * Usage:
 *
 *   const open = useOpenSmartCodeEditorWindow();
 *   const handle = open({
 *     agents: [GENERIC_CODE_EDITOR_AGENT, DYNAMIC_CONTEXT_CODE_EDITOR_AGENT],
 *     // each entry is { mandateKey, name, codeVariableKey } — never an agent id
 *     initialCode,
 *     language: "typescript",
 *     onCodeChange: (e) => setCode(e.code),
 *   });
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createSmartCodeEditorCallbackGroup,
  type SmartCodeEditorWindowHandlers,
} from "./callbacks";
import type {
  CodeEditorAgentConfig,
  CodeFile,
} from "@/features/code-editor/agent-code-editor/types";

export interface OpenSmartCodeEditorWindowOptions
  extends SmartCodeEditorWindowHandlers {
  /**
   * Stable instance id. Omit to get a fresh, unique window every call
   * (recommended for "edit this snippet" style flows).
   */
  windowInstanceId?: string;

  /** Agents available in the history picker. First entry is the default. */
  agents: CodeEditorAgentConfig[];
  /** Picker-default job (mandate key). Defaults to `agents[0]`. */
  defaultPickerMandateKey?: string;

  // Single-file
  initialCode?: string;
  language?: string;

  // Multi-file
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
}

const OVERLAY_ID = "smartCodeEditorWindow";

type HandleRef = {
  instanceId: string;
  callbackGroupId: string;
  dispose: () => void;
};

export interface SmartCodeEditorWindowHandle {
  overlayId: string;
  instanceId: string;
  callbackGroupId: string;
  close: () => void;
  dispose: () => void;
}

export function useOpenSmartCodeEditorWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  const open = useCallback(
    (
      options: OpenSmartCodeEditorWindowOptions,
    ): SmartCodeEditorWindowHandle => {
      const instanceId =
        options.windowInstanceId ?? `${OVERLAY_ID}-${Date.now()}`;

      const { callbackGroupId, dispose } = createSmartCodeEditorCallbackGroup({
        onReady: options.onReady,
        onLaunched: options.onLaunched,
        onCodeChange: options.onCodeChange,
        onAgentComplete: options.onAgentComplete,
        onAgentError: options.onAgentError,
        onWindowClose: options.onWindowClose,
        onEvent: options.onEvent,
      });

      const data: Record<string, unknown> = {
        callbackGroupId,
        agents: options.agents,
        title: options.title ?? null,
        language: options.language ?? "plaintext",
        initialCode: options.initialCode ?? "",
      };
      if (options.defaultPickerMandateKey !== undefined)
        data.defaultPickerMandateKey = options.defaultPickerMandateKey;
      if (options.files !== undefined) data.files = options.files;
      if (options.initialActiveFilePath !== undefined)
        data.initialActiveFilePath = options.initialActiveFilePath;
      if (options.filePath !== undefined) data.filePath = options.filePath;
      if (options.selection !== undefined) data.selection = options.selection;
      if (options.diagnostics !== undefined)
        data.diagnostics = options.diagnostics;
      if (options.workspaceName !== undefined)
        data.workspaceName = options.workspaceName;
      if (options.workspaceFolders !== undefined)
        data.workspaceFolders = options.workspaceFolders;
      if (options.gitBranch !== undefined) data.gitBranch = options.gitBranch;
      if (options.gitStatus !== undefined) data.gitStatus = options.gitStatus;
      if (options.agentSkills !== undefined)
        data.agentSkills = options.agentSkills;

      dispatch(openOverlay({ overlayId: OVERLAY_ID, instanceId, data }));

      const handleRef: HandleRef = { instanceId, callbackGroupId, dispose };
      handlesRef.current.add(handleRef);

      const close = () => {
        dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId }));
        dispose();
        handlesRef.current.delete(handleRef);
      };

      const detach = () => {
        dispose();
        handlesRef.current.delete(handleRef);
      };

      return {
        overlayId: OVERLAY_ID,
        instanceId,
        callbackGroupId,
        close,
        dispose: detach,
      };
    },
    [dispatch],
  );

  return open;
}
