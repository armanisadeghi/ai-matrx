"use client";

/**
 * useRequestSource — THE SEAM for putting a real agent run on a board.
 *
 * Give it an execution-system `requestId` (from launching an agent, a
 * shortcut, a workflow, or `adoptForeignStream`) and it returns a
 * `PacedSource` a tile renders exactly like a replay: through
 * `StreamTileBody` → `BlockRenderer`, paced by zoom. It reads the same
 * `activeRequests` row `MarkdownStream` reads, and — because a direct row
 * reader is a viewer (LIVE-RUN-RETENTION.md) — holds a viewer retention for as
 * long as the tile is mounted, so the run is never reaped under an open tile.
 *
 *   const source = useRequestSource(requestId, "spatial-tile");
 *   board.addTile({ id, title, rect, content: { type: "stream", stream: source } }, viewportCentre);
 */

import { useState } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  selectAllRenderBlocks,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useRetainRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { RequestStream } from "./stream-source";

export function useRequestSource(requestId: string, viewerLabel = "spatial-tile"): RequestStream<RootState> {
  const store = useAppStore();
  useRetainRequestForViewer(requestId, viewerLabel);
  // One source per request for the life of the tile (the selector factory is
  // memoized per call, so it is created once alongside the source).
  const [source] = useState(
    () =>
      new RequestStream<RootState>(
        store,
        selectAllRenderBlocks(requestId),
        selectRequestStatus(requestId),
        (s) => {
          const e = s.activeRequests.byRequestId[requestId]?.error;
          return e ? (e.user_message ?? e.message) : null;
        },
      ),
  );
  return source;
}
