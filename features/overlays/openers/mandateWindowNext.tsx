"use client";

/**
 * Opener for the `mandateWindowNext` overlay — the NEW mandate window, built
 * beside `mandateWindow` while the owner compares them. Existing call sites
 * keep `useOpenMandateWindow`; nothing is repointed here.
 *
 * The window always lists every mandate the viewer can see; `initialMandateKey`
 * only chooses which one is selected, and `initialTab` which tab opens.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "mandateWindowNext" as const;

export interface OpenMandateWindowNextOptions {
  /** The mandate to select on open (key). */
  initialMandateKey?: string;
  /** The tab to open on (a record tab id, e.g. "holder"). */
  initialTab?: string;
}

export interface MandateWindowNextHandle {
  close: () => void;
}

export function useOpenMandateWindowNext() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenMandateWindowNextOptions = {}): MandateWindowNextHandle => {
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          data: {
            initialMandateKey: opts.initialMandateKey ?? null,
            initialTab: opts.initialTab ?? null,
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

/** Declarative form — opens on mount, closes on unmount. */
export function MandateWindowNextController(
  props: OpenMandateWindowNextOptions,
): null {
  const open = useOpenMandateWindowNext();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.initialMandateKey, props.initialTab]);
  return null;
}
