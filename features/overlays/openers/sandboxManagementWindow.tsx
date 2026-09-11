"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "sandboxManagementWindow" as const;

export interface OpenSandboxManagementWindowOptions {
  /** Sandbox row UUID, never the display-friendly sbx-XXX identifier. */
  sandboxId: string;
  /** A display label for the window title. */
  title?: string;
}

export interface SandboxManagementWindowHandle {
  close: () => void;
}

export function useOpenSandboxManagementWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenSandboxManagementWindowOptions): SandboxManagementWindowHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            sandboxId: opts.sandboxId,
            title: opts.title ?? null,
          },
        }),
      );
      return {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })),
      };
    },
    [dispatch],
  );
}

/** Opens while mounted and closes when the owning view unmounts. */
export function SandboxManagementWindowController(
  props: OpenSandboxManagementWindowOptions,
): null {
  const open = useOpenSandboxManagementWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.sandboxId, props.title]);
  return null;
}
