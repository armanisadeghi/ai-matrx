"use client";

// features/spaces/embed/RecordBodySpace.tsx — a custom-table row's body page, drawn in the Spaces editor.
//
// For records-ui's `renderRecordBody` port (@ai-matrx/records-ui ≥ 0.101.15): a row's body is the Space
// linked to it by the association `record → document`, label `row_body` (BLOCK-SCHEMA § Row body). When
// the row has one, this draws it with full Notion editing and autosave (compare-and-swap on the Space's
// version, exactly like a Space page); when it has none — while the lookup is loading, when it fails, or
// when the reader cannot open it — it draws `fallback` (the record page's own body), so the record page
// always shows a body. A failed lookup is also reported to the error capture. The database decides
// access; this reads, never gates. It mounts no QuickFind: Cmd+K stays the host page's.
//
// `renderRecordBody` is called synchronously, so a host that must return `null` for a row with no body
// before the lookup lands uses `useRowBodySpace(recordId)` itself and mounts <RecordBodySpace> only for
// `state === "found"`.
//
// BUILD GRAPH (code-splitting Method B): this shell stays cheap — the lookup, the props type and ONE
// next/dynamic edge to RecordBodySpaceImpl (editor + SpacesProvider), which loads only once a body Space
// is found. Add no other import of the editor here, and no second dynamic edge.

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { createClient } from "@/utils/supabase/client";

const RecordBodySpaceImpl = dynamic(() => import("./RecordBodySpaceImpl"), {
  ssr: false,
  loading: () => <RegionSkeleton shape="rows" count={4} aria-label="Loading the page" />,
});

export const ROW_BODY_LABEL = "row_body";

export type RowBodyState = { state: "loading" } | { state: "none" } | { state: "found"; spaceId: string } | { state: "failed"; message: string };

const LOADING: RowBodyState = { state: "loading" };

/** The Space that is this row's body (one live body per row), as the reader may see it. */
export function useRowBodySpace(recordId: string): RowBodyState {
  // The answer is kept with the row it answers: a new recordId reads as loading until its own answer
  // lands, with no reset written from the effect.
  const [answer, setAnswer] = useState<{ recordId: string; state: RowBodyState } | null>(null);
  useEffect(() => {
    let live = true;
    const setFound = (state: RowBodyState) => setAnswer({ recordId, state });
    void (async () => {
      const { data, error } = await createClient()
        .schema("platform")
        .from("associations")
        .select("target_id")
        .eq("source_type", "record")
        .eq("source_id", recordId)
        .eq("target_type", "document")
        .eq("label", ROW_BODY_LABEL)
        .is("deleted_at", null)
        .maybeSingle();
      if (!live) return;
      if (error) {
        captureError({
          source: "supabase-postgrest",
          operation: "select",
          schema: "platform",
          relation: "associations",
          code: error.code,
          message: `Row body Space lookup failed: ${error.message}`,
          details: error.details ?? undefined,
          hint: error.hint ?? undefined,
          callSite: "features/spaces/embed/RecordBodySpace.tsx useRowBodySpace",
        });
        setFound({ state: "failed", message: error.message });
      }
      else setFound(data ? { state: "found", spaceId: data.target_id } : { state: "none" });
    })();
    return () => {
      live = false;
    };
  }, [recordId]);
  return answer?.recordId === recordId ? answer.state : LOADING;
}

export interface RecordBodySpaceProps {
  tableId: string;
  recordId: string;
  /** The record as the record page read it (unused today; the body is found by the record's id). */
  record?: unknown;
  readOnly: boolean;
  /** The record page's own body: drawn while the lookup loads, when it fails, and when there is no body Space. */
  fallback?: ReactNode;
}

/** The row's body Space in the Spaces editor, or `fallback` (default nothing) when the row has no body Space. */
export function RecordBodySpace({ recordId, readOnly, fallback = null }: RecordBodySpaceProps) {
  const body = useRowBodySpace(recordId);
  // Loading, failed (reported above) or none: the record page's own body, never an empty one.
  if (body.state !== "found") return <>{fallback}</>;
  return (
    <ImplBoundary fallback={fallback}>
      <RecordBodySpaceImpl spaceId={body.spaceId} readOnly={readOnly} fallback={fallback} />
    </ImplBoundary>
  );
}

/** The editor chunk failed to load or threw: report it, and draw the record page's own body. */
class ImplBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    captureReactRenderError(error, {
      boundary: "RecordBodySpace",
      componentStack: info.componentStack,
      modulePath: "features/spaces/embed/RecordBodySpaceImpl",
    });
  }
  override render() {
    return this.state.failed ? <>{this.props.fallback}</> : this.props.children;
  }
}
