"use client";

// features/start/widgets/bodies/AgendaWidget.tsx — today's meetings through the meetings feature's own
// directory (`useMeetingsDirectory`: hosting or invited, every organization, no active-org filter).
import { Video } from "lucide-react";
import { useMeetingsDirectory } from "@/features/meet/hooks/useMeetingsDirectory";
import type { StartWidgetBodyProps } from "../types";
import { WidgetList } from "../frame";

interface OccurrenceLike {
  meetingId: string;
  occurrenceStart: string;
  title: string;
  meetingCancelled: boolean;
  state: string;
}

/** Occurrences that start today (local), not cancelled, earliest first. */
export function pickTodaysOccurrences<T extends OccurrenceLike>(occurrences: readonly T[], now = new Date()): T[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return occurrences
    .filter((o) => !o.meetingCancelled && o.state !== "cancelled")
    .filter((o) => {
      const t = new Date(o.occurrenceStart).getTime();
      return t >= start && t < end;
    })
    .sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));
}

/**
 * One row per series: meetings sharing a title (and host) today collapse to the NEXT one still to come
 * (else the last), with how many there are. Seen live 2026-10-09: six separate one-off meetings named
 * "Weekly product sync" (real rows, no recurrence rule) filled the whole slot.
 */
export function collapseSeries<T extends OccurrenceLike & { hostUserId?: string }>(
  today: readonly T[],
  now = new Date(),
): (T & { count: number })[] {
  const groups = new Map<string, T[]>();
  for (const o of today) {
    const key = `${o.hostUserId ?? ""}:${o.title.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const at = now.getTime();
  return [...groups.values()]
    .map((list) => {
      const next = list.find((o) => new Date(o.occurrenceStart).getTime() >= at) ?? list[list.length - 1]!;
      return { ...next, count: list.length };
    })
    .sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));
}

export function AgendaWidget({ size }: StartWidgetBodyProps) {
  const directory = useMeetingsDirectory();
  const today = collapseSeries(pickTodaysOccurrences(directory.occurrences));
  return (
    <WidgetList
      type="agenda"
      size={size}
      loading={directory.loading}
      error={directory.failure}
      empty="Nothing scheduled today"
      rows={today.map((o) => ({
        key: `${o.meetingId}:${o.occurrenceStart}`,
        title: o.title || "Untitled meeting",
        href: `/meetings/${encodeURIComponent(o.meetingId)}`,
        meta: `${new Date(o.occurrenceStart).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${o.count > 1 ? ` · ${o.count} today` : ""}`,
        icon: Video,
      }))}
    />
  );
}
