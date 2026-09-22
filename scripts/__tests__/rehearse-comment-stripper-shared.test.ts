/**
 * pnpm db:rehearse's measure pass used to strip dash-dash and block comments with its own
 * naive two-regex chain, which was NOT single-quote aware: a statement like
 * "comment on function x is 'says -- something';" had its trailing "something';" eaten as
 * if it were a comment, leaving an unbalanced quote that the statement splitter then died
 * on as "unterminated quoted string". POLICY-LOCK (commit 4622586263) fixed the same class
 * of bug in the policy-only judge and shared the fix as stripCommentsQuoteAware in
 * scripts/lib/migration-target.ts - quote-aware (with doubled-quote escapes), dollar-quote-
 * tag-aware, and block-comment-aware.
 *
 * scripts/rehearse-migration.ts's stripForStatements now delegates to that ONE shared
 * stripper instead of carrying a second copy. This test proves the shared stripper handles
 * the four cases the runner's measure pass depends on, and is a straight RED-then-GREEN
 * proof: swap the import for the old regex body below and every case marked RED-under-old
 * fails.
 */
import { stripCommentsQuoteAware } from "../lib/migration-target";

/** The exact naive stripper `rehearse-migration.ts` carried before POLICY-LOCK landed. */
function oldNaiveStrip(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

describe("stripCommentsQuoteAware — the one shared stripper rehearse-migration.ts now uses", () => {
  it("a single-quoted string with a doubled-quote escape survives whole (RED under the old regex)", () => {
    const sql = "comment on function x is 'says -- something with a ''quoted'' word';\n";
    const stripped = stripCommentsQuoteAware(sql);
    expect(stripped).toContain("says -- something with a ''quoted'' word");
    expect((stripped.match(/'/g) ?? []).length).toBe(6);

    // RED under the old behaviour: it truncates at the first `--` inside the literal,
    // leaving the trailing quote and semicolon dangling — an unbalanced string.
    const old = oldNaiveStrip(sql);
    expect((old.match(/'/g) ?? []).length).toBe(1);
  });

  it("a dollar-quoted body with a tag is left untouched, `--` and all (RED under the old regex)", () => {
    const sql =
      "create function f() returns void language plpgsql as $tag$\n" +
      "begin\n  -- not a real comment marker inside the tag body test\n  raise notice 'x -- y';\nend\n$tag$;\n";
    const stripped = stripCommentsQuoteAware(sql);
    expect(stripped).toContain("$tag$");
    expect(stripped).toContain("raise notice 'x -- y';");

    // RED under the old behaviour: the naive stripper has no concept of a dollar-quote tag,
    // so it treats the `--` line INSIDE the tagged body as a real comment and eats it.
    const old = oldNaiveStrip(sql);
    expect(old).not.toContain("not a real comment marker inside the tag body test");
  });

  it("a /* */ block comment is stripped (GREEN under both old and new)", () => {
    const sql = "/* this whole block is a comment */\ncreate table demo.t (id uuid primary key);\n";
    const stripped = stripCommentsQuoteAware(sql);
    expect(stripped).not.toContain("this whole block is a comment");
    expect(stripped).toContain("create table demo.t");
  });

  it("a `--` line comment outside any literal is stripped (GREEN under both old and new)", () => {
    const sql = "-- plain trailing comment\ncreate table demo.u (id uuid primary key);\n";
    const stripped = stripCommentsQuoteAware(sql);
    expect(stripped).not.toContain("plain trailing comment");
    expect(stripped).toContain("create table demo.u");
  });

  it("the real bug: a comment-on-function body naming '-- NULL names nobody' round-trips as one statement", () => {
    // The exact shape from migrations/campaign/secsweep2_ops_system_error_user_id_is_the_caller.sql
    // that motivated the shared stripper (see its docstring, 2026-09-22): the old regex died with
    // "unterminated quoted string" on this body; the shared stripper keeps the literal whole.
    const sql =
      "comment on function ops.system_error_user_id_pin() is\n" +
      "  'NULL is allowed where the column is nullable -- NULL names nobody and cannot impersonate.';\n";
    const stripped = stripCommentsQuoteAware(sql);
    expect((stripped.match(/'/g) ?? []).length).toBe(2);
    expect(stripped.trim().endsWith(";")).toBe(true);
  });
});
