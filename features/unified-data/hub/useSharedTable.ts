"use client";

// features/unified-data/hub/useSharedTable.ts — LANE HUB-FIX
//
// A TABLE SOMEBODY ELSE'S ORGANIZATION SHARED WITH YOU, OPENED IN THEIRS.
//
// 🚨 THE DEAD ROW THIS CLOSES (VERIFIER-14 item 2, measured on production from
// the member seat). The hub's "Shared with me" listing exists precisely to show
// tables ANOTHER organization has given the person signed in. Every row on it
// linked to `/data-v2/<table>` — the table route, which mounts the store for
// the organization the person is currently working in — so every row landed on:
//
//     "This table is not here. This table is not in the organization you are
//      working in, so there is nothing here to show."
//
// Honest, and still a named thing that does not open. The row is unopenable BY
// DEFINITION as long as the address does not say whose table it is.
//
// THE FIX IS THE PLATFORM'S OWN, NOT A NEW ONE. `platform.link_carries_its_organization`
// is the rule that makes every notification link name the organization it is
// about (`?org=<uuid>`), because a link that lands in whichever organization the
// reader happens to have picked is a link that lands anywhere. The hub's row now
// carries `?org=` the same way, and this hook is what the table route reads it
// with.
//
// 🚨 IT DOES NOT TRUST THE ADDRESS. A `?org=` in a URL is a claim anybody can
// type. Before the route mounts the store for another organization, this asks
// the store's OWN door — `custom.tables_shared_with_me()`, which answers only
// for the person signed in — whether that person really holds a live, ACCEPTED
// share on THAT table in THAT organization. No row, no mount: the screen says what
// the address asked for and that nothing backs it. The door is the authority;
// this hook only reads it.
//
// It never changes which organization the person is working in. Their own
// selection is untouched — they are reading somebody else's table for as long
// as they are on this address, and the screen says so out loud.
//
// 🚨 IT RUNS EVEN WHEN `?org=` IS THE ORGANIZATION THEY ARE WORKING IN
// (VERIFIER-15 H4). The accept screen sets the owner's organization and opens
// the table in one gesture, so the address and the selection agree — and the
// old guard ("asked === active → nothing to check") skipped the banner, leaving
// nothing on the page to say whose table this is. The door only lists
// organizations the person is NOT a member of, so a member's own `?org=` link
// finds nothing here and the page behaves exactly as it always did.

import { createKeptAnswers } from "@/lib/kept-answer/keptAnswer";
import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "./doors";

export type SharedTableContext =
  /** No `?org=` on the address, or it names the organization already active. */
  | { state: "none" }
  /** The door has not answered yet. NEVER mount the wrong organization meanwhile. */
  | { state: "checking" }
  /** A live share, straight from the store's own door. */
  | {
      state: "shared";
      organizationId: string;
      organizationName: string;
      levelLabel: string;
    }
  /** A real share that cannot open right now. The sentence says why. */
  | { state: "not-shared"; why: string };

/** What the share door says about `tableId` in `askedOrganizationId` (never throws). */
export async function askSharedTable(
  dataSource: RecordsDataSource,
  tableId: string,
  askedOrganizationId: string,
): Promise<SharedTableContext> {
  // FIRST, IS IT A SHARE AT ALL. The door answers only about the person
  // signed in and names no organization, so asking it first costs every
  // ordinary `?org=` link (a member's own notification) one small read and
  // never a sentence about an organization they may well belong to.
  const answered = await doors.tablesSharedWithMe(dataSource);
  if (!answered.ok) {
    // We could not look. The table page's own mount still answers for the
    // organization the person is working in; claiming anything about a
    // share here would be a claim nobody measured.
    return { state: "none" };
  }
  const share = answered.data.find(
    (row) => row.table_id === tableId && row.organization_id === askedOrganizationId,
  );
  if (!share) {
    // NOT A SHARE OF THEIRS. The door lists only organizations the person is
    // not a member of, so this is either their own organization (the link
    // judge moves them there, and the page is theirs) or an address naming a
    // table nobody shared with them — for which the table page's own
    // sentence ("This table is not here") is already the honest answer.
    return { state: "none" };
  }
  if (!share.opens) return { state: "not-shared", why: share.say };
  return {
    state: "shared",
    organizationId: share.organization_id,
    organizationName: share.organization,
    levelLabel: share.level_label,
  };
}

/**
 * KEPT PER (TABLE, ORGANIZATION), NEVER BLANKED (lane REMOUNT-SAFETY, 2026-10-02). A remount or
 * a wake reads the last answer at once — the table page's ports and rights hang on it, so a
 * "checking" blink re-bound them on every wake — and re-asks in the background.
 */
const sharedTables = createKeptAnswers<SharedTableContext>();

/** Tests only: forget every kept share answer. */
export function forgetSharedTables(): void {
  sharedTables.forget();
}

export function useSharedTable(
  dataSource: RecordsDataSource,
  tableId: string,
  askedOrganizationId: string | null,
): SharedTableContext {
  const key = askedOrganizationId ? `${tableId}:${askedOrganizationId}` : null;
  const { answer } = sharedTables.useAnswer(key, () => askSharedTable(dataSource, tableId, askedOrganizationId ?? ""));
  if (!askedOrganizationId) return { state: "none" };
  return answer ?? { state: "checking" };
}
