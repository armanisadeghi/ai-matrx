"use client";

/**
 * Opener for the `linkRecordSheet` overlay — "Link a record…" on any record the right-click menu
 * targets (`features/rich-document/annotations/LinkRecordOverlay.tsx`). Data-only: the target is a
 * plain serializable `{ token, id, title }`. Mirrors `contextAssignment`.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "linkRecordSheet" as const;

export interface OpenLinkRecordSheetOptions {
  /** `tableId` / `organizationId`: a store record's, so record ↔ record links through its columns. */
  target: { token: string; id: string; title: string; tableId?: string; organizationId?: string };
}

export function useOpenLinkRecordSheet() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenLinkRecordSheetOptions) => {
      dispatch(openOverlay({ overlayId: OVERLAY_ID, data: { target: opts.target } }));
      return { close: () => dispatch(closeOverlay({ overlayId: OVERLAY_ID })) };
    },
    [dispatch],
  );
}
