"use client";

/**
 * A TABLE SHOWN AWAY FROM ITS PAGE GETS THE TABLE'S ONE ACTION LIST (lane TABLE-ACTIONS item 11).
 *
 * Mounts that draw a record-store table outside `/data/<id>` — `UserTableWindow`,
 * `QuickDataWindow`'s preview, the store grid on `/data/<id>` — answer a right-click with
 * `tableActions()` from `@ai-matrx/records-ui`, through the one v3 renderer (`toExtraSections`).
 * There is no second list here: the guard `no-table-action-list-outside-the-registry` forbids it.
 *
 * Away from the page only the reading verbs act (Open, Open in new tab, Copy link, Copy table ID).
 * Every other verb keeps its row and says where it acts — on the table's page, which then checks
 * the person's real access. So `rights` here never refuse: a level this mount does not know would
 * be a guess, and a guessed "Needs Editor access" shown to the owner is a lie.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE.
 */

import { whatYouMayDo } from "@ai-matrx/records-ui";
import { tableActions, tableLink, type ObjectAction } from "@ai-matrx/records-ui/object-actions";

import type { ContextMenuEntityRef, ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { toExtraSections } from "@/features/unified-data/actions/tableActionAdapters";
import { copyToClipboard } from "@/lib/clipboard/copy";

/** The one thing every dataset-table surface can say about the selected table. */
export interface DatasetTableMenuRow {
  id: string;
  name: string | null;
}

/**
 * THE TABLE'S OWN ENTITY, for right-click's Attach To: a record-store table is a `record` (the Data
 * home's `getRowEntity` says the same). No `resourceType`: the table's action list carries Share,
 * so v3's generic Share is not drawn beside it.
 */
export function datasetTableEntityRef(
  row: DatasetTableMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "record", id: row.id, title: row.name ?? "Table" };
}

/** Why a verb that needs the table's page does nothing here (≤ 60 chars). */
export const ON_THE_TABLE_PAGE_REASON = "Open the table to do this";

/** Every verb the registry hands out that acts on the table's page, never away from it. */
const PAGE_VERBS = [
  "rename", "duplicate", "move", "favorite", "share", "export", "import", "add-column", "settings",
  "history", "make-default", "archive",
  ...["forms", "bookings", "checklists", "notifications", "portals", "inbox", "dashboards", "archived"].map(
    (destination) => `built-on.${destination}`,
  ),
];

/** The table's one action list, as a right-click's extra sections, for a mount away from its page. */
export function tableActionSectionsAwayFromPage(
  row: DatasetTableMenuRow | null,
): ContextMenuExtraSection[] {
  if (!row) return [];
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const copy = async (text: string, done: string) => {
    await copyToClipboard(text, done);
  };
  const actions: ObjectAction[] = tableActions({
    table: { id: row.id, name: row.name ?? "Table" },
    // Never a refusal (see header): only the reading verbs carry a handler.
    rights: whatYouMayDo("admin", true),
    host: {
      ...(origin ? { origin } : {}),
      open: () => window.location.assign(tableLink(row.id, origin)),
      openInNewTab: (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      copyText: (url) => copy(url, "Link copied"),
      unavailableReasons: Object.fromEntries(PAGE_VERBS.map((id) => [id, ON_THE_TABLE_PAGE_REASON])),
      extend: () => [
        {
          id: "copy-table-id",
          label: "Copy table ID",
          icon: "copy",
          group: "open",
          run: () => copy(row.id, "Table ID copied"),
        },
      ],
    },
  });
  return toExtraSections(actions);
}
