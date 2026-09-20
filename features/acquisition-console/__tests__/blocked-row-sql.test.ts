/**
 * 🚨 THE CONSOLE'S "WHAT HAPPENED" CELL NEVER PRINTS SQL.
 *
 * The sibling of `blocked-row-provider-tokens.test.ts`, one layer up: that one
 * covers the row with NO `error_sentence`, this one covers the row that HAS one
 * and whose sentence is a driver's render.
 *
 * cold-walk-14 (2026-09-20): `/acquisition` printed a raw
 * `INSERT INTO docproc.processed_documents … VALUES ($1, $2, … Args: (…)` —
 * bound argument values included — as the person-facing account of a
 * first-time Expert's file. `parseBlockRow` assigned `error_sentence` straight
 * to `where`, and `whereCell` rendered it.
 *
 * This exercises the real contract function. It fails against
 * `where: errorSentence ?? …`.
 */

import { parseBlockRow } from "../contract";

const LIVE_LEAK =
  "Matrx ORM  |  QueryTimeoutError Query timed out during execute_query " +
  "Operation: execute_query Query:     INSERT INTO docproc.processed_documents " +
  "(id, organization_id, owner_id) VALUES ($1, $2, $3) " +
  "Args: ('03e3dab7-1f1c-4d2e-9f40-3a7f6b2c0d11', 'cld_file')";

function blockEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    input_ref: "37af3c33-df85-4ad0-a4e6-a7a52424e826",
    input_label: "page_03 (1).jpg",
    error_class: "processing_failed",
    unblock_note: null,
    lawful_route: null,
    first_seen_at: "2026-09-18T08:32:26Z",
    last_seen_at: "2026-09-18T08:32:26Z",
    occurrence_count: 1,
    ...overrides,
  };
}

describe("parseBlockRow — a driver's render never becomes the cell", () => {
  it("keeps SQL, placeholders, Args and the ORM banner out of `where`", () => {
    const row = parseBlockRow(blockEntry({ error_sentence: LIVE_LEAK }), 0);
    expect(row.where).not.toMatch(/INSERT\s+INTO/i);
    expect(row.where).not.toMatch(/\$\d+\s*,\s*\$\d+/);
    expect(row.where).not.toMatch(/\bArgs\s*:/);
    expect(row.where).not.toMatch(/Matrx ORM\s*\|/);
    expect(row.where).not.toContain("03e3dab7");
  });

  it("says it was a system error on our side, and files the raw text as detail", () => {
    const row = parseBlockRow(blockEntry({ error_sentence: LIVE_LEAK }), 0);
    expect(row.where.toLowerCase()).toContain("system error on our side");
    expect(row.whereDetail).toBe(LIVE_LEAK);
  });

  it("leaves a sentence written for a person exactly as the server wrote it", () => {
    const honest =
      "“03-protected-handbook.epub” is copy-protected (Adobe ADEPT), so we cannot " +
      "read it — and we will never strip a publisher’s protection.";
    const row = parseBlockRow(blockEntry({ error_sentence: honest }), 0);
    expect(row.where).toBe(honest);
    expect(row.whereDetail).toBeUndefined();
  });
});
