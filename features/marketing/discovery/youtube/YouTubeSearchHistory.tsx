"use client";

import { AlertCircle, Clock3, History, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { YouTubeSearchHistoryEntry } from "./service";

interface YouTubeSearchHistoryProps {
  entries: YouTubeSearchHistoryEntry[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSelect: (entry: YouTubeSearchHistoryEntry) => void;
  onLoadMore: () => void;
}

function formatSearchTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function HistoryList({
  entries,
  activeId,
  loading,
  error,
  hasMore,
  onSelect,
  onLoadMore,
}: Omit<YouTubeSearchHistoryProps, "mobileOpen" | "onMobileOpenChange">) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 pr-3">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-700 dark:text-red-200">
              {error}
            </div>
          )}
          {entries.map((entry) => {
            const canRestore = entry.page !== null;
            return (
              <button
                key={entry.id}
                type="button"
                disabled={!canRestore}
                onClick={() => onSelect(entry)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  activeId === entry.id
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-border bg-card/70 hover:border-foreground/20 hover:bg-muted/70 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-white/20 dark:hover:bg-white/[0.05]"
                } disabled:cursor-default disabled:opacity-55`}
              >
                <span className="line-clamp-2 text-sm font-medium text-foreground dark:text-zinc-200">
                  {entry.query}
                </span>
                <span className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground dark:text-zinc-500">
                  {entry.status === "failed" ? (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Clock3 className="h-3 w-3" />
                  )}
                  {formatSearchTime(entry.createdAt)}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground dark:text-zinc-500">
                  {entry.status === "failed"
                    ? "Search failed"
                    : `${entry.resultCount} saved video${entry.resultCount === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          })}

          {!loading && entries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center dark:border-white/10">
              <History className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No searches yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Every search you run will be saved here.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {(loading || hasMore) && (
        <div className="border-t border-border pt-3 dark:border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onLoadMore}
            className="w-full rounded-xl"
          >
            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Loading history" : "Load older searches"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function YouTubeSearchHistory({
  entries,
  activeId,
  loading,
  error,
  hasMore,
  mobileOpen,
  onMobileOpenChange,
  onSelect,
  onLoadMore,
}: YouTubeSearchHistoryProps) {
  const listProps = {
    entries,
    activeId,
    loading,
    error,
    hasMore,
    onSelect,
    onLoadMore,
  };

  return (
    <>
      <aside className="sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-72 shrink-0 overflow-hidden rounded-3xl border border-border bg-card/80 p-4 shadow-xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/70 dark:shadow-black/20 lg:flex lg:flex-col">
        <div className="mb-4">
          <div className="flex items-center gap-2 font-semibold">
            <History className="h-4 w-4 text-red-500" />
            Search history
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Saved results reopen instantly without using YouTube quota.
          </p>
        </div>
        <HistoryList {...listProps} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="flex w-[88vw] flex-col p-4 sm:max-w-sm"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-red-500" />
              Search history
            </SheetTitle>
            <SheetDescription>
              Saved results reopen instantly without using YouTube quota.
            </SheetDescription>
          </SheetHeader>
          <HistoryList {...listProps} />
        </SheetContent>
      </Sheet>
    </>
  );
}
