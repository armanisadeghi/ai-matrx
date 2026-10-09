"use client";

/**
 * The two ways to put things on a board, both built from the same rows (`add-menu-rows.ts`) over
 * EVERY registered item type (`items/catalog.ts`) — a feature added to the catalog appears here with
 * no change to this file, under the section its type declares:
 *   AddMenu     the toolbar's "Add" button: search box, Recent, then one list by section;
 *   StartPanel  what an empty board shows: the same sections, one click and you are working.
 * One row per thing: a click starts it new (or activates the canvas tool); a type that can also be
 * brought in has a second door on the same row (the icon at its end, or Shift+Enter).
 */

import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ReactReduxContext } from "react-redux";
import { ChevronDown, Ellipsis, FolderInput, Plus, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { BoardCameraStoreContext } from "../engine/react";
import type { BoardTool } from "../engine/tools";
import { boardSectionLabel, type BoardItemType, type StartNewEntry } from "../items/types";
import {
  buildAddRows,
  filterAddRows,
  groupBySection,
  pushRecentAdd,
  readRecentAdds,
  recentRows,
  writeRecentAdds,
  type AddRow,
} from "./add-menu-rows";

interface AddProps {
  types: readonly BoardItemType[];
  /** A preset's less-important types: listed last under "More" (none = no group). */
  more?: readonly BoardItemType[];
  onStartNew: (type: BoardItemType, entry: StartNewEntry) => void;
  onBringIn: (type: BoardItemType) => void;
  /** The canvas tools the board offers (a preset's toolbar); omitted = all. */
  canvasTools?: readonly BoardTool[];
}

/** This person's recent adds: read after mount (storage is the browser's), written on every add. */
function useRecentAdds() {
  // Optional: a bare render with no redux Provider (a test, a demo) has no person, so no recents.
  const redux = useContext(ReactReduxContext);
  const userId = redux ? selectUserId(redux.store.getState() as Parameters<typeof selectUserId>[0]) : null;
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => setIds(readRecentAdds(userId)), [userId]);
  const remember = (id: string) =>
    setIds((cur) => {
      const next = pushRecentAdd(cur, id);
      writeRecentAdds(userId, next);
      return next;
    });
  return { ids, remember };
}

/** Run a row's click: a tool activates, a type starts new (or opens its picker). */
function useRowActions({ onStartNew, onBringIn }: Pick<AddProps, "onStartNew" | "onBringIn">, remember: (id: string) => void) {
  const store = useContext(BoardCameraStoreContext);
  return {
    run: (row: AddRow) => {
      if (row.primary.kind === "tool") store?.setTool(row.primary.tool);
      else if (row.type) {
        remember(row.id);
        if (row.primary.kind === "new") onStartNew(row.type, row.primary.entry);
        else onBringIn(row.type);
      }
    },
    bringIn: (row: AddRow) => {
      if (!row.type) return;
      remember(row.id);
      onBringIn(row.type);
    },
  };
}

export function AddMenu({ types, more = [], onStartNew, onBringIn, canvasTools }: AddProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const { ids, remember } = useRecentAdds();
  const { run, bringIn } = useRowActions({ onStartNew, onBringIn }, remember);
  const rows = useMemo(() => buildAddRows(types, canvasTools), [types, canvasTools]);
  const moreRows = useMemo(() => buildAddRows(more, []), [more]);
  const searching = query.trim().length > 0;
  const found = useMemo(() => (searching ? filterAddRows([...rows, ...moreRows], query) : []), [searching, rows, moreRows, query]);
  const recents = useMemo(() => recentRows(rows, ids), [rows, ids]);
  const byId = useMemo(() => new Map([...rows, ...moreRows].map((r) => [r.id, r])), [rows, moreRows]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (row: AddRow) => {
    close();
    run(row);
  };
  const pickBringIn = (row: AddRow) => {
    close();
    bringIn(row);
  };
  // cmdk values are `<scope>|<row id>`: the same row can sit in Recent and in its section.
  const selectedRow = byId.get(active.split("|")[1] ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
          <ChevronDown className="h-3 w-3 opacity-80" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" data-board-chrome>
        <Command
          shouldFilter={false}
          loop
          value={active}
          onValueChange={setActive}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey && selectedRow?.bringIn) {
              e.preventDefault();
              pickBringIn(selectedRow);
            }
          }}
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search" aria-label="Search what to add" />
          <CommandList className="max-h-[min(26rem,70vh)]">
            <CommandEmpty>Nothing matches</CommandEmpty>
            {searching ? (
              <CommandGroup>
                {found.map((r) => (
                  <AddRowItem key={r.id} scope="found" row={r} onPick={pick} onBringIn={pickBringIn} showSection />
                ))}
              </CommandGroup>
            ) : (
              <>
                {recents.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recents.map((r) => (
                      <AddRowItem key={r.id} scope="recent" row={r} onPick={pick} onBringIn={pickBringIn} />
                    ))}
                  </CommandGroup>
                )}
                {groupBySection(rows).map((g) => (
                  <CommandGroup key={g.section} heading={g.label}>
                    {g.rows.map((r) => (
                      <AddRowItem key={r.id} scope="all" row={r} onPick={pick} onBringIn={pickBringIn} />
                    ))}
                  </CommandGroup>
                ))}
                {moreRows.length > 0 && (
                  <CommandGroup heading="More">
                    {moreRows.map((r) => (
                      <AddRowItem key={r.id} scope="more" row={r} onPick={pick} onBringIn={pickBringIn} showSection />
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddRowItem({
  row,
  scope,
  onPick,
  onBringIn,
  showSection = false,
}: {
  row: AddRow;
  scope: string;
  onPick: (row: AddRow) => void;
  onBringIn: (row: AddRow) => void;
  showSection?: boolean;
}) {
  const Icon = row.icon;
  return (
    <CommandItem value={`${scope}|${row.id}`} onSelect={() => onPick(row)} className="gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">{row.label}</span>
      {showSection && <span className="shrink-0 text-xs text-muted-foreground">{boardSectionLabel(row.section)}</span>}
      {row.bringIn && (
        <button
          type="button"
          title={`Bring in: ${row.bringIn.label}`}
          aria-label={`Bring in: ${row.bringIn.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onBringIn(row);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <FolderInput className="h-3.5 w-3.5" />
        </button>
      )}
    </CommandItem>
  );
}

export function StartPanel({ types, more = [], onStartNew, onBringIn, templates }: AddProps & { templates?: ReactNode }) {
  const [showMore, setShowMore] = useState(false);
  const { ids, remember } = useRecentAdds();
  const { run, bringIn } = useRowActions({ onStartNew, onBringIn }, remember);
  // The board's tools are on its toolbar, one glance away: the panel offers what you can make.
  const rows = useMemo(
    () => buildAddRows(showMore ? [...types, ...more] : types, []),
    [types, more, showMore],
  );
  const recents = useMemo(() => recentRows(rows, ids), [rows, ids]);
  const card = (r: AddRow, scope: string) => {
    const Icon = r.icon;
    return (
      <div key={`${scope}:${r.id}`} className="relative">
        <button
          type="button"
          onClick={() => run(r)}
          className="flex w-full flex-col items-start gap-2 rounded-xl border border-border bg-background p-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
        >
          <Icon className="h-5 w-5 text-primary" />
          {r.label}
        </button>
        {r.bringIn && (
          <button
            type="button"
            title={`Bring in: ${r.bringIn.label}`}
            aria-label={`Bring in: ${r.bringIn.label}`}
            onClick={() => bringIn(r)}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FolderInput className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  };
  return (
    <div
      data-start-panel-frame
      // The top and bottom padding is the board's chrome band (BoardViewport insets: 72 top for the
      // Add toolbar and zoom bar, 56 bottom), so the panel can never sit under them at any width. The minimap (bottom-right, 200px wide, md and up)
      // would meet a panel this wide below 1104px, so those widths also keep the minimap's height clear.
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4 pb-14 pt-[72px] md:pb-40 min-[1104px]:pb-14"
    >
      <section
        data-board-chrome
        aria-label="Start working on your board"
        className="pointer-events-auto max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur"
      >
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What do you want to work on?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Start something new or bring in what you already have. Everything you add stays on this board, side by side.
        </p>
        {recents.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{recents.map((r) => card(r, "recent"))}</div>
          </>
        )}
        {groupBySection(rows).map((g) => (
          <section key={g.section} aria-label={g.label}>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{g.rows.map((r) => card(r, "all"))}</div>
          </section>
        ))}
        {more.length > 0 && !showMore && (
          <button
            type="button"
            aria-label="More"
            title="More"
            onClick={() => setShowMore(true)}
            className={cn(
              "mt-3 flex h-8 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5",
            )}
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        )}
        {templates}
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          Or drop files anywhere on the board, or paste a link or some text.
        </p>
      </section>
    </div>
  );
}
