"use client";

// features/spaces/state/SpacesProvider.tsx — the workspace state every Spaces screen reads.
//
// Holds the store (the database, through live-store.ts), the tree of summaries, favorites, recently visited, the sidebar and the
// quick-find switch. Favorites / recent / sidebar width are per-browser view state; the documents
// themselves live only in the store.

import { isSyncedSource, loadSyncedSources, useSyncedSourcesVersion } from "./synced-sources";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import type { SpaceBlock, SpaceDoc, SpaceId, SpaceSummary } from "../contract";
import { between, byPosition } from "../store/position";
import { installAgencySample, pageOrganizationId } from "../data/agency-install";
import { addTravelingSmmSample, findSamplePage, pointCopyAtItsTables } from "../store/sample";
import { createDatabaseSpacesStore } from "../store-db/create-store";
import { createLiveSpacesStore, type LiveSpacesStore } from "./live-store";
import { hasSignedInSession, isRefusal, onSignedIn, type LoadAccess } from "./load-access";
import { sampleTemplatePlan } from "./template-plan";
import { listTemplateIds, setTemplate, copyTemplate } from "./templates";
import { bringTemplateTables } from "./template-tables";

const FAVORITES_KEY = "spaces:favorites";
/** The sidebar's open rows (written by SpacesSidebar): the tree's first read loads their children too. */
export const EXPANDED_KEY = "spaces:expanded";
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

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The page the address bar names (`/spaces/<id>`), read when the tree loads so its path comes with it. */
function currentPageId(): string | null {
  const m = /^\/spaces\/([0-9a-f-]{36})(?:[/?#]|$)/i.exec(window.location.pathname);
  return m ? m[1] : null;
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
  /** Open a page just made elsewhere ("/page") with the caret in its title, so it is named at once. */
  openToName: (id: SpaceId) => void;
  /** A page created in this tab, handed to its screen once so it opens without a round trip. */
  takeFresh: (id: SpaceId) => SpaceDoc | null;
  /** Bumped when a page's content was rewritten outside its screen (the sample filled while it was open):
   *  the screen opens again on the new content. */
  pageEpoch: (id: SpaceId) => number;
  /** The page's screen opens again on its stored content (an outside writer, e.g. the Space Builder, changed it). */
  reopenPage: (id: SpaceId) => void;
  sample: { adding: boolean; progress: string | null; add: (opts?: { asTemplate?: boolean }) => Promise<void> };
  /** I2 / I3 — Spaces marked as templates that the person can open (null = not read yet). */
  templates: {
    ids: string[] | null;
    error: string | null;
    refresh: () => void;
    setTemplate: (id: SpaceId, on: boolean) => Promise<void>;
    use: (id: SpaceId, title: string) => Promise<void>;
  };
  /** The live pages loaded so far (the sidebar loads lazily, like Notion): never the whole tree. */
  summaries: SpaceSummary[];
  /** Trash: empty until `loadTrash` (Trash opened) has read it. */
  archived: SpaceSummary[];
  /** Read Trash (the archived pages). `trashLoaded` is false until the first read answers. */
  loadTrash: () => void;
  trashLoaded: boolean;
  /** A page's children are loaded (expanding a row loads them through `loadChildren`). */
  childrenLoaded: (parentId: SpaceId) => boolean;
  loadChildren: (parentId: SpaceId) => Promise<void>;
  /** Load a page and its ancestors into the tree (the open page, a search hit) when it is not there yet. */
  reveal: (id: SpaceId) => void;
  byId: Map<SpaceId, SpaceSummary>;
  childrenOf: (parentId: SpaceId | null) => SpaceSummary[];
  pathTo: (id: SpaceId) => SpaceSummary[];
  favorites: SpaceId[];
  toggleFavorite: (id: SpaceId) => void;
  recent: SpaceId[];
  markVisited: (id: SpaceId) => void;
  createSpace: (parentId: SpaceId | null, options?: { open?: boolean; afterId?: SpaceId; title?: string; blocks?: SpaceBlock[] }) => Promise<SpaceDoc>;
  archiveSpace: (id: SpaceId) => Promise<void>;
  restoreSpace: (id: SpaceId) => Promise<void>;
  duplicateSpace: (id: SpaceId) => Promise<SpaceDoc>;
  moveSpace: (id: SpaceId, targetId: SpaceId | null, placement: DropPlacement) => Promise<void>;
  open: (id: SpaceId, blockId?: string) => void;
  quickFind: { open: boolean; mode: "jump" | "pick"; onPick?: (id: SpaceId) => void; create?: QuickFindCreate };
  /** `create`: the picker also offers "New page “typed name”" (Link to page, `[[`, `[+`). */
  openQuickFind: (mode?: "jump" | "pick", onPick?: (id: SpaceId) => void, create?: QuickFindCreate) => void;
  closeQuickFind: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  /** A page link's address (the public web page addresses pages by their link); default `/spaces/<id>`. */
  pageHref?: (id: SpaceId) => string;
  /** What a link to a page this screen cannot show says; default: "Page in Trash" only when it is. */
  missingPageLabel?: string;
  /** The page is a published Site read by anyone (`/site/<link>`): blocks that run as the viewer draw a static stand-in (an Applet block shows its card). */
  publicSite?: boolean;
  /**
   * A linked page the tree does not hold (a page shared from another organization, a link to a page
   * outside it): read once by id under row security — access, never organization. undefined = not asked
   * yet or reading; null = this person cannot open it (or it is gone).
   */
  linkTarget?: (id: SpaceId) => SpaceSummary | null | undefined;
  /** Ask for a link target the tree does not hold (once per page id). */
  requestLink?: (id: SpaceId) => void;
}

/** A picker that can also make the page: `first` lists "New page" above the matches (Notion's `[+`). */
export interface QuickFindCreate {
  onCreate: (title: string) => void;
  first?: boolean;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

export function useSpaces(): SpacesContextValue {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces must be used inside <SpacesProvider>.");
  return ctx;
}

export function SpacesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // org-filter: write-target a new top-level page is filed in the organization the person works in
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const orgRef = useRef(organizationId);
  orgRef.current = organizationId;
  const [store] = useState(() => createLiveSpacesStore(() => orgRef.current));
  const dispatch = useAppDispatch();
  const [all, setAll] = useState<SpaceSummary[]>([]);
  // Parents whose live children are all in `all` (round 35: the tree is read lazily, never whole).
  const [loadedParents, setLoadedParents] = useState<ReadonlySet<SpaceId>>(new Set());
  const loadedRef = useRef<ReadonlySet<SpaceId>>(loadedParents);
  loadedRef.current = loadedParents;
  const [trash, setTrash] = useState<SpaceSummary[] | null>(null);
  const trashWanted = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [access, setAccess] = useState<LoadAccess | null>(null);
  const reload = useRef<() => void>(() => {});
  const trashRead = useRef<() => Promise<unknown>>(() => Promise.resolve());
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
    // A failed read that is not a refusal (a statement timeout on a busy database) is read once more before it
    // is shown; once the tree has loaded, a failed re-read (after Build with AI, a tree change) keeps the tree.
    let retriedFailure = false;
    let loadedOnce = false;
    const refresh = () => {
      // Round 35 — Notion's lazy sidebar: top level, the children of every open row and of the open page's
      // (and favorites'/recents') ancestors. Never archived pages (Trash reads its own list when opened).
      const expand = [...new Set([...loadedRef.current, ...readList(EXPANDED_KEY)])];
      const reveal = [...new Set([currentPageId(), readStored(LAST_SPACE_KEY), ...readList(FAVORITES_KEY), ...readList(RECENT_KEY)].filter((v): v is string => Boolean(v)))];
      const startedAt = performance.now();
      if (trashWanted.current) void trashRead.current();
      void store.sidebar({ expand, reveal }).then(
        (list) => {
          if (!live) return;
          if (!loadedOnce) console.info(`[spaces] sidebar tree read: ${list.length} pages in ${Math.round(performance.now() - startedAt)} ms`);
          loadedOnce = true;
          retriedFailure = false;
          setAll(list);
          setLoadedParents(new Set([...expand, ...list.map((s) => s.parentId).filter((v): v is string => Boolean(v))]));
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
            if (!retriedFailure) {
              retriedFailure = true;
              window.setTimeout(() => live && refresh(), 2000);
              return;
            }
            setAccess(null);
            if (loadedOnce) {
              // The last list stays on screen; the person is told it is not fresh and can read it again.
              retriedFailure = false;
              toast.error("Your pages could not be refreshed", { action: { label: "Try again", onClick: () => reload.current() } });
              return;
            }
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
    const readTrash = () =>
      store.trash().then(
        (list) => live && setTrash(list),
        (err: unknown) => {
          console.error("[spaces] Trash could not be read", err);
          if (live) toast.error("We couldn't read Trash", { action: { label: "Try again", onClick: () => void readTrash() } });
        },
      );
    trashRead.current = readTrash;
    const off = store.onChange((change) => {
      if (change.kind === "tree") return refresh();
      const { id, title, icon, updatedAt, isArchived } = change.doc;
      // Position and parent stay as the list gave them (a saved doc does not carry the list's order key).
      setAll((prev) => prev.map((s) => (s.id === id ? { ...s, title, icon, updatedAt, isArchived } : s)));
    });
    // The template labels (I3) are read when the ••• menu or the template gallery opens (round 40), never on load.
    setFavorites(readList(FAVORITES_KEY));
    setRecent(readList(RECENT_KEY));
    return () => {
      live = false;
      off();
      offAuth();
    };
  }, [store]);

  // C18: synced sources are content of a synced block, never pages of the tree (state/synced-sources.ts).
  useSyncedSourcesVersion();
  useEffect(() => {
    const ids = all.map((s) => s.id);
    if (ids.length) void loadSyncedSources(ids).catch((err: unknown) => console.error("[spaces] synced sources could not be read", err));
  }, [all]);
  const summaries = all.filter((s) => !s.isArchived && !isSyncedSource(s.id));
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
  const archived = (trash ?? []).filter((s) => !isSyncedSource(s.id)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const loadTrash = () => {
    trashWanted.current = true;
    void trashRead.current();
  };
  /** Rows merged in from a lazy read: each named parent's children are replaced by what the server said. */
  const mergeRows = (rows: SpaceSummary[], parents: SpaceId[]) => {
    const complete = new Set(parents);
    setAll((prev) => {
      const incoming = new Map(rows.map((r) => [r.id, r]));
      const kept = prev.filter((s) => !incoming.has(s.id) && !(s.parentId && complete.has(s.parentId)));
      return [...kept, ...rows];
    });
    setLoadedParents((prev) => new Set([...prev, ...parents]));
  };
  const childrenLoading = useRef(new Set<SpaceId>());
  const loadChildren = async (parentId: SpaceId) => {
    if (loadedRef.current.has(parentId) || childrenLoading.current.has(parentId)) return;
    childrenLoading.current.add(parentId);
    try {
      mergeRows(await store.children(parentId), [parentId]);
    } catch (err) {
      console.error("[spaces] a page's sub-pages could not be read", err);
      toast.error("We couldn't load the pages inside", { action: { label: "Try again", onClick: () => void loadChildren(parentId) } });
    } finally {
      childrenLoading.current.delete(parentId);
    }
  };
  /** The page's whole path is in the tree: every ancestor up to a top-level page. */
  const pathKnown = (id: SpaceId) => {
    let cur = byId.get(id);
    while (cur?.parentId) cur = byId.get(cur.parentId);
    return Boolean(cur);
  };
  const revealing = useRef(new Set<SpaceId>());
  const reveal = (id: SpaceId) => {
    if (!ready || pathKnown(id) || revealing.current.has(id)) return;
    revealing.current.add(id);
    void store.sidebar({ expand: [], reveal: [id] }).then(
      (rows) => {
        const added = rows.filter((r) => r.parentId);
        mergeRows(added, [...new Set(added.map((r) => r.parentId as string))]);
      },
      (err: unknown) => {
        revealing.current.delete(id);
        console.error("[spaces] a page's place in the tree could not be read", err);
      },
    );
  };
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
      const doc = await store.create({ parentId, afterId: options?.afterId, title: options?.title, blocks: options?.blocks });
      fresh.current.set(doc.id, doc);
      if (options?.open !== false) {
        focusTitle.current = doc.id;
        open(doc.id);
      }
      return doc;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't create the page.");
      throw err;
    }
  };
  const patchSummary: SpacesContextValue["patchSummary"] = (id, patch) => {
    setAll((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const [epochs, setEpochs] = useState<Record<SpaceId, number>>({});
  const pageEpoch = (id: SpaceId) => epochs[id] ?? 0;
  /** The page's screen re-opens on `doc` (already stored) — a screen opened before it was written shows it. */
  const reopenWith = (doc: SpaceDoc) => {
    fresh.current.set(doc.id, doc);
    setEpochs((prev) => ({ ...prev, [doc.id]: (prev[doc.id] ?? 0) + 1 }));
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
  const addSample = async (opts?: { asTemplate?: boolean }) => {
    if (sampleProgress) return;
    setSampleProgress("0");
    try {
      const existed = (await findSamplePage(store))?.id ?? null;
      // The page and its tables share one organization: an existing sample page's own organization;
      // a new page and its tables go to the write organization (asked for when none is chosen).
      const root = await addTravelingSmmSample(
        store,
        {
          orgOf: async (id) => {
            const org = await pageOrganizationId(id);
            if (!org) throw new Error("We couldn't read the sample page's organization.");
            return org;
          },
          // org-filter: write-target a new sample page and its tables are filed in the active organization
          writeOrg: () => ensureOrgId(orgRef.current),
          install: (orgId) => installAgencySample(orgId, dispatch, setSampleProgress),
          createRoot: async (orgId, title) => {
            const doc = await createDatabaseSpacesStore(orgId).create({ parentId: null, title });
            store.notifyTree();
            return doc;
          },
        },
        (done, total) => setSampleProgress(`${done}/${total}`),
      );
      const plan = sampleTemplatePlan(Boolean(opts?.asTemplate), existed, root.id);
      if (plan.kind === "copy") {
        const copyId = await copyTemplate(plan.of, root.title, orgRef.current);
        // A copy filed in another organization reads that organization's own agency tables.
        const copyOrg = await pageOrganizationId(copyId);
        if (copyOrg && copyOrg !== (await pageOrganizationId(plan.of))) {
          setSampleProgress("Making tables…");
          await pointCopyAtItsTables(store, copyId, await installAgencySample(copyOrg, dispatch, setSampleProgress));
        }
        showCopy(copyId, root.title, plan.of);
      } else {
        // The page may have been opened while it was being made: it opens again on the finished content.
        reopenWith(root);
        open(plan.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't add the sample.", {
          duration: Infinity,
          action: { label: "Try again", onClick: () => void addSample(opts) },
        });
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
  /** A template copy's sidebar row shows at once (top-level, last: created order), the tree re-reads, the copy opens. */
  const showCopy = (copyId: SpaceId, title: string, sourceId: SpaceId) => {
    const source = all.find((s) => s.id === sourceId);
    const now = new Date().toISOString();
    setAll((prev) => (prev.some((s) => s.id === copyId) ? prev : [...prev, { id: copyId, parentId: null, position: topLevelLast(prev), title: title || "Untitled", icon: source?.icon ?? null, isArchived: false, updatedAt: now }]));
    store.notifyTree();
    open(copyId);
  };
  const applyTemplate = async (id: SpaceId, title: string) => {
    try {
      const copyId = await copyTemplate(id, title, orgRef.current);
      // Filed in another organization: its tables come along (copied there, the blocks pointed at them).
      try {
        const brought = await bringTemplateTables(store, copyId, setSampleProgress);
        if (brought) toast.info(brought === 1 ? "1 table copied with the template" : `${brought} tables copied with the template`);
      } finally {
        setSampleProgress(null);
      }
      showCopy(copyId, title, id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't use this template.");
    }
  };
  const archiveSpace = (id: SpaceId) => store.archive(id);
  /** A position after every top-level page (top-level order is created order). */
  const topLevelLast = (list: SpaceSummary[]) => list.filter((s) => !s.parentId).map((s) => s.position).sort().at(-1)?.concat("z") ?? "z";
  const restoreSpace = (id: SpaceId) => store.restore(id);
  const duplicateSpace = async (id: SpaceId) => {
    const copy = await store.duplicate(id, { withChildren: true });
    // The copy opens with its content at once (the duplicate already read it), never blank while re-read.
    fresh.current.set(copy.id, copy);
    return copy;
  };
  const moveSpace: SpacesContextValue["moveSpace"] = async (id, targetId, placement) => {
    if (targetId === id) return;
    if (placement === "inside" || targetId === null) {
      // Last among the target's children: read them first when the tree has not loaded them yet.
      const kids = targetId && !loadedRef.current.has(targetId) ? (await store.children(targetId)).sort(byPosition) : childrenOf(targetId);
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

  // Link targets the tree does not hold and the route did not read (`space-links.tsx`): a link added after
  // load. Round 40: every link asking in the same moment goes in ONE read (`content.space_summaries`), never
  // one full page read each. Row security decides; never the organization. Archived = not shown as a page.
  const [linked, setLinked] = useState<Map<SpaceId, SpaceSummary | null>>(new Map());
  const asked = useRef(new Set<SpaceId>());
  const pendingLinks = useRef<SpaceId[]>([]);
  const linkTarget = (id: SpaceId): SpaceSummary | null | undefined => visibleById.get(id) ?? linked.get(id);
  const flushLinks = () => {
    const ids = pendingLinks.current;
    pendingLinks.current = [];
    if (!ids.length) return;
    void store.summaries(ids).then(
      (found) => {
        const byFound = new Map(found.map((s) => [s.id, s]));
        setLinked((prev) => {
          const next = new Map(prev);
          for (const id of ids) {
            const s = byFound.get(id);
            next.set(id, s && !s.isArchived ? s : null);
          }
          return next;
        });
      },
      (err: unknown) => {
        console.error("[spaces] linked pages could not be read", err);
        setLinked((prev) => {
          const next = new Map(prev);
          for (const id of ids) next.set(id, null);
          return next;
        });
      },
    );
  };
  const requestLink = (id: SpaceId) => {
    if (!ready || visibleById.has(id) || asked.current.has(id)) return;
    asked.current.add(id);
    pendingLinks.current.push(id);
    if (pendingLinks.current.length === 1) setTimeout(flushLinks, 0);
  };

  const value: SpacesContextValue = {
    linkTarget,
    requestLink,
    store,
    ready,
    loadError,
    access,
    retryLoad: () => reload.current(),
    patchSummary,
    takeFocusTitle,
    openToName: (id) => {
      focusTitle.current = id;
      open(id);
    },
    takeFresh,
    pageEpoch,
    reopenPage: (id) => setEpochs((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 })),
    sample: { adding: sampleProgress !== null, progress: sampleProgress, add: addSample },
    templates: { ids: templateIds, error: templatesError, refresh: refreshTemplates, setTemplate: markTemplate, use: applyTemplate },
    summaries: visible,
    archived,
    loadTrash,
    trashLoaded: trash !== null,
    childrenLoaded: (parentId) => loadedParents.has(parentId),
    loadChildren,
    reveal,
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
    openQuickFind: (mode = "jump", onPick, create) => setQuickFind({ open: true, mode, onPick, create }),
    closeQuickFind: () => setQuickFind({ open: false, mode: "jump" }),
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  };
  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export type { SpacesContextValue };

/**
 * A read-only page with no workspace around it (the public web page, J1): the blocks read `byId`, `open`
 * and `pathTo` from here. The caller builds a value whose writing doors refuse — nothing on that screen writes.
 */
export function StaticSpacesProvider({ value, children }: { value: SpacesContextValue; children: ReactNode }) {
  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}
