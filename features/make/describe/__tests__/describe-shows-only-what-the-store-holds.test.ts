// features/make/describe/__tests__/describe-shows-only-what-the-store-holds.test.ts — lane MAKE-HOME wave 3.
//
// THE USE CASE. Cedar Ridge Physical Therapy's front desk types "a patient intake form that books
// the first visit" on /make. The Data page agent makes a "New Patients" table, an intake form and a
// "Book your first visit" page (a booking page is a form in the store, so the items door lists its
// id under both kinds). The result card must show exactly those three, each opening, and never:
// what Cedar Ridge already had, the slots table the app keeps for the booking page, or anything that
// appeared in a different organization at the same moment.
//
// RED ON A PLANT: drop the "before" check, the platform-owned check, the organization check or the
// booking-is-also-a-form de-duplication in `madeSince` and a case below fails.

import type { DataHomeItemRow, DataHomeTableRow } from "@/features/unified-data/hub/doors";

import { madeSince, snapshotOf } from "../made";

const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const OTHER = "6b1c2f4e-3d2a-4f1b-9c8e-7a6b5c4d3e2f";

const table = (id: string, name: string, org = CEDAR, extra: Partial<DataHomeTableRow> = {}): DataHomeTableRow => ({
  table_id: id,
  table_name: name,
  organization_id: org,
  organization_name: org === CEDAR ? "Cedar Ridge Physical Therapy" : "Harbor Dental",
  member: true,
  visibility: "internal",
  updated_at: "2026-10-02T21:00:00Z",
  mine: true,
  shared_with_me: false,
  platform_owned: false,
  kind: "table",
  ...extra,
});

const item = (kind: DataHomeItemRow["kind"], id: string, tableId: string, title: string, org = CEDAR): DataHomeItemRow => ({
  kind,
  organization_id: org,
  organization_name: "Cedar Ridge Physical Therapy",
  item_id: id,
  table_id: tableId,
  table_name: "New Patients",
  item_row: { form_id: id, table_id: tableId, title, published_at: "2026-10-02T21:00:30Z" },
});

const before = snapshotOf([table("t-old", "Treatment Plans")], [item("form", "f-old", "t-old", "Discharge survey")]);

describe("the describe box shows only what the sentence made", () => {
  it("lists the new table, form and booking page, each opening, in that order", () => {
    const made = madeSince(
      before,
      {
        tables: [table("t-old", "Treatment Plans"), table("t-new", "New Patients")],
        items: [
          item("form", "f-old", "t-old", "Discharge survey"),
          item("booking", "b-new", "t-new", "Book your first visit"),
          item("form", "f-new", "t-new", "New patient intake"),
        ],
      },
      CEDAR,
    );
    expect(made.map((m) => [m.kind, m.title])).toEqual([
      ["table", "New Patients"],
      ["form", "New patient intake"],
      ["booking", "Book your first visit"],
    ]);
    expect(made[0].href).toBe("/data/t-new");
    expect(made[1]).toMatchObject({ href: "/data/t-new?rail=forms&item=f-new", publicHref: "/f/f-new" });
    expect(made[2]).toMatchObject({ href: "/data/t-new?rail=bookings&item=b-new", publicHref: "/b/b-new" });
  });

  it("shows a booking page once, never again as a form", () => {
    const made = madeSince(
      before,
      { tables: [], items: [item("booking", "b-new", "t-new", "Book your first visit"), item("form", "b-new", "t-new", "Book your first visit")] },
      CEDAR,
    );
    expect(made.map((m) => m.kind)).toEqual(["booking"]);
  });

  it("never lists the slots table the app keeps for a booking page", () => {
    const made = madeSince(
      before,
      { tables: [table("t-slots", "Book your first visit slots", CEDAR, { platform_owned: true, kind: "booking" })], items: [] },
      CEDAR,
    );
    expect(made).toEqual([]);
  });

  it("never lists what appeared in another organization", () => {
    const made = madeSince(
      before,
      { tables: [table("t-elsewhere", "Hygiene Recalls", OTHER)], items: [item("form", "f-elsewhere", "t-elsewhere", "Recall form", OTHER)] },
      CEDAR,
    );
    expect(made).toEqual([]);
  });

  it("an unpublished form opens in its builder and offers no public link", () => {
    const draft = item("form", "f-draft", "t-new", "Draft intake");
    draft.item_row = { ...draft.item_row, published_at: null };
    const [made] = madeSince(before, { tables: [], items: [draft] }, CEDAR);
    expect(made.publicHref).toBeUndefined();
    expect(made.href).toBe("/data/t-new?rail=forms&item=f-draft");
  });

  it("a rule that tells someone the moment an answer arrives reads as a Notification, a weekly one as a Digest", () => {
    const sub = (id: string, cadence: string): DataHomeItemRow => ({
      kind: "digest",
      organization_id: CEDAR,
      organization_name: "Cedar Ridge Physical Therapy",
      item_id: id,
      table_id: "t-new",
      table_name: "New Patients",
      item_row: { rule_id: id, table_id: "t-new", name: `Rule ${id}`, cadence },
    });
    const made = madeSince(before, { tables: [], items: [sub("r-now", "instant"), sub("r-week", "weekly")] }, CEDAR);
    expect(made.map((m) => m.word ?? "Digest")).toEqual(["Notification", "Digest"]);
  });
});
