import { reviewLaneLabel, reviewSearchText } from "./row-text";
import type { ReviewQueueRow } from "./types";

/** The shape of the real row that search missed on 2026-09-11: "print" lived
 *  ONLY in `metadata.verification_notes`, an array the curated key list never
 *  read. Built from the live column set; the values are invented. */
function row(metadata: ReviewQueueRow["metadata"]): ReviewQueueRow {
  return {
    id: "a2717aa3-0000-4000-8000-000000000000",
    title: "Lane B single-message preview and approval",
    url: "/crm/outreach-lists/7888326d",
    instructions: "Open the list and approve one message.",
    repo_slug: "matrx-frontend",
    status: "submitted",
    metadata,
  } as ReviewQueueRow;
}

const names = { domain: "Clients", feature: "Not assigned" };

describe("reviewSearchText", () => {
  it("matches a term that appears only in an arbitrary metadata key", () => {
    const text = reviewSearchText(
      row({ verification_notes: ["A reprint of the approval is blocked."] }),
      names,
    ).toLowerCase();
    expect(text).toContain("print");
  });

  it("walks nested objects and arrays, not just the known note keys", () => {
    const text = reviewSearchText(
      row({ triage: { verification: { evidence: [{ note: "deep-needle" }] } } }),
      names,
    );
    expect(text).toContain("deep-needle");
  });

  it("does not match on metadata KEYS", () => {
    const text = reviewSearchText(row({ verification_notes: ["ok"] }), names);
    expect(text).not.toContain("verification_notes");
  });

  it("still carries the columns and the lane", () => {
    const text = reviewSearchText(
      row({ origin: { agent_label: "print-package-lead" } }),
      names,
    );
    expect(text).toContain("Lane B single-message");
    expect(text).toContain("/crm/outreach-lists/7888326d");
    expect(text).toContain("matrx-frontend");
    expect(text).toContain("Clients");
    expect(text).toContain("print-package-lead");
    expect(reviewLaneLabel(row({ origin: { agent_label: "x" } }))).toBe("x");
  });
});
