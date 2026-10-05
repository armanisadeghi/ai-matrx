"use client";

// features/spaces/sidebar/SpacesSidebar.tsx — the Notion sidebar (§D): header, Search, Favorites and
// Private sections, the page tree (expand, hover + and •••, drag to reorder / nest), Trash.

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Badge, Button, Input, SearchField } from "@ai-matrx/design-system/controls";
import {
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
  SquarePen,
  Star,
  StarOff,
  Trash2,
  Undo2,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState, type DragEvent } from "react";

import { toast } from "@/lib/toast";

import type { SpaceId, SpaceSummary } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces, type DropPlacement } from "../state/SpacesProvider";

const EXPANDED_KEY = "spaces:expanded";

function RowMenu({ space, onRename }: { space: SpaceSummary; onRename: () => void }) {
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
        <button type="button" className="spaces-row-action" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-[240px] p-1" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="spaces-menu-row" onClick={act(() => spaces.toggleFavorite(space.id))}>
          <span className="spaces-menu-row-icon">{fav ? <StarOff size={16} /> : <Star size={16} />}</span>
          {fav ? "Remove from Favorites" : "Add to Favorites"}
        </button>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          className="spaces-menu-row"
          onClick={act(() => {
            void navigator.clipboard.writeText(`${window.location.origin}/spaces/${space.id}`).then(() => toast.success("Copied link"));
          })}
        >
          <span className="spaces-menu-row-icon">
            <LinkIcon size={16} />
          </span>
          Copy link
        </button>
        <button type="button" className="spaces-menu-row" onClick={act(() => void spaces.duplicateSpace(space.id))}>
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
        <button type="button" className="spaces-menu-row" data-danger="true" onClick={act(() => void spaces.archiveSpace(space.id).then(() => toast.success("Moved to Trash")))}>
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
    if (doc && doc.title !== title) await store.save({ ...doc, title }, doc.version);
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
      <PopoverContent align="start" className="w-[300px] p-1.5">
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
            <button
              type="button"
              className="spaces-row-chevron"
              aria-label={isOpen ? "Collapse" : "Expand"}
              onClick={(e) => {
                e.stopPropagation();
                toggle(space.id);
              }}
            >
              <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : undefined }} />
            </button>
          </span>
          <span className="spaces-row-title">{space.title || "Untitled"}</span>
          <span className="spaces-row-actions">
            <RowMenu space={space} onRename={() => setRenaming(true)} />
            <button
              type="button"
              className="spaces-row-action"
              aria-label="Add a page inside"
              onClick={(e) => {
                e.stopPropagation();
                toggle(space.id, true);
                void spaces.createSpace(space.id);
              }}
            >
              <Plus size={15} />
            </button>
          </span>
        </div>
      </RenamePopover>
      {isOpen ? (
        kids.length ? (
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
        <button type="button" className="spaces-section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {title}
        </button>
        {onAdd ? (
          <button type="button" className="spaces-row-action opacity-0 group-hover/section:opacity-100" aria-label={`Add a page in ${title}`} onClick={onAdd}>
            <Plus size={15} />
          </button>
        ) : null}
      </div>
      {open ? <div role="tree">{children}</div> : null}
    </div>
  );
}

function TrashPopover() {
  const { archived, restoreSpace, open } = useSpaces();
  const [q, setQ] = useState("");
  const list = archived.filter((s) => (s.title || "Untitled").toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="spaces-nav-row">
          <Trash2 size={17} />
          Trash
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-[400px] p-2">
        <SearchField placeholder="Search pages in Trash" value={q} onChange={(e) => setQ(e.target.value)} className="w-full" />
        <div className="mt-2 max-h-[320px] overflow-y-auto">
          {list.map((s) => (
            <div key={s.id} className="spaces-trash-row" data-clickable="" onClick={() => open(s.id)}>
              <SpaceIcon media={s.icon} size={17} />
              <span className="min-w-0 flex-1 truncate text-sm">{s.title || "Untitled"}</span>
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
          {list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No pages in Trash</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SpacesSidebarContent({ onCollapse }: { onCollapse?: () => void }) {
  const spaces = useSpaces();
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
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Spaces</span>
        {onCollapse ? (
          <button type="button" className="spaces-row-action spaces-collapse" aria-label="Close sidebar" title="Close sidebar (Cmd+\)" onClick={onCollapse}>
            <ChevronsLeft size={17} />
          </button>
        ) : null}
        <button type="button" className="spaces-row-action" aria-label="New page" onClick={() => void spaces.createSpace(null)}>
          <SquarePen size={16} />
        </button>
      </div>
      {spaces.store.kind === "memory" ? (
        <div className="spaces-sample-marker">
          <Badge tone="warning" title="Changes last until you reload">
            Sample data — not saved
          </Badge>
        </div>
      ) : null}
      <button type="button" className="spaces-nav-row" onClick={() => spaces.openQuickFind("jump")}>
        <Search size={17} />
        Search
        <span className="ml-auto text-xs text-muted-foreground">⌘K</span>
      </button>

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
        <TrashPopover />
      </div>
    </div>
  );
}
