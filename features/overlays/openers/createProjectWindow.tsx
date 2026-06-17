"use client";

/**
 * Opener for the `createProjectWindow` overlay.
 *
 * Re-exports the canonical hand-written opener (full callback-aware API via
 * the callback registry for `onCreated` / `onWindowClose`).
 *
 * Also exposes `<CreateProjectWindowController />` for the declarative form,
 * matching the convention every other opener uses.
 */
import { useEffect } from "react";
import {
  useOpenCreateProjectWindow,
  type OpenCreateProjectWindowOptions,
  type CreateProjectWindowHandle,
} from "@/features/window-panels/windows/projects/useOpenCreateProjectWindow";

export {
  useOpenCreateProjectWindow,
  type OpenCreateProjectWindowOptions,
  type CreateProjectWindowHandle,
};

export function CreateProjectWindowController(
  props: OpenCreateProjectWindowOptions,
): null {
  const open = useOpenCreateProjectWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.instanceId]);
  return null;
}
