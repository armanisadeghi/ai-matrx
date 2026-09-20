/**
 * 🚨 SQL, A STACK TRACE OR A DRIVER'S RENDER IS NEVER THE SENTENCE.
 *
 * The fourteenth cold walk (2026-09-20,
 * common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/cold-walk-14)
 * read this on `/acquisition`, inside a block row, as the account of what
 * happened to a first-time Expert's file:
 *
 *   Matrx ORM | QueryTimeoutError … Query: INSERT INTO
 *   docproc.processed_documents (id, organization_id, owner_id, …) VALUES
 *   ($1, $2, $… Args: ('03e3dab7-…', '5dc930e9-…', '87a6e699-…', 'cld_file', …)
 *
 * `LIVE_LEAK` below is that value, read back out of
 * `platform.acquisition_block.error_sentence` for row
 * f0f4b90d-de6e-4e66-a35d-7424d3da1f60 — not one an author invented to pass.
 * The bound arguments turned out to include the OCR'd text of the customer's
 * own document, which is why this is a data-exposure guard and not only a
 * tidiness one.
 *
 * These exercise the real exported functions, and each fails against the render
 * path as it stood (`where: errorSentence ?? …` printed the value verbatim).
 */

import {
  SYSTEM_ERROR_SENTENCE,
  namesMachineText,
  personFacingSentence,
  providerErrorSentence,
} from "../failureSentence";

const LIVE_LEAK =
  "Matrx ORM  |  QueryTimeoutError Query timed out during execute_query " +
  "Operation: execute_query Query:     INSERT INTO docproc.processed_documents " +
  "(id, organization_id, owner_id, source_kind, source_id) VALUES " +
  "($1, $2, $3, $4, $5) Args: ('03e3dab7-1f1c-4d2e-9f40-3a7f6b2c0d11', " +
  "'5dc930e9-bd65-44a1-8369-af773f6e1a5b', 'cld_file')";

/** Every shape that must never reach a sentence. Each was seen on a real row. */
const FORBIDDEN: [string, RegExp][] = [
  ["a SQL statement", /INSERT\s+INTO/i],
  ["bind placeholders", /\$\d+\s*,\s*\$\d+/],
  ["an inlined payload marker", /\bArgs\s*:/],
  ["a driver banner", /Matrx ORM\s*\|/],
  ["a schema-qualified table", /docproc\.processed_documents/],
];

const MACHINE = [
  LIVE_LEAK,
  "UPDATE platform.acquisition_block SET status = 'open' WHERE id = $1",
  'Traceback (most recent call last):\n  File "/app/x.py", line 12, in run',
  "l.update_where(..., lock_rows_in_pk_order=True)",
  "QueryTimeoutError",
  "[ERROR in execute_query]",
];

/** Real sentences this product writes. None may be touched — over-cleaning a
 * codec's careful refusal is the same lie in the other direction. */
const PROSE = [
  "The site refused both our normal request and our server browser. It will answer an ordinary person's browser.",
  "YouTube would not answer what captions this video has — it asked the server to prove it is not a robot.",
  "This is iMessage (chat.db), which this server recognises but cannot read yet.",
  "We reached this page successfully but could not read any text out of it.",
  "It stopped after 3 attempts (see step 2 below).",
];

describe("namesMachineText", () => {
  it.each(MACHINE)("catches %s", (text) => {
    expect(namesMachineText(text)).toBe(true);
  });

  it.each(PROSE)("leaves a real sentence alone: %s", (text) => {
    expect(namesMachineText(text)).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(namesMachineText(null)).toBe(false);
    expect(namesMachineText("")).toBe(false);
  });
});

describe("personFacingSentence", () => {
  it.each(FORBIDDEN)("never puts %s in the sentence", (_label, shape) => {
    expect(personFacingSentence(LIVE_LEAK).text).not.toMatch(shape);
  });

  it("falls to a system error on our side, with a remedy", () => {
    const { text } = personFacingSentence(LIVE_LEAK);
    expect(text).toContain(SYSTEM_ERROR_SENTENCE);
    expect(text.length).toBeGreaterThan(SYSTEM_ERROR_SENTENCE.length);
  });

  it("keeps the raw text as detail, so whoever debugs it still has it", () => {
    expect(personFacingSentence(LIVE_LEAK).detail).toBe(LIVE_LEAK);
  });

  it.each(PROSE)("passes a real sentence through word for word: %s", (text) => {
    const spoken = personFacingSentence(text);
    expect(spoken.text).toBe(text);
    expect(spoken.detail).toBeUndefined();
  });
});

describe("providerErrorSentence — a token that is really a driver render", () => {
  it("does not blame the provider for our own database", () => {
    const { text, detail } = providerErrorSentence(LIVE_LEAK);
    expect(text).toBe(SYSTEM_ERROR_SENTENCE);
    expect(text).not.toMatch(/INSERT INTO/i);
    expect(detail).toBe(LIVE_LEAK);
  });

  it("still names a known provider token plainly", () => {
    expect(providerErrorSentence("LOGIN_REQUIRED").text.toLowerCase()).toContain(
      "sign in",
    );
  });
});
