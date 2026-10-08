// features/make/describe/__tests__/describe-never-changes-an-existing-table.test.ts
//
// THE USE CASE. A creator describes a social-media post tracker; the organization already has an unrelated "Content calendar"
// (Task, Owner, Due, Status). The mandate answers "reuse it" and adds fields. The box must never change a table the person
// already has: that reuse becomes a new, differently named table; a table declared with only its own fields stays a link target.
// BREAKS THIS CATCHES: a reuse that adds a field reaching bindReuses · a link-only reuse being turned into a new table.

import { applySafeReuses, bindReuses, coerceDescribeAnswer } from "../describeTemplate";

const existing = [
  { id: "t-cal", name: "Content calendar", fields: [{ key: "task", label: "Task", kind: "text" }, { key: "owner", label: "Owner", kind: "text" }] },
  { id: "t-con", name: "Contacts", fields: [{ key: "name", label: "Name", kind: "text" }, { key: "email", label: "Email", kind: "email" }] },
];
const answer = coerceDescribeAnswer({
  template: {
    id: "creator-post-tracker",
    tables: [
      { token: "contact", name: "Contacts", labelSingular: "Contact", titleField: "name", fields: [{ key: "name", label: "Name", parityType: "text" }, { key: "email", label: "Email", parityType: "email" }] },
      { token: "content_calendar", name: "Content calendar", labelSingular: "Content plan", titleField: "task", fields: [{ key: "task", label: "Task", parityType: "text" }, { key: "owner", label: "Owner", parityType: "text" }, { key: "fixed_fee", label: "Fixed fee", parityType: "currency" }] },
    ],
  },
  notes: [],
  reuses: [{ token: "contact", existing_table_id: "t-con" }, { token: "content_calendar", existing_table_id: "t-cal" }],
});

describe("the describe box never changes a table the person already has", () => {
  it("turns the reuse that adds a field into a new table, says so, and binds only the link-only one", () => {
    const safe = applySafeReuses(answer, existing);
    expect(safe.reuses).toEqual([{ token: "contact", existing_table_id: "t-con" }]);
    expect(safe.notes).toEqual(["Built a new Content plans table instead of changing your existing Content calendar."]);
    const bound = bindReuses(safe.template as never, safe.reuses, existing);
    const byToken = new Map(bound.tables.map((t) => [t.token, t]));
    expect(byToken.get("contact")!.bindsTo?.tableId).toBe("t-con");
    expect(byToken.get("content_calendar")!.bindsTo).toBeUndefined();
    expect((byToken.get("content_calendar") as { name?: string }).name).toBe("Content plans");
  });
});
