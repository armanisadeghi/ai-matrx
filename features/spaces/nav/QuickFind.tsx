"use client";

// features/spaces/nav/QuickFind.tsx — Cmd+K / Cmd+P quick find (E1), and the page picker that
// "Link to page" and "Move to" open (same list, different action).

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { CornerDownLeft, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useClaimSearchKeys } from "@/features/shell/hooks/useClaimSearchKeys";

import type { SpaceMedia } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";

interface Hit {
  id: string;
  title: string;
  icon?: SpaceMedia | null;
  /** Ancestors' titles, top first ("" = top level). */
  path: string;
  snippet?: string;
}

/** The "New page" row's place in the list (it has no page id). */
const NEW_PAGE = "new-page";

export function QuickFind() {
  const { quickFind, closeQuickFind, byId, recent, store, open, pathTo, openQuickFind } = useSpaces();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Round 35: matches come from the server's search door (titles, then page text), never from a whole
  // tree held in the browser. `found` answers `foundFor`; an older answer never replaces a newer one.
  const [found, setFound] = useState<{ q: string; hits: Hit[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Cmd+P anywhere in Spaces: the route owns both keys (shell's sanctioned claim).
  useClaimSearchKeys(["k", "p"], (key, e) => {
    // Inside the editor Cmd+K is "add link" when text is selected (Notion does the same).
    const sel = window.getSelection();
    if (key === "k" && sel && !sel.isCollapsed && (e.target as HTMLElement | null)?.closest?.(".bn-editor")) return false;
    openQuickFind("jump");
    return true;
  });

  useEffect(() => {
    if (!quickFind.open) return;
    setQuery("");
    setActive(0);
  }, [quickFind.open]);

  const q = query.trim().toLowerCase();
  useEffect(() => {
    if (!quickFind.open) return;
    let live = true;
    const t = window.setTimeout(
      () =>
        void store.search(q, 50).then(
          (rows) => {
            if (!live) return;
            setFailed(false);
            setFound({ q, hits: rows.map((r) => ({ id: r.id, title: r.title, icon: r.icon, path: r.path, snippet: r.snippet })) });
          },
          (err: unknown) => {
            console.error("[spaces] page search failed", err);
            if (live) setFailed(true);
          },
        ),
      q ? 120 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [quickFind.open, q, store]);

  const known = (id: string): Hit | null => {
    const s = byId.get(id);
    if (!s) return null;
    const parents = pathTo(id).slice(0, -1);
    return { id, title: s.title, icon: s.icon, path: parents.map((p) => p.title || "Untitled").join(" / ") };
  };
  const serverHits = found && found.q === q ? found.hits : [];
  let hits: Hit[];
  if (!q) {
    // Recently visited first (the ones the tree holds), then the server's most recently edited.
    const recentHits = recent.map(known).filter((h): h is Hit => Boolean(h));
    const seen = new Set(recentHits.map((h) => h.id));
    hits = [...recentHits, ...serverHits.filter((h) => !seen.has(h.id))].slice(0, 30);
  } else {
    hits = serverHits.slice(0, 50);
  }
  const searching = Boolean(q) && !failed && (!found || found.q !== q);
  // Link to page / `[[` / `[+`: typing a name also offers a new sub-page with that name (Notion).
  const create = quickFind.mode === "pick" ? quickFind.create : undefined;
  const newTitle = query.trim();
  if (create && newTitle) hits = create.first ? [{ id: NEW_PAGE, title: "", path: "" }, ...hits] : [...hits, { id: NEW_PAGE, title: "", path: "" }];

  const choose = (id: string) => {
    const pick = quickFind.onPick;
    closeQuickFind();
    if (id === NEW_PAGE) {
      create?.onCreate(newTitle);
      return;
    }
    if (quickFind.mode === "pick" && pick) pick(id);
    else open(id);
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog open={quickFind.open} onOpenChange={(o) => (o ? null : closeQuickFind())}>
      <DialogContent className="spaces-quickfind top-[12vh] max-w-[620px] translate-y-0 gap-0 overflow-hidden p-0" showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{quickFind.mode === "pick" ? "Choose a page" : "Search"}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={18} className="shrink-0 text-muted-foreground" />
          <Input
            variant="bare"
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(hits.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && hits[active]) {
                e.preventDefault();
                choose(hits[active].id);
              }
            }}
            placeholder={quickFind.mode === "pick" ? "Search for a page…" : "Search Spaces…"}
            className="h-12 flex-1 text-base"
            aria-label="Search"
          />
        </div>
        <div ref={listRef} className="max-h-[min(60vh,480px)] overflow-y-auto p-1">
          <p className="px-3 pb-1 pt-2 type-secondary font-medium text-muted-foreground">{q ? "Best matches" : "Recent"}</p>
          {hits.map((hit, i) => {
            if (hit.id === NEW_PAGE) {
              return (
                <button
                  key={NEW_PAGE}
                  type="button"
                  data-index={i}
                  data-active={i === active ? "true" : undefined}
                  className="spaces-qf-row"
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(NEW_PAGE)}
                >
                  <span className="spaces-qf-icon">
                    <Plus size={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left type-body">New page “{newTitle}”</span>
                  {i === active ? <CornerDownLeft size={14} className="shrink-0 text-muted-foreground" /> : null}
                </button>
              );
            }
            return (
              <button
                key={hit.id}
                type="button"
                data-index={i}
                data-active={i === active ? "true" : undefined}
                className="spaces-qf-row"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(hit.id)}
              >
                <span className="spaces-qf-icon">
                  <SpaceIcon media={hit.icon ?? null} size={18} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate type-body">
                    {hit.title || "Untitled"}
                    {hit.path ? <span className="text-muted-foreground"> — {hit.path}</span> : null}
                  </span>
                  {hit.snippet ? <span className="block truncate type-secondary text-muted-foreground">{hit.snippet}</span> : null}
                </span>
                {i === active ? <CornerDownLeft size={14} className="shrink-0 text-muted-foreground" /> : null}
              </button>
            );
          })}
          {failed ? <p className="px-3 py-6 text-center type-body text-muted-foreground">Search is unavailable. Type again to retry.</p> : null}
          {searching && hits.length === 0 ? <RegionSkeleton shape="rows" count={3} aria-label="Searching" /> : null}
          {!failed && !searching && hits.length === 0 ? <p className="px-3 py-6 text-center type-body text-muted-foreground">No results</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
