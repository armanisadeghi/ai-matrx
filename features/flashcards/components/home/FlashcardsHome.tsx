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
// so search + visibility + folder filtering all run client-side over the
// in-memory list. Server-side search/pagination is a follow-up once set
// counts grow. Folder/tag membership (fc_set → category via EDGE_ROLE.theme)
// is loaded in one batched `assoc_for_sources` round-trip, not per-row.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState, useTransition } from "react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
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
  CalendarClock,
  Upload,
  X,
  Flame,
  FileSearch,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { fcService } from "../../data/fcService";
import { EDGE_ROLE } from "../../data/types";
import type { CardWithDetails, FcSetRow } from "../../data/types";
import { toast } from "@/lib/toast";
import { buildLibraryJson, downloadTextFile } from "../../utils/exportDeck";
import { associationsService } from "@/features/scopes/service/associationsService";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { studyService } from "@/features/education/study/service/studyService";
import type { StudyStreakRow } from "@/features/education/study/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationFlashcardsScope,
  type FlashcardSetSummary,
} from "@/features/surfaces/manifests/education-flashcards.manifest";

const EDU_BASE = "/education/flashcards";
const FAST_FIRE_BASE = "/education/fastfire";
const FOLDER_DIMENSION = CATEGORY_DIMENSIONS.flashcardFolder;

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
      return visibility === "personal" || visibility === "internal";
    case "shared":
      return visibility === "link";
    case "public":
      return visibility === "public";
    case "all":
    default:
      return true;
  }
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
    // A PLAIN div — `role="button"` + tabIndex was REMOVED when the name
    // became an anchor. ARIA's button role takes presentational children, so
    // a focusable <a> inside it is not required to be exposed to assistive
    // tech: the row would have announced as one button and swallowed the very
    // door this sweep added. The name's anchor is now the keyboard and screen
    // reader path; this onClick is mouse convenience only. (The row cannot
    // itself become the <Link> the way AudioStudyHome's did — it contains
    // Study / Fast Fire buttons, and a <button> inside an <a> is equally
    // invalid.)
    <div
      onClick={() => onOpen(set.id)}
      className={cn(
        "group grid min-h-[88px] grid-cols-[36px_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 cursor-pointer sm:min-h-[44px] sm:gap-y-0.5 sm:rounded-lg sm:px-3 sm:py-2",
        busy && "pointer-events-none opacity-60",
      )}
      aria-label={`Open flashcard set ${set.name}`}
    >
      <h3 className="col-span-3 row-start-1 min-w-0 text-base font-semibold text-foreground sm:col-span-1 sm:col-start-2 sm:text-sm">
        {/* THE DOOR LAW: the card's onClick is a mouse convenience; the
            NAME is the real anchor. `fc_set` carries an `hrefFor` in the
            registry, so the route is not hardcoded here. EntityRef already
            stops propagation on its own anchor, so clicking the name does
            not also fire the card's onOpen. */}
        <EntityRef
          token="fc_set"
          id={set.id}
          name={set.name}
          showIcon={false}
          fill
          wrap
          className="relative w-full [&>span]:absolute [&>span]:right-0 [&>span]:top-0 sm:[&>span]:static"
          labelClassName="line-clamp-2 !break-normal sm:truncate"
        />
      </h3>

      <div className="col-start-1 row-start-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:row-span-2 sm:row-start-1">
        <Layers className="h-4 w-4" />
      </div>

      <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5 sm:gap-y-0.5 sm:text-[11px]">
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

      {/* Mobile keeps the title on its own full-width row; Study / Fast Fire
          sit with the secondary details instead of permanently squeezing it. */}
      <div className="col-start-3 row-start-2 flex shrink-0 items-center gap-1 sm:row-span-2 sm:row-start-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11 sm:h-8 sm:w-8"
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
          className="h-11 w-11 sm:h-8 sm:w-8"
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
  const [folderIds, setFolderIds] = useState<Set<string>>(new Set());
  const [foldersBySet, setFoldersBySet] = useState<Record<string, string[]>>(
    {},
  );
  const [streak, setStreak] = useState<StudyStreakRow | null>(null);
  const [exportingLibrary, setExportingLibrary] = useState(false);
  const { categories: folders } = useCategories({
    dimension: FOLDER_DIMENSION,
  });

  // VISION §15 (WP3 gap 6) — account-level export: every deck the learner can
  // list, with full cards, as one lossless JSON file. Loud on partial failure —
  // a deck that fails to load is reported, never silently dropped.
  const exportLibrary = async (): Promise<void> => {
    if (!sets || sets.length === 0 || exportingLibrary) return;
    setExportingLibrary(true);
    try {
      const decks: { set: FcSetRow; cards: CardWithDetails[] }[] = [];
      const failed: string[] = [];
      for (const set of sets) {
        const res = await fcService.getSetWithCards(set.id);
        if (res.data) decks.push(res.data);
        else failed.push(set.name);
      }
      if (decks.length === 0) {
        toast.error("Export failed — no deck could be loaded.");
        return;
      }
      downloadTextFile(
        `flashcard_library_${new Date().toISOString().slice(0, 10)}.json`,
        "application/json",
        buildLibraryJson(decks),
      );
      if (failed.length > 0) {
        toast.error(
          `Exported ${decks.length} decks — ${failed.length} failed to load: ${failed.join(", ")}`,
        );
      } else {
        toast.success(`Exported ${decks.length} decks`);
      }
    } finally {
      setExportingLibrary(false);
    }
  };

  // Phase 3 (daily streak): read-only — the streak row is written exclusively
  // by the education.bump_study_streak() DB trigger on study_session insert,
  // so it reflects activity across every study mode (flashcards, fast fire...).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await studyService.getStreak();
      if (!cancelled && !res.error) setStreak(res.data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Folder/tag membership for every visible set, one batched round-trip
  // (assoc_for_sources) rather than N per-row lookups.
  useEffect(() => {
    if (!sets || sets.length === 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await associationsService.listForSources(
        "fc_set",
        sets.map((s) => s.id),
        "category",
      );
      if (cancelled || !res.ok) return;
      const map: Record<string, string[]> = {};
      for (const e of res.data.edges) {
        if (e.role !== EDGE_ROLE.theme) continue;
        (map[e.sourceId] ??= []).push(e.targetId);
      }
      setFoldersBySet(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [sets]);

  const toggleFolder = (id: string) => {
    setFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const goTo = (id: string, path: string) => {
    if (isPending) return;
    setNavigatingId(id);
    startTransition(() => router.push(path));
  };

  // Secondary actions live in the shell header (IC-5): inline glass icons on
  // `lg+`, one `…` bottom sheet below it. "Export library" is omitted rather
  // than shown dead when there is nothing to export — HeaderAction has no
  // disabled state, and a row that silently does nothing is worse than absent.
  const headerActions: HeaderAction[] = [
    {
      icon: "Flame",
      label: "Drill weak areas",
      onPress: () => goTo("__weak__", `${EDU_BASE}/weak-areas`),
    },
    {
      icon: "CalendarClock",
      label: "Review due",
      onPress: () => goTo("__review__", `${EDU_BASE}/review`),
    },
    {
      icon: "TrendingUp",
      label: "Progress",
      onPress: () => goTo("__progress__", `${EDU_BASE}/progress`),
    },
    {
      // THE DOOR LAW — /education/offline was reachable only by the service
      // worker serving it on a failed navigation, so a learner could never
      // open it deliberately to check what they have downloaded or whether
      // their answers have synced.
      icon: "CloudOff",
      label: "Downloaded & offline",
      onPress: () => goTo("__offline__", "/education/offline"),
    },
    {
      // THE DOOR LAW — every AI step in flashcards (grading, live help, batch
      // review, card images) is a Mandate the learner may re-point at their
      // own agent, and this surface named none of that. Deep-linked to the
      // `flashcards` domain: the bare list is 264 mandates across 45 domains.
      icon: "BrainCircuit",
      label: "Flashcard agents",
      onPress: () =>
        goTo("__mandates__", "/agents/mandates?feature=flashcards"),
    },
    {
      icon: "FileSearch",
      label: "New deck from a document",
      onPress: () => goTo("__from_source__", `${EDU_BASE}/new/from-source`),
    },
    {
      icon: "Upload",
      label: "Import decks",
      onPress: () => goTo("__import__", `${EDU_BASE}/new/import`),
    },
    ...(sets && sets.length > 0
      ? [
          {
            icon: "Download",
            label: "Export library",
            onPress: () => {
              if (exportingLibrary) return;
              void exportLibrary();
            },
          },
        ]
      : []),
  ];

  const q = query.trim().toLowerCase();
  const visible = (sets ?? []).filter(
    (s) =>
      matchesVisibility(visibility, s.visibility) &&
      matchesQuery(s, q) &&
      (folderIds.size === 0 ||
        (foldersBySet[s.id] ?? []).some((id) => folderIds.has(id))),
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/education-flashcards"
      // Scope is assembled at TRIGGER time from the live render values, so the
      // agent always sees the filters the learner has applied right now.
      getScope={() =>
        createEducationFlashcardsScope({
          sets_loaded: sets !== null && !error,
          folders: folders.map((f) => ({ id: f.id, name: f.name })),
          visibility_filter: visibility,
          selected_folder_ids: [...folderIds],
          ...(sets !== null && !error
            ? {
                set_count: sets.length,
                all_sets: sets.map((s) => toSetSummary(s, foldersBySet)),
                visible_sets: visible.map((s) => toSetSummary(s, foldersBySet)),
                visible_set_ids: visible.map((s) => s.id),
              }
            : {}),
          ...(error ? { load_error: error } : {}),
          ...(q ? { search_query: q } : {}),
          ...(streak
            ? {
                study_streak_days: streak.current_streak,
                longest_streak_days: streak.longest_streak,
              }
            : {}),
        })
      }
    >
      <div className="h-full w-full overflow-y-auto bg-textured">
        {/* Route chrome: back + identity + every secondary action. The six
          secondary actions used to be a seven-button row in the body; below
          `lg` that row could not wrap and ran off the right edge with the
          labels overlapping (375px). They now live in the header, where
          HeaderActions renders them inline on `lg+` and behind ONE `…`
          bottom sheet on mobile. Only the primary "New" stays in the body. */}
        <EducationToolHeader
          title="Flashcards"
          sheetTitle="Flashcard actions"
          actions={headerActions}
        />
        <div className="mx-auto max-w-4xl px-3 pb-safe pt-[var(--shell-header-h)] sm:px-6 sm:pb-6">
          <div className="flex items-center gap-2 pt-2 sm:pt-4">
            <div className="flex shrink-0 items-center gap-3">
              {streak && streak.current_streak > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                  title={`Longest streak: ${streak.longest_streak} day${streak.longest_streak === 1 ? "" : "s"}`}
                >
                  <Flame className="h-3.5 w-3.5" />
                  {streak.current_streak} day
                  {streak.current_streak === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-initial">
              <Button
                onClick={newSet}
                disabled={isPending && navigatingId === NEW_SET_NAV_ID}
                className="h-11 w-full sm:h-9 sm:w-auto"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Create deck
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
                className="h-11 pl-9 text-base sm:h-9 sm:text-sm"
                style={{ fontSize: "16px" }}
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
                    "min-h-10 sm:min-h-0",
                    visibility === f.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {f.label}
                </button>
              ))}

              {folders.length > 0 ? (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFolder(f.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        "min-h-10 sm:min-h-0",
                        folderIds.has(f.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                  {folderIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={() => setFolderIds(new Set())}
                      className="inline-flex min-h-10 min-w-10 items-center justify-center gap-0.5 rounded-full px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground sm:min-h-0 sm:min-w-0"
                      aria-label="Clear folder filter"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
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
                <p className="max-w-md text-xs text-muted-foreground">
                  {error}
                </p>
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
                  Generate a set from any topic in chat, or use New to create
                  one. It will show up here, ready to study.
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
    </SurfaceRuntimeProvider>
  );
}

/** Map a loaded set row + its folder edges into the surface's set summary. */
function toSetSummary(
  set: FcSetRow,
  foldersBySet: Record<string, string[]>,
): FlashcardSetSummary {
  return {
    id: set.id,
    name: set.name,
    topic: set.topic,
    lesson: set.lesson,
    description: set.description,
    visibility: set.visibility,
    updated_at: set.updated_at,
    folder_ids: foldersBySet[set.id] ?? [],
  };
}
