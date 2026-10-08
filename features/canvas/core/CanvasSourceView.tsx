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
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import type { CanvasContent } from "@/features/canvas/canvasContent";
import {
  isMaterializedArtifactId,
  readArtifactPointerId,
} from "@/features/canvas/artifact-types/artifactId";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import { isJsonObject } from "@/types/json";
import {
  htmlPageIdOf,
  resolveCanvasSourceFromData,
  type CanvasSourceText,
} from "./canvasSource";
import { getLatestDocumentSnapshot } from "@/features/documents/document-service";
import { isServiceFailure } from "@/features/data-tables/types";
import { univerDocToMarkdown } from "@/features/documents/univer-doc-to-markdown";

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

/**
 * A cloud document's source is its MARKDOWN, read back from the latest Univer
 * snapshot — never the `{ documentId }` pointer the canvas holds. The document
 * row is the truth; this view reads it the same way the editor does.
 */
function DocumentCanvasSource({ documentId }: { documentId: string }) {
  // Remounted (not reset with a setState) whenever the document or the retry
  // changes, so the load effect never has to push "loading" synchronously.
  const [attempt, setAttempt] = React.useState(0);
  return (
    <DocumentCanvasSourceLoad
      key={`${documentId}:${attempt}`}
      documentId={documentId}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function DocumentCanvasSourceLoad({
  documentId,
  onRetry,
}: {
  documentId: string;
  onRetry: () => void;
}) {
  const [state, setState] = React.useState<
    | { phase: "loading" }
    | { phase: "error"; reason: string }
    | { phase: "ready"; markdown: string }
  >({ phase: "loading" });

  React.useEffect(() => {
    let active = true;
    void (async () => {
      const res = await getLatestDocumentSnapshot(documentId);
      if (!active) return;
      if (isServiceFailure(res)) {
        setState({ phase: "error", reason: res.error });
        return;
      }
      const markdown = univerDocToMarkdown(res.data?.snapshot);
      setState({ phase: "ready", markdown });
    })();
    return () => {
      active = false;
    };
  }, [documentId]);

  if (state.phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <MatrxMiniLoader />
        <span className="sr-only">Loading document source</span>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <SourceUnavailable
        reason={`The document's content could not be read (${state.reason}).`}
        onRetry={onRetry}
      />
    );
  }
  if (!state.markdown.trim()) {
    return (
      <SourceUnavailable reason="This document is empty — there is no text to show yet." />
    );
  }
  return <SourceText source={{ text: state.markdown, language: "markdown" }} />;
}

/** A published HTML page's source: its stored document, read like its editor does. */
function HtmlPageCanvasSource({ pageId }: { pageId: string }) {
  const [attempt, setAttempt] = React.useState(0);
  return (
    <HtmlPageCanvasSourceLoad
      key={`${pageId}:${attempt}`}
      pageId={pageId}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function HtmlPageCanvasSourceLoad({
  pageId,
  onRetry,
}: {
  pageId: string;
  onRetry: () => void;
}) {
  const [state, setState] = React.useState<
    | { phase: "loading" }
    | { phase: "error"; reason: string }
    | { phase: "ready"; html: string }
  >({ phase: "loading" });

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { HTMLPageService } = await import(
          "@/features/html-pages/services/htmlPageService"
        );
        const page = (await HTMLPageService.getPage(pageId)) as {
          html_content?: unknown;
        };
        if (!active) return;
        setState({
          phase: "ready",
          html: typeof page?.html_content === "string" ? page.html_content : "",
        });
      } catch (error) {
        if (!active) return;
        setState({
          phase: "error",
          reason: error instanceof Error ? error.message : "unknown error",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [pageId]);

  if (state.phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <MatrxMiniLoader />
        <span className="sr-only">Loading page source</span>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <SourceUnavailable
        reason={`The page could not be read (${state.reason}).`}
        onRetry={onRetry}
      />
    );
  }
  if (!state.html.trim()) {
    return <SourceUnavailable reason="This page is empty." />;
  }
  return <SourceText source={{ text: state.html, language: "html" }} />;
}

export function CanvasSourceView({ content }: { content: CanvasContent }) {
  const pageId = htmlPageIdOf(content);
  // Keyed by the item's URL too: an edit republishes and bumps it, so the
  // source re-reads instead of showing the pre-edit document.
  if (pageId) {
    return (
      <HtmlPageCanvasSource
        key={typeof content.data === "string" ? content.data : pageId}
        pageId={pageId}
      />
    );
  }

  if (content.type === "udt_document") {
    const documentId =
      typeof content.data?.documentId === "string"
        ? content.data.documentId
        : "";
    if (!documentId) {
      return (
        <SourceUnavailable reason="This pane has no document id, so its source cannot be read." />
      );
    }
    return <DocumentCanvasSource documentId={documentId} />;
  }

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
