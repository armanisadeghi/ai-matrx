"use client";

/**
 * The two ways to put things on a board, both listing EVERY registered item
 * type (`items/catalog.ts`) — so a feature added to the catalog appears here
 * with no change to this file:
 *   AddMenu     the toolbar's "Add" button;
 *   StartPanel  what an empty board shows: one click and you are working.
 */

import { ChevronDown, Plus, Upload } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardItemType } from "../items/types";

interface AddProps {
  types: readonly BoardItemType[];
  onStartNew: (type: BoardItemType) => void;
  onBringIn: (type: BoardItemType) => void;
}

export function AddMenu({ types, onStartNew, onBringIn }: AddProps) {
  const news = types.filter((t) => t.startNew);
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
      <DropdownMenuContent align="start" className="w-64" data-spatial-chrome>
        {news.length > 0 && <DropdownMenuLabel className="text-xs text-muted-foreground">Start new</DropdownMenuLabel>}
        {news.map((t) => (
          <DropdownMenuItem key={`new:${t.key}`} onSelect={() => onStartNew(t)}>
            <t.icon className="mr-2 h-4 w-4" />
            {t.startNew?.label}
          </DropdownMenuItem>
        ))}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StartPanel({ types, onStartNew, onBringIn }: AddProps) {
  const news = types.filter((t) => t.startNew);
  const ins = types.filter((t) => t.bringIn);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4">
      <section
        data-spatial-chrome
        aria-label="Start working on your board"
        className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-border bg-card/95 p-6 shadow-xl backdrop-blur"
      >
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What do you want to work on?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Start something new or bring in what you already have. Everything you add stays on this board, side by side.
        </p>
        {news.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start new</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {news.map((t) => (
                <button
                  key={`new:${t.key}`}
                  type="button"
                  onClick={() => onStartNew(t)}
                  className="flex flex-col items-start gap-2 rounded-xl border border-border bg-background p-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
                >
                  <t.icon className="h-5 w-5 text-primary" />
                  {t.startNew?.label}
                </button>
              ))}
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
        <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          Or drop files anywhere on the board, or paste a link or some text.
        </p>
      </section>
    </div>
  );
}
