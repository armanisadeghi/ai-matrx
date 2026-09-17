// features/crm/gmail/sent-record-facts.test.ts
//
// A4/D6 (VERIFY-B1-B2): the sent row's facts are LIVE in the row and were
// rendered by nothing, and the six audit values live in `metadata.audit_trail`
// until the generated types catch up with the columns. These assertions pin both
// halves of the ONE accessor, including the part that makes the eventual
// `pnpm db-types` a one-line change: a row that ALREADY carries the column is
// read from the column.
//
// Red on the pre-fix bytes: `features/crm/gmail/sent-record-facts.ts` did not
// exist, and `InteractionTimeline.tsx` referenced none of these fields.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InteractionRow } from "@/features/crm/types";
import { gmailInteractionRow } from "./service";
import { gmailSentRecordFacts, isGmailSentRecord } from "./sent-record-facts";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function row(overrides: Partial<InteractionRow> = {}): InteractionRow {
  const written = gmailInteractionRow(
    {
      receipt: {
        messageId: "gmail-msg-1",
        connectionId: "conn-1",
        fromEmail: "me@ourcompany.com",
        to: "ada@example.com",
        cc: ["bo@example.com"],
        subject: "Following up",
        body: "As promised.",
      },
      association: {
        partyId: "party-ada",
        organizationId: "org-1",
        dealId: "deal-1",
        projectId: "project-1",
        contactPointId: "point-1",
        mediumId: "medium-1",
      },
      approvedByUserId: "user-approver",
      draftedBy: {
        agentId: "agent-1",
        runId: "run-1",
        label: "the CRM follow-up agent",
        assistId: "assist-1",
      },
    },
    "interaction-1",
    "2026-09-17T10:00:00Z",
  );
  return {
    ...(written as unknown as InteractionRow),
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  };
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

  it("reads the audit trail from `metadata` while the types lack the columns", () => {
    const facts = gmailSentRecordFacts(row());
    expect(facts.draftedByAgentId).toBe("agent-1");
    expect(facts.draftedByRunId).toBe("run-1");
    expect(facts.draftedByLabel).toBe("the CRM follow-up agent");
    expect(facts.approvedBy).toBe("user-approver");
    expect(facts.approvedAt).toBe("2026-09-17T10:00:00Z");
    expect(facts.approvalAssistId).toBe("assist-1");
  });

  it("prefers the COLUMN the moment a row carries one", () => {
    // Exactly what `pnpm db-types` + the promoted write will produce.
    const promoted = {
      ...row(),
      approved_by: "user-from-column",
      drafted_by_agent_id: "agent-from-column",
    } as unknown as InteractionRow;
    const facts = gmailSentRecordFacts(promoted);
    expect(facts.approvedBy).toBe("user-from-column");
    expect(facts.draftedByAgentId).toBe("agent-from-column");
    // And the keys the column does not yet carry still come from the jsonb.
    expect(facts.draftedByRunId).toBe("run-1");
  });

  it("says nothing it was not told", () => {
    const bare = { ...row(), metadata: {}, provider: "gmail" } as InteractionRow;
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
    // Every named record opens (THE DOOR LAW).
    expect(source).toMatch(/EntityRef[\s\S]*token="party"/);
    expect(source).toMatch(/token="crm_deal"/);
    expect(source).toMatch(/token="project"/);
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
