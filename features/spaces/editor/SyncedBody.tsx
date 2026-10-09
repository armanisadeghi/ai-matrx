"use client";

// features/spaces/editor/SyncedBody.tsx — the editable body of a synced block (C18): the source Space's blocks in
// their own editor, saved to the source (version-guarded) and re-read when anyone else saves it — another copy in
// this tab (the store's change events) or another person (the source's realtime row).
// Loaded through next/dynamic from synced-block.tsx (the page editor's schema cannot import the editor itself).

import { useEffect, useRef, useState } from "react";

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";

import type { SpaceBlock, SpaceDoc } from "../contract";
import { useSpaces } from "../state/SpacesProvider";
import type { SpacesEditor } from "./schema";
import { SpaceEditor } from "./SpaceEditor";

export interface SyncedBodyProps {
  sourceId: string;
  editable: boolean;
  /** The source as read (Unsync keeps these blocks). */
  onDoc?: (doc: SpaceDoc | null) => void;
}

export default function SyncedBody({ sourceId, editable, onDoc }: SyncedBodyProps) {
  const { store, createSpace } = useSpaces();
  const [doc, setDoc] = useState<SpaceDoc | null | undefined>(undefined);
  const [round, setRound] = useState(0);
  const docRef = useRef<SpaceDoc | null>(null);
  const base = useRef(0);
  const pending = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const editorRef = useRef<SpacesEditor | null>(null);
  const [origin] = useState(() => `synced:${crypto.randomUUID()}`);
  const onDocRef = useRef(onDoc);
  onDocRef.current = onDoc;

  const adopt = (d: SpaceDoc, redraw: boolean) => {
    docRef.current = d;
    base.current = d.version;
    setDoc(d);
    onDocRef.current?.(d);
    if (redraw) setRound((r) => r + 1);
  };

  useEffect(() => {
    let live = true;
    void store.get(sourceId).then(
      (d) => {
        if (!live) return;
        if (d) adopt(d, false);
        else {
          setDoc(null);
          onDocRef.current?.(null);
        }
      },
      () => live && setDoc(null),
    );
    // Someone else's save of the source: take it when nothing of ours is waiting.
    const take = (d: SpaceDoc) => {
      if (!live || d.id !== sourceId || d.version <= base.current || pending.current || inFlight.current) return;
      adopt(d, true);
    };
    const offLocal = store.onChange((change) => {
      if (change.kind === "saved" && change.origin !== origin) take(change.doc);
    });
    const offRemote = store.subscribe(sourceId, take);
    return () => {
      live = false;
      offLocal();
      offRemote();
    };
    // adopt is stable in effect (refs only).
  }, [store, sourceId, origin]);

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
      const latest = await store.get(sourceId).catch(() => null);
      if (latest && latest.version !== base.current) {
        pending.current = false;
        adopt(latest, true);
        toast.warning("This synced block was changed somewhere else. Showing the latest version.");
      } else {
        pending.current = true;
        toast.error(err instanceof Error && err.message ? err.message : "We couldn't save this synced block.");
      }
    } finally {
      inFlight.current = false;
      if (pending.current && !timer.current) timer.current = window.setTimeout(() => void flush(), 1000);
    }
  };
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

  if (doc === undefined) return <RegionSkeleton shape="rows" count={2} aria-label="Loading the synced block" />;
  if (doc === null) return <div className="spaces-synced-missing">The original of this synced block can’t be opened.</div>;
  const canEdit = editable && !doc.isArchived;
  return (
    <SpaceEditor
      key={`${doc.id}:${round}`}
      spaceId={doc.id}
      initialBlocks={doc.blocks}
      editable={canEdit}
      onChange={(blocks: SpaceBlock[]) => {
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
        pickPage: async () => {
          toast.info("Link pages outside the synced block.");
          return null;
        },
        pickSource: async () => {
          toast.info("Add databases outside the synced block.");
          return null;
        },
        newDatabase: async () => {
          toast.info("Add databases outside the synced block.");
          return null;
        },
      }}
      menu={{
        moveBlocksTo: () => toast.info("Move blocks out of a synced block by dragging them."),
        turnIntoPageIn: () => toast.info("Turn blocks into a page outside the synced block."),
        askAi: () => toast.info("Ask AI outside the synced block."),
      }}
    />
  );
}
