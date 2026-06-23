"use client";

import React, { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { Button } from "@/components/ui/button";
import { type ArtifactRendererProps } from "../artifact-renderers";
import { isMaterializedArtifactId } from "../artifactId";
import {
  useCanvasItem,
  CANVAS_ITEM_UPDATED_EVENT,
} from "@/features/canvas/hooks/useCanvasItem";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { canvasItemsService } from "@/features/canvas/services/canvasItemsService";
import { parseMarkdownTable } from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { createDatasetFromTable } from "@/features/data-tables/create-dataset-from-table";
import { deriveDatasetNameForChatTable } from "@/features/data-tables/derive-dataset-name";

const StreamingTableRenderer = lazy(() =>
  import("@/components/mardown-display/blocks/table/StreamingTableRenderer").then(
    (m) => ({ default: m.StreamingTableRenderer }),
  ),
);
const UserTableViewer = lazy(
  () => import("@/components/user-generated-table-data/UserTableViewer"),
);

const UDT_SYSTEM = "udt_datasets";

/**
 * Unified renderer for `table` artifacts.
 *
 * GOVERNING RULE: in the normal view a table renders and behaves EXACTLY as the
 * legacy `case "table"` did — the full `StreamingTableRenderer` toolbar (editing,
 * sort, export CSV/JSON, etc.) and inline-edit write-back to `cx_message.content`
 * (+ server-cache bust, so the model's next-turn history matches what the user
 * sees). The artifact layer only ADDS: a one-click **Convert to table** that
 * links a real `udt_datasets` row, after which the live realtime `UserTableViewer`
 * renders from the dataset (the markdown stays in the message for the agent's
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
  if (!content) return null;

  // Streaming / inline (not yet a persisted artifact): identical to the old
  // `case "table"` — full toolbar (gated on metadata.isComplete) + inline edits
  // persisted to the message. No Convert button until there's a row to link.
  if (!isMaterializedArtifactId(artifactId)) {
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
      fallbackContent={content}
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
  const [converting, setConverting] = useState(false);
  const [reverting, setReverting] = useState(false);

  const linkedTableId =
    row?.external_system === UDT_SYSTEM && row?.external_id
      ? row.external_id
      : null;

  // Current markdown from the persisted row (falls back to what the caller
  // passed while the row loads).
  const content = useMemo(() => {
    const stored = row?.content as
      | { data?: unknown }
      | string
      | null
      | undefined;
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

  const handleConvert = useCallback(async () => {
    const parsed = parseMarkdownTable(content);
    if (!parsed || parsed.headers.length === 0) {
      toast.error("Couldn't read this table's columns to convert.");
      return;
    }
    setConverting(true);
    try {
      const name = await deriveDatasetNameForChatTable({
        sourceMessageId: row?.source_message_id,
        canvasItemId,
        artifactTitle: row?.title,
        tableMarkdown: content,
        headers: parsed.headers,
      });
      const result = await createDatasetFromTable({
        name,
        headers: parsed.headers,
        rows: parsed.normalizedData,
      });
      if (result.success && result.tableId) {
        await canvasArtifactService.setExternalLink(canvasItemId, {
          externalSystem: UDT_SYSTEM,
          externalId: result.tableId,
        });
        toast.success("Converted to a live table");
        refetch();
      } else {
        toast.error(`Convert failed: ${result.error ?? "unknown error"}`);
      }
    } finally {
      setConverting(false);
    }
  }, [content, row, canvasItemId, refetch]);

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

  // Linked → the real, live, realtime two-way UDT table is the source of truth.
  // It carries markdown from the chat table, so render cells as rich text; the
  // chat artifact provides the context, so suppress the table's own title header
  // (no double title). A quiet Revert action unlinks it back to the text table.
  if (linkedTableId) {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <UserTableViewer
          tableId={linkedTableId}
          renderCellMarkdown
          hideHeader
          toolbarTrailing={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
              onClick={handleRevert}
              disabled={reverting}
            >
              <Undo2 className="h-3.5 w-3.5" />
              {reverting ? "Reverting…" : "Revert to text"}
            </Button>
          }
        />
      </Suspense>
    );
  }

  // Non-linked → full markdown table toolbar, including one-click convert.
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StreamingTableRenderer
        content={content}
        metadata={{ isComplete: true }}
        onContentChange={persistEdit}
        convertToTable={{
          onClick: handleConvert,
          busy: converting,
        }}
      />
    </Suspense>
  );
}
