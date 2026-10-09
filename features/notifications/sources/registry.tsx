"use client";

/**
 * features/notifications/sources/registry.tsx — THE NOTICE-SOURCE REGISTRY.
 *
 * Owner ruling 3 (2026-10-01): the bell is the ONE door to every system that
 * tells, asks or reminds a person. Each such system registers ONE source here;
 * the bell's "All places" strip, the page's Places rail and the cross-source
 * Snoozed view read this list and never name a system by hand. A new system
 * joins by adding an entry — never by editing the bell.
 *
 * Every source opens its CANONICAL list as a window over the current page, or —
 * when its list is route-bound (it writes the address) — in a new tab. Never a
 * same-tab navigation (ruling 4).
 *
 * Each source's live state comes from its own hook; `usePlaceStates` calls every
 * one of them once, so the bell holds every place's state — folded under More or
 * not — and Clear all can clear them all (BELL-OWNER review, 2026-10-07).
 */

import type { LucideIcon } from "lucide-react";
import {
  CheckCheck,
  CheckSquare,
  ClipboardCheck,
  EyeOff,
  MoreHorizontal,
  Lightbulb,
  Table2,
  Users,
  Workflow,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { AppDispatch } from "@/lib/redux/store";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { usePendingApprovalCount } from "@/features/approvals/usePendingApprovalCount";
import { useWaitingRuns } from "@/features/workflow-runtime/discovery/useWaitingRuns";
import { queryAssists } from "@/features/assists/service";
import type { AssistsQuery } from "@/features/assists/types";
import { listMyTaskUserStates } from "@/features/tasks/services/taskUserStateService";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkWaiting } from "../useInbox";
import { useInboxMemory } from "../useInboxMemory";
import { markPlaces, newIn, type PlaceReading } from "../badge";

/** How a source interrupts: needs_you/direct add to the badge, updates a dot, quiet nothing. */
export type SourceBucket = "needs_you" | "direct" | "updates" | "quiet";

export interface SourceState {
  /** Items waiting; null = the source shows no number (or could not be read). */
  count: number | null;
  /** Snoozed, dismissed or silenced — hidden, never lost. */
  hidden: number | null;
  loading: boolean;
  error: boolean;
  /** Item ids, where the place answers with them: "new" is then compared by id (badge.ts). */
  ids?: string[] | null;
}

export interface NoticeSource {
  key: string;
  label: string;
  icon: LucideIcon;
  bucket: SourceBucket;
  /** Where its list opens: over the page, or a new tab (route-bound lists). */
  opensIn: "window" | "tab";
  /** Only for people this source exists for. */
  adminOnly?: boolean;
  open: (dispatch: AppDispatch) => void;
}

const NONE: SourceState = { count: null, hidden: null, loading: false, error: false };

function openWindow(overlayId: "approvalsWindow" | "assistsWindow" | "workInboxWindow" | "quickTasksWindow" | "waitingRunsWindow") {
  return (dispatch: AppDispatch) => {
    dispatch(openOverlay({ overlayId }));
  };
}

function openTab(path: string) {
  return () => {
    window.open(new URL(path, window.location.origin).toString(), "_blank", "noopener,noreferrer");
  };
}

// ── per-source state hooks ─────────────────────────────────────────────────

function useApprovalsState(): SourceState {
  // `unknown` covers both "still reading" and "could not read"; neither shows a number.
  const { count, unknown } = usePendingApprovalCount();
  return { count: unknown ? null : count, hidden: null, loading: false, error: false };
}

function useWorkState(): SourceState {
  const work = useWorkWaiting(true);
  if (!work.data) return { ...NONE, loading: work.isLoading, error: work.isError };
  return {
    count: work.data.reduce((sum, o) => sum + o.waiting, 0),
    hidden: work.data.reduce((sum, o) => sum + o.snoozed, 0),
    loading: false,
    error: false,
  };
}

const ASSIST_COUNT_QUERY: AssistsQuery = {
  statuses: ["pending"],
  sourceKey: null,
  sourceKind: null,
  surfaceName: null,
  search: "",
  maxConfidence: null,
  minConfidence: null,
  minPriority: null,
  maxPriority: null,
  includeSnoozed: false,
  starredOnly: false,
  unseenOnly: false,
  sortField: "created_at",
  sortAscending: false,
  page: 1,
  pageSize: 1,
};

async function assistCounts(userId: string): Promise<{ active: number; hidden: number }> {
  const [active, withSnoozed] = await Promise.all([
    queryAssists(userId, ASSIST_COUNT_QUERY),
    queryAssists(userId, { ...ASSIST_COUNT_QUERY, includeSnoozed: true }),
  ]);
  return { active: active.total, hidden: Math.max(0, withSnoozed.total - active.total) };
}

function useAssistsState(): SourceState {
  const userId = useAppSelector(selectUserId);
  const q = useQuery({
    queryKey: ["inbox", "source", "assists", userId] as const,
    queryFn: () => assistCounts(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  });
  if (!q.data) return { ...NONE, loading: q.isLoading, error: q.isError };
  return { count: q.data.active, hidden: q.data.hidden, loading: false, error: false };
}

function useTasksState(): SourceState {
  const userId = useAppSelector(selectUserId);
  const q = useQuery({
    queryKey: ["inbox", "source", "task-states", userId] as const,
    queryFn: listMyTaskUserStates,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  if (!q.data) return { ...NONE, loading: q.isLoading, error: q.isError };
  const now = Date.now();
  const hidden = q.data.filter(
    (s) => s.dismissed_at !== null || (s.snoozed_until !== null && Date.parse(s.snoozed_until) > now),
  ).length;
  return { count: null, hidden, loading: false, error: false };
}

function useWaitingRunsState(): SourceState {
  const { rows, loading, error } = useWaitingRuns();
  return {
    count: error ? null : rows.length,
    ids: error || loading ? null : rows.map((row) => row.runId),
    hidden: null,
    loading,
    error: error !== null,
  };
}

/**
 * What a source shows beside its label: "N snoozed", its count ABOVE what the person last cleared,
 * and its one-click actions (Clear · Hide from bell). Arman, 2026-10-07: nothing hard to resolve
 * (38 workflows waiting) may be a number the person cannot get to zero — the work stays on the
 * source's own page; the bell's number clears in one click and comes back only for something new.
 */
export function SourceIndicatorView({
  state,
  bucket,
  sourceKey,
}: {
  state: SourceState;
  bucket: SourceBucket;
  sourceKey: string;
}) {
  const memory = useInboxMemory();
  // A place still reading (or unreadable) shows no number and cannot be cleared.
  const readable = !state.loading && !state.error && state.count !== null;
  const reading: PlaceReading = { count: readable ? state.count : null, ids: state.ids };
  const shown = memory.ready ? newIn(sourceKey, reading, memory.cleared) : (reading.count ?? 0);
  const loud = bucket === "needs_you" || bucket === "direct";
  return (
    <>
      {state.hidden ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{state.hidden} snoozed</span>
      ) : null}
      {state.error ? (
        <span className="shrink-0 text-[11px] text-muted-foreground" title="Count unavailable">
          —
        </span>
      ) : shown > 0 && bucket !== "quiet" ? (
        <span
          data-source-count={sourceKey}
          className={cn(
            "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
            loud ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {shown > 99 ? "99+" : shown}
        </span>
      ) : null}
    </>
  );
}

/** The ⋯ beside a place: Clear its number, or take it out of the bell. */
export function SourceActions({ sourceKey, state }: { sourceKey: string; state: SourceState }) {
  const memory = useInboxMemory();
  const readable = !state.loading && !state.error && state.count !== null;
  const reading: PlaceReading = { count: readable ? state.count : null, ids: state.ids };
  const shown = memory.ready ? newIn(sourceKey, reading, memory.cleared) : 0;
  return (
    <SourceMenu
      sourceKey={sourceKey}
      canClear={memory.ready && readable && shown > 0}
      onClear={() => memory.saveCleared(markPlaces(memory.cleared, { [sourceKey]: reading }))}
      onHide={() => {
        if (!memory.hiddenSources.includes(sourceKey)) memory.saveHidden([...memory.hiddenSources, sourceKey]);
      }}
    />
  );
}

function SourceMenu({
  sourceKey,
  canClear,
  onClear,
  onHide,
}: {
  sourceKey: string;
  canClear: boolean;
  onClear: () => void;
  onHide: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Place options"
          title="Place options"
          data-source-menu={sourceKey}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--matrx-glass-bg-hover)] hover:text-foreground"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        // The menu is portalled, but React events still bubble to the row that opens the place.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem disabled={!canClear} onSelect={onClear} data-source-clear={sourceKey}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Clear
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onHide} data-source-hide={sourceKey}>
          <EyeOff className="mr-2 h-4 w-4" />
          Hide from bell
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * THE REGISTRY. Order is display order. Census of what tells, asks or reminds:
 * common-docs/systems/communications/notifications/FEATURE.md §3.8.
 */
export const NOTICE_SOURCES: readonly NoticeSource[] = [
  {
    key: "approvals",
    label: "Waiting on you",
    icon: ClipboardCheck,
    bucket: "needs_you",
    opensIn: "window",
    open: openWindow("approvalsWindow"),
  },
  {
    key: "work",
    label: "In your tables",
    icon: Table2,
    bucket: "needs_you",
    opensIn: "window",
    open: openWindow("workInboxWindow"),
  },
  {
    key: "workflows",
    label: "Workflows waiting",
    icon: Workflow,
    bucket: "needs_you",
    opensIn: "window",
    open: openWindow("waitingRunsWindow"),
  },
  {
    key: "assists",
    label: "Assists",
    icon: Lightbulb,
    bucket: "updates",
    opensIn: "window",
    open: openWindow("assistsWindow"),
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    bucket: "quiet",
    opensIn: "window",
    open: openWindow("quickTasksWindow"),
  },
  {
    key: "hr_tasks",
    label: "HR tasks",
    icon: Users,
    bucket: "quiet",
    // The HR inbox writes its scope into the address, so it opens in its own tab.
    opensIn: "tab",
    open: openTab("/hr/tasks"),
  },
];

/**
 * Every place's live state at once, keyed by source key — read ONCE by the bell (or the inbox
 * rail) and handed to each row, so Clear all sees every place, folded under More or not.
 */
export function usePlaceStates(): Record<string, SourceState> {
  return {
    approvals: useApprovalsState(),
    work: useWorkState(),
    workflows: useWaitingRunsState(),
    assists: useAssistsState(),
    tasks: useTasksState(),
    hr_tasks: NONE,
  };
}

/** What each readable place reads now — what Clear all records as cleared. */
export function placeReadings(states: Readonly<Record<string, SourceState>>): Record<string, PlaceReading> {
  const out: Record<string, PlaceReading> = {};
  for (const [key, state] of Object.entries(states)) {
    if (state.loading || state.error || state.count === null) continue;
    out[key] = { count: state.count, ids: state.ids };
  }
  return out;
}

export function visibleSources(isAdmin: boolean): readonly NoticeSource[] {
  return NOTICE_SOURCES.filter((source) => !source.adminOnly || isAdmin);
}
