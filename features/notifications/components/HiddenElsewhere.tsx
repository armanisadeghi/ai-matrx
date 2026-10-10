"use client";

/**
 * features/notifications/components/HiddenElsewhere.tsx — the Snoozed view's
 * "everywhere else" half (owner ruling 3, 2026-10-01: "if you snooze an assist or
 * another reminder and it's now gone, you're never scared you won't find it").
 *
 * Gathers what a person hid in the OTHER notice systems, each through that
 * system's own door, each with its own way back:
 *   assists      snoozed (Unsnooze → restoreAssist) and silenced sources
 *                (Turn back on → unsuppressAssistSource)
 *   tasks        snoozed (Unsnooze) and dismissed (Turn back on)
 *   your tables  snoozed record-store items — counted here, listed in their own
 *                window's Snoozed view (the store's ActionInbox)
 * Each row says what hid it and when it comes back.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Lightbulb, Table2, VolumeX } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  listMySourceSuppressions,
  queryAssists,
  restoreAssist,
  unsuppressAssistSource,
} from "@/features/assists/service";
import {
  listMyTaskUserStates,
  undismissTask,
  unsnoozeTask,
} from "@/features/tasks/services/taskUserStateService";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { supabase } from "@/utils/supabase/client";
import { fullTime } from "../presentation";
import { useWorkWaiting } from "../useInbox";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface HiddenItem {
  key: string;
  icon: typeof Lightbulb;
  place: string;
  title: string;
  /** "Snoozed · back Tue" / "Dismissed" / "Silenced" */
  why: string;
  whyTitle?: string;
  actionLabel: string;
  restore: () => Promise<unknown>;
}

interface HiddenAnswer {
  items: HiddenItem[];
  /** A part could not be read — said on screen, never shown as "nothing hidden". */
  failed: boolean;
}

async function loadHidden(userId: string): Promise<HiddenAnswer> {
  let failed = false;
  const softly = <T,>(promise: Promise<T>): Promise<T | null> =>
    promise.catch((error: unknown) => {
      console.error("[Inbox] A hidden-items read failed:", error);
      failed = true;
      return null;
    });
  const now = Date.now();
  const [assists, silenced, taskStates] = await Promise.all([
    softly(queryAssists(userId, {
      statuses: ["pending"],
      sourceKey: null,
      sourceKind: null,
      surfaceName: null,
      search: "",
      maxConfidence: null,
      minConfidence: null,
      minPriority: null,
      maxPriority: null,
      includeSnoozed: true,
      starredOnly: false,
      unseenOnly: false,
      sortField: "created_at",
      sortAscending: false,
      page: 1,
      pageSize: 100,
    })),
    softly(listMySourceSuppressions(userId)),
    listMyTaskUserStates(),
  ]);

  const items: HiddenItem[] = [];
  const silencedKeys = new Set((silenced ?? []).map((s) => s.sourceKey));
  for (const assist of assists?.rows ?? []) {
    if (!assist.suppressedUntil || assist.suppressedUntil === "infinity") continue;
    if (Date.parse(assist.suppressedUntil) <= now || silencedKeys.has(assist.sourceKey)) continue;
    items.push({
      key: `assist:${assist.id}`,
      icon: Lightbulb,
      place: "Assists",
      title: assist.title,
      why: `Snoozed until ${fullTime(assist.suppressedUntil)}`,
      actionLabel: "Unsnooze",
      restore: () => restoreAssist(assist.id),
    });
  }
  for (const s of silenced ?? []) {
    items.push({
      key: `silenced:${s.sourceKey}:${s.until}`,
      icon: VolumeX,
      place: "Assists",
      title: s.label,
      why: s.until === "infinity" ? `Silenced · ${s.affectedRows}` : `Silenced until ${fullTime(s.until)}`,
      actionLabel: "Turn back on",
      restore: () => unsuppressAssistSource(userId, s.sourceKey, s.until),
    });
  }

  const hiddenTasks = taskStates.filter(
    (t) => t.dismissed_at !== null || (t.snoozed_until !== null && Date.parse(t.snoozed_until) > now),
  );
  if (hiddenTasks.length) {
    const { data, error } = await projectsDb(supabase)
      .from("tasks")
      .select("id, title")
      .is("deleted_at", null)
      .in("id", hiddenTasks.map((t) => t.task_id));
    if (error) {
      console.error("[Inbox] Hidden task titles failed:", error.message);
      failed = true;
    }
    const titles = new Map((data ?? []).map((t) => [t.id as string, (t.title as string | null) ?? "Untitled task"]));
    for (const t of hiddenTasks) {
      const title = titles.get(t.task_id);
      if (!title) continue;
      const snoozed = t.snoozed_until !== null && Date.parse(t.snoozed_until) > now;
      items.push({
        key: `task:${t.task_id}`,
        icon: CheckSquare,
        place: "Tasks",
        title,
        why: snoozed ? `Snoozed until ${fullTime(t.snoozed_until as string)}` : "Dismissed",
        actionLabel: snoozed ? "Unsnooze" : "Turn back on",
        restore: () => (snoozed ? unsnoozeTask(t.task_id) : undismissTask(t.task_id)),
      });
    }
  }
  return { items, failed };
}

export function HiddenElsewhere() {
  const userId = useAppSelector(selectUserId);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const work = useWorkWaiting(true);
  const hidden = useQuery({
    queryKey: ["inbox", "hidden-elsewhere", userId] as const,
    queryFn: () => loadHidden(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
  const workSnoozed = (work.data ?? []).reduce((sum, o) => sum + o.snoozed, 0);
  const items = hidden.data?.items ?? [];
  const partlyUnread = hidden.isError || Boolean(hidden.data?.failed);

  const restore = (item: HiddenItem) =>
    item
      .restore()
      .then(() => toast(`Back on: ${item.title}`))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : "That didn't save."),
      )
      .then(() => queryClient.invalidateQueries({ queryKey: ["inbox"] }));

  if (hidden.isLoading) return null;
  if (items.length === 0 && workSnoozed === 0 && !partlyUnread) return null;

  return (
    <section aria-label="Hidden elsewhere" className="mt-2">
      <div className="flex h-7 items-center px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Elsewhere
      </div>
      {partlyUnread ? (
        <div className="px-3 py-2 text-xs text-destructive">Some hidden items couldn&apos;t load here.<ErrorAlchemyMenu /></div>
      ) : null}
      <ul className="px-1">
        {workSnoozed > 0 ? (
          <li className="flex h-14 items-center gap-2.5 rounded-lg px-2 hover:bg-[var(--matrx-glass-bg-hover)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Table2 className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">{workSnoozed} snoozed in your tables</span>
              <span className="block truncate text-xs text-muted-foreground">In your tables · Snoozed view</span>
            </span>
            <button
              type="button"
              onClick={() => dispatch(openOverlay({ overlayId: "workInboxWindow" }))}
              className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium hover:bg-[var(--matrx-glass-bg-hover)]"
            >
              Show
            </button>
          </li>
        ) : null}
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex h-14 items-center gap-2.5 rounded-lg px-2 hover:bg-[var(--matrx-glass-bg-hover)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground" title={item.whyTitle}>
                  {item.place} · {item.why}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void restore(item)}
                className="h-7 shrink-0 rounded-md border border-border px-2 text-xs font-medium hover:bg-[var(--matrx-glass-bg-hover)]"
              >
                {item.actionLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
