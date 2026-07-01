// features/flashcards/components/home/FlashcardsHome.tsx
//
// The list-first home for the Flashcards tool (the /education/flashcards
// "savior" list view, NOT a forced detail page). Loads every set the current
// user owns or can see (RLS-filtered, recent-first) via fcService.listSets()
// and renders them as a dense, searchable, filterable list that scales to
// hundreds of sets. Click a row → set detail (Open); per-row Study / Fast Fire.
// "New" → /education/flashcards/new (the AI create-from-topic flow).
//
// NOTE: listSets() returns ALL rows with no server-side search/pagination yet,
// so search + visibility filtering run client-side over the in-memory list.
// Server-side search, pagination, and folders/tags are a follow-up once set
// counts grow — this page does NOT cover those.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  Plus,
  Play,
  Zap,
  BookOpen,
  Clock,
  Search,
  FolderTree,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fcService } from "../../data/fcService";
import type { FcSetRow } from "../../data/types";

const EDU_BASE = "/education/flashcards";
const FAST_FIRE_BASE = "/education/fastfire";

/** Sentinel nav id for the "New" button (set ids are real UUIDs). */
const NEW_SET_NAV_ID = "__new__";

/** Visibility filter chips. Maps each chip to the FcSetRow.visibility values it shows. */
type VisibilityFilter = "all" | "mine" | "shared" | "public";

const VISIBILITY_FILTERS: { id: VisibilityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "shared", label: "Shared" },
  { id: "public", label: "Public" },
];

/** Which raw visibility values each chip matches. "all" → every set. */
function matchesVisibility(
  filter: VisibilityFilter,
  visibility: FcSetRow["visibility"],
): boolean {
  switch (filter) {
    case "mine":
      return visibility === "private" || visibility === "internal";
    case "shared":
      return visibility === "link";
    case "public":
      return visibility === "public";
    case "all":
    default:
      return true;
  }
}

/** Visibility → display chip. */
const VISIBILITY_LABEL: Record<FcSetRow["visibility"], string> = {
  private: "Private",
  internal: "Org",
  link: "Link",
  public: "Public",
};

function VisibilityChip({ visibility }: { visibility: FcSetRow["visibility"] }) {
  const label = VISIBILITY_LABEL[visibility] ?? "Private";
  return (
    <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider leading-4 text-muted-foreground">
      {label}
    </span>
  );
}

/** "3 days ago"-style relative time, falling back to a date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Case-insensitive match across name / topic / lesson / description. */
function matchesQuery(set: FcSetRow, q: string): boolean {
  if (!q) return true;
  const haystack = [set.name, set.topic, set.lesson, set.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function SetRow({
  set,
  onOpen,
  onStudy,
  onFastFire,
  busy,
}: {
  set: FcSetRow;
  onOpen: (id: string) => void;
  onStudy: (id: string) => void;
  onFastFire: (id: string) => void;
  busy: boolean;
}) {
  // Compact secondary line: topic · lesson · difficulty · updated. We do NOT
  // have a card count from listSets(), so none is shown (no fabricated count).
  const metaBits = [set.topic, set.lesson, set.difficulty].filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(set.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(set.id);
        }
      }}
      className={cn(
        "group flex min-h-[44px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer",
        busy && "pointer-events-none opacity-60",
      )}
      aria-label={`Open flashcard set ${set.name}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Layers className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
            {set.name}
          </h3>
          <VisibilityChip visibility={set.visibility} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {metaBits.length > 0 ? (
            <span className="truncate capitalize">{metaBits.join(" · ")}</span>
          ) : set.description ? (
            <span className="truncate">{set.description}</span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(set.updated_at)}
          </span>
        </div>
      </div>

      {/* Per-row actions. On narrow screens the row itself opens the set (Open);
          Study / Fast Fire stay reachable as compact icon buttons. */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Study"
          aria-label={`Study ${set.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onStudy(set.id);
          }}
        >
          <Play className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Fast Fire"
          aria-label={`Fast Fire ${set.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onFastFire(set.id);
          }}
        >
          <Zap className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function FlashcardsHome() {
  const router = useRouter();
  const [sets, setSets] = useState<FcSetRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fcService.listSets();
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setSets([]);
      } else {
        setError(null);
        setSets(res.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (id: string) => {
    if (isPending) return;
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${EDU_BASE}/${id}`);
    });
  };

  const study = (id: string) => {
    if (isPending) return;
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${EDU_BASE}/${id}/study`);
    });
  };

  const fastFire = (id: string) => {
    if (isPending) return;
    setNavigatingId(id);
    startTransition(() => {
      router.push(`${FAST_FIRE_BASE}?set=${id}`);
    });
  };

  const newSet = () => {
    if (isPending) return;
    setNavigatingId(NEW_SET_NAV_ID);
    startTransition(() => {
      router.push(`${EDU_BASE}/new`);
    });
  };

  const q = query.trim().toLowerCase();
  const visible = (sets ?? []).filter(
    (s) => matchesVisibility(visibility, s.visibility) && matchesQuery(s, q),
  );

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-5 sm:py-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Flashcards
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (isPending) return;
                setNavigatingId("__progress__");
                startTransition(() => router.push(`${EDU_BASE}/progress`));
              }}
              disabled={isPending && navigatingId === "__progress__"}
            >
              <TrendingUp className="mr-1.5 h-4 w-4" />
              Progress
            </Button>
            <Button
              onClick={newSet}
              disabled={isPending && navigatingId === NEW_SET_NAV_ID}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New
            </Button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sets by name, topic, or description"
              className="pl-9"
              aria-label="Search flashcard sets"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {VISIBILITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setVisibility(f.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  visibility === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            ))}

            {/* Folders / tags are a reserved, not-yet-built affordance. */}
            <span
              className="ml-auto inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground opacity-70"
              title="Folders and tags are coming soon"
              aria-disabled="true"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Folders / tags — coming soon
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="mt-4">
          {loading || sets === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-14 text-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Couldn&apos;t load your flashcard sets
              </p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          ) : sets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                No flashcard sets yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generate a set from any topic in chat, or use New to create one.
                It will show up here, ready to study.
              </p>
              <Button onClick={newSet} className="mt-2">
                <Plus className="mr-1.5 h-4 w-4" />
                New
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No sets match your filters
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Try a different search or switch the visibility filter.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  onOpen={open}
                  onStudy={study}
                  onFastFire={fastFire}
                  busy={isPending && navigatingId === set.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
