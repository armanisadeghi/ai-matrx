"use client";

/**
 * useOpenCreateProjectWindow
 *
 * Imperative opener for `CreateProjectWindow`. Callers get back a handle that
 * can close the window or detach the callback group without closing.
 *
 * Usage:
 *
 *   const openCreateProject = useOpenCreateProjectWindow();
 *   const handle = openCreateProject({
 *     onCreated: (e) => selectProject(e.project.id, e.project.name),
 *   });
 *   // later
 *   handle.close();
 */

import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  createCreateProjectCallbackGroup,
  type CreateProjectWindowHandlers,
  type CreateProjectWindowData,
} from "./callbacks";

const OVERLAY_ID = "createProjectWindow";

export interface OpenCreateProjectWindowOptions extends CreateProjectWindowHandlers {
  /** Optional stable instance id. Omit for a unique new window each call. */
  instanceId?: string;
  /** Pre-set the owner org. `null` forces a Personal project. Omit to let the
   * user choose. When `orgLocked`, the owner selector is non-editable. */
  initialOrgId?: string | null;
  initialOrgSlug?: string | null;
  orgLocked?: boolean;
  /** When true (default for this window), don't offer a settings redirect. */
  skipRedirect?: boolean;
}

export interface CreateProjectWindowHandle {
  overlayId: string;
  instanceId: string;
  callbackGroupId: string;
  /** Close the window AND dispose the callback group. */
  close: () => void;
  /** Leave the window open; stop receiving events. */
  dispose: () => void;
}

type HandleRef = {
  instanceId: string;
  callbackGroupId: string;
  dispose: () => void;
};

export function useOpenCreateProjectWindow() {
  const dispatch = useAppDispatch();
  const handlesRef = useRef<Set<HandleRef>>(new Set());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      for (const h of handles) h.dispose();
      handles.clear();
    };
  }, []);

  return useCallback(
    (
      options: OpenCreateProjectWindowOptions = {},
    ): CreateProjectWindowHandle => {
      const instanceId =
        options.instanceId ??
        `${OVERLAY_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const { callbackGroupId, dispose } = createCreateProjectCallbackGroup({
        onCreated: options.onCreated,
        onAiCreated: options.onAiCreated,
        onWindowClose: options.onWindowClose,
        onEvent: options.onEvent,
      });

      const data: CreateProjectWindowData = {
        callbackGroupId,
        initialOrgId: options.initialOrgId ?? null,
        initialOrgSlug: options.initialOrgSlug ?? null,
        orgLocked: options.orgLocked ?? false,
        skipRedirect: options.skipRedirect ?? true,
      };
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
}
