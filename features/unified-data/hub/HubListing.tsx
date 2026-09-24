"use client";

// features/unified-data/hub/HubListing.tsx — LANE DATA-HUB
//
// THE ONE LISTING COMPONENT. Every capability on the hub is drawn by this, from
// its declaration in `capabilities.ts` — there is no per-capability screen and
// there must never be one, because ten of them would be ten empty states, ten
// row shapes and ten places to forget the lane filter.
//
// What a row always carries, because a hub that made you open a thing to learn
// what it is has not saved anybody a click: its name, the TABLE it belongs to,
// the short facts the store already counted, who changed it last and when — and
// a way in. THE DOOR LAW: every named thing opens.
//
// What it never does: draw a count nobody read, print an id at a person, or
// show an empty list with no sentence under it. A capability whose door refused
// says the store's own words and says that nothing was read — never an empty
// list standing in for a failed call.

import Link from "next/link";
import { ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import { cn } from "@ai-matrx/design-system";

import type { VisibilityLane } from "@ai-matrx/records-ui";

import { emptyInLane, type HubCapability, type HubItem } from "./capabilities";
import type { DoorFailure } from "./doors";

export type HubListingState =
  | { phase: "reading" }
  | { phase: "read"; items: HubItem[] }
  | { phase: "refused"; error: DoorFailure };

export interface HubListingProps {
  capability: HubCapability;
  state: HubListingState;
  /** The lane filter the whole hub is under, for the sentence an empty lane gets. */
  laneLabel: string | null;
  /** The lane the whole hub is filtered to, for the lane's own empty sentence. */
  lane?: VisibilityLane | null | undefined;
  /** This organization shows members only what is shared with them. */
  sharedOnly?: boolean | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "22 September at 14:05" — the way a person says it, never an ISO string. */
function when(at: string | null | undefined): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({ item }: { item: HubItem }) {
  const changed = when(item.changedAt);
  return (
    <li className="group border-t border-border first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
        <Link
          href={item.href}
          className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
        >
          {item.title}
        </Link>
        {/* NEVER THE SAME NAME TWICE ON ONE ROW. A Table and a board ARE their
            table, so "Crew choices in Crew choices" is the row saying nothing
            twice — measured on Rincon's 43 tables, 2026-09-22. */}
        {item.tableName && item.tableId !== item.id ? (
          <span className="truncate text-xs text-muted-foreground">in {item.tableName}</span>
        ) : null}
        {item.facts.length ? (
          <span className="truncate text-xs text-muted-foreground">
            {item.facts.join(" · ")}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {item.changedBy && changed ? (
            <span className="truncate">
              {item.changedBy}, {changed}
            </span>
          ) : changed ? (
            <span className="truncate">{changed}</span>
          ) : null}
          {item.publicHref ? (
            <Link
              href={item.publicHref}
              className="flex shrink-0 items-center gap-1 underline-offset-2 hover:underline"
              title={item.publicLabel}
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              {item.publicLabel}
            </Link>
          ) : null}
        </span>
      </div>
      {item.trouble ? (
        <p className="flex items-start gap-2 px-3 pb-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{item.trouble}</span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * ONE ROW FOR A GROUP OF SAME-TITLED ROWS — "Crew choices" said once, with the
 * count on it, instead of once per table that has a Crew field. There is no
 * single door a group of thirteen kernel tables opens, so the name is not a
 * link here; the count is the whole fact.
 */
function GroupedRow({ title, items }: { title: string; items: HubItem[] }) {
  const latest = items.reduce<HubItem | null>((newest, item) => {
    if (!item.changedAt) return newest;
    if (!newest || !newest.changedAt || item.changedAt > newest.changedAt) return item;
    return newest;
  }, null);
  const changed = latest ? when(latest.changedAt) : null;
  return (
    <li className="group border-t border-border first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "table" : "tables"}
        </span>
        {changed ? (
          <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {latest?.changedBy ? `${latest.changedBy}, ` : ""}
              most recently {changed}
            </span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** Same-titled items collapsed into one group each, order kept by first sighting. */
function groupItemsByTitle(items: HubItem[]): Array<{ title: string; items: HubItem[] }> {
  const order: string[] = [];
  const byTitle = new Map<string, HubItem[]>();
  for (const item of items) {
    const bucket = byTitle.get(item.title);
    if (bucket) {
      bucket.push(item);
    } else {
      byTitle.set(item.title, [item]);
      order.push(item.title);
    }
  }
  return order.map((title) => ({ title, items: byTitle.get(title) ?? [] }));
}

export function HubListing({
  capability,
  state,
  laneLabel,
  lane,
  sharedOnly,
  open,
  onOpenChange,
}: HubListingProps) {
  const grouped =
    state.phase === "read" && capability.groupDuplicateTitles
      ? groupItemsByTitle(state.items)
      : null;
  const count = state.phase === "read" ? (grouped ? grouped.length : state.items.length) : null;

  return (
    <section data-hub-listing={capability.id} className="rounded-lg border border-border bg-card">
      {/* ONE ROW OF HEADER. The name, the count, the sentence, and the way open. */}
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        data-hub-listing-toggle={capability.id}
        className="flex w-full items-baseline gap-2 px-3 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open ? "" : "-rotate-90",
          )}
          aria-hidden
        />
        <span className="text-sm font-medium text-foreground">{capability.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {state.phase === "reading" ? "reading…" : state.phase === "refused" ? "—" : count}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {sharedOnly && capability.whatWhenSharedOnly ? capability.whatWhenSharedOnly : capability.what}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border">
          {state.phase === "reading" ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Asking {capability.door}…
            </p>
          ) : state.phase === "refused" ? (
            /* NOTHING FAILS SILENTLY. The store's own sentence, and what it means. */
            <div className="px-3 py-3">
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>
                  {capability.door} did not answer, so nothing was read — this is not an empty
                  list. {state.error.message}
                </span>
              </p>
              {state.error.hint ? (
                <p className="mt-1 pl-5 text-xs text-muted-foreground">{state.error.hint}</p>
              ) : null}
            </div>
          ) : state.items.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {lane
                ? emptyInLane(capability.title, lane)
                : sharedOnly && capability.emptyWhenSharedOnly
                  ? capability.emptyWhenSharedOnly
                  : capability.empty}
            </p>
          ) : grouped ? (
            <ul className="divide-y-0">
              {grouped.map((group) =>
                group.items.length > 1 ? (
                  <GroupedRow key={`${capability.id}:${group.title}`} title={group.title} items={group.items} />
                ) : (
                  <Row key={`${capability.id}:${group.items[0]!.id}`} item={group.items[0]!} />
                ),
              )}
            </ul>
          ) : (
            <ul className="divide-y-0">
              {state.items.map((item) => (
                <Row key={`${capability.id}:${item.id}`} item={item} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
