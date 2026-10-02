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
 * `useState` is a hook each source owns; it is called by the one component that
 * renders that source (`SourceCountProbe`), never in a loop.
 */

import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  ClipboardCheck,
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
import { useWorkWaiting } from "../useInbox";

/** How a source interrupts: needs_you/direct add to the badge, updates a dot, quiet nothing. */
export type SourceBucket = "needs_you" | "direct" | "updates" | "quiet";

export interface SourceState {
  /** Items waiting; null = the source shows no number (or could not be read). */
  count: number | null;
  /** Snoozed, dismissed or silenced — hidden, never lost. */
  hidden: number | null;
  loading: boolean;
  error: boolean;
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
  useState: () => SourceState;
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
  return { count: error ? null : rows.length, hidden: null, loading, error: error !== null };
}

function useNoState(): SourceState {
  return NONE;
}

/**
 * THE REGISTRY. Order is display order. Census of what tells, asks or reminds:
 * common-docs/projects/notifications-ui-redo/RESEARCH.md §3.8.
 */
export const NOTICE_SOURCES: readonly NoticeSource[] = [
  {
    key: "approvals",
    label: "Waiting on you",
    icon: ClipboardCheck,
    bucket: "needs_you",
    opensIn: "window",
    useState: useApprovalsState,
    open: openWindow("approvalsWindow"),
  },
  {
    key: "work",
    label: "In your tables",
    icon: Table2,
    bucket: "needs_you",
    opensIn: "window",
    useState: useWorkState,
    open: openWindow("workInboxWindow"),
  },
  {
    key: "workflows",
    label: "Workflows waiting",
    icon: Workflow,
    bucket: "needs_you",
    opensIn: "window",
    useState: useWaitingRunsState,
    open: openWindow("waitingRunsWindow"),
  },
  {
    key: "assists",
    label: "Assists",
    icon: Lightbulb,
    bucket: "updates",
    opensIn: "window",
    useState: useAssistsState,
    open: openWindow("assistsWindow"),
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: CheckSquare,
    bucket: "quiet",
    opensIn: "window",
    useState: useTasksState,
    open: openWindow("quickTasksWindow"),
  },
  {
    key: "hr_tasks",
    label: "HR tasks",
    icon: Users,
    bucket: "quiet",
    // The HR inbox writes its scope into the address, so it opens in its own tab.
    opensIn: "tab",
    useState: useNoState,
    open: openTab("/hr/tasks"),
  },
];

export function visibleSources(isAdmin: boolean): readonly NoticeSource[] {
  return NOTICE_SOURCES.filter((source) => !source.adminOnly || isAdmin);
}
