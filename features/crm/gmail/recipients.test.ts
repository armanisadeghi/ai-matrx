// features/crm/gmail/recipients.test.ts
//
// WHY THIS FILE EXISTS. The compose window decides two things by itself, and
// both of them can send a message to the wrong place if they are wrong:
//
//   1. WHICH ADDRESSES this record offers, and in which order — the first one
//      is the one that ends up in the To field without anybody typing.
//   2. WHETHER the address in the To field is a contact point we hold. That
//      single fact decides whether `crm.check_send_eligibility` is consulted at
//      all, so a false match means a suppressed recipient is treated as an
//      unknown address and the person is told they are on their own judgement
//      when in fact the gate would have refused.
//
// Both are pure functions over the record's OWN contact points, so they are
// tested on rows shaped exactly like the live ones — deleted points, a
// suppressed medium, a duplicate address, a phone point, and a medium whose
// value is not an address at all.

import type { ContactPoint } from "@/features/crm/types";
import {
  defaultGmailRecipient,
  gmailRecipientOptions,
  parseAddressList,
} from "./recipients";

type MediumOverrides = Partial<ContactPoint["medium"]>;
type PointOverrides = Partial<Omit<ContactPoint, "medium">>;

let seq = 0;
function point(
  value: string,
  channel: string,
  medium: MediumOverrides = {},
  overrides: PointOverrides = {},
): ContactPoint {
  seq += 1;
  const id = `point-${seq}`;
  const mediumId = `medium-${seq}`;
  return {
    id,
    party_id: "party-1",
    medium_id: mediumId,
    organization_id: "org-1",
    label: null,
    is_primary: false,
    is_identity_key: false,
    purpose_code: "general",
    purpose_id: null,
    channel,
    confidence: null,
    address_id: null,
    affiliation_id: null,
    extension: null,
    last_contacted_at: null,
    metadata: {},
    opt_out_at: null,
    opt_out_source: null,
    sort_order: null,
    source: null,
    valid_from: null,
    valid_to: null,
    created_at: "2026-09-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-09-01T00:00:00Z",
    updated_by: null,
    deleted_at: null,
    version: 1,
    ...overrides,
    medium: {
      id: mediumId,
      channel,
      value_raw: value,
      display_value: value,
      is_contactable: true,
      is_role_address: false,
      bounce_count: 0,
      bounce_type: null,
      complaint_at: null,
      suppression_reason: null,
      deleted_at: null,
      ...medium,
    } as ContactPoint["medium"],
  } as ContactPoint;
}

describe("gmailRecipientOptions", () => {
  it("offers only email addresses, primary first", () => {
    const options = gmailRecipientOptions([
      point("+1 555 0100", "phone"),
      point("work@example.com", "email", {}, { label: "Work" }),
      point("primary@example.com", "email", {}, { is_primary: true }),
    ]);
    expect(options.map((option) => option.address)).toEqual([
      "primary@example.com",
      "work@example.com",
    ]);
  });

  it("drops a deleted point and a deleted medium", () => {
    const options = gmailRecipientOptions([
      point("gone@example.com", "email", {}, { deleted_at: "2026-09-02T00:00:00Z" }),
      point("also-gone@example.com", "email", {
        deleted_at: "2026-09-02T00:00:00Z",
      }),
      point("live@example.com", "email"),
    ]);
    expect(options.map((option) => option.address)).toEqual([
      "live@example.com",
    ]);
  });

  it("drops a medium whose value is not an address", () => {
    expect(gmailRecipientOptions([point("not an address", "email")])).toEqual(
      [],
    );
  });

  it("shows one entry per address, keeping the higher-ranked point", () => {
    const options = gmailRecipientOptions([
      point("dupe@example.com", "email", {}, { label: "Secondary" }),
      point("Dupe@example.com", "email", {}, { is_primary: true }),
    ]);
    expect(options).toHaveLength(1);
    expect(options[0].isPrimary).toBe(true);
  });

  it("carries the record's own warning without deciding the verdict", () => {
    const [suppressed] = gmailRecipientOptions([
      point("stop@example.com", "email", { suppression_reason: "asked us to" }),
    ]);
    expect(suppressed.warning).toContain("asked us to");
    const [bounced] = gmailRecipientOptions([
      point("bounce@example.com", "email", {
        bounce_type: "hard",
        bounce_count: 3,
      }),
    ]);
    expect(bounced.warning).toContain("bounced");
  });
});

describe("defaultGmailRecipient", () => {
  it("prefers an address the record has nothing against", () => {
    const options = gmailRecipientOptions([
      point("bad@example.com", "email", { is_contactable: false }, { is_primary: true }),
      point("good@example.com", "email"),
    ]);
    expect(defaultGmailRecipient(options)?.address).toBe("good@example.com");
  });

  it("still offers the only address when every one carries a warning", () => {
    const options = gmailRecipientOptions([
      point("only@example.com", "email", { is_contactable: false }),
    ]);
    expect(defaultGmailRecipient(options)?.address).toBe("only@example.com");
  });

  it("returns null when the record holds no address", () => {
    expect(defaultGmailRecipient([])).toBeNull();
  });
});

describe("parseAddressList", () => {
  it("splits on commas and semicolons and drops the blanks", () => {
    expect(parseAddressList(" a@x.com , ;b@y.com; ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});
