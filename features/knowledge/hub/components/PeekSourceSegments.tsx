"use client";

/**
 * A Source's OWN first Segments, read from the Source (`GET /document/{id}/chunks`)
 * — what the peek shows while browsing, when there is no search term for a
 * passage to have matched. A search's `top_segments` are passages that matched
 * the words typed; with nothing typed, showing them would pass off whatever the
 * browse happened to rank as "the top" of the document (found in the live walk).
 */

import { useEffect, useState } from "react";
import { Skeleton } from "@ai-matrx/design-system";
import { fetchDocumentChunks } from "@/features/rag/api/document";
import { describeBackendFailure } from "@/lib/api/errors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export const PEEK_FIRST_SEGMENTS = 3;

interface Segment {
  id: string;
  text: string;
  locator: string | null;
}

type ReadState =
  | { status: "loading" }
  | { status: "ready"; segments: Segment[] }
  | { status: "error"; message: string };

export function PeekSourceSegments({ sourceId }: { sourceId: string }) {
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    fetchDocumentChunks(sourceId, { parentOnly: true, limit: PEEK_FIRST_SEGMENTS })
      .then((rows) => {
        if (!live) return;
        const segments = [...rows]
          .sort((a, b) => a.chunk_index - b.chunk_index)
          .slice(0, PEEK_FIRST_SEGMENTS)
          .map((r) => ({
            id: r.chunk_id,
            text: r.content_text,
            locator: r.page_numbers?.length ? `p. ${r.page_numbers[0]}` : null,
          }));
        setState({ status: "ready", segments });
      })
      .catch((err: unknown) => {
        if (live) setState({ status: "error", message: describeBackendFailure(err).headline });
      });
    return () => {
      live = false;
    };
  }, [sourceId, attempt]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2" role="status" aria-label="Reading this Source's first Segments">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-5/6" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-center gap-2 text-xs text-destructive">
        <span className="min-w-0 flex-1">This Source&apos;s Segments could not be read: {state.message}</span>
        <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </button>
        <ErrorAlchemyMenu error={state.message} operation="Read a Source's first Segments" size="xs" />
      </div>
    );
  }
  if (!state.segments.length) {
    return <p className="text-xs text-muted-foreground">This Source has no Segments yet.</p>;
  }
  return (
    <ul className="space-y-2" data-testid="peek-source-segments">
      {state.segments.map((g) => (
        <li key={g.id} className="rounded-md border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm">
          <p className="line-clamp-4 leading-relaxed">{g.text}</p>
          {g.locator ? <p className="pt-1 text-[11px] text-muted-foreground">{g.locator}</p> : null}
        </li>
      ))}
    </ul>
  );
}
