"use client";

/**
 * Opener for the `smartCodeEditorWindow` overlay.
 *
 * Re-exports the canonical hand-written opener (full callback-aware API
 * via the callback registry). The codegen stub was replaced because it
 * dropped the handler contract.
 */
import { useEffect } from "react";
import {
  useOpenSmartCodeEditorWindow,
  type OpenSmartCodeEditorWindowOptions,
  type SmartCodeEditorWindowHandle,
} from "@/features/window-panels/windows/smart-code-editor/useOpenSmartCodeEditorWindow";

export {
  useOpenSmartCodeEditorWindow,
  type OpenSmartCodeEditorWindowOptions,
  type SmartCodeEditorWindowHandle,
};

export function SmartCodeEditorWindowController(
  props: OpenSmartCodeEditorWindowOptions,
): null {
  const open = useOpenSmartCodeEditorWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.windowInstanceId]);
  return null;
}
