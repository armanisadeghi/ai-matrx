// features/make/recent.ts — LANE MAKE-HOME, wave 1.
//
// "RECENTLY CHANGED" ON /make: the last ten things the person can open, any kind, newest change
// first, each naming its organization. Read once through the data home's one call
// (`custom.data_home`, features/unified-data/hub/doors.ts) and built into rows by the data home's
// own builder (`buildDataHomeRows`), so a row's address, kind word and organization are exactly the
// ones /data-v2 lists.
//
// WHAT NEVER SHOWS (guard G2, __tests__/recent-skips-archived-and-test-rows.test.ts):
//   · an archived or removed row — the door already skips them (deleted_at / archived_at); this is
//     the second wall, so a door that one day answers with archived rows still never puts one here;
//   · a row in a TEST organization — `iam.organizations.settings.test_fixture`, the stored
//     classification the organization picker already hides test organizations by
//     (features/organizations/components/OrganizationPickerPanel.tsx); never a name match;
//   · a Table the app keeps for itself (`kept_by_the_app`: scopes, choice lists, bookkeeping).
// "Changed", not "opened": there is no door for what a person opened across kinds.

import type { DataHomeAnswer } from "@/features/unified-data/hub/doors";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

export const RECENT_SHOWN = 10;

/** A door row (or its `item_row`) that says it is archived or removed. */
export function carriesArchived(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  if (row["archived_at"] != null || row["deleted_at"] != null) return true;
  if (row["is_archived"] === true || row["archived"] === true) return true;
  return row["state"] === "archived";
}

/** An organization the store classifies as a test fixture (`settings.test_fixture`). */
export function isTestOrganization(org: { settings?: unknown }): boolean {
  const settings = org.settings;
  return Boolean(settings && typeof settings === "object" && "test_fixture" in (settings as object));
}

/**
 * The data home's answer with everything Recent must never show taken out BEFORE rows are built:
 * archived rows, test organizations' rows, and the Tables the app keeps for itself.
 */
export function answerForRecent(answer: DataHomeAnswer, testOrganizationIds: ReadonlySet<string>): DataHomeAnswer {
  return {
    tables: answer.tables.filter(
      (t) =>
        !t.kept_by_the_app &&
        !testOrganizationIds.has(t.organization_id) &&
        !carriesArchived(t as unknown as Record<string, unknown>),
    ),
    items: answer.items.filter(
      (i) =>
        !testOrganizationIds.has(i.organization_id) &&
        !carriesArchived(i.item_row) &&
        !carriesArchived(i as unknown as Record<string, unknown>),
    ),
    changed_by: answer.changed_by,
  };
}

/** Newest change first; a row with no change time cannot be "recently changed" and is left out. */
export function recentlyChanged(rows: readonly DataHomeRow[], limit = RECENT_SHOWN): DataHomeRow[] {
  return rows
    .filter((r) => Boolean(r.updatedAt))
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? ""))
    .slice(0, limit);
}
