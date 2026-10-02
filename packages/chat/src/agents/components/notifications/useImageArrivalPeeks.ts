/**
 * features/agents/components/notifications/useImageArrivalPeeks.ts
 *
 * Watches ALL active requests across the Redux store for new `image_output`
 * render blocks.  When a block arrives that hasn't been "announced" yet,
 * it's pushed onto the peek queue so `ImageArrivalPeekHost` can render it.
 *
 * Key design choices:
 *  - Unique key is `${requestId}:${blockId}` — blockIds reset to 0 on each
 *    new request (e.g. `data_image_output_9` appears in every request), so
 *    using blockId alone caused the second image to be silently dropped.
 *  - Module-level `announcedSet` (not a ref) survives component unmount /
 *    remount. The host overlay is closed when empty and reopened on next image;
 *    without module-level persistence already-dismissed images would reappear.
 *  - Maximum queue depth is capped at MAX_VISIBLE so stale peeks don't pile
 *    up when the user is away.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import type { UnifiedImageBlock } from "@/features/files/blocks/image/types";
import { isUnifiedImageBlock } from "@/features/files/blocks/image/guards";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PeekEntry {
  /** `${requestId}:${blockId}` — globally unique across all requests. */
  peekId: string;
  blockId: string;
  requestId: string;
  /** Canonical image block — every renderer in the app speaks this shape. */
  block: UnifiedImageBlock;
}

// ─── Module-level announced set ────────────────────────────────────────────────
// Survives component unmount/remount so already-dismissed images never reappear
// when the overlay closes and reopens on a subsequent image arrival.

const announcedSet = new Set<string>();

// ─── Selector ──────────────────────────────────────────────────────────────────

/**
 * Returns a flat, ordered list of every `image_output` render block across
 * all active requests, each carrying a canonical `UnifiedImageBlock`.
 * Memoized — only recomputes when `byRequestId` changes.
 */
const selectAllImageOutputBlocks = createSelector(
  (state: RootState) => state.activeRequests.byRequestId,
  (byRequestId): PeekEntry[] => {
    const results: PeekEntry[] = [];
    for (const [requestId, req] of Object.entries(byRequestId)) {
      if (!req) continue;
      for (const blockId of req.renderBlockOrder) {
        const block = req.renderBlocks[blockId];
        if (block?.type !== "image_output") continue;
        // process-stream.ts converts every image data event to a
        // UnifiedImageBlock before upserting, so block.data IS the
        // canonical shape. Prove it with the guard rather than force-cast
        // from the loose Redux storage shape — legacy payloads (no adapter
        // run) silently fail the guard and are skipped.
        if (!isUnifiedImageBlock(block.data)) continue;
        results.push({
          peekId: `${requestId}:${blockId}`,
          blockId,
          requestId,
          block: block.data,
        });
      }
    }
    return results;
  },
);

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Never stack more than this many peeks at once. */
const MAX_VISIBLE = 3;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface UseImageArrivalPeeksResult {
  /** The current queue of peek entries to display (max MAX_VISIBLE). */
  peeks: PeekEntry[];
  /** Call this when a peek card has finished its exit animation. */
  dismiss: (peekId: string) => void;
}

export function useImageArrivalPeeks(): UseImageArrivalPeeksResult {
  const allBlocks = useAppSelector(selectAllImageOutputBlocks);
  const [peeks, setPeeks] = useState<PeekEntry[]>([]);

  useEffect(() => {
    const newEntries = allBlocks.filter((b) => !announcedSet.has(b.peekId));

    if (newEntries.length === 0) return;

    for (const entry of newEntries) {
      announcedSet.add(entry.peekId);
    }

    setPeeks((prev) => {
      const combined = [...prev, ...newEntries];
      return combined.length > MAX_VISIBLE
        ? combined.slice(combined.length - MAX_VISIBLE)
        : combined;
    });
  }, [allBlocks]);

  const dismiss = useCallback((peekId: string) => {
    setPeeks((prev) => prev.filter((p) => p.peekId !== peekId));
  }, []);

  return { peeks, dismiss };
}
