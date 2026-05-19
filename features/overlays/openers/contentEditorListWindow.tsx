"use client";

/**
 * Opener for the `contentEditorListWindow` overlay.
 *
 * Routes through the shared `useOpenContentEditorWindow` hook. See
 * `contentEditorWindow.tsx` for the canonical hook.
 */
import { useEffect } from "react";
import {
  useOpenContentEditorWindow,
  type OpenContentEditorListWindowOptions,
  type ContentEditorWindowHandle,
} from "@/features/window-panels/windows/content-editors/useOpenContentEditorWindow";

export {
  useOpenContentEditorWindow,
  type OpenContentEditorListWindowOptions,
  type ContentEditorWindowHandle,
};

export function ContentEditorListWindowController(
  props: OpenContentEditorListWindowOptions,
): null {
  const open = useOpenContentEditorWindow();
  useEffect(() => {
    const handle = open({ variant: "list", ...props });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return null;
}
