/**
 * FORCING TEST for the Bugbot HIGH on frontend PR 228: an approval proposal
 * survives the read.
 *
 * `approval_proposal` was in the `AssistAction` union, the producer wrote it
 * (`aidream/services/google_workspace/approvals.py` → the `row["action"]`
 * literal), and `narrowAction` had no branch for it — so `toAssist` returned
 * null for every one of those rows and the platform approval queue read 0 live
 * proposals while the header badge counted them in SQL.
 *
 * The row below is shaped EXACTLY as that producer writes it, field for field,
 * including the `__kind` marker on the payload. If the branch is removed or
 * narrowed, this test fails at `expect(assist).not.toBeNull()` — which is the
 * only place in the suite that can tell the difference between "the queue is
 * empty" and "the queue cannot read anything".
 */

import { toAssist, type AssistRow } from "../types";

/** The producer's `action` object, verbatim (approvals.py, 2026-09-17). */
const producerAction = {
  kind: "approval_proposal",
  proposalKind: "sheet_write",
  mode: "mode_4",
  payload: {
    __kind: "sheet_write_dry_run",
    preview: { spreadsheet_title: "Q3 pipeline", cells_changed: 4 },
    arguments: { spreadsheet_id: "1abc", range: "Sheet1!A1:B2" },
  },
  proposerLabel: "the CRM follow-up agent",
  proposerAgentId: "a1b2c3",
  proposerRunId: "run-9",
  operatorUserId: "user-1",
};

function row(action: unknown): AssistRow {
  return {
    id: "assist-1",
    user_id: "user-1",
    organization_id: "org-1",
    entity_type: "google_sheet",
    entity_id: "1abc",
    surface_name: "matrx-user/approval-queue",
    source_kind: "agent",
    source_key: "approval.sheet_write",
    title: "Write 4 cells to Q3 pipeline",
    body: "The cells now, beside the cells after.",
    reasoning: null,
    confidence: null,
    action: action as AssistRow["action"],
    status: "pending",
    priority: 20,
    dedupe_key: "user-1:write_sheet:1abc",
    created_at: "2026-09-17T10:00:00Z",
    decided_at: null,
    suppressed_until: null,
    expires_at: null,
    result: null,
    evidence: null,
    first_seen_at: null,
    occurrences: 1,
    resolved_at: null,
    decision_note: null,
    is_starred: false,
    viewed_at: null,
    auto_apply_at: null,
    deleted_at: null,
  } as unknown as AssistRow;
}

describe("toAssist: an approval proposal survives the read", () => {
  it("narrows a row shaped exactly as the aidream producer writes it", () => {
    const assist = toAssist(row(producerAction));

    expect(assist).not.toBeNull();
    const action = assist?.action;
    expect(action?.kind).toBe("approval_proposal");
    if (action?.kind !== "approval_proposal") throw new Error("unreachable");
    expect(action.proposalKind).toBe("sheet_write");
    expect(action.mode).toBe("mode_4");
    expect(action.proposerLabel).toBe("the CRM follow-up agent");
    expect(action.proposerAgentId).toBe("a1b2c3");
    expect(action.proposerRunId).toBe("run-9");
    expect(action.operatorUserId).toBe("user-1");
  });

  it("keeps the payload's `__kind` marker and every field, untouched", () => {
    // THE KIND-MARKER LAW: the marker is part of the data. The kind's own
    // module narrows the payload; this seam must hand it over verbatim.
    const assist = toAssist(row(producerAction));
    const action = assist?.action;
    if (action?.kind !== "approval_proposal") throw new Error("unreachable");
    expect(action.payload).toEqual(producerAction.payload);
  });

  it("carries the producer's `blocked` sentence when the row has one", () => {
    const assist = toAssist(
      row({
        ...producerAction,
        blocked: {
          reason: "You do not hold the Google account this would send from.",
          whoCan: "Ask the person who connected it.",
        },
      }),
    );
    const action = assist?.action;
    if (action?.kind !== "approval_proposal") throw new Error("unreachable");
    expect(action.blocked?.reason).toContain("do not hold the Google account");
    expect(action.blocked?.whoCan).toContain("Ask the person");
  });

  it("refuses a row whose mode is not one of the five", () => {
    // The mode decides whether a human must click. A value this build cannot
    // read is never coerced into a safe-looking one.
    expect(toAssist(row({ ...producerAction, mode: "mode_7" }))).toBeNull();
    expect(toAssist(row({ ...producerAction, proposalKind: "" }))).toBeNull();
  });
});
