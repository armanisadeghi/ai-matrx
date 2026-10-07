"use client";

// features/spaces/editor/synced-block.tsx — Notion's synced block (C18). The stored block is `synced` with
// `props.sourceId`; its content is the source Space (state/synced-sources.ts), drawn editable in place by
// SyncedBody. On hover, Notion's bar: "Synced block · Editing in N pages · Copy and sync · Unsync".
// "Copy and sync" puts the block on the clipboard; pasting it in any page makes a linked copy (SpaceEditor's
// paste handler reads the marker, and BlockNote's own copy of a selected synced block keeps its sourceId too).

import { Copy, RefreshCw, Unlink } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { copyText } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";

import type { SpaceDoc } from "../contract";
import { onSyncedCount, syncedPageCount } from "../state/synced-sources";
import { toEngine } from "./convert";
import { DATABASE_HOST_CLASS } from "./database-host";
import { storedSpec } from "./stored-blocks";

const SyncedBody = dynamic(() => import("./SyncedBody"), { ssr: false, loading: () => <div className="spaces-synced-loading" /> });

/** What "Copy and sync" puts on the clipboard: pasting it in a page makes a linked copy. */
export const SYNCED_CLIP = /^spaces-synced:([0-9a-f-]{36})$/;
export const syncedClip = (sourceId: string) => `spaces-synced:${sourceId}`;

function usePageCount(sourceId: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      void syncedPageCount(sourceId).then(
        (c) => live && setN(c),
        () => live && setN(null),
      );
    read();
    const off = onSyncedCount(sourceId, read);
    return () => {
      live = false;
      off();
    };
  }, [sourceId]);
  return n;
}

type Ctx = { blockId: string; editor: never };

function SyncedView({ sourceId, ctx }: { sourceId: string; ctx: Ctx }) {
  const editor = ctx.editor as unknown as {
    isEditable: boolean;
    getBlock: (id: string) => unknown;
    replaceBlocks: (a: unknown[], b: unknown[]) => void;
  };
  const count = usePageCount(sourceId);
  const source = useRef<SpaceDoc | null>(null);
  const editable = editor.isEditable;
  return (
    <div className={`${DATABASE_HOST_CLASS} spaces-synced`} contentEditable={false} data-synced-source={sourceId}>
      {editable ? (
        <div className="spaces-synced-bar" role="toolbar" aria-label="Synced block">
          <span className="spaces-synced-tag">
            <RefreshCw size={12} strokeWidth={2} />
            Synced block
          </span>
          {count !== null && count > 0 ? <span className="spaces-synced-count">Editing in {count} {count === 1 ? "page" : "pages"}</span> : null}
          <button
            type="button"
            className="spaces-synced-action"
            onClick={() =>
              void copyText(syncedClip(sourceId)).then((ok) =>
                ok ? toast.success("Copied. Paste it in any page to sync it there.") : toast.error("We couldn't copy the synced block."),
              )
            }
          >
            <Copy size={12} strokeWidth={2} />
            Copy and sync
          </button>
          <button
            type="button"
            className="spaces-synced-action"
            onClick={() => {
              const doc = source.current;
              const block = editor.getBlock(ctx.blockId);
              if (!doc || !block) return;
              // Unsync: this copy becomes ordinary blocks holding what the source holds now (new ids).
              const blocks = toEngine(doc.blocks).map(function fresh(b): Record<string, unknown> {
                const { id: _id, children, ...rest } = b as unknown as Record<string, unknown> & { children?: unknown[] };
                return { ...rest, children: (children ?? []).map((c) => fresh(c as never)) };
              });
              editor.replaceBlocks([block], blocks.length ? blocks : [{ type: "paragraph" }]);
            }}
          >
            <Unlink size={12} strokeWidth={2} />
            Unsync
          </button>
        </div>
      ) : null}
      <div className="spaces-synced-body">
        <SyncedBody sourceId={sourceId} editable={editable} onDoc={(d) => (source.current = d)} />
      </div>
    </div>
  );
}

export const SyncedBlock = storedSpec(
  "synced",
  // Presses and keys inside belong to the nested editor: the database spec's event claim covers DATABASE_HOST_CLASS.
  (p, ctx) => (typeof p.sourceId === "string" && p.sourceId ? <SyncedView sourceId={p.sourceId} ctx={ctx} /> : null),
);
