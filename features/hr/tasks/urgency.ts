/**
 * SPEC-UI-IA §5.9 — "grouped by urgency (Overdue / Today / This week / Later)".
 *
 * This is deliberately computed in the browser and not in the RPC: "today" is a
 * question about the viewer's clock, and a server that answers it has to guess a
 * timezone. The queue's ORDER is the server's (`hr.wf_pending` sorts urgent
 * first, then `due_at`); only the bucket LABEL is local.
 */

import type { HrInboxRow, HrUrgencyBucket } from "@/features/hr/tasks/types";

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
    const minutes = Math.round(Math.abs(deltaMs) / 60000);
    const text =
        minutes < 60
            ? `${minutes} min`
            : minutes < 60 * 48
              ? `${Math.round(minutes / 60)} hr`
              : `${Math.round(minutes / 1440)} days`;
    return overdue ? `${text} overdue` : `in ${text}`;
}
