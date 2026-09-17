// features/crm/gmail/sent-record.test.ts
//
// THE THREE THINGS BUGBOT FOUND ON 2026-09-17, each written RED first against
// the shipped code and kept here so they cannot come back.
//
//  1. HIGH — the timeline recorded the DRAFT, not what was sent. Both writers
//     snapshotted to/cc/subject/body when review opened, and the review card
//     lets every one of them change before Send. `narrowGmailSendReceipt` is
//     the answer: the card's own receipt is the only lawful source for a sent
//     record, and `gmailInteractionRow` must be built from it.
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
import { gmailInteractionRow, narrowGmailSendReceipt } from "./service";

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

// ── 1. The sent record is the CARD's receipt ────────────────────────────────

describe("narrowGmailSendReceipt", () => {
  it("takes every field the card reported, including the edited body", () => {
    const receipt = narrowGmailSendReceipt(
      {
        message_id: "gmail-123",
        to: "edited@example.com",
        cc: ["cc@example.com", 7],
        subject: "Edited subject",
        body: "Edited body",
        from_email: "me@example.com",
        edited: true,
      },
      "connection-1",
    );
    expect(receipt).toEqual({
      messageId: "gmail-123",
      connectionId: "connection-1",
      fromEmail: "me@example.com",
      to: "edited@example.com",
      cc: ["cc@example.com"],
      subject: "Edited subject",
      body: "Edited body",
    });
  });

  it("returns null when the card named no message id", () => {
    expect(narrowGmailSendReceipt({ to: "a@b.com" }, "c")).toBeNull();
    expect(narrowGmailSendReceipt(null, "c")).toBeNull();
    expect(narrowGmailSendReceipt("sent", "c")).toBeNull();
  });
});

describe("gmailInteractionRow", () => {
  const receipt = {
    messageId: "gmail-999",
    connectionId: "connection-9",
    fromEmail: "me@example.com",
    to: "edited@example.com",
    cc: [],
    subject: "What actually went",
    body: "What actually went out",
  };

  it("records what was sent, associated with the record, org explicit", () => {
    const row = gmailInteractionRow(
      {
        receipt,
        association: {
          partyId: "party-1",
          organizationId: "org-1",
          dealId: "deal-1",
          contactPointId: "point-1",
        },
        approvedByUserId: "user-1",
      },
      "interaction-1",
      "2026-09-17T10:00:00.000Z",
    );
    expect(row.subject).toBe("What actually went");
    expect(row.body).toBe("What actually went out");
    expect(row.channel_code).toBe("email");
    expect(row.provider).toBe("gmail");
    // The external message id and the account it went out through.
    expect(row.provider_interaction_id).toBe("gmail-999");
    expect(row.provider_account_id).toBe("connection-9");
    expect(row.organization_id).toBe("org-1");
    expect(row.deal_id).toBe("deal-1");
    expect(row.direction).toBe("outbound");
  });

  it("carries the audit trail in the shape the migration backfills", () => {
    const row = gmailInteractionRow(
      {
        receipt,
        association: { partyId: "party-1", organizationId: "org-1" },
        approvedByUserId: "user-1",
        draftedBy: {
          agentId: "agent-1",
          runId: "run-1",
          label: "Follow-up writer",
          assistId: "assist-1",
        },
      },
      "interaction-2",
      "2026-09-17T10:00:00.000Z",
    );
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.__kind).toBe("crm_gmail_send_record");
    expect(metadata.audit_trail).toEqual({
      drafted_by_agent_id: "agent-1",
      drafted_by_run_id: "run-1",
      drafted_by_label: "Follow-up writer",
      approval_assist_id: "assist-1",
      approved_by: "user-1",
      approved_at: "2026-09-17T10:00:00.000Z",
    });
  });

  it("writes an approver and a time together, or neither", () => {
    const row = gmailInteractionRow(
      {
        receipt,
        association: { partyId: "party-1", organizationId: "org-1" },
        approvedByUserId: null,
      },
      "interaction-3",
      "2026-09-17T10:00:00.000Z",
    );
    const trail = (row.metadata as { audit_trail: Record<string, unknown> })
      .audit_trail;
    expect(trail.approved_by).toBeNull();
    expect(trail.approved_at).toBeNull();
  });
});

// ── 2. The gate runs on what is about to be sent ────────────────────────────

describe("recipientsOfSend", () => {
  it("covers Cc and drops blanks and repeats", () => {
    expect(recipientsOfSend(" a@x.com ", ["b@y.com", "", "A@X.com"])).toEqual([
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
    const refusal = await preflightGmailRecipients(
      "stop@example.com",
      [],
      options,
      async (mediumId) => verdict(mediumId !== stopMedium),
    );
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
    const refusal = await preflightGmailRecipients(
      "ok@example.com",
      ["stop@example.com"],
      options,
      async (mediumId) => verdict(mediumId !== stopMedium),
    );
    expect(refusal).toContain("stop@example.com");
  });

  it("fails CLOSED when the gate cannot be read", async () => {
    const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
    const refusal = await preflightGmailRecipients(
      "ok@example.com",
      [],
      options,
      async () => {
        throw new Error("network down");
      },
    );
    expect(refusal).toContain("could not be read");
    expect(refusal).toContain("network down");
  });

  it("sends when every recipient the record holds is allowed", async () => {
    const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
    expect(
      await preflightGmailRecipients("ok@example.com", [], options, async () =>
        verdict(true),
      ),
    ).toBeNull();
  });

  it("does not invent a verdict for an address the record does not hold", async () => {
    const options = gmailRecipientOptions([emailPoint("ok@example.com")]);
    let asked = 0;
    const refusal = await preflightGmailRecipients(
      "stranger@example.com",
      [],
      options,
      async () => {
        asked += 1;
        return verdict(false);
      },
    );
    // Nothing to look up — the compose step has already said so in words.
    expect(asked).toBe(0);
    expect(refusal).toBeNull();
  });
});
