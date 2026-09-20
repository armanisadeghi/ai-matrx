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

import { existsSync, readFileSync } from "node:fs";
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

/**
 * VERIFY-B1-B2-R5 W3 / W4 / W5 — WHAT THE ROW KEEPS ABOUT WHAT THE AUTHORITY
 * SAID AND WHAT THE SPINE ADDED.
 *
 * The exemptions and the compliance report are on `crm.interaction.metadata`
 * (`gmail_interaction_metadata`, aidream lane B-26), so the timeline can show
 * them long after the toast is gone. `bounce_correlation` is NOT on the row yet —
 * the spine writes it on the `crm.sending_event` detail and on the send's own
 * answer — so the reader takes it when it is there and the surface says nothing
 * when it is not. The metadata keys are measured against the server's own source
 * by the leg below.
 */
describe("the disclosures the row keeps", () => {
  const disclosed = row({
    metadata: {
      __kind: "crm_gmail_send_record",
      to: "ada@example.de",
      cc: [],
      audit_trail: { ...AUDIT },
      exempted_blocks: [
        {
          code: "jurisdiction_prohibited",
          message:
            "Germany requires permission BEFORE you write, even for business email.",
          exempt_reason:
            "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
          field: "recipient",
          address: "ada@example.de",
        },
      ],
      compliance: {
        compliance_class: "commercial_outreach",
        envelope: true,
        footer_appended: true,
        footer_text: "\n\nThis is a commercial message. 1 Main St.",
        reason: "This message went out through a registered outreach mailbox.",
      },
    },
  } as unknown as Partial<InteractionRow>);

  it("keeps the rule the authority raised and the reason it was set aside", () => {
    const facts = gmailSentRecordFacts(disclosed);
    expect(facts.exemptedBlocks).toEqual([
      {
        code: "jurisdiction_prohibited",
        message:
          "Germany requires permission BEFORE you write, even for business email.",
        exemptReason:
          "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
        field: "recipient",
        address: "ada@example.de",
      },
    ]);
  });

  it("keeps the class and the exact footer appended after approval", () => {
    const facts = gmailSentRecordFacts(disclosed);
    expect(facts.compliance).toEqual({
      complianceClass: "commercial_outreach",
      footerAppended: true,
      footerText: "\n\nThis is a commercial message. 1 Main St.",
      reason: "This message went out through a registered outreach mailbox.",
    });
  });

  it("reads an ordinary row as having nothing to disclose, not as a denial", () => {
    const facts = gmailSentRecordFacts(row());
    expect(facts.exemptedBlocks).toEqual([]);
    // An absent report is null — NOT a report saying no footer was added.
    expect(facts.compliance).toBeNull();
    expect(facts.bounceCorrelation).toBeNull();
    expect(facts.bounceCorrelationNote).toBeNull();
  });

  it("never drops a stored block for missing prose", () => {
    const facts = gmailSentRecordFacts(
      row({
        metadata: {
          __kind: "crm_gmail_send_record",
          exempted_blocks: [{ code: "aup_not_accepted" }, {}, "nope"],
        },
      } as unknown as Partial<InteractionRow>),
    );
    expect(facts.exemptedBlocks).toHaveLength(1);
    expect(facts.exemptedBlocks[0]!.exemptReason).toMatch(/was not recorded/i);
  });

  it("takes the bounce correlation when the row carries it", () => {
    const facts = gmailSentRecordFacts(
      row({
        metadata: {
          __kind: "crm_gmail_send_record",
          bounce_correlation: "not_watched",
          bounce_correlation_note: "We do not read this mailbox.",
        },
      } as unknown as Partial<InteractionRow>),
    );
    expect(facts.bounceCorrelation).toBe("not_watched");
    expect(facts.bounceCorrelationNote).toBe("We do not read this mailbox.");
  });
});

describe("THE GUARD: the timeline says what was set aside and what was added", () => {
  const surface = readFileSync(
    join(__dirname, "GmailSentRecordDetails.tsx"),
    "utf8",
  );

  it("renders the exempted blocks, the footer text and the bounce warning", () => {
    expect(surface).toContain("facts.exemptedBlocks");
    expect(surface).toContain("facts.compliance?.footerAppended");
    expect(surface).toContain("facts.compliance.footerText");
    expect(surface).toContain('facts.bounceCorrelation === "not_watched"');
  });
});

describe("CENSUS: the metadata keys are the server's", () => {
  const reviewedSend = join(
    process.env.AIDREAM_DIR ?? join(REPO_ROOT, "..", "aidream"),
    "aidream/services/outreach_single_send/reviewed_send.py",
  );
  const measurable = existsSync(reviewedSend);

  (measurable ? it : it.skip)(
    "writes exempted_blocks and compliance onto the interaction metadata",
    () => {
      const source = readFileSync(reviewedSend, "utf8");
      const start = source.indexOf("def gmail_interaction_metadata(");
      expect(start).toBeGreaterThan(0);
      const builder = source.slice(start, start + 3000);
      expect(builder).toContain('"exempted_blocks"');
      expect(builder).toContain('"compliance"');
      // FALSIFIABILITY: a key the builder does not write is detected.
      expect(builder).not.toContain('"exempted_codes"');
      // UNMEASURED-until-present: the bounce correlation is on the sending EVENT's
      // detail, not on the row. The reader above takes it the day it lands here;
      // until then the timeline says nothing about it and the send's own answer is
      // the only place a person is told (W5).
      if (!builder.includes('"bounce_correlation"')) {
        console.warn(
          "UNMEASURED-until-present: gmail_interaction_metadata does not write " +
            "`bounce_correlation`, so a reviewed send's timeline cannot say that a " +
            "bounce will never be matched back — only the post-send answer can. " +
            "features/crm/gmail/sent-record-facts.ts reads it already.",
        );
      }
    },
  );

  (measurable ? it.skip : it)("is UNMEASURED without the aidream checkout", () => {
    console.warn(
      `UNMEASURED: ${reviewedSend} not found, so the metadata keys this fixture ` +
        "asserts were NOT compared against the server.",
    );
    expect(true).toBe(true);
  });
});
