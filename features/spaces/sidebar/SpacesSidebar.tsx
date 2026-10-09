"use client";

// features/spaces/sidebar/SpacesSidebar.tsx — the Notion sidebar (§D): header, Search, Favorites and
// Private sections, the page tree (expand, hover + and •••, drag to reorder / nest), Trash.

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input, RegionSkeleton, SearchField } from "@ai-matrx/design-system/controls";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  CornerUpRight,
  ExternalLink,
  Link as LinkIcon,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  House,
  SquarePen,
  Star,
  StarOff,
  Trash2,
  LayoutTemplate,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent } from "react";

import { toast } from "@/lib/toast";

import type { SpaceId, SpaceSummary } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { EXPANDED_KEY, useSpaces, type DropPlacement } from "../state/SpacesProvider";
import { ImportButton } from "./ImportMenu";
import { SitesPopover } from "./SitesPopover";
import { TemplateGallery } from "./TemplateGallery";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { useSpaceBuilder } from "../ai/SpaceBuilder";
import { signInHref } from "../workspace/LoadAccessState";


/** The current page's row scrolls into view when it appears (D9), without moving the page itself. */
function scrollIntoViewOnce(el: HTMLDivElement | null) {
  if (!el) return;
  const box = el.closest(".spaces-sidebar-scroll");
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 2 + r.height / 2;
}

/** The New page button's menu: a blank page, or a whole Space built by the Space Builder. */
function NewPageMenu({ onNewPage }: { onNewPage: () => void }) {
  const builder = useSpaceBuilder();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ChevronDown size={14} />} aria-label="New page options" />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="sm" padding="xs">
        <button type="button" className="spaces-menu-row" onClick={() => { setOpen(false); onNewPage(); }}>
          <SquarePen size={15} /> New page
        </button>
        <button type="button" className="spaces-menu-row" onClick={() => { setOpen(false); builder.ask(null); }}>
          <AGENT_ICON size={15} /> Build with AI
        </button>
      </PopoverContent>
    </Popover>
  );
}

function RowMenu({ space, onRename }: { space: SpaceSummary; onRename: () => void }) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const spaces = useSpaces();
  const [open, setOpen] = useState(false);
  const fav = spaces.favorites.includes(space.id);
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<MoreHorizontal size={15} />} aria-label="More actions" onClick={(e) => e.stopPropagation()} />
      </PopoverTrigger>
      {/* Closes instantly (Notion): a row that leaves the tree (Move to Trash) must not take an open menu
          with it — an anchorless menu would be drawn at the top-left corner during its exit. */}
      <PopoverContent surface="solid" align="start" side="right" width="sm" padding="xs" className="data-[state=closed]:hidden" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="spaces-menu-row" onClick={act(() => spaces.toggleFavorite(space.id))}>
          <span className="spaces-menu-row-icon">{fav ? <StarOff size={16} /> : <Star size={16} />}</span>
          {fav ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          className="spaces-menu-row"
          onClick={act(() => {
            void copyText(`${window.location.origin}/spaces/${space.id}`, "Copied link");
          })}
        >
          <span className="spaces-menu-row-icon">
            <LinkIcon size={16} />
          </span>
          Copy link
        </button>
        <button type="button" className="spaces-menu-row" onClick={act(() =>
            void spaces
              .duplicateSpace(space.id)
              .then((copy) => spaces.open(copy.id))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't duplicate this page.")),
          )}>
          <span className="spaces-menu-row-icon">
            <Copy size={16} />
          </span>
          Duplicate
        </button>
        <button type="button" className="spaces-menu-row" onClick={act(onRename)}>
          <span className="spaces-menu-row-icon">
            <PenLine size={16} />
          </span>
          Rename
        </button>
        <button
          type="button"
          className="spaces-menu-row"
          onClick={act(() =>
            spaces.openQuickFind("pick", (target) => {
              void spaces.moveSpace(space.id, target, "inside").catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not move"));
            }),
          )}
        >
          <span className="spaces-menu-row-icon">
            <CornerUpRight size={16} />
          </span>
          Move to
        </button>
        <button type="button" className="spaces-menu-row" data-danger="true" onClick={act(() =>
            void spaces
              .archiveSpace(space.id)
              .then(() => toast.success("Moved to Trash"))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't move this page to Trash.")),
          )}>
          <span className="spaces-menu-row-icon">
            <Trash2 size={16} />
          </span>
          Move to Trash
        </button>
        <div className="my-1 border-t border-border" />
        <button type="button" className="spaces-menu-row" onClick={act(() => window.open(`/spaces/${space.id}`, "_blank", "noopener"))}>
          <span className="spaces-menu-row-icon">
            <ExternalLink size={16} />
          </span>
          Open in new tab
        </button>
      </PopoverContent>
    </Popover>
  );
}

function RenamePopover({ space, open, onOpenChange, children }: { space: SpaceSummary; open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  const { store } = useSpaces();
  const [title, setTitle] = useState(space.title);
  const commit = async () => {
    onOpenChange(false);
    const doc = await store.get(space.id);
    if (doc && doc.title !== title) {
      await store.save({ ...doc, title }, doc.version).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "We couldn't rename this page."));
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setTitle(space.title);
        onOpenChange(o);
      }}
    >
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent surface="solid" align="start" width="md" padding="xs">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") onOpenChange(false);
          }}
          onBlur={() => void commit()}
          aria-label="Page title"
        />
      </PopoverContent>
    </Popover>
  );
}

interface DragState {
  id: SpaceId | null;
  over: SpaceId | null;
  placement: DropPlacement | null;
}

function TreeRow({
  space,
  depth,
  expanded,
  toggle,
  currentId,
  drag,
  setDrag,
}: {
  space: SpaceSummary;
  depth: number;
  expanded: Set<SpaceId>;
  toggle: (id: SpaceId, open?: boolean) => void;
  currentId: SpaceId | null;
  drag: DragState;
  setDrag: (d: DragState) => void;
}) {
  const spaces = useSpaces();
  const kids = spaces.childrenOf(space.id);
  const isOpen = expanded.has(space.id);
  const kidsLoaded = spaces.childrenLoaded(space.id);
  // Notion's lazy tree: an open row reads its sub-pages the first time it is shown open.
  useEffect(() => {
    if (isOpen && !kidsLoaded) void spaces.loadChildren(space.id);
  }, [isOpen, kidsLoaded, space.id, spaces]);
  const [renaming, setRenaming] = useState(false);
  const dropHere = drag.over === space.id && drag.id !== space.id ? drag.placement : null;

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!drag.id || drag.id === space.id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    const placement: DropPlacement = y < 0.25 ? "before" : y > 0.75 ? "after" : "inside";
    if (drag.over !== space.id || drag.placement !== placement) setDrag({ ...drag, over: space.id, placement });
  };

  return (
    <>
      <RenamePopover space={space} open={renaming} onOpenChange={setRenaming}>
        <div
          role="treeitem"
          aria-expanded={isOpen}
          aria-selected={currentId === space.id}
          tabIndex={0}
          data-clickable=""
          className="spaces-row group/row"
          data-current={currentId === space.id ? "true" : undefined}
          ref={currentId === space.id ? scrollIntoViewOnce : undefined}
          data-drop={dropHere ?? undefined}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", space.title);
            setDrag({ id: space.id, over: null, placement: null });
          }}
          onDragEnd={() => setDrag({ id: null, over: null, placement: null })}
          onDragOver={onDragOver}
          onDragLeave={() => drag.over === space.id && setDrag({ ...drag, over: null, placement: null })}
          onDrop={(e) => {
            e.preventDefault();
            if (drag.id && drag.placement) {
              const moving = drag.id;
              void spaces.moveSpace(moving, space.id, drag.placement).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not move"));
              if (drag.placement === "inside") toggle(space.id, true);
            }
            setDrag({ id: null, over: null, placement: null });
          }}
          onClick={() => spaces.open(space.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") spaces.open(space.id);
            if (e.key === "ArrowRight") toggle(space.id, true);
            if (e.key === "ArrowLeft") toggle(space.id, false);
          }}
        >
          <span className="spaces-row-icon">
            <span className="spaces-row-glyph">
              <SpaceIcon media={space.icon} size={17} />
            </span>
            <Button variant="quiet" icon={<ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />} aria-label={isOpen ? "Collapse" : "Expand"} onClick={(e) => {
                e.stopPropagation();
                toggle(space.id);
              }} />
          </span>
          <span className="spaces-row-title">{space.title || "Untitled"}</span>
          <span className="spaces-row-actions">
            <RowMenu space={space} onRename={() => setRenaming(true)} />
            <Button variant="quiet" icon={<Plus size={15} />} aria-label="Add a page inside" onClick={(e) => {
                e.stopPropagation();
                toggle(space.id, true);
                void spaces.createSpace(space.id);
              }} />
          </span>
        </div>
      </RenamePopover>
      {isOpen ? (
        !kidsLoaded && !kids.length ? (
          <div style={{ paddingLeft: 8 + (depth + 1) * 12 }}>
            <RegionSkeleton shape="rows" count={1} aria-label="Reading pages inside" />
          </div>
        ) : kids.length ? (
          kids.map((k) => <TreeRow key={k.id} space={k} depth={depth + 1} expanded={expanded} toggle={toggle} currentId={currentId} drag={drag} setDrag={setDrag} />)
        ) : (
          <div className="spaces-row-empty" style={{ paddingLeft: 8 + (depth + 1) * 12 + 22 }}>
            No pages inside
          </div>
        )
      ) : null}
    </>
  );
}

function Section({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3">
      <div className="spaces-section-head group/section">
        <Button variant="quiet" onClick={() => setOpen(!open)} aria-expanded={open}>
          {title}
        </Button>
        {onAdd ? (
          <Button variant="quiet" icon={<Plus size={15} />} aria-label={`Add a page in ${title}`} onClick={onAdd} className="opacity-0 group-hover/section:opacity-100" />
        ) : null}
      </div>
      {open ? <div role="tree">{children}</div> : null}
    </div>
  );
}

/** Notion's sidebar "Templates": opens the template picker (I2). */
function TemplatesButton() {
  const { sample } = useSpaces();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="spaces-nav-row" onClick={() => setOpen(true)}>
        <LayoutTemplate size={17} />
        Templates
        {sample.adding ? <span className="ml-auto type-secondary text-muted-foreground">{sample.progress}</span> : null}
      </button>
      <TemplateGallery open={open} onOpenChange={setOpen} />
    </>
  );
}

function TrashPopover() {
  const { archived, restoreSpace, open, loadTrash, trashLoaded } = useSpaces();
  const [q, setQ] = useState("");
  const list = archived.filter((s) => (s.title || "Untitled").toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popover onOpenChange={(o) => o && loadTrash()}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<Trash2 size={17} />}>
          Trash
        </Button>
      </PopoverTrigger>
      <PopoverContent surface="solid" side="right" align="end" width="xl" padding="sm">
        <SearchField placeholder="Search pages in Trash" value={q} onChange={(e) => setQ(e.target.value)} className="w-full" />
        <div className="mt-2 max-h-[320px] overflow-y-auto">
          {list.map((s) => (
            <div key={s.id} className="spaces-trash-row" data-clickable="" onClick={() => open(s.id)}>
              <SpaceIcon media={s.icon} size={17} />
              <span className="min-w-0 flex-1 truncate type-body">{s.title || "Untitled"}</span>
              <Button
                variant="quiet"
                aria-label="Restore"
                icon={<Undo2 size={15} />}
                onClick={(e) => {
                  e.stopPropagation();
                  void restoreSpace(s.id).then(() => toast.success("Page restored"));
                }}
              />
            </div>
          ))}
          {!trashLoaded ? <RegionSkeleton shape="rows" count={4} aria-label="Reading Trash" /> : null}
          {trashLoaded && list.length === 0 ? <p className="py-6 text-center type-body text-muted-foreground">No pages in Trash</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SpacesSidebarContent({ onCollapse }: { onCollapse?: () => void }) {
  const spaces = useSpaces();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ spaceId?: string }>();
  const currentId = params?.spaceId ?? null;
  const [expanded, setExpanded] = useState<Set<SpaceId>>(new Set());
  const [drag, setDrag] = useState<DragState>({ id: null, over: null, placement: null });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw) as string[]));
    } catch {
      // view state only
    }
  }, []);

  const toggle = (id: SpaceId, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = open ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      try {
        window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        // view state only
      }
      return next;
    });
  };

  // The open page is not in the lazily read tree yet (opened from a link or search): read its path.
  useEffect(() => {
    if (currentId && spaces.ready) spaces.reveal(currentId);
  }, [currentId, spaces]);

  // The tree opens down to the current page (D9).
  const pathKey = currentId ? spaces.pathTo(currentId).map((p) => p.id).join("/") : "";
  useEffect(() => {
    if (!pathKey) return;
    const ancestors = pathKey.split("/").slice(0, -1);
    if (ancestors.some((a) => !expanded.has(a))) setExpanded((prev) => new Set([...prev, ...ancestors]));
    // Only when the current page (or its path) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  const roots = spaces.childrenOf(null);
  const favs = spaces.favorites.map((id) => spaces.byId.get(id)).filter((s): s is SpaceSummary => Boolean(s));
  const rowProps = { expanded, toggle, currentId, drag, setDrag };

  return (
    <div className="spaces-sidebar-inner">
      <div className="spaces-sidebar-head">
        <span className="spaces-workspace-mark">S</span>
        <span className="min-w-0 flex-1 truncate type-title">Spaces</span>
        {onCollapse ? (
          <Button variant="quiet" icon={<ChevronsLeft size={17} />} aria-label="Close sidebar" title="Close sidebar (Cmd+\)" onClick={onCollapse} />
        ) : null}
        <Button variant="quiet" icon={<SquarePen size={16} />} aria-label="New page" onClick={() => void spaces.createSpace(null)} />
        <NewPageMenu onNewPage={() => void spaces.createSpace(null)} />
      </div>
      <Button variant="quiet" icon={<Search size={17} />} onClick={() => spaces.openQuickFind("jump")}>
        Search
        <span className="ml-auto type-secondary text-muted-foreground">⌘K</span>
      </Button>
      <Button variant="quiet" className="justify-start" icon={<House size={17} />} data-active={pathname === "/spaces/home" || undefined} onClick={() => router.push(`/spaces/home${typeof window === "undefined" ? "" : window.location.search}`)}>
        Home
      </Button>

      <div className="spaces-sidebar-scroll">
        {favs.length ? (
          <Section title="Favorites">
            {favs.map((s) => (
              <TreeRow key={`fav-${s.id}`} space={s} depth={0} {...rowProps} />
            ))}
          </Section>
        ) : null}
        <Section title="Private" onAdd={() => void spaces.createSpace(null)}>
          {roots.map((s) => (
            <TreeRow key={s.id} space={s} depth={0} {...rowProps} />
          ))}
          {spaces.access === "signed-out" ? (
            <Link className="spaces-row-empty" href={signInHref(pathname)}>
              Sign in to see your pages
            </Link>
          ) : spaces.access === "no-access" ? (
            <div className="spaces-row-empty">No access to these pages</div>
          ) : spaces.loadError ? (
            <button type="button" className="spaces-row-empty spaces-row-error" onClick={spaces.retryLoad}>
              {spaces.loadError} Try again
            </button>
          ) : null}
          <div
            className="spaces-root-drop"
            data-drop={drag.id && drag.over === "__root" ? "after" : undefined}
            onDragOver={(e) => {
              if (!drag.id) return;
              e.preventDefault();
              if (drag.over !== "__root") setDrag({ ...drag, over: "__root", placement: "inside" });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag.id) void spaces.moveSpace(drag.id, null, "inside");
              setDrag({ id: null, over: null, placement: null });
            }}
          />
        </Section>
      </div>

      <div className="spaces-sidebar-foot">
        <TemplatesButton />
        <SitesPopover />
        <ImportButton />
        <TrashPopover />
      </div>
    </div>
  );
}
