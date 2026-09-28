/**
 * Every org resource kind backed by a table must name that table's schema.
 *
 * Agent-review 387cd269 (2026-09-27): the org Notes page showed "Could not find
 * the table 'public.notes'" — notes had moved to `workbench`, and nine other
 * catalogue entries (datasets, workbooks, transcripts, flashcards, quizzes,
 * canvas, research topics, message templates, workflows) still assumed
 * `public` too. `public` is only a staging queue now, so an entry that omits
 * `schemaName` is almost certainly pointing at a table that is gone. A table
 * that genuinely still lives in `public` is listed here, deliberately.
 */
import { ORG_RESOURCE_CATALOGUE } from "../resource-catalogue";

const STILL_IN_PUBLIC = new Set(["sandbox_instances"]);

describe("org resource catalogue — every table names its schema", () => {
  it("no table-backed entry silently defaults to public", () => {
    const unnamed = ORG_RESOURCE_CATALOGUE.filter(
      (entry) =>
        entry.table !== null &&
        !entry.schemaName &&
        !STILL_IN_PUBLIC.has(entry.table),
    ).map((entry) => `${entry.key} -> public.${entry.table}`);
    expect(unnamed).toEqual([]);
  });
});
