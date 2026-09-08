/**
 * NO UNSCOPED READ OF THE MANDATE CORPUS — the class, not the instance.
 *
 * The defect (REVIEW-one-resolution.md §8, measured live 2026-09-01/09-07):
 * `features/mandates/admin/service.ts` read `mandate.definition` with no
 * ownership predicate and `mandate.binding` with none either, carrying the
 * comment *"Bindings are read unscoped (RLS already narrows them to what the
 * caller may see)"*. For a platform admin RLS narrows NOTHING — the row policy
 * is `USING (is_platform_admin())` — so the console pulled every binding in the
 * database (283 live) and filtered them in the browser.
 *
 * That belief is the class. It is not specific to the console, and it leaves no
 * trace at runtime: the screen looks right, and the over-read is invisible
 * until someone counts rows on the wire. So the guard is a SOURCE contract —
 * THE VIEW LAW written as a test (`docs/official/db-rules.md`: "RLS is the
 * ceiling, never the view — every list query declares its own scope").
 *
 * Every read of the two mandate corpus tables must carry a narrowing predicate
 * of its own (`.in(...)` or `.eq(...)`). The one honest way to get the whole
 * corpus is the ONE list door, `mnd_list_scoped`, which is the only thing
 * allowed to decide ownership — and the second half of this file proves the
 * guard FIRES on the exact source that shipped, so it can never be a check
 * that passes because it measures nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * Comments are stripped before every check: these files are dense with prose
 * ABOUT the defect (including the shipped comment quoted verbatim), and a
 * guard that fails on its own explanation gets turned off within a week.
 */
export function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The accessors in `lib/supabase/mandateStorage.ts` for the corpus tables. */
const CORPUS_TABLE = /\bmandate(?:Definitions|Bindings)\s*\(/g;

/**
 * A read of a corpus table with no scope of its own. The chain is taken from
 * the table accessor to the end of the statement, so a narrowing added on a
 * LATER, CONDITIONAL statement (`if (keys) query = query.in(...)`) does not
 * count — that is exactly the shape the console shipped.
 */
export function unscopedCorpusReads(source: string): string[] {
  const problems: string[] = [];
  for (const match of source.matchAll(CORPUS_TABLE)) {
    const start = match.index ?? 0;
    const end = source.indexOf(";", start);
    const chain = source.slice(start, end === -1 ? source.length : end);
    if (!chain.includes(".select(")) continue; // a write, not a corpus read
    if (chain.includes(".in(") || chain.includes(".eq(")) continue;
    problems.push(chain.split("\n").slice(0, 4).join(" ").replace(/\s+/g, " "));
  }
  return problems;
}

/**
 * THE SAME CLASS, ONE LAYER UP: a SCREEN that renders numbers from a wider
 * corpus than the list it sits on.
 *
 * `GET /mandates/coverage` classifies every mandate definition in the database
 * — 682 rows, every organization's. The mandates console lists the `system`
 * home of the one list door (~410 rows). While the coverage board took the raw
 * `MandateCoverageResponse`, its tiles counted that whole corpus and its named
 * strips could name a mandate the console's own table had excluded — which is
 * exactly what a walk of v0.4.1718 found the "Nothing assigned" tile doing.
 *
 * So a presentation component may not touch the whole-corpus payload at all:
 * no `MandateCoverageResponse` in its props, and nothing read off `report`.
 * Scope belongs to the host, which owns the rows.
 */
const UNSCOPED_COVERAGE_RENDERS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\bMandateCoverageResponse\b/,
    why: "takes the whole-corpus server report (GET /mandates/coverage) — it classifies EVERY organization's mandates, not the rows this screen lists",
  },
  {
    pattern: /\breport\s*\??\.\s*counts\b/,
    why: "renders report.counts — the whole corpus's tallies, not this list's",
  },
  {
    pattern: /\breport\s*\??\.\s*orange\b/,
    why: "names report.orange rows — it can name a mandate this list excludes",
  },
  {
    pattern: /\breport\s*\??\.\s*red\b/,
    why: "names report.red rows — it can name a mandate this list excludes",
  },
];

export function unscopedCoverageRenders(source: string): string[] {
  const problems: string[] = [];
  for (const line of source.split("\n")) {
    for (const { pattern, why } of UNSCOPED_COVERAGE_RENDERS) {
      if (pattern.test(line)) problems.push(`${line.trim()} — ${why}`);
    }
  }
  return problems;
}

/** The belief that produced the class, in the words it was written in. */
export function rlsNarrowsItBeliefs(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /RLS (?:already )?narrows/i.test(line))
    .map((line) => line.trim());
}

const ADMIN_SERVICE = "features/mandates/admin/service.ts";
const CONSOLE = "features/mandates/admin/MandatesConsole.tsx";
const LIST_DOOR = "features/mandates/list-door.ts";
const BROWSE_SERVICE = "features/mandates/browse/service.ts";
const COVERAGE_BOARD = "features/mandates/admin/MandateCoverageBoard.tsx";

function read(relativePath: string): string {
  return withoutComments(readFileSync(join(REPO_ROOT, relativePath), "utf8"));
}

describe("the mandate corpus is never read unscoped", () => {
  it("narrows every corpus read in the admin door", () => {
    expect(unscopedCorpusReads(read(ADMIN_SERVICE))).toEqual([]);
  });

  it("does not lean on RLS to narrow a list", () => {
    expect(rlsNarrowsItBeliefs(read(ADMIN_SERVICE))).toEqual([]);
  });

  it("takes ownership for the whole corpus from the ONE list door", () => {
    const source = read(ADMIN_SERVICE);
    expect(source).toContain("listMandatesScoped");
    expect(source).toContain("@/features/mandates/list-door");
  });

  it("asks the door for the SYSTEM home from the console, and prints its refusal", () => {
    const source = read(CONSOLE);
    expect(source).toContain("fetchMandateConsoleData({ home: SYSTEM_HOME })");
    // A refusal is a settled fact on the page, never a toast over an empty table.
    expect(source).toContain("isMandateListRefusal");
    expect(source).toContain("systemHomeRefusal");
  });
});

describe("the console's coverage board counts only the rows the console lists", () => {
  it("cannot reach the whole-corpus coverage report at all", () => {
    expect(unscopedCoverageRenders(read(COVERAGE_BOARD))).toEqual([]);
  });

  it("takes a view scoped to the host's own rows", () => {
    const source = read(COVERAGE_BOARD);
    expect(source).toContain("ScopedMandateCoverage");
    expect(source).toContain("view: ScopedMandateCoverage | null");
    // A count that is not known is "…"/"—", never a confident 0.
    expect(source).toContain('count === null ? (loading ? "…" : "—") : count');
  });

  it("is handed a view the console derives from the scoped rows", () => {
    const source = read(CONSOLE);
    expect(source).toContain("scopedCoverageOf(");
    expect(source).toContain("allRows.map((row) => row.mandateKey)");
    expect(source).toContain("<MandateCoverageBoard");
    expect(source).toContain("view={coverageView}");
    // The raw server report never crosses into the board again.
    expect(source).not.toContain("report={coverage}");
    // …and the classification stays aidream's: the console intersects, it
    // never re-derives green/orange/red.
    expect(source).toContain("coverageBucketOf");
  });
});

describe("mnd_list_scoped has exactly one caller", () => {
  it("is reached only through the list door module", () => {
    expect(read(LIST_DOOR)).toContain('supabase.rpc("mnd_list_scoped"');
    // The browse service used to hold its own hand-rolled RPC seam.
    expect(read(BROWSE_SERVICE)).not.toContain('rpc("mnd_list_scoped"');
    expect(read(ADMIN_SERVICE)).not.toContain('rpc("mnd_list_scoped"');
  });
});

/**
 * THE GUARD PROVEN RED. These are the exact statements that shipped, quoted
 * from `features/mandates/admin/service.ts` before the one-resolution rewire.
 * If the checks above ever stop detecting them, they have stopped measuring
 * anything and these tests fail instead of quietly passing.
 */
describe("proven against the code as it shipped", () => {
  const SHIPPED_DEFINITION_READ = `
  let mandateQuery = mandateDefinitions(supabase)
    .select("*")
    .is("deleted_at", null);
  if (scopedKeys) mandateQuery = mandateQuery.in("mandate_key", scopedKeys);
`;
  const SHIPPED_BINDING_READ = `
  const [mandatesRes, bindingsRes] = await Promise.all([
    mandateQuery.order("mandate_key"),
    mandateBindings(supabase)
      .select("*")
      .is("deleted_at", null)
      .order("created_at"),
  ]);
`;
  const SHIPPED_BELIEF = `
  // Bindings are read unscoped (RLS already narrows them to what the caller may
  // see) and filtered to the loaded mandates here.
`;

  it("catches the definition read whose narrowing was conditional", () => {
    expect(unscopedCorpusReads(SHIPPED_DEFINITION_READ)).toHaveLength(1);
  });

  it("catches the binding read that had no predicate at all", () => {
    expect(unscopedCorpusReads(SHIPPED_BINDING_READ)).toHaveLength(1);
  });

  /**
   * The coverage board's props and its two named strips, quoted verbatim from
   * `features/mandates/admin/MandateCoverageBoard.tsx` as it shipped in
   * v0.4.1718 — the third unscoped read of the mandate corpus on this page.
   */
  const SHIPPED_COVERAGE_BOARD = `
export interface MandateCoverageBoardProps {
  report: MandateCoverageResponse | null;
  loading: boolean;
  error: string | null;
}

  const counts = report?.counts ?? null;

      {report && report.orange.length > 0 ? (
        <NamedRows
          heading={\`\${report.orange.length} running on a fallback Holder\`}
          rows={report.orange.map((row) => ({ key: row.mandate_key }))}
        />
      ) : null}

      {report && report.red.length > 0 ? (
        <NamedRows
          heading={\`\${report.red.length} with nothing assigned\`}
          rows={report.red.map((row) => ({ key: row.mandate_key }))}
        />
      ) : null}
`;

  it("catches the board taking the whole-corpus report as its props", () => {
    const problems = unscopedCoverageRenders(SHIPPED_COVERAGE_BOARD);
    expect(
      problems.filter((p) => p.includes("MandateCoverageResponse")),
    ).toHaveLength(1);
  });

  it("catches the tiles counting report.counts", () => {
    expect(
      unscopedCoverageRenders(SHIPPED_COVERAGE_BOARD).filter((p) =>
        p.includes("report.counts"),
      ),
    ).toHaveLength(1);
  });

  it("catches the strips naming report.orange and report.red rows", () => {
    const problems = unscopedCoverageRenders(SHIPPED_COVERAGE_BOARD);
    expect(problems.filter((p) => p.includes("report.orange"))).toHaveLength(3);
    expect(problems.filter((p) => p.includes("report.red"))).toHaveLength(3);
  });

  it("catches the belief in the comment that justified it", () => {
    // Read WITHOUT the comment stripper: the belief lived in a comment, and
    // this check is the one place a comment is the evidence.
    expect(rlsNarrowsItBeliefs(SHIPPED_BELIEF)).toHaveLength(1);
  });
});
