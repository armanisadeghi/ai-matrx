"use client";

/**
 * The two ways to put things on a board, both listing EVERY registered item
 * type (`items/catalog.ts`) — so a feature added to the catalog appears here
 * with no change to this file:
 *   AddMenu     the toolbar's "Add" button;
 *   StartPanel  what an empty board shows: one click and you are working.
 */

import { useState } from "react";
import { ChevronDown, Ellipsis, Plus, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startNewEntries, type BoardItemType, type StartNewEntry } from "../items/types";

interface AddProps {
  types: readonly BoardItemType[];
  /** A preset's less-important types: folded behind a "…" control (none = no control). */
  more?: readonly BoardItemType[];
  onStartNew: (type: BoardItemType, entry: StartNewEntry) => void;
  onBringIn: (type: BoardItemType) => void;
}

export function AddMenu({ types, more = [], onStartNew, onBringIn }: AddProps) {
  const news = types.flatMap((t) => startNewEntries(t).map((entry, i) => ({ t, entry, key: `new:${t.key}:${i}` })));
  const ins = types.filter((t) => t.bringIn);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
          <ChevronDown className="h-3 w-3 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" data-board-chrome>
        {news.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Start new</DropdownMenuLabel>}
        {news.map(({ t, entry, key }) => {
          const Icon = entry.icon ?? t.icon;
          return (
            <DropdownMenuItem key={key} onSelect={() => onStartNew(t, entry)}>
              <Icon className="mr-2 h-4 w-4" />
              {entry.label}
            </DropdownMenuItem>
          );
        })}
        {news.length > 0 && ins.length > 0 && <DropdownMenuSeparator />}
        {ins.length > 0 && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">Bring in what you have</DropdownMenuLabel>
        )}
        {ins.map((t) => (
          <DropdownMenuItem key={`in:${t.key}`} onSelect={() => onBringIn(t)}>
            <t.icon className="mr-2 h-4 w-4" />
            {t.bringIn?.label}
          </DropdownMenuItem>
        ))}
        {more.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger aria-label="More">
                <Ellipsis className="mr-2 h-4 w-4" />
                More
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto" data-board-chrome>
                {more.flatMap((t) => [
                  ...startNewEntries(t).map((entry, i) => {
                    const Icon = entry.icon ?? t.icon;
                    return (
                      <DropdownMenuItem key={`new:${t.key}:${i}`} onSelect={() => onStartNew(t, entry)}>
                        <Icon className="mr-2 h-4 w-4" />
                        {entry.label}
                      </DropdownMenuItem>
                    );
                  }),
                  ...(t.bringIn
                    ? [
                        <DropdownMenuItem key={`in:${t.key}`} onSelect={() => onBringIn(t)}>
                          <t.icon className="mr-2 h-4 w-4" />
                          {t.bringIn.label}
                        </DropdownMenuItem>,
                      ]
                    : []),
                ])}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StartPanel({ types, more = [], onStartNew, onBringIn }: AddProps) {
  const [showMore, setShowMore] = useState(false);
  const shown = showMore ? [...types, ...more] : types;
  const news = shown.flatMap((t) => startNewEntries(t).map((entry, i) => ({ t, entry, key: `new:${t.key}:${i}` })));
  const ins = shown.filter((t) => t.bringIn);
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
        {news.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start new</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {news.map(({ t, entry, key }) => {
                const Icon = entry.icon ?? t.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onStartNew(t, entry)}
                    className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {ins.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bring in what you have
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {ins.map((t) => (
                <button
                  key={`in:${t.key}`}
                  type="button"
                  onClick={() => onBringIn(t)}
                  className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  <t.icon className="h-4 w-4 text-muted-foreground" />
                  {t.bringIn?.label}
                </button>
              ))}
            </div>
          </>
        )}
        {more.length > 0 && !showMore && (
          <button
            type="button"
            aria-label="More"
            title="More"
            onClick={() => setShowMore(true)}
            className="mt-3 flex h-8 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
          >
            <Ellipsis className="h-4 w-4" />
          </button>
        )}
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          Or drop files anywhere on the board, or paste a link or some text.
        </p>
      </section>
    </div>
  );
}
