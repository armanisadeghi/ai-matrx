"use client";

/**
 * CanvasSourceView — the `Source` half of the canvas pane's view toggle.
 *
 * It prints the ITEM'S OWN SOURCE (see `canvasSource.ts`): the document's
 * markdown, the artifact's code, the structured artifact's markdown export.
 * Never the redux envelope — that used to ship to users verbatim, pointers and
 * message ids included, and is now admin-only in the artifact debug panel.
 *
 * A materialized item carries a POINTER (`{ artifactId }`), exactly as
 * `CanvasBody` does, so this view resolves the persisted row before reading a
 * source out of it — and when it cannot, it SAYS SO with a retry instead of
 * falling back to a dump.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { TapTargetButton } from "@ai-matrx/tap-target";
import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";
import {
  isMaterializedArtifactId,
  readArtifactPointerId,
} from "@/features/canvas/artifact-types/artifactId";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isJsonObject } from "@/types/json";
import {
  resolveCanvasSourceFromData,
  type CanvasSourceText,
} from "./canvasSource";

function SourceText({ source }: { source: CanvasSourceText }) {
  return (
    <div className="h-full p-2">
      <pre
        data-canvas-source-language={source.language}
        className="h-full overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground scrollbar-thin whitespace-pre-wrap break-words"
      >
        {source.text}
      </pre>
    </div>
  );
}

function SourceUnavailable({
  reason,
  onRetry,
}: {
  reason: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
        <div>
          <p className="text-sm font-medium text-foreground">
            No source to show
          </p>
          <p className="mt-1 text-xs">{reason}</p>
        </div>
        {onRetry && (
          <TapTargetButton
            icon={<RefreshCw className="h-4 w-4" />}
            label="Try again"
            ariaLabel="Try loading the source again"
            onClick={onRetry}
          />
        )}
      </div>
    </div>
  );
}

/** The persisted row's stored payload — same unwrapping `CanvasBody` uses. */
function readStoredData(stored: unknown): unknown {
  if (typeof stored === "string") return stored;
  if (isJsonObject(stored) && "data" in stored) return stored.data;
  return stored;
}

function PersistedCanvasSource({
  artifactId,
  type,
}: {
  artifactId: string;
  type: string;
}) {
  const { row, loading, error, refetch } = useCanvasItem(artifactId, {
    resolve: "latest",
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <MatrxMiniLoader />
        <span className="sr-only">Loading source</span>
      </div>
    );
  }

  if (error || !row) {
    return (
      <SourceUnavailable
        reason="The saved artifact could not be read, so its source is not available right now."
        onRetry={refetch}
      />
    );
  }

  const source = resolveCanvasSourceFromData(
    readStoredData(row.content),
    row.type ?? type,
  );
  if (!source) {
    return (
      <SourceUnavailable reason="This artifact has no text source of its own." />
    );
  }
  return <SourceText source={source} />;
}

export function CanvasSourceView({ content }: { content: CanvasContent }) {
  const pointerId = isMaterializedArtifactId(content.metadata?.canvasItemId)
    ? content.metadata?.canvasItemId
    : readArtifactPointerId(content.data);

  if (pointerId) {
    return <PersistedCanvasSource artifactId={pointerId} type={content.type} />;
  }

  const source = resolveCanvasSourceFromData(content.data, content.type);
  if (!source) {
    return (
      <SourceUnavailable reason="This item has no text source of its own." />
    );
  }
  return <SourceText source={source} />;
}

export default CanvasSourceView;
