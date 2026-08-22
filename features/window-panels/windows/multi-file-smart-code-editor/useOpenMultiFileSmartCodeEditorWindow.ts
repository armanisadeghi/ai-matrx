"use client";

/**
 * useOpenMultiFileSmartCodeEditorWindow
 *
 * Imperative helper for the multi-file Smart Code Editor window. Mirrors
 * `useOpenSmartCodeEditorWindow` but takes a file set and exposes file-
 * aware event handlers (`onFileChange`, `onActiveFileChange`, …).
 *
 * Handlers live outside Redux: the hook wires them into a callback
 * group and threads the group id through the overlay's `data` payload.
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay, closeOverlay } from "@/lib/redux/slices/overlaySlice";
import type { CodeFile } from "@/features/code-editor/multi-file-core/types";
import {
  createMultiFileSmartCodeEditorCallbackGroup,
  type MultiFileSmartCodeEditorWindowHandlers,
} from "./callbacks";

export interface OpenMultiFileSmartCodeEditorWindowOptions extends MultiFileSmartCodeEditorWindowHandlers {
  /**
   * Stable instance id. Omit to get a fresh, unique window every call.
   */
  windowInstanceId?: string;

  /** The JOB to launch (`agent.mandate` key) — never an agent id. Required. */
  mandateKey: string;
  /** Initial file set. */
  files: CodeFile[];
  /** Which file starts active (defaults to `files[0]`). */
  initialActiveFile?: string | null;
  /** Editor header + WindowPanel title. */
  title?: string | null;
  defaultWordWrap?: "on" | "off";
  autoFormatOnOpen?: boolean;
  /** Optional per-turn variable seed forwarded to `launchAgentExecution`. */
  variables?: Record<string, unknown>;
}

const OVERLAY_ID = "multiFileSmartCodeEditorWindow";

type HandleRef = {
  instanceId: string;
  callbackGroupId: string;
  dispose: () => void;
};

export interface MultiFileSmartCodeEditorWindowHandle {
  overlayId: string;
  instanceId: string;
  callbackGroupId: string;
  close: () => void;
  dispose: () => void;
}

export function useOpenMultiFileSmartCodeEditorWindow() {
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
      options: OpenMultiFileSmartCodeEditorWindowOptions,
    ): MultiFileSmartCodeEditorWindowHandle => {
      const instanceId =
        options.windowInstanceId ?? `${OVERLAY_ID}-${Date.now()}`;

      const { callbackGroupId, dispose } =
        createMultiFileSmartCodeEditorCallbackGroup({
          onReady: options.onReady,
          onLaunched: options.onLaunched,
          onActiveFileChange: options.onActiveFileChange,
          onFileChange: options.onFileChange,
          onFileOpen: options.onFileOpen,
          onFileClose: options.onFileClose,
          onAgentComplete: options.onAgentComplete,
          onAgentError: options.onAgentError,
          onWindowClose: options.onWindowClose,
          onEvent: options.onEvent,
        });

      const data: Record<string, unknown> = {
        callbackGroupId,
        mandateKey: options.mandateKey,
        files: options.files,
        initialActiveFile: options.initialActiveFile ?? null,
        title: options.title ?? null,
        defaultWordWrap: options.defaultWordWrap ?? "off",
        autoFormatOnOpen: options.autoFormatOnOpen ?? false,
      };
      if (options.variables !== undefined) data.variables = options.variables;

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
