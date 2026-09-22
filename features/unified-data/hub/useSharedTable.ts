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
// the store's OWN door — `custom.table_share_outside_for_me()`, which answers
// only for the person signed in — whether that person really holds a live share
// on THAT table in THAT organization. No row, no mount: the screen says what
// the address asked for and that nothing backs it. The door is the authority;
// this hook only reads it.
//
// It never changes which organization the person is working in. Their own
// selection is untouched — they are reading somebody else's table for as long
// as they are on this address, and the screen says so out loud.

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
  /** The address named an organization the store will not back. Say which, and why. */
  | { state: "not-shared"; why: string };

export function useSharedTable(
  dataSource: RecordsDataSource,
  tableId: string,
  askedOrganizationId: string | null,
  activeOrganizationId: string | null,
): SharedTableContext {
  const [answer, setAnswer] = useState<SharedTableContext>(
    askedOrganizationId && askedOrganizationId !== activeOrganizationId
      ? { state: "checking" }
      : { state: "none" },
  );

  useEffect(() => {
    if (!askedOrganizationId || askedOrganizationId === activeOrganizationId) {
      setAnswer({ state: "none" });
      return;
    }
    let alive = true;
    setAnswer({ state: "checking" });
    void (async () => {
      // 🚨 THE SWITCH, ASKED OF THE ORGANIZATION WHOSE STORE WE ARE ABOUT TO
      // READ, and asked here rather than only by the route above — this hook is
      // the only thing that can open another organization's store on this page,
      // so the gate belongs inside it and cannot be walked past by a host that
      // forgot its own. `off` and `could not check` are different sentences and
      // both are said; neither is ever spelled as "you have no share".
      const gate = await UNIFIED_DATA_CAMPAIGN.check(askedOrganizationId);
      if (!alive) return;
      if (gate.state !== "on") {
        setAnswer({
          state: "not-shared",
          why:
            gate.state === "unavailable"
              ? "The record store's switch could not be read for the organization that owns this " +
                `table, so nothing was read — this is not an answer about your access. ${gate.cause}`
              : "The organization that owns this table does not keep its data in the record store, " +
                "so there is nothing here to show you.",
        });
        return;
      }
      const answered = await doors.sharedWithMe(dataSource);
      if (!alive) return;
      if (!answered.ok) {
        // The call did not happen. That is not "you have no share" — saying so
        // would be a claim about this person's access that nobody measured.
        setAnswer({
          state: "not-shared",
          why:
            "The store's list of what has been shared with you did not answer, so nothing was " +
            `read — this is not an answer about your access. ${answered.error.message}`,
        });
        return;
      }
      const share = answered.data.find(
        (row) => row.table_id === tableId && row.organization_id === askedOrganizationId,
      );
      if (!share) {
        setAnswer({
          state: "not-shared",
          why:
            "This address says the table belongs to another organization and was shared with " +
            "you, and the store says it was not — the share may have been taken back, or run " +
            "out. Ask whoever shared it to share it again.",
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
