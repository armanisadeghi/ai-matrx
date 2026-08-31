"use client";

/**
 * THE SCHEDULING ROW'S ACTIONS — ONE definition of "what you can do to a
 * scheduled task row" and "what you can do to a run row", shared by every
 * admin table that shows one (tasks, runs, orphan-leases; scanner-health
 * shows `sch_task` too and should adopt `useScheduledTaskMenuSection` on its
 * next touch — see SECTIONS.md).
 *
 * Mirrors `features/crm/components/crm-row-actions.tsx`: a table adds a
 * right-click menu by calling the hook once, handing the pane's
 * `NonEditableContextMenu` its `resolveContextOnOpen` and `extraSections`.
 *
 * THE DOOR LAW: a scheduled task opens at `/schedules/<id>` (`scheduleHref`),
 * never the workspace `task` route — see `features/scheduling/constants/routes.ts`.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. "Disable schedule" delegates to the
 * existing `disableTaskAdmin` RPC and "Mark run as failed" to the existing
 * `markRunFailedAdmin` RPC (both already live in
 * `lib/services/scheduling-admin-service.ts`) — this module only puts doors
 * that already exist onto a menu that didn't have them yet.
 */

import { useState } from "react";
import {
  ExternalLink,
  Hash,
  Play,
  Power,
  SquareArrowOutUpRight,
  XCircle,
} from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraItem,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import {
  disableTaskAdmin,
  markRunFailedAdmin,
} from "@/lib/services/scheduling-admin-service";
import { scheduleHref } from "@/features/scheduling/constants/routes";

function copyToClipboard(text: string, done: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Could not copy to clipboard"),
  );
}

function rowFromDataId<T extends { id: string }>(
  target: HTMLElement | null,
  rows: () => T[],
): T | null {
  const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
  if (!id) return null;
  return rows().find((r) => r.id === id) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduled TASK rows (`scheduler.sch_task`) — tasks/page.tsx today;
// scanner-health/page.tsx names the same identity and should adopt this on
// next touch (out of scope for this rollout wave).
// ─────────────────────────────────────────────────────────────────────────

export interface ScheduledTaskMenuRow {
  id: string;
  title: string;
  enabled: boolean;
}

export interface ScheduledTaskMenu {
  resolveContextOnOpen: (
    target: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  getApplicationScope: () => ApplicationScope;
  sections: ContextMenuExtraSection[];
}

export function useScheduledTaskMenuSection<T extends ScheduledTaskMenuRow>(opts: {
  rows: () => T[];
  /** Readable text for Copy/AI — defaults to the title. */
  content?: (row: T) => string;
  /** Fires after a successful disable, so the host can update local state. */
  onDisabled?: (row: T) => void;
  /**
   * Queues one manual run without touching the schedule's enabled state
   * (e.g. `runNow` from `features/scheduling/service/schedulerClient`).
   * Omit on a host that has no run-now door — the item stays hidden rather
   * than disabled, since "run now" is opt-in surface capability, not a
   * universal action every task row supports.
   */
  onRunNow?: (row: T) => void | Promise<void>;
}): ScheduledTaskMenu {
  const [clicked, setClicked] = useState<T | null>(null);

  const resolveContextOnOpen = (target: HTMLElement | null) => {
    const row = rowFromDataId(target, opts.rows);
    setClicked(row);
    if (!row) return null;
    return {
      content: opts.content ? opts.content(row) : row.title,
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "sch_task" as const,
        id: row.id,
        title: row.title,
      },
    };
  };

  const withRow = (fn: (row: T) => void) => () => {
    if (!clicked) {
      toast.error("Right-click a schedule row to act on it.");
      return;
    }
    fn(clicked);
  };

  const disableSchedule = async (row: T) => {
    const ok = await confirm({
      title: `Disable "${row.title}"?`,
      description:
        "This pauses the schedule immediately — it stops firing until re-enabled. There is no re-enable control on this console yet; edit the schedule directly to turn it back on.",
      confirmLabel: "Disable",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await disableTaskAdmin(row.id);
      toast.success(`${row.title} disabled`);
      opts.onDisabled?.(row);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const href = clicked ? scheduleHref(clicked.id) : "#";
  const items: ContextMenuExtraItem[] = [
    ...(opts.onRunNow
      ? ([
          {
            kind: "item",
            id: "sch-task-run-now",
            label: "Run now",
            icon: Play,
            disabled: !clicked,
            onSelect: withRow((row) => void opts.onRunNow?.(row)),
          },
        ] satisfies ContextMenuExtraItem[])
      : []),
    {
      kind: "link",
      id: "sch-task-open",
      label: "Open schedule",
      icon: ExternalLink,
      href,
      disabled: !clicked,
    },
    {
      kind: "link",
      id: "sch-task-open-new-tab",
      label: "Open in a new tab",
      icon: SquareArrowOutUpRight,
      href,
      target: "_blank",
      disabled: !clicked,
    },
    {
      kind: "item",
      id: "sch-task-copy-id",
      label: "Copy schedule ID",
      icon: Hash,
      disabled: !clicked,
      onSelect: withRow((row) => copyToClipboard(row.id, "ID copied")),
    },
    {
      kind: "item",
      id: "sch-task-disable",
      label: "Disable schedule…",
      icon: Power,
      destructive: true,
      disabled: !clicked || !clicked.enabled,
      description: clicked && !clicked.enabled ? "Already paused" : undefined,
      onSelect: withRow((row) => void disableSchedule(row)),
    },
  ];

  return {
    resolveContextOnOpen,
    getApplicationScope: () => ({
      content: clicked ? (opts.content ? opts.content(clicked) : clicked.title) : "",
    }),
    sections: [{ id: "sch-task-row", label: "Schedule", items }],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduled RUN rows (`scheduler.sch_run`) — runs/page.tsx and
// orphan-leases/page.tsx name the exact same row shape (`AdminRunRow`).
// ─────────────────────────────────────────────────────────────────────────

export interface ScheduledRunMenuRow {
  id: string;
  task_id: string;
  task_title?: string | null;
  status: string;
}

export interface ScheduledRunMenu {
  resolveContextOnOpen: (
    target: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  getApplicationScope: () => ApplicationScope;
  sections: ContextMenuExtraSection[];
}

const FORCE_FAILABLE = new Set(["claimed", "running"]);

export function useScheduledRunMenuSection<T extends ScheduledRunMenuRow>(opts: {
  rows: () => T[];
  content?: (row: T) => string;
  /** Fires after a successful force-fail, so the host can reload/update. */
  onMarkedFailed?: (row: T) => void;
}): ScheduledRunMenu {
  const [clicked, setClicked] = useState<T | null>(null);

  const label = (row: T) => `Run ${row.id.slice(0, 8)}…`;

  const resolveContextOnOpen = (target: HTMLElement | null) => {
    const row = rowFromDataId(target, opts.rows);
    setClicked(row);
    if (!row) return null;
    return {
      content: opts.content ? opts.content(row) : label(row),
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "sch_run" as const,
        id: row.id,
        title: label(row),
      },
    };
  };

  const withRow = (fn: (row: T) => void) => () => {
    if (!clicked) {
      toast.error("Right-click a run row to act on it.");
      return;
    }
    fn(clicked);
  };

  const markFailed = async (row: T) => {
    const ok = await confirm({
      title: "Mark run as failed",
      description: `Force-fail ${label(row)} on "${row.task_title ?? row.task_id}"? The scanner will re-enqueue on the next tick for recurring triggers.`,
      confirmLabel: "Mark failed",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await markRunFailedAdmin(row.id, "Marked failed by admin (context menu)");
      toast.success("Run marked failed");
      opts.onMarkedFailed?.(row);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const scheduleHrefFor = clicked ? scheduleHref(clicked.task_id) : "#";
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "sch-run-open-schedule",
      label: "Open schedule",
      icon: ExternalLink,
      href: scheduleHrefFor,
      disabled: !clicked,
    },
    {
      kind: "link",
      id: "sch-run-open-schedule-new-tab",
      label: "Open schedule in a new tab",
      icon: SquareArrowOutUpRight,
      href: scheduleHrefFor,
      target: "_blank",
      disabled: !clicked,
    },
    {
      kind: "item",
      id: "sch-run-copy-id",
      label: "Copy run ID",
      icon: Hash,
      disabled: !clicked,
      onSelect: withRow((row) => copyToClipboard(row.id, "ID copied")),
    },
    {
      kind: "item",
      id: "sch-run-mark-failed",
      label: "Mark run as failed…",
      icon: XCircle,
      destructive: true,
      disabled: !clicked || !FORCE_FAILABLE.has(clicked.status),
      description:
        clicked && !FORCE_FAILABLE.has(clicked.status)
          ? "Only claimed or running runs can be force-failed"
          : undefined,
      onSelect: withRow((row) => void markFailed(row)),
    },
  ];

  return {
    resolveContextOnOpen,
    getApplicationScope: () => ({
      content: clicked ? (opts.content ? opts.content(clicked) : label(clicked)) : "",
    }),
    sections: [{ id: "sch-run-row", label: "Run", items }],
  };
}
