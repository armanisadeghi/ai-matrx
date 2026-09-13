/**
 * SPEC-UI-IA §5.9 — "grouped by urgency (Overdue / Today / This week / Later)".
 *
 * This is deliberately computed in the browser and not in the RPC: "today" is a
 * question about the viewer's clock, and a server that answers it has to guess a
 * timezone. The queue's ORDER is the server's (`hr.wf_pending` sorts urgent
 * first, then `due_at`); only the bucket LABEL is local.
 */

import type { HrInboxRow, HrUrgencyBucket } from "@/features/hr/tasks/types";
import { formatDurationMs } from "@ai-matrx/kit/format";


export const URGENCY_ORDER: HrUrgencyBucket[] = [
    "overdue",
    "today",
    "week",
    "later",
    "undated",
];

export const URGENCY_LABEL: Record<HrUrgencyBucket, string> = {
    overdue: "Overdue",
    today: "Today",
    week: "This week",
    later: "Later",
    undated: "No due date",
};

export function bucketFor(dueAt: string | null | undefined, now = new Date()): HrUrgencyBucket {
    if (!dueAt) return "undated";
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return "undated";
    if (due.getTime() < now.getTime()) return "overdue";

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    if (due.getTime() <= endOfToday.getTime()) return "today";

    const endOfWeek = new Date(endOfToday);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return due.getTime() <= endOfWeek.getTime() ? "week" : "later";
}

export function groupByUrgency(
    rows: HrInboxRow[],
    now = new Date(),
): { bucket: HrUrgencyBucket; rows: HrInboxRow[] }[] {
    const groups = new Map<HrUrgencyBucket, HrInboxRow[]>();
    for (const row of rows) {
        const bucket = bucketFor(row.due_at, now);
        const list = groups.get(bucket);
        if (list) list.push(row);
        else groups.set(bucket, [row]);
    }
    return URGENCY_ORDER.filter((b) => groups.has(b)).map((bucket) => ({
        bucket,
        rows: groups.get(bucket) ?? [],
    }));
}

/** "in 3 hours" / "2 days overdue" — a countdown a person can act on. */
export function relativeDue(dueAt: string | null | undefined, now = new Date()): string {
    if (!dueAt) return "No due date";
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return "No due date";
    const deltaMs = due.getTime() - now.getTime();
    const overdue = deltaMs < 0;
    const magnitude = Math.abs(deltaMs);
    // ONE CALL, not a cascade with one adopted branch (2026-09-12). Until now
    // only the under-an-hour branch went to the package and the two above it
    // were hand-rolled against local `HOUR_MS` / `DAY_MS` constants — invisible
    // to the duration guard, which read literal time bases only. `coarse` owns
    // every tier this needed, including the day tier the hand-rolled version
    // printed as "3 days" flat where the voice says "3d 4h".
    const text = formatDurationMs(magnitude, { style: "coarse" });
    return overdue ? `${text} overdue` : `in ${text}`;
}
