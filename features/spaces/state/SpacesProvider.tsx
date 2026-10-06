"use client";

// features/spaces/state/SpacesProvider.tsx — the workspace state every Spaces screen reads.
//
// Holds the store (the database, through live-store.ts), the tree of summaries, favorites, recently visited, the sidebar and the
// quick-find switch. Favorites / recent / sidebar width are per-browser view state; the documents
// themselves live only in the store.

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { SpaceDoc, SpaceId, SpaceSummary } from "../contract";
import { between, byPosition } from "../store/position";
import { installAgencySample } from "../data/agency-install";
import { addTravelingSmmSample } from "../store/sample";
import { createLiveSpacesStore, type LiveSpacesStore } from "./live-store";
import { hasSignedInSession, isRefusal, onSignedIn, type LoadAccess } from "./load-access";
import { listTemplateIds, setTemplate, copyTemplate } from "./templates";

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
  store: LiveSpacesStore;
  ready: boolean;
  /** The tree could not be read for a fault (network, server): the screens say so instead of looking empty. */
  loadError: string | null;
  /** The tree read was refused: signed out, or no access. The screens show the sign-in / no-access state. */
  access: LoadAccess | null;
  /** Read the tree again (after a fault or a refusal). */
  retryLoad: () => void;
  /** Optimistic title/icon in the tree while the open page types (Notion renames the row live). */
  patchSummary: (id: SpaceId, patch: Partial<Pick<SpaceSummary, "title" | "icon">>) => void;
  /** A page just created by the person: its title takes focus once it opens. */
  takeFocusTitle: (id: SpaceId) => boolean;
  /** A page created in this tab, handed to its screen once so it opens without a round trip. */
  takeFresh: (id: SpaceId) => SpaceDoc | null;
  sample: { adding: boolean; progress: string | null; add: () => Promise<void> };
  /** I2 / I3 — Spaces marked as templates that the person can open (null = not read yet). */
  templates: {
    ids: string[] | null;
    error: string | null;
    refresh: () => void;
    setTemplate: (id: SpaceId, on: boolean) => Promise<void>;
    use: (id: SpaceId, title: string) => Promise<void>;
  };
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
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const orgRef = useRef(organizationId);
  orgRef.current = organizationId;
  const [store] = useState(() => createLiveSpacesStore(() => orgRef.current));
  const [all, setAll] = useState<SpaceSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [access, setAccess] = useState<LoadAccess | null>(null);
  const reload = useRef<() => void>(() => {});
  const focusTitle = useRef<SpaceId | null>(null);
  const fresh = useRef(new Map<SpaceId, SpaceDoc>());
  const [sampleProgress, setSampleProgress] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<SpaceId[]>([]);
  const [recent, setRecent] = useState<SpaceId[]>([]);
  const [quickFind, setQuickFind] = useState<SpacesContextValue["quickFind"]>({ open: false, mode: "jump" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let retriedRefusal = false;
    const refresh = () => {
      void store.list({ includeArchived: true }).then(
        (list) => {
          if (!live) return;
          setAll(list);
          setLoadError(null);
          setAccess(null);
          setReady(true);
        },
        async (err: unknown) => {
          if (!live) return;
          if (isRefusal(err)) {
            const signedIn = await hasSignedInSession();
            if (!live) return;
            // A refusal with a session is usually the boot race (the read left before the session
            // attached): read once more before calling it no access.
            if (signedIn && !retriedRefusal) {
              retriedRefusal = true;
              window.setTimeout(() => live && refresh(), 1200);
              return;
            }
            setAccess(signedIn ? "no-access" : "signed-out");
            setLoadError(null);
          } else {
            console.error("[spaces] the page tree could not be read", err);
            setAccess(null);
            setLoadError("We couldn't load your pages.");
          }
          setReady(true);
        },
      );
    };
    reload.current = () => {
      retriedRefusal = false;
      refresh();
    };
    refresh();
    // Signing in (or a session attaching late) reads the tree again.
    const offAuth = onSignedIn(() => {
      if (!live) return;
      retriedRefusal = false;
      refresh();
    });
    const off = store.onChange((change) => {
      if (change.kind === "tree") return refresh();
      const { id, title, icon, updatedAt, isArchived } = change.doc;
      // Position and parent stay as the list gave them (a saved doc does not carry the list's order key).
      setAll((prev) => prev.map((s) => (s.id === id ? { ...s, title, icon, updatedAt, isArchived } : s)));
    });
    // The template labels (I3): the ••• menu shows whether the open page is one.
    void listTemplateIds().then(
      (ids) => live && setTemplateIds(ids),
      (err: unknown) => live && setTemplatesError(err instanceof Error ? err.message : "We couldn't list templates."),
    );
    setFavorites(readList(FAVORITES_KEY));
    setRecent(readList(RECENT_KEY));
    return () => {
      live = false;
      off();
      offAuth();
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
    try {
      const doc = await store.create({ parentId, afterId: options?.afterId, title: options?.title });
      fresh.current.set(doc.id, doc);
      if (options?.open !== false) {
        focusTitle.current = doc.id;
        open(doc.id);
      }
      return doc;
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) toast.error(err instanceof Error ? err.message : "We couldn't create the page.");
      throw err;
    }
  };
  const patchSummary: SpacesContextValue["patchSummary"] = (id, patch) => {
    setAll((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const takeFresh = (id: SpaceId) => {
    const doc = fresh.current.get(id) ?? null;
    fresh.current.delete(id);
    return doc;
  };
  const takeFocusTitle = (id: SpaceId) => {
    if (focusTitle.current !== id) return false;
    focusTitle.current = null;
    return true;
  };
  const addSample = async () => {
    if (sampleProgress) return;
    setSampleProgress("0");
    try {
      // org-filter: write-target the sample's tables are installed in the active organization (asked for when none is chosen)
      const install = async () => installAgencySample(await ensureOrgId(orgRef.current));
      const root = await addTravelingSmmSample(store, install, (done, total) => setSampleProgress(`${done}/${total}`));
      open(root.id);
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) toast.error(err instanceof Error ? err.message : "We couldn't add the sample.");
    } finally {
      setSampleProgress(null);
    }
  };
  const refreshTemplates = () => {
    void listTemplateIds().then(
      (ids) => {
        setTemplateIds(ids);
        setTemplatesError(null);
      },
      (err: unknown) => setTemplatesError(err instanceof Error ? err.message : "We couldn't list templates."),
    );
  };
  const markTemplate = async (id: SpaceId, on: boolean) => {
    await setTemplate(id, on);
    setTemplateIds((prev) => (on ? [...new Set([...(prev ?? []), id])] : (prev ?? []).filter((t) => t !== id)));
  };
  const applyTemplate = async (id: SpaceId, title: string) => {
    try {
      const copyId = await copyTemplate(id, title, orgRef.current);
      // The tree learns of the copy, then it opens (Notion opens the new page at once).
      store.notifyTree();
      open(copyId);
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) toast.error(err instanceof Error ? err.message : "We couldn't use this template.");
    }
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
    loadError,
    access,
    retryLoad: () => reload.current(),
    patchSummary,
    takeFocusTitle,
    takeFresh,
    sample: { adding: sampleProgress !== null, progress: sampleProgress, add: addSample },
    templates: { ids: templateIds, error: templatesError, refresh: refreshTemplates, setTemplate: markTemplate, use: applyTemplate },
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
