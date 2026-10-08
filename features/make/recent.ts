// features/make/recent.ts — LANE MAKE-HOME, wave 1.
//
// "RECENTLY CHANGED" ON /make: the last ten things the person can open, any kind, newest change
// first, each naming its organization. Read once through the data home's one call
// (`custom.data_home`, features/unified-data/hub/doors.ts) and built into rows by the data home's
// own builder (`buildDataHomeRows`), so a row's address, kind word and organization are exactly the
// ones /data lists.
//
// WHAT NEVER SHOWS (guard G2, __tests__/recent-skips-archived-and-test-rows.test.ts):
//   · an archived or removed row — the door already skips them (deleted_at / archived_at); this is
//     the second wall, so a door that one day answers with archived rows still never puts one here;
//   · a row in a TEST organization — `iam.organizations.settings.test_fixture`, the stored
//     classification the organization picker already hides test organizations by
//     (features/organizations/components/OrganizationPickerPanel.tsx); never a name match;
//   · a Table the app keeps for itself (`platform_owned`: scopes, choice lists, bookkeeping).
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

/**
 * THE TEST-ORGANIZATION MARK, READ IN ONE PLACE. Today the stored mark is `settings.test_fixture`
 * (the classification the organization picker hides test organizations by), plus the debris
 * organizations census v6 CENSUS-CLEANUP.md table B lists for archiving that carry no mark
 * (`TABLE_B_DEBRIS`, ids resolved read-only 2026-10-02). The chair is adding `is_test` on
 * iam.organizations; when it lands, this function reads `org.is_test` alone and the list goes —
 * the switch is this one function. It already honours `is_test` when a row carries it.
 */
export function isTestOrganization(org: { id?: string; settings?: unknown; is_test?: boolean | null }): boolean {
  if (typeof org.is_test === "boolean") return org.is_test;
  const settings = org.settings;
  if (settings && typeof settings === "object" && "test_fixture" in (settings as object)) return true;
  return org.id !== undefined && TABLE_B_DEBRIS.has(org.id);
}

/** Table B's ARCHIVE / test-account organizations with no `test_fixture` mark (until `is_test`). */
const TABLE_B_DEBRIS: ReadonlySet<string> = new Set([
  "988557e5-284c-4490-b152-5f3c61db24f7", // api-key:e2e's Org
  "23c2ac41-8044-49ed-9af9-35761370e5c0", // Cedar Ridge Dental
  "3d69560d-7339-4e16-b122-a3c6b9974a2a", // Coppa-Firstrun-Test (1)
  "326a149a-ffbd-4d51-8f11-73f3cb76fb15", // Coppa-Firstrun-Test (2)
  "ec5ae32a-e989-4b83-98ae-9bba88aa04d3", // d20-oauth-test's Workspace
  "16ff78a9-899f-4352-b44d-7f5ab3930b21", // Glenwood Insights
  "0b4f5f52-3261-4149-b864-fa1782f1877c", // Harbor Draft Co
  "c4397784-4435-4e3c-b94c-bebafcad084b", // Harbor Staffing Co
  "90221854-9c45-4494-bb32-ddbf4700e800", // Holdfast Archives
  "567c6356-0d90-4b8f-a45b-25e5f1a26235", // Holdfast Records
  "103039e4-e76f-4958-883e-7528b1c8b637", // Holdfast Storage
  "fcddc623-2927-4323-9e49-67345750eaf1", // Holdfast Vault
  "12c5515b-ccde-4bd6-94d2-3cf6e87bae14", // Lakeside Orthopedic Referrals
  "f808d9ad-3caa-446b-bc01-4c4f92145189", // Matrx-Local-E2e-Probe-20819's Org
  "75d4c4e4-5aa1-4d7c-8265-26881d5a18fa", // Matrx-Local-E2e's Org
  "e761e794-7d19-464d-b76e-c6dd36f09347", // Meridian Payroll
  "aeb1578b-3acd-4262-8bf6-fe7c3c46a880", // Northline Staffing
  "91201cc5-ba69-4cb1-9f07-ea1cb852c83c", // Northline Staffing II
  "21ef2575-552a-4fe7-88f1-6caf53cc6c52", // Page-Grantee-Test's Org
  "302fe159-d9f4-435a-acae-b01b53ba2d2c", // Quickline East
  "b5aae93c-f1f2-4c02-81a0-f6c992ba04ea", // Quickline North
  "4b152cfe-2380-435b-ae9f-72c3a0a9ab58", // Quickline South
  "4cedc83e-0757-4f99-b57a-a464451e4886", // Quickline West
  "dec1a2e0-0000-4000-8000-000000000001", // Relais Partners
  "9c5cee39-1c75-477b-94de-1066d4a52163", // Riverside Clinic
  "188f75a1-0a9a-49ac-a080-4e0a1179a4e1", // Toolwright
]);

/**
 * The data home's answer with everything Recent must never show taken out BEFORE rows are built:
 * archived rows, test organizations' rows, and the Tables the app keeps for itself.
 */
export function answerForRecent(answer: DataHomeAnswer, testOrganizationIds: ReadonlySet<string>): DataHomeAnswer {
  return {
    tables: answer.tables.filter(
      (t) =>
        !t.platform_owned &&
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

/** Rows whose organization is a test organization, taken out (Recent applies it once the person's
 * organizations are known, so the home read never waits for them). */
export function withoutTestOrganizations(rows: readonly DataHomeRow[], testOrganizationIds: ReadonlySet<string>): DataHomeRow[] {
  if (testOrganizationIds.size === 0) return [...rows];
  return rows.filter((r) => !r.organizationId || !testOrganizationIds.has(r.organizationId));
}
