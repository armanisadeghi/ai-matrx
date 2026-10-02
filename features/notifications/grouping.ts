/**
 * features/notifications/grouping.ts — one row per object (RESEARCH.md §3.4).
 *
 * Grouped on the client over the fetched page until a grouped door exists
 * (`my_notification_groups`, the named server follow-up — paging stays exact only
 * once the server groups):
 *
 *   * `records.changed` and every non-update notice with a target group by
 *     `target_kind:target_id` — the 56 "Request submitted" notices about one HR
 *     request become one row;
 *   * every other UPDATE groups by its event family and organization — 17 "News
 *     monitor digest" rows become one;
 *   * a notice with no target and no family stands alone.
 *
 * The lead row is the newest; the group sorts at the lead's time.
 */
import type { InboxNotification, NoticeBucket } from "./types";

export interface NoticeGroup {
  key: string;
  lead: InboxNotification;
  rows: InboxNotification[];
  bucket: NoticeBucket;
  unread: number;
  /** Distinct named actors, newest first. */
  actors: string[];
}

export function groupKeyOf(row: InboxNotification): string {
  if (row.bucket === "updates" && row.event_key !== "records.changed") {
    return `family:${row.event_key}:${row.organization_id ?? ""}`;
  }
  if (row.target_kind && row.target_id) {
    return `target:${row.target_kind}:${row.target_id}`;
  }
  return `row:${row.id}`;
}

export function groupNotices(rows: readonly InboxNotification[]): NoticeGroup[] {
  const groups = new Map<string, NoticeGroup>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        lead: row,
        rows: [row],
        bucket: row.bucket,
        unread: row.read_at === null ? 1 : 0,
        actors: row.actor_name ? [row.actor_name] : [],
      });
      continue;
    }
    existing.rows.push(row);
    if (row.read_at === null) existing.unread += 1;
    if (row.actor_name && !existing.actors.includes(row.actor_name)) {
      existing.actors.push(row.actor_name);
    }
    if (row.sort_at > existing.lead.sort_at) existing.lead = row;
    // A group needs you when any member does.
    if (row.bucket === "needs_you") existing.bucket = "needs_you";
  }
  return [...groups.values()].sort((a, b) =>
    a.lead.sort_at < b.lead.sort_at ? 1 : a.lead.sort_at > b.lead.sort_at ? -1 : 0,
  );
}

/** "Dana", "Dana and Sam", "Dana and 3 others". */
export function actorsPhrase(actors: readonly string[]): string | null {
  if (actors.length === 0) return null;
  if (actors.length === 1) return actors[0];
  if (actors.length === 2) return `${actors[0]} and ${actors[1]}`;
  return `${actors[0]} and ${actors.length - 1} others`;
}

/** Every member id of a set of groups — what a group-level action acts on. */
export function idsOf(groups: readonly NoticeGroup[]): string[] {
  return groups.flatMap((group) => group.rows.map((row) => row.id));
}
