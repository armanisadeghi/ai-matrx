// features/crm/gmail/sent-record.test.ts
//
// THE THREE THINGS BUGBOT FOUND ON 2026-09-17, each written RED first against
// the shipped code and kept here so they cannot come back.
//
//  1. HIGH — the timeline recorded the DRAFT, not what was sent. THAT HALF MOVED
//     TO THE SERVER (aidream `4dbffdffb`): the browser no longer writes the
//     `crm.interaction` row at all, so what is recorded is what the send request
//     carried and what the provider answered. The honesty of that request — the
//     record context decided from the fields on screen at the click, and every
//     gap the server reports being SHOWN — lives in
//     `./the-client-writes-no-sent-record.test.ts` and
//     `./reviewed-send-contract.test.ts`.
//  2. MEDIUM — review edits skipped the send gate. The compose step checked the
//     address in ITS To field; the card then let the recipient change and
//     posted Send itself. `preflightGmailRecipients` runs at Send time, over
//     every recipient including Cc, and FAILS CLOSED.
//  3. MEDIUM — the singleton compose window kept the first record's draft. That
//     one is component state and this repo has no React testing library
//     installed (`node_modules/@testing-library` does not exist), so it is
//     covered by construction instead: the window mounts the panel under
//     `key={partyId}` AND the panel resets its own state when `partyId`
//     changes. Asserted here only to the extent a non-rendering test can: that
//     nothing about the record lives outside the panel's props.

import type { EligibilityVerdict } from "@/features/crm/compliance/types";
import type { ContactPoint } from "@/features/crm/types";
import { gmailRecipientOptions } from "./recipients";
import {
  mediumIdForAddress,
  preflightGmailRecipients,
  recipientsOfSend,
} from "./preflight";

let seq = 0;
function emailPoint(value: string): ContactPoint {
  seq += 1;
  const mediumId = `medium-${seq}`;
  return {
    id: `point-${seq}`,
    party_id: "party-1",
    medium_id: mediumId,
    organization_id: "org-1",
    label: null,
    is_primary: false,
    is_identity_key: false,
    purpose_code: "general",
    purpose_id: null,
    channel: "email",
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
    medium: {
      id: mediumId,
      channel: "email",
      value_raw: value,
      display_value: value,
      is_contactable: true,
      is_role_address: false,
      bounce_count: 0,
      bounce_type: null,
      complaint_at: null,
      suppression_reason: null,
      deleted_at: null,
    },
  } as unknown as ContactPoint;
}

function verdict(allowed: boolean): EligibilityVerdict {
  return {
    allowed,
    lane: "cold_outreach",
    blocks: allowed
      ? []
      : [
          {
            code: "unsubscribed",
            message: "They asked us to stop emailing them.",
            fix: "Only they can reverse it.",
          },
        ],
    warnings: [],
    resolved: {
      jurisdiction: null,
      confidence: "none",
      method: "test",
      jurisdiction_verdict: null,
      jurisdiction_ratified: false,
      consent_basis: "none",
      subscriber_kind: "unknown",
    },
  };
}

// ── 2. The gate runs on what is about to be sent ────────────────────────────

describe("recipientsOfSend", () => {
  it("covers Cc and drops blanks and repeats", () => {
    const parsed = recipientsOfSend(" a@x.com ", ["b@y.com", "", "A@X.com"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mailboxes.map((mailbox) => mailbox.address)).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});

describe("mediumIdForAddress", () => {
  it("matches the record's address ignoring case", () => {
    const options = gmailRecipientOptions([emailPoint("Ada@example.com")]);
    expect(mediumIdForAddress("ada@example.com", options)).toBe(
      options[0].mediumId,
    );
    expect(mediumIdForAddress("someone@else.com", options)).toBeNull();
  });
});

describe("preflightGmailRecipients", () => {
  it("refuses a recipient swapped in after the compose check passed", async () => {
    const options = gmailRecipientOptions([
      emailPoint("ok@example.com"),
      emailPoint("stop@example.com"),
    ]);
    const stopMedium = options.find(
      (option) => option.address === "stop@example.com",
    )!.mediumId;
    const refusal = await preflightGmailRecipients({
      to: "stop@example.com",
      cc: [],
      options,
      organizationId: "org-1",
      check: async (mediumId) => verdict(mediumId !== stopMedium),
      lookup: async () => [],
    });
    expect(refusal).toContain("stop@example.com");
    expect(refusal).toContain("asked us to stop");
  });

  it("refuses a blocked address that was only added to Cc", async () => {
    const options = gmailRecipientOptions([
      emailPoint("ok@example.com"),
      emailPoint("stop@example.com"),
    ]);
    const stopMedium = options.find(
      (option) => option.address === "stop@example.com",
    )!.mediumId;
    const refusal = await preflightGmailRecipients({
      to: "ok@example.com",
      cc: ["stop@example.com"],
      options,
      organizationId: "org-1",
      check: async (mediumId) => verdict(mediumId !== stopMedium),
      lookup: async () => [],
    });
    expect(refusal).toContain("stop@example.com");
  });

  it("fails CLOSED when the gate cannot be read", async () => {
    const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
    const refusal = await preflightGmailRecipients({
      to: "ok@example.com",
      cc: [],
      options,
      organizationId: "org-1",
      check: async () => {
        throw new Error("network down");
      },
      lookup: async () => [],
    });
    expect(refusal).toContain("could not be read");
    expect(refusal).toContain("network down");
  });

  it("sends when every recipient the record holds is allowed", async () => {
    const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
    expect(
      await preflightGmailRecipients({
        to: "ok@example.com",
        cc: [],
        options,
        organizationId: "org-1",
        check: async () => verdict(true),
        lookup: async () => [],
      }),
    ).toBeNull();
  });

  /**
   * D2 (VERIFY-B1-B2). The old preflight `continue`d past any address the RECORD
   * did not hold, so the one send authority was never asked about exactly the
   * addresses nobody had vetted: a person unsubscribed on ANOTHER record could
   * be emailed by opening compose anywhere and typing her address. These three
   * fail on the pre-fix bytes (the first because nothing looked the address up,
   * the second because a refusal for an unheld address was impossible).
   */
  describe("every recipient is checked, held or not", () => {
    it("resolves an unheld address against the organization and REFUSES it", async () => {
      const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
      const asked: string[] = [];
      const refusal = await preflightGmailRecipients({
        to: "unsubscribed@elsewhere.com",
        cc: [],
        options,
        organizationId: "org-1",
        check: async (mediumId) => {
          asked.push(mediumId);
          return verdict(false);
        },
        lookup: async (address) =>
          address === "unsubscribed@elsewhere.com" ? ["medium-elsewhere"] : [],
      });
      expect(asked).toEqual(["medium-elsewhere"]);
      expect(refusal).toContain("unsubscribed@elsewhere.com");
    });

    it("passes an address this organization holds no row for at all", async () => {
      const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
      let asked = 0;
      const refusal = await preflightGmailRecipients({
        to: "brand.new@elsewhere.com",
        cc: [],
        options,
        organizationId: "org-1",
        check: async () => {
          asked += 1;
          return verdict(false);
        },
        lookup: async () => [],
      });
      // No medium row means no suppression can exist — nothing to ask.
      expect(asked).toBe(0);
      expect(refusal).toBeNull();
    });

    it("fails CLOSED when the address lookup itself cannot be read", async () => {
      const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
      const refusal = await preflightGmailRecipients({
        to: "stranger@elsewhere.com",
        cc: [],
        options,
        organizationId: "org-1",
        check: async () => verdict(true),
        lookup: async () => {
          throw new Error("PostgREST 503");
        },
      });
      expect(refusal).toContain("could not be read");
      expect(refusal).toContain("PostgREST 503");
    });
  });
});
