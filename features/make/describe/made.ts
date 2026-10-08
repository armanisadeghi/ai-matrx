// features/make/describe/made.ts — LANE MAKE-HOME (v6), wave 3: the describe box.
//
// WHAT THE AGENT MADE, READ FROM THE STORE — NEVER FROM ITS WORDS. The describe box hands the
// person's sentence to the EXISTING Data page agent (mandate `data.page_guidance`, whose job is
// "turn one plain sentence into a live form, booking page, portal or dashboard … built through the
// records tool"). That agent writes through the server's `records` tool (`form_propose`,
// `booking_propose` — each makes its table too). This file never trusts the agent's reply to say
// what exists: it diffs two reads of the data home's own doors (`custom.data_home_tables` +
// `custom.data_home_items`) for the one organization, before and after, so every card on the
// result is a thing the store answers for, and each one opens.
//
// Pure: the component polls the doors and calls `madeSince`; the guard tests it with no network.

import type { DataHomeItemRow, DataHomeTableRow } from "@/features/unified-data/hub/doors";
import { formatDurationSeconds } from "@ai-matrx/kit/format";

export type MadeKind = "table" | "form" | "booking" | "portal" | "dashboard" | "digest" | "checklist";

/** One thing the sentence made, with where it opens. */
export interface MadeThing {
  kind: MadeKind;
  id: string;
  title: string;
  /** Where the maker opens it (the table, or the builder rail on its table). */
  href: string;
  /** Where a stranger opens it, for a published form or booking page. */
  publicHref?: string;
  /**
   * The kind in a person's words when the store's kind word is too broad: the items door lists every
   * subscription as "digest", and one that tells somebody the moment an answer arrives is a
   * Notification, not a Digest (the same cadence test the workflow presets use).
   */
  word?: string;
}

/** Everything one organization holds at one moment, by id — the "before" of a describe run. */
export interface StoreSnapshot {
  tables: ReadonlySet<string>;
  items: ReadonlySet<string>;
}

const itemKey = (row: Pick<DataHomeItemRow, "kind" | "item_id">) => `${row.kind}:${row.item_id}`;

export function snapshotOf(tables: readonly DataHomeTableRow[], items: readonly DataHomeItemRow[]): StoreSnapshot {
  return {
    tables: new Set(tables.map((t) => t.table_id)),
    items: new Set(items.map(itemKey)),
  };
}

const ITEM_KINDS: ReadonlySet<string> = new Set(["form", "booking", "portal", "dashboard", "digest", "checklist"]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * What is in `after` and not in `before`, for ONE organization: the person's own new tables
 * (never the app's bookkeeping — a booking page's slots table is platform table) and every new
 * form, booking page, portal, dashboard, digest or checklist. A booking page IS a form in the store,
 * so an id listed as both is shown once, as the booking page. Tables first, then forms, then
 * bookings, then the rest — the order a person reads "table, form, booking".
 */
export function madeSince(
  before: StoreSnapshot,
  after: { tables: readonly DataHomeTableRow[]; items: readonly DataHomeItemRow[] },
  organizationId: string,
): MadeThing[] {
  const made: MadeThing[] = [];
  for (const t of after.tables) {
    if (t.organization_id !== organizationId || before.tables.has(t.table_id)) continue;
    if (t.platform_owned || t.kind !== "table") continue;
    made.push({ kind: "table", id: t.table_id, title: t.table_name, href: `/data/${t.table_id}` });
  }
  const bookingIds = new Set(
    after.items.filter((i) => i.kind === "booking").map((i) => str(i.item_row.form_id) ?? i.item_id),
  );
  for (const i of after.items) {
    if (i.organization_id !== organizationId || !ITEM_KINDS.has(i.kind) || before.items.has(itemKey(i))) continue;
    const row = i.item_row;
    const id = str(row.form_id) ?? i.item_id;
    if (i.kind === "form" && bookingIds.has(id)) continue;
    const tableId = str(row.table_id) ?? i.table_id;
    const title = str(row.title) ?? str(row.name) ?? i.table_name ?? "Untitled";
    const published = Boolean(row.published_at);
    if (i.kind === "form") {
      made.push({
        kind: "form",
        id,
        title,
        href: tableId ? `/data/${tableId}?rail=forms&item=${id}` : `/f/${id}`,
        ...(published ? { publicHref: `/f/${id}` } : {}),
      });
    } else if (i.kind === "booking") {
      made.push({
        kind: "booking",
        id,
        title,
        href: tableId ? `/data/${tableId}?rail=bookings&item=${id}` : `/b/${id}`,
        ...(published ? { publicHref: `/b/${id}` } : {}),
      });
    } else {
      const instant = i.kind === "digest" && ["", "instant", "immediate"].includes(String(row.cadence ?? ""));
      made.push({
        ...(instant ? { word: "Notification" } : {}),
        kind: i.kind as MadeKind,
        id: i.item_id,
        title,
        href:
          i.kind === "dashboard" && tableId
            ? `/data/${tableId}?dashboard=${i.item_id}`
            : tableId
              ? `/data/${tableId}`
              : "/data",
      });
    }
  }
  const order: Record<MadeKind, number> = { table: 0, form: 1, booking: 2, portal: 3, dashboard: 4, checklist: 5, digest: 6 };
  return made.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The result's heading: "Made in 41s" — whole seconds, never under one, so a ticking count never flickers decimals. */
export function secondsWords(ms: number): string {
  return formatDurationSeconds(Math.max(1, Math.round(ms / 1000)), { style: "compact" });
}
