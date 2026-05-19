"use client";

/**
 * Opener for the `multiFileSmartCodeEditorWindow` overlay.
 *
 * Re-exports the canonical hand-written opener (full callback-aware API).
 */
import { useEffect } from "react";
import {
  useOpenMultiFileSmartCodeEditorWindow,
  type OpenMultiFileSmartCodeEditorWindowOptions,
  type MultiFileSmartCodeEditorWindowHandle,
} from "@/features/window-panels/windows/multi-file-smart-code-editor/useOpenMultiFileSmartCodeEditorWindow";

export {
  useOpenMultiFileSmartCodeEditorWindow,
  type OpenMultiFileSmartCodeEditorWindowOptions,
  type MultiFileSmartCodeEditorWindowHandle,
};

export function MultiFileSmartCodeEditorWindowController(
  props: OpenMultiFileSmartCodeEditorWindowOptions,
): null {
  const open = useOpenMultiFileSmartCodeEditorWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.windowInstanceId]);
  return null;
}
