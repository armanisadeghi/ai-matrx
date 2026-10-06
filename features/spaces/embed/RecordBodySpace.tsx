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

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";

import "@blocknote/shadcn/style.css";
import "../spaces.css";

import type { SpaceDoc } from "../contract";
import { useSourcePicker } from "../data/SourcePicker";
import type { SpacesEditor } from "../editor/schema";
import { SpaceEditor } from "../editor/SpaceEditor";
import { SpacesProvider, useSpaces } from "../state/SpacesProvider";

export const ROW_BODY_LABEL = "row_body";

export type RowBodyState = { state: "loading" } | { state: "none" } | { state: "found"; spaceId: string } | { state: "failed"; message: string };

/** The Space that is this row's body (one live body per row), as the reader may see it. */
export function useRowBodySpace(recordId: string): RowBodyState {
  const [found, setFound] = useState<RowBodyState>({ state: "loading" });
  useEffect(() => {
    let live = true;
    setFound({ state: "loading" });
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
  return found;
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
    <SpacesProvider>
      {/* .spaces-root carries the Spaces palette and type the editor draws with. */}
      <div className="spaces-root spaces-row-body">
        <BodyEditor spaceId={body.spaceId} readOnly={readOnly} fallback={fallback} />
      </div>
    </SpacesProvider>
  );
}

function BodyEditor({ spaceId, readOnly, fallback }: { spaceId: string; readOnly: boolean; fallback: ReactNode }) {
  const { store, createSpace } = useSpaces();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  const [sourcePicker, pickSource] = useSourcePicker();
  const editorRef = useRef<SpacesEditor | null>(null);
  const docRef = useRef<SpaceDoc | null>(null);
  const base = useRef(0);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const [origin] = useState(() => crypto.randomUUID());

  const adopt = (d: SpaceDoc) => {
    docRef.current = d;
    base.current = d.version;
    setDoc(d);
  };

  useEffect(() => {
    let live = true;
    void store.get(spaceId).then(
      (d) => live && (d ? adopt(d) : setDoc(null)),
      () => live && setDoc(null),
    );
    return () => {
      live = false;
    };
  }, [store, spaceId]);

  const flush = async (): Promise<void> => {
    timer.current = null;
    if (inFlight.current || !pending.current || !docRef.current) return;
    pending.current = false;
    inFlight.current = true;
    try {
      const saved = await store.saveFrom(origin, docRef.current, base.current);
      base.current = saved.version;
      if (docRef.current) docRef.current = { ...docRef.current, version: saved.version, updatedAt: saved.updatedAt };
    } catch (err) {
      const latest = await store.get(spaceId).catch(() => null);
      if (latest && latest.version !== base.current) {
        // Someone else saved first: never write over them.
        pending.current = false;
        adopt(latest);
        setRound((r) => r + 1);
        toast.warning("This page was changed somewhere else. Showing the latest version; your last edit was not saved.");
      } else {
        pending.current = true;
        toast.error(err instanceof Error && err.message ? err.message : "We couldn't save this page.");
      }
    } finally {
      inFlight.current = false;
      if (pending.current && !timer.current) timer.current = window.setTimeout(() => void flush(), 1000);
    }
  };

  // Leaving the record page saves what is pending.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      void flushRef.current();
    },
    [],
  );

  if (doc === undefined) return <RegionSkeleton shape="rows" count={4} aria-label="Loading the page" />;
  // The reader cannot open the body Space (or it is gone): the record page's own body.
  if (doc === null) return <>{fallback}</>;
  const editable = !readOnly && !doc.settings.locked && !doc.isArchived;

  return (
    <>
      <SpaceEditor
        key={`${doc.id}:${round}`}
        spaceId={doc.id}
        initialBlocks={doc.blocks}
        editable={editable}
        onChange={(blocks) => {
          if (!docRef.current) return;
          docRef.current = { ...docRef.current, blocks };
          pending.current = true;
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void flush(), 400);
        }}
        onReady={(editor) => {
          editorRef.current = editor;
        }}
        slash={{
          createSubpage: async () => (await createSpace(doc.id, { open: false })).id,
          // No page picker here (no QuickFind on a record page: Cmd+K stays the host's).
          pickPage: async () => {
            toast.info("Open this page in Spaces to link another page.");
            return null;
          },
          pickSource,
        }}
        menu={{
          moveBlocksTo: () => toast.info("Open this page in Spaces to move blocks to another page."),
          turnIntoPageIn: () => toast.info("Open this page in Spaces to turn blocks into a page."),
          askAi: () => toast.info("AI is not connected yet"),
        }}
      />
      {sourcePicker}
    </>
  );
}
