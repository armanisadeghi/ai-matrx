"use client";

// features/spaces/state/synced-sources.ts — C18 synced blocks: where their one source lives and who shows it.
//
// A synced block's content is ONE Space (the "synced source"), a sub-page of the page it was made on (so it
// inherits that page's access). Every synced block — the original and each copy — holds the same
// `props.sourceId`, so an edit in any of them is an edit of the source and shows everywhere.
// Two association labels say what is what (both through the registered assoc_link / assoc_unlink path):
//   synced_source : source Space -> its home page   — marks the Space as a synced source (the sidebar hides it)
//   synced_block  : a page -> the source Space      — this page shows the block ("Editing in N pages")
// A page's synced_block edges are reconciled from its blocks after every change (useSyncedEdges).

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { SpaceBlock } from "@/lib/spaces-blocks/types";
import { supabase } from "@/utils/supabase/client";

export const SYNCED_SOURCE = "synced_source";
export const SYNCED_BLOCK = "synced_block";

const known = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  for (const l of listeners) l();
};

/** Ids known to be synced sources (hidden from the page tree). */
export function isSyncedSource(id: string): boolean {
  return known.has(id);
}
export function markSyncedSources(ids: Iterable<string>): void {
  let changed = false;
  for (const id of ids) if (!known.has(id)) (known.add(id), (changed = true));
  if (changed) bump();
}
/** Re-renders when the known set grows. */
export function useSyncedSourcesVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
}

const checked = new Set<string>();
/** Which of `ids` are synced sources (one read per 200 ids; an id is asked once per tab — round 40). */
export async function loadSyncedSources(all: string[]): Promise<void> {
  const ids = all.filter((id) => !checked.has(id));
  if (!ids.length) return;
  for (const id of ids) checked.add(id);
  const found: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .schema("platform")
      .from("associations")
      .select("source_id")
      .eq("source_type", "document")
      .eq("label", SYNCED_SOURCE)
      .is("deleted_at", null)
      .in("source_id", ids.slice(i, i + 200));
    if (error) {
      for (const id of ids) checked.delete(id);
      throw new Error(`We couldn't read the synced blocks: ${error.message}`);
    }
    for (const r of data ?? []) found.push(r.source_id);
  }
  markSyncedSources(found);
}

async function link(sourceId: string, targetId: string, label: string): Promise<void> {
  const { error } = await supabase.rpc("assoc_link", {
    p_source_type: "document",
    p_source_id: sourceId,
    p_target_type: "document",
    p_target_id: targetId,
    p_role: label,
    p_label: label,
  });
  if (error) throw new Error(error.message);
}

async function unlink(sourceId: string, targetId: string, label: string): Promise<void> {
  const { error } = await supabase.rpc("assoc_unlink", {
    p_source_type: "document",
    p_source_id: sourceId,
    p_target_type: "document",
    p_target_id: targetId,
    p_role: label,
  });
  if (error) throw new Error(error.message);
}

/** A new source Space was made under `homePageId`: mark it (and hide it at once). */
export async function markNewSource(sourceId: string, homePageId: string): Promise<void> {
  markSyncedSources([sourceId]);
  await link(sourceId, homePageId, SYNCED_SOURCE);
}

/** How many pages show this source (live synced_block edges). */
export async function syncedPageCount(sourceId: string): Promise<number> {
  const { count, error } = await supabase
    .schema("platform")
    .from("associations")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "document")
    .eq("target_id", sourceId)
    .eq("label", SYNCED_BLOCK)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Every synced source a page's blocks show. */
export function syncedSourcesIn(blocks: SpaceBlock[]): string[] {
  const out = new Set<string>();
  const walk = (list: SpaceBlock[]) => {
    for (const b of list) {
      if (b.type === "synced" && typeof b.props?.sourceId === "string" && b.props.sourceId) out.add(b.props.sourceId);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return [...out];
}

const countListeners = new Map<string, Set<() => void>>();
/** Tell every open synced block of `sourceId` to read its page count again. */
export function bumpSyncedCount(sourceId: string): void {
  for (const l of countListeners.get(sourceId) ?? []) l();
}
export function onSyncedCount(sourceId: string, l: () => void): () => void {
  const set = countListeners.get(sourceId) ?? new Set();
  set.add(l);
  countListeners.set(sourceId, set);
  return () => set.delete(l);
}

/** Keeps the page's synced_block edges equal to the synced blocks it holds (on = the person can edit it). */
export function useSyncedEdges(pageId: string, blocks: SpaceBlock[] | undefined, on: boolean): void {
  const linked = useRef<{ page: string; ids: Set<string> } | null>(null);
  const busy = useRef(false);
  const want = blocks ? syncedSourcesIn(blocks).sort().join(",") : null;
  // Round 40: a page opened with no synced block asks nothing on open (one edge read per page load was
  // most pages' only use of this); its edges are read and reconciled once a synced block is added.
  useEffect(() => {
    if (!on || want === null) return;
    if (want === "" && linked.current?.page !== pageId) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        if (!linked.current || linked.current.page !== pageId) {
          const { data, error } = await supabase
            .schema("platform")
            .from("associations")
            .select("target_id")
            .eq("source_type", "document")
            .eq("source_id", pageId)
            .eq("label", SYNCED_BLOCK)
            .is("deleted_at", null);
          if (error) throw new Error(error.message);
          linked.current = { page: pageId, ids: new Set((data ?? []).map((r) => r.target_id)) };
        }
        const next = new Set(want ? want.split(",") : []);
        const have = linked.current.ids;
        for (const id of next) {
          if (have.has(id)) continue;
          await link(pageId, id, SYNCED_BLOCK);
          have.add(id);
          bumpSyncedCount(id);
        }
        for (const id of [...have]) {
          if (next.has(id)) continue;
          await unlink(pageId, id, SYNCED_BLOCK);
          have.delete(id);
          bumpSyncedCount(id);
        }
      } catch (err) {
        console.error("[spaces] synced block links could not be kept", err);
        linked.current = null;
      } finally {
        busy.current = false;
      }
      void live;
    }, 600);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [pageId, want, on]);
}
