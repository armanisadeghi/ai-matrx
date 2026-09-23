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

import { useEffect, useState } from "react";
import type { RecordsDataSource } from "@ai-matrx/records";

import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
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

export function useSharedTable(
  dataSource: RecordsDataSource,
  tableId: string,
  askedOrganizationId: string | null,
  activeOrganizationId: string | null,
): SharedTableContext {
  const [answer, setAnswer] = useState<SharedTableContext>(
    askedOrganizationId ? { state: "checking" } : { state: "none" },
  );

  useEffect(() => {
    if (!askedOrganizationId) {
      setAnswer({ state: "none" });
      return;
    }
    let alive = true;
    setAnswer({ state: "checking" });
    void (async () => {
      // FIRST, IS IT A SHARE AT ALL. The door answers only about the person
      // signed in and names no organization, so asking it first costs every
      // ordinary `?org=` link (a member's own notification) one small read and
      // never a sentence about an organization they may well belong to.
      const answered = await doors.tablesSharedWithMe(dataSource);
      if (!alive) return;
      if (!answered.ok) {
        // We could not look. The table page's own mount still answers for the
        // organization the person is working in; claiming anything about a
        // share here would be a claim nobody measured.
        setAnswer({ state: "none" });
        return;
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
        setAnswer({ state: "none" });
        return;
      }
      if (!share.opens) {
        setAnswer({ state: "not-shared", why: share.say });
        return;
      }
      // 🚨 THE SWITCH, ASKED OF THE ORGANIZATION WHOSE STORE WE ARE ABOUT TO
      // READ, and asked here rather than only by the route above — this hook is
      // the only thing that can open another organization's store on this page,
      // so the gate belongs inside it and cannot be walked past by a host that
      // forgot its own. `off` and `could not check` are different sentences.
      const gate = await UNIFIED_DATA_CAMPAIGN.check(askedOrganizationId);
      if (!alive) return;
      if (gate.state !== "on") {
        setAnswer({
          state: "not-shared",
          why:
            gate.state === "unavailable"
              ? `${share.organization} shared ${share.table_name} with you, and whether its record store is on could not be read, so nothing was read — this is not an answer about your access. ${gate.cause}`
              : `${share.organization} shared ${share.table_name} with you, and does not keep its data in the record store right now, so there is nothing to show yet.`,
        });
        return;
      }
      setAnswer({
        state: "shared",
        organizationId: share.organization_id,
        organizationName: share.organization,
        levelLabel: share.level_label,
      });
    })();
    return () => {
      alive = false;
    };
  }, [dataSource, tableId, askedOrganizationId, activeOrganizationId]);

  return answer;
}
