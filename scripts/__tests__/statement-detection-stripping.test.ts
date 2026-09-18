/**
 * THE STATEMENT DETECTORS READ SQL, NOT PROSE (measured defect, 2026-09-17).
 *
 * `scripts/apply-migration.ts` tested `NEEDS_AUTOCOMMIT_RE` against comment-only-stripped
 * text, so the words `CREATE INDEX CONCURRENTLY` written inside a function's own HINT
 * string — itself inside a `$$ … $$` body — made `pnpm db:apply` refuse a file that needs
 * no autocommit at all and send its author to the aidream runner for a statement that is
 * not in the file. The self-ledger detector had the same shape; only the transaction-control
 * detector stripped bodies and literals. The fix is that there is ONE stripper,
 * `stripForStatementDetection`, and every detector reads it.
 *
 * THIS DRIVES THE REAL RUNNER. The script self-executes on import (`main().then(...)`), so
 * there is nothing to unit-import and nothing worth mocking: each case is written to a temp
 * file and judged by an actual `--judge-only` invocation, which is the same code path an
 * apply takes to reach the same three facts.
 *
 * RED, proven 2026-09-17 against a mutated copy in a temp checkout: point `statementFacts`
 * at `stripForDetection` and the three prose cases report `autocommit: true`; the
 * conformance corpus then names the disagreement between the two runners
 * (`sd-01…sd-03 @ branch: THE TWO RUNNERS DISAGREE`).
 *
 * The twin is `aidream/db/tests/test_statement_detection_stripping.py`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const RUNNER = resolve(ROOT, "scripts", "apply-migration.ts");

interface Facts {
  autocommit: boolean;
  txn_control: string | null;
  self_ledger: boolean;
}

/** Judge one body through the real runner and return its three statement facts. */
function judge(name: string, sql: string): Facts {
  const dir = mkdtempSync(resolve(tmpdir(), "matrx-stmt-detect-"));
  const file = resolve(dir, `${name}.sql`);
  writeFileSync(file, sql, "utf8");
  const out = execFileSync("npx", ["tsx", RUNNER, "--judge-only", file], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Facts & { target: string });
  if (lines.length === 0) throw new Error(`--judge-only returned no verdict for ${name}:\n${out}`);
  const first = lines[0]!;
  // Target-independent by construction: both lines must carry the same three facts.
  for (const l of lines) {
    expect(l.autocommit).toBe(first.autocommit);
    expect(l.txn_control).toBe(first.txn_control);
    expect(l.self_ledger).toBe(first.self_ledger);
  }
  return { autocommit: first.autocommit, txn_control: first.txn_control, self_ledger: first.self_ledger };
}

const PROSE = "CREATE INDEX CONCURRENTLY";

const CASES: ReadonlyArray<readonly [string, string]> = [
  [
    "dollar-hint",
    `create function public.zz_hint() returns void language plpgsql as $$\n` +
      `begin\n  raise exception 'hot table' using hint = 'build it with ${PROSE}';\nend\n$$;\n`,
  ],
  [
    "tagged-body",
    `create function public.zz_doc() returns text language sql as $doc$\n` +
      `  select '${PROSE} is how it was built'::text\n$doc$;\n`,
  ],
  [
    "single-quoted",
    `insert into public.zz_notes (body)\n  values ('later: ${PROSE}, and ''VACUUM'' after that');\n`,
  ],
  ["commented", `-- ${PROSE.toLowerCase()} zz_idx on public.zz (id);\n/* vacuum public.zz; */\ncreate table if not exists public.zz (id bigint primary key);\n`],
];

describe("the autocommit detector reads statements, not prose", () => {
  for (const [name, sql] of CASES) {
    it(`${name}: the phrase is present and the file still needs no autocommit`, () => {
      expect(sql.toLowerCase()).toContain(PROSE.toLowerCase());
      expect(judge(name, sql).autocommit).toBe(false);
    });
  }

  it("a real top-level CREATE INDEX CONCURRENTLY is still detected — unchanged behaviour", () => {
    expect(
      judge("real", "create index concurrently if not exists zz_idx on public.zz (id);\n").autocommit,
    ).toBe(true);
  });
});

describe("the other two detectors read the same stripped text", () => {
  it("prose about the ledger is not a ledger write; a real write is", () => {
    const prose =
      `create function public.zz_warn() returns void language plpgsql as $$\n` +
      `begin raise exception 'never INSERT INTO public._schema_migrations yourself'; end\n$$;\n`;
    expect(judge("ledger-prose", prose).self_ledger).toBe(false);
    expect(
      judge("ledger-real", "insert into public._schema_migrations (source, filename) values ('x','y');\n")
        .self_ledger,
    ).toBe(true);
  });

  it("a plpgsql block's begin/end is not transaction control; a bare BEGIN; is", () => {
    expect(judge("do-block", "do $$ begin perform 1; end $$;\n").txn_control).toBeNull();
    expect(judge("bare-begin", "begin;\ncreate table zz (id int);\ncommit;\n").txn_control).toBe("BEGIN");
  });
});
