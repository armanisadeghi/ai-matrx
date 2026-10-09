"use client";

/**
 * Opener for the `socialPostWindow` overlay (multi-instance).
 *
 * - `useOpenSocialPost()` — imperative hook. One post gets ONE deterministic
 *   instance id (its post id), so opening the same post twice FOCUSES the panel
 *   already floating instead of stacking a copy.
 * - `<SocialPostWindowController />` — declarative wrapper.
 *
 * Hand-maintained opener — see features/overlays/FEATURE.md.
 */

import { useCallback, useEffect } from "react";

import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  closeOverlay,
  openOverlay,
  selectOpenInstances,
} from "@/lib/redux/slices/overlaySlice";
import {
  focusWindow,
  restoreWindow,
} from "@/lib/redux/slices/windowManagerSlice";

const OVERLAY_ID = "socialPostWindow" as const;

export interface OpenSocialPostOptions {
  postId: string;
  /** Every media / transcript / refresh call names this organization. */
  organizationId: string;
  /** The brand's route segment (builds the creator link); "" outside a brand. */
  brandSeg?: string;
  /** Tab to open on: overview (default), transcript, metrics, breakdown. */
  tab?: string;
  /** The post is landscape (a regular YouTube video): the panel opens shorter. */
  landscape?: boolean;
}

export interface SocialPostHandle {
  close: () => void;
}

export function useOpenSocialPost() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  return useCallback(
    (opts: OpenSocialPostOptions): SocialPostHandle => {
      const instanceId = opts.postId;
      const handle = {
        close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
      const open = selectOpenInstances(store.getState(), OVERLAY_ID);
      if (open.some((inst) => inst.instanceId === instanceId)) {
        // Already floating: un-minimize and raise it, so the click never looks dead.
        dispatch(restoreWindow(instanceId));
        dispatch(focusWindow(instanceId));
        return handle;
      }
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: {
            stackIndex: open.length,
            postId: opts.postId,
            organizationId: opts.organizationId,
            brandSeg: opts.brandSeg ?? "",
            tab: opts.tab ?? "overview",
            landscape: opts.landscape ?? false,
          },
        }),
      );
      return handle;
    },
    [dispatch, store],
  );
}

/** Declarative form: opens the panel on mount, closes it on unmount. */
export function SocialPostWindowController(props: OpenSocialPostOptions): null {
  const open = useOpenSocialPost();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.postId, props.organizationId, props.brandSeg, props.tab]);
  return null;
}
