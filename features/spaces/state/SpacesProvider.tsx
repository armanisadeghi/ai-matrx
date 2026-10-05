"use client";

// features/spaces/state/SpacesProvider.tsx — the workspace state every Spaces screen reads.
//
// Holds the store (memory now), the tree of summaries, favorites, recently visited, the sidebar and the
// quick-find switch. Favorites / recent / sidebar width are per-browser view state; the documents
// themselves live only in the store.

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { SpaceDoc, SpaceId, SpaceSummary, SpacesStore } from "../contract";
import { getMemorySpacesStore } from "../store/memory-store";
import { between, byPosition } from "../store/position";

const FAVORITES_KEY = "spaces:favorites";
const RECENT_KEY = "spaces:recent";
export const LAST_SPACE_KEY = "spaces:last";

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage full or blocked: favorites/recent are view state; the page still works without them.
  }
}

/** Where a dragged Space lands: inside a target, or before/after it among its siblings. */
export type DropPlacement = "before" | "after" | "inside";

interface SpacesContextValue {
  store: SpacesStore;
  ready: boolean;
  summaries: SpaceSummary[];
  archived: SpaceSummary[];
  byId: Map<SpaceId, SpaceSummary>;
  childrenOf: (parentId: SpaceId | null) => SpaceSummary[];
  pathTo: (id: SpaceId) => SpaceSummary[];
  favorites: SpaceId[];
  toggleFavorite: (id: SpaceId) => void;
  recent: SpaceId[];
  markVisited: (id: SpaceId) => void;
  createSpace: (parentId: SpaceId | null, options?: { open?: boolean; afterId?: SpaceId; title?: string }) => Promise<SpaceDoc>;
  archiveSpace: (id: SpaceId) => Promise<void>;
  restoreSpace: (id: SpaceId) => Promise<void>;
  duplicateSpace: (id: SpaceId) => Promise<SpaceDoc>;
  moveSpace: (id: SpaceId, targetId: SpaceId | null, placement: DropPlacement) => Promise<void>;
  open: (id: SpaceId, blockId?: string) => void;
  quickFind: { open: boolean; mode: "jump" | "pick"; onPick?: (id: SpaceId) => void };
  openQuickFind: (mode?: "jump" | "pick", onPick?: (id: SpaceId) => void) => void;
  closeQuickFind: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

export function useSpaces(): SpacesContextValue {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces must be used inside <SpacesProvider>.");
  return ctx;
}

export function SpacesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [store] = useState(() => getMemorySpacesStore());
  const [all, setAll] = useState<SpaceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [favorites, setFavorites] = useState<SpaceId[]>([]);
  const [recent, setRecent] = useState<SpaceId[]>([]);
  const [quickFind, setQuickFind] = useState<SpacesContextValue["quickFind"]>({ open: false, mode: "jump" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const refresh = () => {
      void store.list({ includeArchived: true }).then((list) => {
        if (!live) return;
        setAll(list);
        setReady(true);
      });
    };
    refresh();
    const off = store.onAnyChange(refresh);
    setFavorites(readList(FAVORITES_KEY));
    setRecent(readList(RECENT_KEY));
    return () => {
      live = false;
      off();
    };
  }, [store]);

  const summaries = all.filter((s) => !s.isArchived);
  const byId = new Map(summaries.map((s) => [s.id, s]));
  // A Space whose ancestor is in Trash is out of the tree too.
  const visible = summaries.filter((s) => {
    let p = s.parentId;
    while (p) {
      const parent = byId.get(p);
      if (!parent) return false;
      p = parent.parentId;
    }
    return true;
  });
  const visibleById = new Map(visible.map((s) => [s.id, s]));
  const archived = all.filter((s) => s.isArchived).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const childrenOf = (parentId: SpaceId | null) => visible.filter((s) => s.parentId === parentId).sort(byPosition);
  const pathTo = (id: SpaceId) => {
    const out: SpaceSummary[] = [];
    let cur = visibleById.get(id);
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? visibleById.get(cur.parentId) : undefined;
    }
    return out;
  };

  const toggleFavorite = (id: SpaceId) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      writeList(FAVORITES_KEY, next);
      return next;
    });
  };
  const markVisited = (id: SpaceId) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((r) => r !== id)].slice(0, 20);
      writeList(RECENT_KEY, next);
      return next;
    });
    try {
      window.localStorage.setItem(LAST_SPACE_KEY, id);
    } catch {
      // view state only
    }
  };
  const open = (id: SpaceId, blockId?: string) => {
    setMobileSidebarOpen(false);
    router.push(`/spaces/${id}${blockId ? `#block-${blockId}` : ""}`);
  };

  const createSpace: SpacesContextValue["createSpace"] = async (parentId, options) => {
    const doc = await store.create({ parentId, afterId: options?.afterId, title: options?.title });
    if (options?.open !== false) open(doc.id);
    return doc;
  };
  const archiveSpace = (id: SpaceId) => store.archive(id);
  const restoreSpace = (id: SpaceId) => store.restore(id);
  const duplicateSpace = async (id: SpaceId) => {
    const copy = await store.duplicate(id, { withChildren: true });
    return copy;
  };
  const moveSpace: SpacesContextValue["moveSpace"] = async (id, targetId, placement) => {
    if (targetId === id) return;
    if (placement === "inside" || targetId === null) {
      const kids = childrenOf(targetId);
      await store.move(id, targetId, between(kids.at(-1)?.position ?? null, null));
      return;
    }
    const target = visibleById.get(targetId);
    if (!target) return;
    const sibs = childrenOf(target.parentId).filter((s) => s.id !== id);
    const i = sibs.findIndex((s) => s.id === targetId);
    const position =
      placement === "before" ? between(sibs[i - 1]?.position ?? null, target.position) : between(target.position, sibs[i + 1]?.position ?? null);
    await store.move(id, target.parentId, position);
  };

  const value: SpacesContextValue = {
    store,
    ready,
    summaries: visible,
    archived,
    byId: visibleById,
    childrenOf,
    pathTo,
    favorites: favorites.filter((f) => visibleById.has(f)),
    toggleFavorite,
    recent: recent.filter((r) => visibleById.has(r)),
    markVisited,
    createSpace,
    archiveSpace,
    restoreSpace,
    duplicateSpace,
    moveSpace,
    open,
    quickFind,
    openQuickFind: (mode = "jump", onPick) => setQuickFind({ open: true, mode, onPick }),
    closeQuickFind: () => setQuickFind({ open: false, mode: "jump" }),
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  };
  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
