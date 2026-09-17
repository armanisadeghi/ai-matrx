// features/crm/gmail/sent-record-facts.test.ts
//
// A4/D6 (VERIFY-B1-B2): the sent row's facts are LIVE in the row and were
// rendered by nothing. These assertions pin the ONE accessor — the six audit
// COLUMNS, the `metadata.audit_trail` fallback for rows written before they
// existed, and the Cc attribution.
//
// Red on the pre-fix bytes: `features/crm/gmail/sent-record-facts.ts` did not
// exist, and `InteractionTimeline.tsx` referenced none of these fields.
//
// 🚨 THE FIXTURE IS THE SERVER'S ROW, NOT OURS. The browser no longer writes this
// row (aidream `4dbffdffb`), so the fixture below is written by hand in the shape
// `record_reviewed_send` / `gmail_interaction_metadata` write — the six columns
// AND the same six keys mirrored into `metadata.audit_trail`, from the same
// values in the same statement. That hand shape is only trustworthy because
// `./reviewed-send-contract-is-the-servers.test.ts` measures those metadata keys
// against the server's own source; without that leg this would be a test feeding
// its author's own guess to its author's own reader.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InteractionRow } from "@/features/crm/types";
import { gmailSentRecordFacts, isGmailSentRecord } from "./sent-record-facts";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const AUDIT = {
  drafted_by_agent_id: "agent-1",
  drafted_by_run_id: "run-1",
  drafted_by_label: "the CRM follow-up agent",
  approved_by: "user-approver",
  approved_at: "2026-09-17T10:00:00Z",
  approval_assist_id: "assist-1",
} as const;

function row(overrides: Partial<InteractionRow> = {}): InteractionRow {
  return {
    id: "interaction-1",
    party_id: "party-ada",
    organization_id: "org-1",
    deal_id: "deal-1",
    contact_point_id: "point-1",
    channel_code: "email",
    direction: "outbound",
    status: "completed",
    occurred_at: "2026-09-17T10:00:00Z",
    subject: "Following up",
    body: "As promised.",
    provider: "gmail",
    provider_interaction_id: "gmail-msg-1",
    provider_account_id: "conn-1",
    // The six columns, exactly as the server writes them…
    ...AUDIT,
    metadata: {
      __kind: "crm_gmail_send_record",
      to: "ada@example.com",
      cc: ["bo@example.com"],
      sent_via_account: {
        connection_id: "conn-1",
        account_email: "me@ourcompany.com",
      },
      // …and the same values mirrored in the row's own jsonb, which is what a
      // row written before the columns existed carries alone.
      audit_trail: { ...AUDIT },
      cc_attribution: [
        {
          address: "bo@example.com",
          contact_point_id: null,
          medium_id: null,
          held_by_this_record: false,
        },
      ],
      composed_from_project_id: "project-1",
    },
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  } as unknown as InteractionRow;
}

describe("isGmailSentRecord", () => {
  it("recognises the row by provider and by the metadata marker", () => {
    expect(isGmailSentRecord(row())).toBe(true);
    expect(isGmailSentRecord(row({ provider: null }))).toBe(true);
    expect(
      isGmailSentRecord(row({ provider: "twilio", metadata: {} })),
    ).toBe(false);
  });
});

describe("gmailSentRecordFacts", () => {
  it("reads every fact a timeline shows", () => {
    const facts = gmailSentRecordFacts(row());
    expect(facts.provider).toBe("gmail");
    expect(facts.to).toBe("ada@example.com");
    expect(facts.cc).toEqual(["bo@example.com"]);
    expect(facts.messageId).toBe("gmail-msg-1");
    expect(facts.sentViaAccountEmail).toBe("me@ourcompany.com");
    expect(facts.composedFromProjectId).toBe("project-1");
  });

  it("reads every audit fact off the row", () => {
    const facts = gmailSentRecordFacts(row());
    expect(facts.draftedByAgentId).toBe("agent-1");
    expect(facts.draftedByRunId).toBe("run-1");
    expect(facts.draftedByLabel).toBe("the CRM follow-up agent");
    expect(facts.approvedBy).toBe("user-approver");
    expect(facts.approvedAt).toBe("2026-09-17T10:00:00Z");
    expect(facts.approvalAssistId).toBe("assist-1");
  });

  it("prefers the COLUMN over the jsonb copy when the two disagree", () => {
    const promoted = row({
      approved_by: "user-from-column",
      drafted_by_agent_id: "agent-from-column",
    });
    const facts = gmailSentRecordFacts(promoted);
    expect(facts.approvedBy).toBe("user-from-column");
    expect(facts.draftedByAgentId).toBe("agent-from-column");
    // The jsonb still answers for the keys the column does not carry — which is
    // every key, on a row written before the columns existed.
    const legacy = row({
      drafted_by_run_id: null,
      approved_by: null,
    });
    expect(gmailSentRecordFacts(legacy).draftedByRunId).toBe("run-1");
    expect(gmailSentRecordFacts(legacy).approvedBy).toBe("user-approver");
  });

  it("says nothing it was not told", () => {
    const bare = row({
      metadata: {},
      provider: "gmail",
      drafted_by_agent_id: null,
      drafted_by_run_id: null,
      drafted_by_label: null,
      approved_by: null,
      approved_at: null,
      approval_assist_id: null,
    });
    const facts = gmailSentRecordFacts(bare);
    expect(facts.approvedBy).toBeNull();
    expect(facts.draftedByLabel).toBeNull();
    expect(facts.to).toBeNull();
    expect(facts.cc).toEqual([]);
  });
});

describe("THE GUARD: the timeline renders the sent record's facts", () => {
  it("InteractionTimeline consumes the accessor, not the raw row", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/crm/components/record/InteractionTimeline.tsx"),
      "utf8",
    );
    expect(source).toMatch(/isGmailSentRecord/);
    expect(source).toMatch(/GmailSentRecordDetails/);
  });

  it("the details component names the associations and the audit trail", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/crm/gmail/GmailSentRecordDetails.tsx"),
      "utf8",
    );
    expect(source).toContain("Associated with");
    expect(source).toContain("Drafted by");
    expect(source).toContain("Approved by");
    // Every named record opens (THE DOOR LAW) — the token is now the intended
    // target's own type, because the chips are the EDGES that exist (R2 N7).
    expect(source).toMatch(/EntityRef[\s\S]*token=\{target\.type\}/);
    expect(source).toMatch(/type: "party"/);
    expect(source).toMatch(/type: "crm_deal" as const/);
    expect(source).toMatch(/type: "project" as const/);
    // And a missing edge is shown as missing, with a way to repair it.
    expect(source).toContain("Not linked to");
    expect(source).toContain("Link it now");
  });

  it("nothing outside the accessor reads the audit keys", () => {
    for (const relative of [
      "features/crm/components/record/InteractionTimeline.tsx",
      "features/crm/gmail/GmailSentRecordDetails.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, relative), "utf8");
      // No reader reaches into the row's jsonb or names a column itself; a
      // mention in a comment is fine, an access is not.
      expect(source).not.toMatch(/\.\s*audit_trail/);
      expect(source).not.toMatch(/\["audit_trail"\]/);
      expect(source).not.toMatch(/row\.drafted_by_/);
      expect(source).not.toMatch(/row\.approved_by/);
    }
  });
});
