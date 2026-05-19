"use client";

/**
 * Opener for the `contentEditorWorkspaceWindow` overlay.
 *
 * Routes through the shared `useOpenContentEditorWindow` hook. See
 * `contentEditorWindow.tsx` for the canonical hook.
 */
import { useEffect } from "react";
import {
  useOpenContentEditorWindow,
  type OpenContentEditorWorkspaceWindowOptions,
  type ContentEditorWindowHandle,
} from "@/features/window-panels/windows/content-editors/useOpenContentEditorWindow";

export {
  useOpenContentEditorWindow,
  type OpenContentEditorWorkspaceWindowOptions,
  type ContentEditorWindowHandle,
};

export function ContentEditorWorkspaceWindowController(
  props: OpenContentEditorWorkspaceWindowOptions,
): null {
  const open = useOpenContentEditorWindow();
  useEffect(() => {
    const handle = open({ variant: "workspace", ...props });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return null;
}
