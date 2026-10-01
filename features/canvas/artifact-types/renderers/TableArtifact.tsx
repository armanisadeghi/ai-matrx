"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { isMaterializedArtifactId } from "../artifactId";
import {
  useCanvasItem,
  CANVAS_ITEM_UPDATED_EVENT,
} from "@/features/canvas/hooks/useCanvasItem";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { canvasItemsService } from "@/features/canvas/services/canvasItemsService";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { deriveDatasetNameForChatTable, isPlaceholderTableTitle } from "@/features/data-tables/derive-dataset-name";
import { readTableDetails } from "@/features/data-tables/service";
import { useOpenUserTableWindow } from "@/features/overlays/openers/userTableWindow";
import { StreamingTableRenderer as StreamingTableRenderer } from "@/components/mardown-display/blocks/table/StreamingTableRenderer";
import LocatedTableViewer from "@/features/data-tables/components/LocatedTableViewer";
import type { ArtifactRendererProps } from "../types";
// The word a canvas link stores for "this artifact became a table" (canvas_items.external_system).
// Stored data, kept as written: changing it is a data change on the linked canvas rows.
const UDT_SYSTEM = "udt_datasets";

/**
 * Unified renderer for `table` artifacts.
 *
 * GOVERNING RULE: in the normal view a table renders and behaves EXACTLY as the
 * legacy `case "table"` did — the full `StreamingTableRenderer` toolbar (editing,
 * sort, export CSV/JSON, etc.) and inline-edit write-back to `cx_message.content`
 * (+ server-cache bust, so the model's next-turn history matches what the user
 * sees). The artifact layer only ADDS: a one-click **Convert to table** that
 * links a real table, after which the live table page renders from it (the markdown stays in the message for the agent's
 * history; further table edits flow to the agent as context, not history).
 *
 * No appearance/behavior change in the normal view beyond the Convert button.
 */
export default function TableArtifact({
  raw,
  data,
  metadata,
  artifactId,
  isStreamActive,
  onContentChange,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  const materialized = isMaterializedArtifactId(artifactId);

  // Streaming / inline (not yet a persisted artifact): identical to the old
  // `case "table"` — full toolbar (gated on metadata.isComplete) + inline edits
  // persisted to the message. No Convert button until there's a row to link.
  // Only bail on empty content HERE — the materialized path below loads its
  // markdown from the canvas row (via useCanvasItem), so it must not be gated
  // on a `content`/`raw` prop the canvas never passes (canvas opens with
  // `data: { artifactId }`, no raw string). Bailing early was why an opened
  // canvas panel rendered blank for a converted/materialized table.
  if (!materialized) {
    if (!content) return null;
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <StreamingTableRenderer
          content={content}
          metadata={metadata}
          isStreamActive={isStreamActive}
          onContentChange={onContentChange}
        />
      </Suspense>
    );
  }

  return (
    <TableArtifactMaterialized
      canvasItemId={artifactId as string}
      fallbackContent={content ?? ""}
      onContentChange={onContentChange}
    />
  );
}

function TableArtifactMaterialized({
  canvasItemId,
  fallbackContent,
  onContentChange,
}: {
  canvasItemId: string;
  fallbackContent: string;
  onContentChange?: (newContent: string) => void;
}) {
  const { row, loading, refetch } = useCanvasItem(canvasItemId);
  const [reverting, setReverting] = useState(false);
  const openTableWindow = useOpenUserTableWindow();

  const linkedTableId =
    row?.external_system === UDT_SYSTEM && row?.external_id
      ? row.external_id
      : null;

  // The linked table's own name, for the window's title (see `tableTitle` below).
  const [linkedName, setLinkedName] = useState<string | null>(null);
  useEffect(() => {
    if (!linkedTableId) return;
    let alive = true;
    void readTableDetails(linkedTableId).then((answer) => {
      if (alive && answer.success && answer.table?.name) setLinkedName(answer.table.name);
    });
    return () => {
      alive = false;
    };
  }, [linkedTableId]);

  // Current markdown from the persisted row (falls back to what the caller
  // passed while the row loads).
  const content = useMemo(() => {
    const stored = row?.content as
      { data?: unknown } | string | null | undefined;
    if (
      stored &&
      typeof stored === "object" &&
      "data" in stored &&
      typeof stored.data === "string"
    ) {
      return stored.data;
    }
    if (typeof stored === "string") return stored;
    return fallbackContent;
  }, [row, fallbackContent]);

  // Persist an inline edit. Update the message (so the model's history matches)
  // when the chat threaded a write-back; ALSO keep the canvas row in sync so the
  // artifact context + render-by-id reflect it. Either path alone is safe.
  const persistEdit = useCallback(
    (updatedMarkdown: string) => {
      onContentChange?.(updatedMarkdown);
      void canvasItemsService
        .update(canvasItemId, {
          content: { data: updatedMarkdown, type: "table", metadata: {} },
        })
        .then(() => {
          window.dispatchEvent(
            new CustomEvent(CANVAS_ITEM_UPDATED_EVENT, {
              detail: { rootId: canvasItemId, latestId: canvasItemId },
            }),
          );
        });
    },
    [canvasItemId, onContentChange],
  );

  // THE ARTIFACT BECOMES A LIVE TABLE through the ONE "Save to a table" (SAVE-AS-TABLE-EVERYWHERE,
  // 2026-09-29; the handover row-7 seed made it here with its own create path). The name offered is
  // the conversation's; the rows go through the store's import doors; when they land — a new table
  // or rows added to one the person has — the artifact links itself to that table.
  const resolveTitle = useCallback(async () => {
    const parsed = parseMarkdownTable(content);
    return deriveDatasetNameForChatTable({
      sourceMessageId: row?.source_message_id,
      canvasItemId,
      artifactTitle: row?.title,
      tableMarkdown: content,
      headers: parsed?.headers ?? [],
    });
  }, [content, row, canvasItemId]);

  const linkToSavedTable = useCallback(
    async (tableId: string) => {
      await canvasArtifactService.setExternalLink(canvasItemId, {
        externalSystem: UDT_SYSTEM,
        externalId: tableId,
      });
      toast.success("This table is live now");
      refetch();
    },
    [canvasItemId, refetch],
  );

  // Revert a converted table back to the editable text table — unlink the UDT
  // dataset (it is kept, not deleted; the original markdown lives in
  // canvas_items.content). The user always has a way back.
  const handleRevert = useCallback(async () => {
    setReverting(true);
    try {
      await canvasArtifactService.setExternalLink(canvasItemId, {});
      toast.success("Reverted to the editable text table");
      refetch();
    } finally {
      setReverting(false);
    }
  }, [canvasItemId, refetch]);

  if (loading && !row) {
    return <MatrxMiniLoader />;
  }

  // Linked → the real, live table is the source of truth. A quiet Revert action
  // unlinks it back to the text table.
  if (linkedTableId) {
    // THE WINDOW IS TITLED BY THE TABLE (lane HANDOVER, 2026-09-29): the chat artifact's own title
    // is the canvas placeholder "Table 1", while the table it became is named for the conversation.
    const artifactTitle = (typeof row?.title === "string" && row.title) || "";
    const tableTitle =
      artifactTitle && !isPlaceholderTableTitle(artifactTitle) ? artifactTitle : linkedName || artifactTitle || "Table";
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <LocatedTableViewer
          tableId={linkedTableId}
          // The table draws records-ui's page: the three actions sit in its one menu.
          recordStoreMenuExtras={[
            {
              key: "artifact-window",
              label: "Open in a floating window",
              onSelect: () => openTableWindow({ tableId: linkedTableId, title: tableTitle }),
            },
            {
              key: "artifact-new-tab",
              label: "Open the full table in a new tab",
              onSelect: () => window.open(`/data/${linkedTableId}`, "_blank", "noopener,noreferrer"),
            },
            ...(reverting
              ? []
              : [{ key: "artifact-revert", label: "Revert to text", onSelect: () => void handleRevert() }]),
          ]}
        />
      </Suspense>
    );
  }

  // Non-linked → full markdown table toolbar; "Save to ▸ A table…" makes it live.
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StreamingTableRenderer
        content={content}
        metadata={{ isComplete: true }}
        onContentChange={persistEdit}
        saveAsTable={{ resolveTitle, onSaved: (tableId) => linkToSavedTable(tableId) }}
      />
    </Suspense>
  );
}
