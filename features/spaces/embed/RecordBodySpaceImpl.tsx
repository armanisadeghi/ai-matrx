"use client";

// features/spaces/embed/RecordBodySpaceImpl.tsx — the heavy half of <RecordBodySpace>: the Spaces editor
// (BlockNote) and SpacesProvider for a row whose body Space was found. Never import this directly — the
// shell RecordBodySpace.tsx is the only door and loads it through ONE next/dynamic edge (ssr: false), so
// record pages without a body Space never fetch or compile the editor into their graph.

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { toast } from "@/lib/toast";

import "@blocknote/shadcn/style.css";
import "../spaces.css";

import type { SpaceDoc } from "../contract";
import { useSourcePicker } from "../data/SourcePicker";
import type { SpacesEditor } from "../editor/schema";
import { SpaceEditor } from "../editor/SpaceEditor";
import { SpacesProvider, useSpaces } from "../state/SpacesProvider";

export interface RecordBodySpaceImplProps {
  spaceId: string;
  readOnly: boolean;
  fallback: ReactNode;
}

/** The found body Space, drawn with full editing and autosave. */
export default function RecordBodySpaceImpl({ spaceId, readOnly, fallback }: RecordBodySpaceImplProps) {
  return (
    <SpacesProvider>
      {/* .spaces-root carries the Spaces palette and type the editor draws with. */}
      <div className="spaces-root spaces-row-body">
        <BodyEditor spaceId={spaceId} readOnly={readOnly} fallback={fallback} />
      </div>
    </SpacesProvider>
  );
}

function BodyEditor({ spaceId, readOnly, fallback }: { spaceId: string; readOnly: boolean; fallback: ReactNode }) {
  const { store, createSpace } = useSpaces();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  const [sourcePicker, pickSource] = useSourcePicker(spaceId);
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
          newDatabase: async () => {
            toast.info("Open this page in Spaces to add a new database.");
            return null;
          },
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
