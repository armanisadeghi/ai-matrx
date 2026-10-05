/**
 * FORCING TEST — FTS-2b item 2. An agent's change to a CRM record waits on /approvals. The row the
 * store filed on 2026-10-05 carries `label: "Party"` (the table name, printed because the registry's
 * party label was the type word "Entity"). The card must name the record by the registry's noun for
 * the row's TOKEN — the one label source every screen reads — never by a word frozen into the payload.
 * The real filed payload of approval 10947cfb (Jordan Pike, Cedar Ridge PT) is the input.
 */
import { describe as describeApproval } from "../kinds/store-change";
import type { StoreApproval } from "../store-door";

const jordan = {
  inbox: { title: "Change Jordan Pike", origin: "agent", requested_by_name: "admin", table_name: null },
  organizationId: "cedar-ridge",
  row: {
    subject_title: "Jordan Pike",
    subject_kind: "standard_row",
    subject_token: "party",
    change: {
      kind: "entity_row_change",
      label: "Party",
      token: "party",
      custom: { preferred_clinic_location: "Cedar Ridge - Irvine" },
      labels: { preferred_clinic_location: "Preferred clinic location" },
      columns: {},
    },
  },
  unreadable: null,
  current: null,
  conversation: null,
} as unknown as StoreApproval;

test("a change to a CRM record names it a contact, never Party", () => {
  const said = describeApproval(jordan);
  expect(said?.headline).toBe("Change Jordan Pike");
  expect(said?.acceptEffect).toBe("Saves the new values on this contact.");
  expect(said?.fields).toEqual([{ label: "Preferred clinic location", after: "Cedar Ridge - Irvine" }]);
});

test("an archive of a CRM record names it a contact", () => {
  const archive = { ...jordan, row: { ...jordan.row, change: { kind: "entity_row_change", label: "Party", token: "party", archive: true } } } as unknown as StoreApproval;
  expect(describeApproval(archive)?.acceptEffect).toBe("Archives this contact. It can be put back.");
});
