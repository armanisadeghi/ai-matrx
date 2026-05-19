"use client";

/**
 * Opener for the `contentEditorWindow` overlay.
 *
 * Re-exports the canonical hand-written opener. `useOpenContentEditorWindow`
 * is a single hook that routes to one of three overlays (window / list /
 * workspace) based on the options' `kind` field; each variant gets its own
 * file in this directory for discoverability.
 */
import { useEffect } from "react";
import {
  useOpenContentEditorWindow,
  type OpenContentEditorWindowOptions,
  type ContentEditorWindowHandle,
} from "@/features/window-panels/windows/content-editors/useOpenContentEditorWindow";

export {
  useOpenContentEditorWindow,
  type OpenContentEditorWindowOptions,
  type ContentEditorWindowHandle,
};

export function ContentEditorWindowController(
  props: OpenContentEditorWindowOptions,
): null {
  const open = useOpenContentEditorWindow();
  useEffect(() => {
    const handle = open({ variant: "editor", ...props });
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return null;
}
