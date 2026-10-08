// features/spaces/state/live-store.ts — the store every Spaces screen talks to.
//
// Wraps the database SpacesStore (store-db/, owner's adapter) so that:
//   - a new top-level Space is filed in the ACTIVE organization read at the moment of the write (the
//     active organization is only ever a write target, never a list filter);
//   - every write tells the open screens what changed, so the sidebar tree, the open page and the
//     breadcrumb agree without polling: a save hands over the saved doc, anything else asks for a
//     fresh list.

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import type { SpaceBlock, SpaceDoc, SpaceId, SpaceSummary, SpacesStore } from "../contract";
import { createDatabaseSpacesStore } from "../store-db/create-store";
import type { SpaceHistoryEntry, SpaceSearchHit } from "../store-db/supabase-store";

export type SpacesChange = { kind: "saved"; doc: SpaceDoc; origin?: string } | { kind: "tree" };

export interface LiveSpacesStore extends SpacesStore {
  /** Save, naming who saved so the saver can ignore its own echo. */
  saveFrom(origin: string, doc: SpaceDoc, expectedVersion: number): Promise<SpaceDoc>;
  onChange(listener: (change: SpacesChange) => void): () => void;
  /** Page history: every saved version of a page, newest first. */
  history(id: SpaceId): Promise<SpaceHistoryEntry[]>;
  /** The sidebar's lazy tree read: top level + children of `expand` and of each `reveal` page's ancestors. */
  sidebar(input: { expand: SpaceId[]; reveal: SpaceId[] }): Promise<SpaceSummary[]>;
  /** One page's live sub-pages (a sidebar row expanding). */
  children(parentId: SpaceId): Promise<SpaceSummary[]>;
  /** Trash: archived pages, read when Trash opens. */
  trash(): Promise<SpaceSummary[]>;
  /** Server-side page search ("" = recently edited). */
  search(query: string, limit?: number): Promise<SpaceSearchHit[]>;
  /** A write made outside the store (e.g. "Use template"): the open screens re-read the tree. */
  notifyTree(): void;
}

export function createLiveSpacesStore(getOrganizationId: () => string | null): LiveSpacesStore {
  // Reads and in-place writes never depend on the organization; only a new top-level Space does.
  const base = createDatabaseSpacesStore("");
  const listeners = new Set<(change: SpacesChange) => void>();
  const emit = (change: SpacesChange) => {
    for (const l of listeners) l(change);
  };
  const tree = async <T>(work: Promise<T>): Promise<T> => {
    const out = await work;
    emit({ kind: "tree" });
    return out;
  };

  const store: LiveSpacesStore = {
    kind: "database",
    list: (options) => base.list(options),
    sidebar: (input) => base.sidebar(input),
    children: (parentId) => base.children(parentId),
    trash: () => base.trash(),
    search: (query, limit) => base.search(query, limit),
    get: (id) => base.get(id),
    async create(input: { parentId: SpaceId | null; title?: string; blocks?: SpaceBlock[]; afterId?: SpaceId }) {
      let target = base;
      if (!input.parentId) {
        // The one write funnel: with no active organization it asks the person, then continues.
        target = createDatabaseSpacesStore(await ensureOrgId(getOrganizationId()));
      }
      return tree(target.create(input));
    },
    save: (doc, expectedVersion) => store.saveFrom("", doc, expectedVersion),
    async saveFrom(origin, doc, expectedVersion) {
      const saved = await base.save(doc, expectedVersion);
      emit({ kind: "saved", doc: saved, origin });
      return saved;
    },
    move: (id, parentId, position) => tree(base.move(id, parentId, position)),
    async duplicate(id, options) {
      // A sub-page's copy stays beside it, in its organization; a top-level page's copy is a new
      // top-level page, filed in the active organization like any new top-level page.
      const source = await base.get(id);
      const target = source?.parentId ? base : createDatabaseSpacesStore(await ensureOrgId(getOrganizationId()));
      return tree(target.duplicate(id, options));
    },
    archive: (id) => tree(base.archive(id)),
    restore: (id) => tree(base.restore(id)),
    subscribe: (id, onChange) => base.subscribe(id, onChange),
    history: (id) => base.history(id),
    notifyTree: () => emit({ kind: "tree" }),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

/** The summary row a saved doc implies (the sidebar patches itself from a save, no refetch). */
export function summaryOf(doc: SpaceDoc): SpaceSummary {
  const { id, parentId, position, title, icon, isArchived, updatedAt } = doc;
  return { id, parentId, position, title, icon, isArchived, updatedAt };
}
