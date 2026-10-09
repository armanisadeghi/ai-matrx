// features/make/__tests__/recent-skips-archived-and-test-rows.test.ts — guard G2 (lane MAKE-HOME).
//
// THE USE CASE. Cedar Ridge Physical Therapy's front desk opens /make. "Recently changed" shows
// what she worked on — the Patient Intake table, its intake form — and never: the old waitlist
// form she archived last week, a test organization's scratch table (an organization the store
// classifies `settings.test_fixture`, the same mark the organization picker hides by), or a scope
// table the app keeps for itself. Newest change first, ten at most, and a row with no change time
// is not "recently changed".
//
// RED ON A PLANT: drop any one filter from `answerForRecent` and the matching case below fails
// (proof run recorded in PROGRESS-MAKE-HOME.md).

import type { DataHomeAnswer } from "@/features/unified-data/hub/doors";
import type { DataHomeRow } from "@/features/unified-data/home/dataHomeRows";

import { answerForRecent, carriesArchived, isTestOrganization, recentlyChanged, RECENT_SHOWN, withoutTestOrganizations } from "../recent";

const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const SCRATCH = "c0ffee00-0000-4000-8000-000000000001";

const table = (id: string, name: string, org: string, orgName: string, extra: Record<string, unknown> = {}) => ({
  table_id: id,
  table_name: name,
  organization_id: org,
  organization_name: orgName,
  member: true,
  visibility: "internal",
  updated_at: "2026-10-02T15:00:00Z",
  mine: true,
  shared_with_me: false,
  platform_owned: false,
  kind: "table",
  ...extra,
});

const ANSWER = {
  tables: [
    table("t-intake", "Patient Intake", CEDAR, "Cedar Ridge Physical Therapy"),
    table("t-scratch", "Lane scratch rows", SCRATCH, "Lane scratch org"),
    table("t-scope", "Clinic locations", CEDAR, "Cedar Ridge Physical Therapy", { platform_owned: true, kind: "scope" }),
    table("t-gone", "Old waitlist", CEDAR, "Cedar Ridge Physical Therapy", { archived_at: "2026-09-25T10:00:00Z" }),
  ],
  items: [
    {
      kind: "form",
      organization_id: CEDAR,
      organization_name: "Cedar Ridge Physical Therapy",
      item_id: "f-intake",
      table_id: "t-intake",
      table_name: "Patient Intake",
      item_row: { form_id: "f-intake", title: "New patient intake", state: "open" },
    },
    {
      kind: "form",
      organization_id: CEDAR,
      organization_name: "Cedar Ridge Physical Therapy",
      item_id: "f-waitlist",
      table_id: "t-intake",
      table_name: "Patient Intake",
      item_row: { form_id: "f-waitlist", title: "Waitlist sign-up", archived_at: "2026-09-25T10:00:00Z" },
    },
    {
      kind: "dashboard",
      organization_id: SCRATCH,
      organization_name: "Lane scratch org",
      item_id: "d-scratch",
      table_id: "t-scratch",
      table_name: "Lane scratch rows",
      item_row: { dashboard_id: "d-scratch", name: "Scratch board" },
    },
  ],
  changed_by: [],
} as unknown as DataHomeAnswer;

it("an archived table and an archived form never reach Recent", () => {
  const kept = answerForRecent(ANSWER, new Set());
  expect(kept.tables.map((t) => t.table_id)).not.toContain("t-gone");
  expect(kept.items.map((i) => i.item_id)).not.toContain("f-waitlist");
  expect(kept.items.map((i) => i.item_id)).toContain("f-intake");
});

it("a test organization's rows never reach Recent", () => {
  const kept = answerForRecent(ANSWER, new Set([SCRATCH]));
  expect(kept.tables.map((t) => t.table_id)).not.toContain("t-scratch");
  expect(kept.items.map((i) => i.item_id)).not.toContain("d-scratch");
  expect(kept.tables.map((t) => t.table_id)).toContain("t-intake");
});

it("a table the app keeps for itself never reaches Recent", () => {
  expect(answerForRecent(ANSWER, new Set()).tables.map((t) => t.table_id)).not.toContain("t-scope");
});

it("a test organization is the stored classification, never a name", () => {
  expect(isTestOrganization({ settings: { test_fixture: "ORG-CLEANUP 2026-09-22" } })).toBe(true);
  expect(isTestOrganization({ settings: { test_fixture: true } })).toBe(true);
  expect(isTestOrganization({ settings: {} })).toBe(false);
  expect(isTestOrganization({})).toBe(false);
  // Table B's unmarked debris counts until is_test lands; is_test, once a row carries it, decides alone.
  expect(isTestOrganization({ id: "4cedc83e-0757-4f99-b57a-a464451e4886", settings: {} })).toBe(true);
  expect(isTestOrganization({ id: CEDAR, settings: {} })).toBe(false);
  expect(isTestOrganization({ id: CEDAR, is_test: true })).toBe(true);
  expect(isTestOrganization({ id: SCRATCH, settings: { test_fixture: true }, is_test: false })).toBe(false);
  expect(carriesArchived({ state: "archived" })).toBe(true);
  expect(carriesArchived({ deleted_at: "2026-09-25T10:00:00Z" })).toBe(true);
  expect(carriesArchived({ state: "open" })).toBe(false);
});

it("Recent is newest change first, at most ten, and skips a row with no change time", () => {
  const row = (id: string, at: string | null) => ({ id, updatedAt: at }) as DataHomeRow;
  const rows = [
    row("a", "2026-10-01T09:00:00Z"),
    row("b", "2026-10-02T16:30:00+00:00"),
    row("c", null),
    ...Array.from({ length: 12 }, (_, i) => row(`z${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T08:00:00Z`)),
  ];
  const recent = recentlyChanged(rows);
  expect(recent).toHaveLength(RECENT_SHOWN);
  expect(recent.slice(0, 2).map((r) => r.id)).toEqual(["b", "a"]);
  expect(recent.map((r) => r.id)).not.toContain("c");
});

it("built rows in a test organization are dropped once the organizations are known", () => {
  const rows = [
    { id: "a", organizationId: CEDAR, updatedAt: "2026-10-02T10:00:00Z" },
    { id: "b", organizationId: SCRATCH, updatedAt: "2026-10-02T11:00:00Z" },
  ] as DataHomeRow[];
  expect(withoutTestOrganizations(rows, new Set([SCRATCH])).map((r) => r.id)).toEqual(["a"]);
  expect(withoutTestOrganizations(rows, new Set()).map((r) => r.id)).toEqual(["a", "b"]);
});
