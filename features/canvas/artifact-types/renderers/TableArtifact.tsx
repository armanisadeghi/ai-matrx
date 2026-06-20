"use client";

import React, { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { Table2 } from "lucide-react";
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
 * Unified renderer for `table` artifacts — the original UDT-tables insight made
 * live (vision R6/R7).
 *
 * Tables do NOT auto-bind to a real dataset (agents emit tables constantly →
 * binding each would flood the user's table list). Instead a materialized table
 * is an editable, persisted markdown table; inline edits round-trip to the
 * artifact (so they survive reload AND the agent's read-only artifact context
 * sees the current values next turn). An explicit one-click **Convert to table**
 * creates a real `udt_datasets` dataset (named from the artifact title, no
 * dialog) and links it — after which the live, realtime, two-way
 * `UserTableViewer` is the source of truth and the markdown is gone.
 *
 * Mirrors the data-touching pattern of `TasksArtifact` (proposal → Convert →
 * live mirror). CSV rides the same path (a CSV block parses as a table).
 */
export default function TableArtifact({
  raw,
  data,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;

  // Pre-materialization (streaming / inline): editable markdown table only —
  // there is no persisted row to link or version against yet.
  if (!isMaterializedArtifactId(artifactId)) {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <StreamingTableRenderer content={content} isStreamActive={isStreamActive} />
      </Suspense>
    );
  }

  return (
    <TableArtifactMaterialized
      canvasItemId={artifactId as string}
      fallbackContent={content}
    />
  );
}

function TableArtifactMaterialized({
  canvasItemId,
  fallbackContent,
}: {
  canvasItemId: string;
  fallbackContent: string;
}) {
  const { row, loading, refetch } = useCanvasItem(canvasItemId);
  const [converting, setConverting] = useState(false);

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

  // Persist an inline edit to the artifact in place. Versioning of canvas-content
  // edits is unified in Wave 4; a table gets the UDT's own row-versioning once
  // converted, which is the versioning that matters for tabular data.
  const persistEdit = useCallback(
    (updatedMarkdown: string) => {
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
    [canvasItemId],
  );

  const handleConvert = useCallback(async () => {
    const parsed = parseMarkdownTable(content);
    if (!parsed || parsed.headers.length === 0) {
      toast.error("Couldn't read this table's columns to convert.");
      return;
    }
    setConverting(true);
    try {
      const name = row?.title?.trim() || "Table from chat";
      const result = await createDatasetFromTable({
        name,
        description: "Created from a chat table",
        headers: parsed.headers,
        rows: parsed.normalizedData,
      });
      if (result.success && result.tableId) {
        await canvasArtifactService.setExternalLink(canvasItemId, {
          externalSystem: UDT_SYSTEM,
          externalId: result.tableId,
        });
        toast.success(
          `Converted to a live table (${result.inserted} row${
            result.inserted !== 1 ? "s" : ""
          })`,
          { description: "Edits here and in /data now sync both ways." },
        );
        refetch();
      } else {
        toast.error(`Convert failed: ${result.error ?? "unknown error"}`);
      }
    } finally {
      setConverting(false);
    }
  }, [content, row?.title, canvasItemId, refetch]);

  if (loading && !row) {
    return <MatrxMiniLoader />;
  }

  // Linked → the real, live, realtime two-way UDT table is the source of truth.
  if (linkedTableId) {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <UserTableViewer tableId={linkedTableId} />
      </Suspense>
    );
  }

  // Non-linked → editable markdown table + one-click Convert.
  return (
    <div className="space-y-2">
      <Suspense fallback={<MatrxMiniLoader />}>
        <StreamingTableRenderer content={content} onContentChange={persistEdit} />
      </Suspense>
      <div className="flex items-center justify-end border-t border-border/40 px-1 pt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={handleConvert}
          disabled={converting}
        >
          <Table2 className="h-3.5 w-3.5" />
          {converting ? "Converting…" : "Convert to table"}
        </Button>
      </div>
    </div>
  );
}
