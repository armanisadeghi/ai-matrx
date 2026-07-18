"use client";

/**
 * /shapes list view — the feature entry LIST page (the /agents doctrine:
 * everything the user can do, list-first, never a forced workspace).
 *
 * Two sections from ONE RLS-scoped read: "Your shapes" (org-owned rows the
 * viewer can see) and a visually secondary "Platform shapes" library
 * (visibility=public). Per row: open (detail), test, status (active +
 * has-component). Navigation uses useTransition with a per-row busy state.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Blocks,
  CircleAlert,
  FlaskConical,
  Loader2,
  RefreshCw,
  Plus,
  Search,
  Shapes,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listShapesForUser,
  partitionShapes,
  type ShapeListEntry,
} from "@/features/content-ir/studio/studio-catalog";
import {
  SHAPES_NEW_HREF,
  shapeDetailHref,
  shapeTestHref,
} from "@/features/content-ir/studio/constants";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: ShapeListEntry[] };

function matches(entry: ShapeListEntry, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    entry.label.toLowerCase().includes(needle) ||
    entry.kind.toLowerCase().includes(needle) ||
    entry.id.toLowerCase().includes(needle)
  );
}

function ShapeRow({
  entry,
  onOpen,
  onTest,
  busyHref,
}: {
  entry: ShapeListEntry;
  onOpen: () => void;
  onTest: () => void;
  busyHref: string | null;
}) {
  const openHref = shapeDetailHref(entry.kind);
  const testHref = shapeTestHref(entry.kind);
  return (
    <div className="group flex items-center gap-3 border-b border-border/60 px-3 py-2 transition-colors last:border-0 hover:bg-accent/30">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            entry.isActive ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
          title={entry.isActive ? "Active" : "Inactive"}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {entry.label}
            </span>
            {busyHref === openHref && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </span>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <code className="font-mono">{entry.kind}</code>
            <span>v{entry.version}</span>
            {entry.family && <span>{entry.family}</span>}
          </span>
        </span>
      </button>
      {entry.hasComponent && (
        <span
          className="flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
          title="A custom component renders this shape"
        >
          <Blocks className="h-3 w-3" />
          <span className="hidden sm:inline">component</span>
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={onTest}
        title="Fill the form and see it render"
      >
        {busyHref === testHref ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FlaskConical className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">Test</span>
      </Button>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/60 px-3 py-3 last:border-0"
        >
          <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function ShapesListClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyHref, setBusyHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [reloadKey, setReloadKey] = useState(0);
  // Keyed by reloadKey so a refresh derives "loading" instead of a
  // synchronous reset-in-effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ key: number; value: ListState } | null>(
    null,
  );
  const state: ListState =
    loaded && loaded.key === reloadKey ? loaded.value : { status: "loading" };

  useEffect(() => {
    let cancelled = false;
    listShapesForUser()
      .then((entries) => {
        if (!cancelled)
          setLoaded({ key: reloadKey, value: { status: "ready", entries } });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoaded({
            key: reloadKey,
            value: {
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const navigate = (href: string) => {
    if (busyHref) return;
    setBusyHref(href);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
      {/* Toolbar */}
      <div className="mb-4 mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shapes"
            className="h-9 pl-8 text-base sm:text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-2.5"
          onClick={() => setReloadKey((k) => k + 1)}
          title="Refresh — pick up shapes the agent just created"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              state.status === "loading" && "animate-spin",
            )}
          />
          <span className="hidden sm:inline text-xs">Refresh</span>
        </Button>
      </div>

      {state.status === "loading" && <SectionSkeleton />}

      {state.status === "error" && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <CircleAlert className="h-4 w-4 shrink-0" />
          {state.message}
        </div>
      )}

      {state.status === "ready" &&
        (() => {
          const filtered = state.entries.filter((e) => matches(e, query));
          const { mine, platform } = partitionShapes(filtered);
          return (
            <div className="space-y-6">
              {/* Your shapes */}
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Shapes className="h-3.5 w-3.5" />
                  Your shapes
                </h2>
                {mine.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-8 text-center">
                    <Shapes className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {query
                        ? "No shapes match your search."
                        : "You have no shapes yet."}
                    </p>
                    {!query && (
                      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                        Design one with the agent — describe your data and get a
                        completely customized component for it.
                      </p>
                    )}
                    {!query && (
                      <Button
                        size="sm"
                        className="mt-3 h-8"
                        onClick={() => navigate(SHAPES_NEW_HREF)}
                      >
                        {busyHref === SHAPES_NEW_HREF ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        New Shape
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border bg-card">
                    {mine.map((entry) => (
                      <ShapeRow
                        key={entry.id}
                        entry={entry}
                        busyHref={busyHref}
                        onOpen={() => navigate(shapeDetailHref(entry.kind))}
                        onTest={() => navigate(shapeTestHref(entry.kind))}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Platform library — visually secondary */}
              {platform.length > 0 && (
                <section className="opacity-90">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Platform shapes
                  </h2>
                  <div className="overflow-hidden rounded-md border border-border/70 bg-card/70">
                    {platform.map((entry) => (
                      <ShapeRow
                        key={entry.id}
                        entry={entry}
                        busyHref={busyHref}
                        onOpen={() => navigate(shapeDetailHref(entry.kind))}
                        onTest={() => navigate(shapeTestHref(entry.kind))}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          );
        })()}
    </div>
  );
}
