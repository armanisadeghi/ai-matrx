// features/crm/gmail/send-authority.test.ts
//
// F-20 item 1 (VERIFY-B1-B2-R2 N2, N9, N10 and breaks A/B/C/D): the ONE send
// authority must parse every recipient field into mailboxes FIRST, judge each
// parsed address, refuse a field it cannot read, treat a lookup it could not
// complete as "cannot confirm eligibility", and attribute Cc on the record.
//
// Every test here FAILED on `1f058283` (the display-name form walked past the
// gate and lost the record; a two-address To was never checked; Cc was never
// attributed; a second medium row for one address was never asked about).

import { gmailRecipientOptions } from "./recipients";
import { preflightGmailRecipients } from "./preflight";
import { assessGmailRecipientIntegrity } from "./recipient-integrity";
import { gmailInteractionRow } from "./service";
import { parseMailboxField, parseRecipientFields } from "./mailbox";
import type { ContactPoint } from "@/features/crm/types";
import type { EligibilityVerdict } from "@/features/crm/compliance/types";

function emailPoint(address: string, id = address): ContactPoint {
  return {
    id: `point-${id}`,
    party_id: "party-1",
    label: "Work",
    is_primary: true,
    deleted_at: null,
    medium: {
      id: `medium-${id}`,
      channel: "email",
      value_key: address.toLowerCase(),
      value_raw: address,
      display_value: address,
      is_contactable: true,
      complaint_at: null,
      bounce_type: null,
      bounce_count: 0,
      suppression_reason: null,
      deleted_at: null,
    },
  } as unknown as ContactPoint;
}

function verdict(allowed: boolean): EligibilityVerdict {
  return {
    allowed,
    blocks: allowed
      ? []
      : [
          {
            code: "unsubscribed",
            message: "This person unsubscribed.",
            fix: "Do not email them.",
          },
        ],
    policyVersion: 1,
  } as unknown as EligibilityVerdict;
}

describe("the mailbox parser", () => {
  it("reads the form every mail client prints", () => {
    const parsed = parseMailboxField("Ada Lovelace <ada@example.com>");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mailboxes[0].address).toBe("ada@example.com");
    expect(parsed.mailboxes[0].displayName).toBe("Ada Lovelace");
  });

  it("does not split on a comma inside a quoted display name", () => {
    const parsed = parseMailboxField('"Doe, John" <john@x.com>, b@y.com');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mailboxes.map((m) => m.address)).toEqual([
      "john@x.com",
      "b@y.com",
    ]);
  });

  it("refuses a field it cannot read rather than guessing", () => {
    expect(parseMailboxField("Ada ada@example.com").ok).toBe(false);
    expect(parseMailboxField("not an address").ok).toBe(false);
  });

  it("deduplicates across To and Cc on the address, not the spelling", () => {
    const parsed = parseRecipientFields([
      "Ada <ADA@example.com>",
      "ada@example.com",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mailboxes).toHaveLength(1);
  });
});

describe("the send authority judges every PARSED address", () => {
  it("refuses a suppressed address written in display-name form (BREAK B)", async () => {
    const refusal = await preflightGmailRecipients({
      to: "Ada Lovelace <ada@example.com>",
      cc: [],
      options: [],
      organizationId: "org-1",
      check: async () => verdict(false),
      lookup: async (address) =>
        address === "ada@example.com" ? ["medium-ada"] : [],
    });
    expect(refusal).toContain("ada@example.com");
    expect(refusal).toContain("unsubscribed");
  });

  it("refuses a two-address To field by name (VERIFY-B1-B2-R4 V1: agrees with the server)", async () => {
    // Until 2026-09-17 this was accepted here and refused only by the server,
    // one round-trip later, about a field this gate had already waved
    // through. `To` carries exactly one mailbox — the same rule the server's
    // `parse_recipient` enforces.
    const asked: string[] = [];
    const refusal = await preflightGmailRecipients({
      to: "a@x.com, b@y.com",
      cc: [],
      options: [],
      organizationId: "org-1",
      check: async (mediumId) => {
        asked.push(mediumId);
        return verdict(true);
      },
      lookup: async (address) => [`medium-${address[0]}`],
    });
    expect(asked).toEqual([]);
    expect(refusal).toContain("a@x.com");
    expect(refusal).toContain("b@y.com");
    expect(refusal).toContain("Cc");
  });

  it("still checks a second address written in Cc, where the remedy sends it", async () => {
    const asked: string[] = [];
    const refusal = await preflightGmailRecipients({
      to: "a@x.com",
      cc: ["b@y.com"],
      options: [],
      organizationId: "org-1",
      check: async (mediumId) => {
        asked.push(mediumId);
        return verdict(mediumId !== "medium-b");
      },
      lookup: async (address) => [`medium-${address[0]}`],
    });
    expect(asked).toEqual(["medium-a", "medium-b"]);
    expect(refusal).toContain("b@y.com");
  });

  it("refuses a recipient field it cannot read, instead of sending", async () => {
    const refusal = await preflightGmailRecipients({
      to: "Ada ada@example.com",
      cc: [],
      options: [],
      organizationId: "org-1",
      check: async () => verdict(true),
      lookup: async () => [],
    });
    expect(refusal).toContain("Ada ada@example.com");
    expect(refusal).toContain("was not sent");
  });

  it("treats an address it cannot normalize as CANNOT CONFIRM, never as clear", async () => {
    const refusal = await preflightGmailRecipients({
      to: "ada@example.com",
      cc: [],
      options: [],
      organizationId: "org-1",
      check: async () => verdict(true),
      lookup: async () => {
        throw new Error("value is not a valid email address");
      },
    });
    expect(refusal).toContain("could not be read");
  });

  it("asks about EVERY medium row an address has, not the first (N10)", async () => {
    const asked: string[] = [];
    const refusal = await preflightGmailRecipients({
      to: "shared@example.com",
      cc: [],
      options: [],
      organizationId: "org-1",
      check: async (mediumId) => {
        asked.push(mediumId);
        return verdict(mediumId !== "medium-slug");
      },
      lookup: async () => ["medium-plain", "medium-slug"],
    });
    expect(asked).toEqual(["medium-plain", "medium-slug"]);
    expect(refusal).toContain("shared@example.com");
  });

  it("asks the organization about an address the RECORD holds too (N10, second branch)", async () => {
    const asked: string[] = [];
    const refusal = await preflightGmailRecipients({
      to: "ada@example.com",
      cc: [],
      options: [
        {
          address: "ada@example.com",
          contactPointId: "point-1",
          mediumId: "medium-on-this-record",
          label: null,
          isPrimary: true,
          warning: null,
        },
      ],
      organizationId: "org-1",
      check: async (mediumId) => {
        asked.push(mediumId);
        return verdict(mediumId !== "medium-on-another-person");
      },
      // The same address, held again on another Person, carrying the opt-out.
      lookup: async () => ["medium-on-another-person"],
    });
    expect(asked).toContain("medium-on-this-record");
    expect(asked).toContain("medium-on-another-person");
    expect(refusal).toContain("ada@example.com");
  });
});

describe("recipient integrity reads a display-name address as the record's own", () => {
  const options = gmailRecipientOptions([emailPoint("ada@example.com")]);

  it("records a send addressed `Ada Lovelace <ada@example.com>` (BREAK A)", () => {
    const outcome = assessGmailRecipientIntegrity({
      sentTo: "Ada Lovelace <ada@example.com>",
      source: { kind: "record", heldAddresses: options },
    });
    expect(outcome.recordOnRecord).toBe(true);
    if (!outcome.recordOnRecord) return;
    expect(outcome.contactPointId).toBe(options[0].contactPointId);
  });

  it("still refuses a stranger, in the same sentence", () => {
    const outcome = assessGmailRecipientIntegrity({
      sentTo: "Someone Else <stranger@elsewhere.com>",
      source: { kind: "record", heldAddresses: options },
    });
    expect(outcome.recordOnRecord).toBe(false);
    if (outcome.recordOnRecord) return;
    expect(outcome.refusal).toContain("stranger@elsewhere.com");
  });

  it("attributes every Cc address it was given (N9, BREAK D)", () => {
    const outcome = assessGmailRecipientIntegrity({
      sentTo: "ada@example.com",
      sentCc: ["Bo <bo@other-company.com>", "ada@example.com"],
      source: { kind: "record", heldAddresses: options },
    });
    expect(outcome.recordOnRecord).toBe(true);
    if (!outcome.recordOnRecord) return;
    expect(outcome.cc).toEqual([
      {
        address: "bo@other-company.com",
        contactPointId: null,
        mediumId: null,
        heldByThisRecord: false,
      },
    ]);
  });
});

describe("the sent row carries the Cc attribution", () => {
  it("names each Cc and whether this record holds it", () => {
    const row = gmailInteractionRow(
      {
        receipt: {
          messageId: "gmail-1",
          connectionId: "conn-1",
          fromEmail: "me@work.com",
          to: "ada@example.com",
          cc: ["Bo <bo@other-company.com>"],
          subject: "Hello",
          body: "Body",
        },
        association: {
          partyId: "party-1",
          organizationId: "org-1",
          ccAttribution: [
            {
              address: "bo@other-company.com",
              contactPointId: null,
              mediumId: null,
              heldByThisRecord: false,
            },
          ],
        },
        approvedByUserId: "user-1",
      },
      "interaction-1",
      "2026-09-17T00:00:00.000Z",
    );
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.cc_attribution).toEqual([
      {
        address: "bo@other-company.com",
        contact_point_id: null,
        medium_id: null,
        held_by_this_record: false,
      },
    ]);
  });
});
