#!/usr/bin/env npx tsx
/**
 * `pnpm check:table-home-reads-the-switch` — WHERE A TABLE LIVES IS ITS ORGANIZATION'S SWITCH
 * (lane WHERE-LIVES-SWITCH, cutover census row X1).
 *
 * THE DEFECT THIS GUARDS. COPY mode copied every older table into the record store under the
 * SAME id and left the older table live until the owner presses his Data tables switch. Every
 * integration decided "record store or older?" by asking "does the store hold a Table with this
 * id?" — so the agents' dataset tool, workflow steps, chat appends and the extension wrote the
 * COPY while the owner kept working in the older table. The one answer is now the store's,
 * `custom.where_tables_live` (read from `platform.cutover_seam_press`), reached through one
 * helper per client:
 *
 *   aidream        packages/matrx-records/matrx_records/server/table_home.py   `table_home`
 *   matrx-frontend features/unified-data/tableLivesIn.ts                       `tableLivesIn`
 *   matrx-extend   src/lib/records/tables.ts                                    `tableLivesWhere`
 *
 * WHAT FAILS (in CODE — comments and docstrings stripped):
 *   1. a runtime file of any of the three repos that PROBES for a same-id copy (reads the Table
 *      kernel by id, or scans the store's Table list for this id) AND DECIDES a store from it
 *      ("older" / "record" / "record_store"), without asking the switch first;
 *   2. one of the resolvers above, or a caller that must go through one, no longer asking.
 *
 * ITS RED: `--at <repo>=<commit>` measures a repo at a commit instead of its working tree;
 * `pnpm check:table-home-reads-the-switch --at aidream=<pre-fix> --at matrx-frontend=<pre-fix>
 * --at matrx-extend=<pre-fix>` fails on all three resolvers. `--self-test` plants both shapes.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

type Repo = "matrx-frontend" | "aidream" | "matrx-extend";

const ROOT = resolve(__dirname, "..");
const REPO_DIR: Record<Repo, string> = {
  "matrx-frontend": ROOT,
  aidream: resolve(ROOT, "..", "aidream"),
  "matrx-extend": resolve(ROOT, "..", "matrx-extend"),
};
const SCAN: Record<Repo, string[]> = {
  "matrx-frontend": ["app", "features", "components", "lib", "utils", "hooks", "providers"],
  aidream: ["aidream", "packages"],
  "matrx-extend": ["src"],
};

/** A same-id copy probe: the Table kernel read by id, or the store's Table list searched for this id. */
const PROBE = [
  /_kernel_id\(\s*["']table["']\s*\)[\s\S]{0,600}read_records_by_ids/,
  /table_kernel_id[\s\S]{0,1200}read_records_by_ids/,
  /storeTables\([^)]*\)[\s\S]{0,300}\.some\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*===/,
];
/** A store decided. */
const DECIDES = /["'](older|record_store)["']/;
/** The switch asked. */
const ASKS = /where_tables_live|\btableLivesIn\(|\btablesLiveIn\(\s*client|\btableLivesWhere\(|\btablesLiveWhere\(|(?<!def )\btable_home\(/;

/** Files that must ask (a resolver, or a resolver's thin caller). */
const MUST_ASK: { repo: Repo; file: string; pattern: RegExp; says: string }[] = [
  { repo: "aidream", file: "packages/matrx-records/matrx_records/server/table_home.py", pattern: /custom\.where_tables_live/, says: "the server's table_home asks the store's one door" },
  { repo: "matrx-frontend", file: "features/unified-data/tableLivesIn.ts", pattern: /["']where_tables_live["']/, says: "the app's one helper asks the store's one door" },
  { repo: "matrx-frontend", file: "features/unified-data/whereThisTableLives.ts", pattern: /\btableLivesIn\(/, says: "whereThisTableLives asks the switch before it looks for a copy" },
  { repo: "matrx-frontend", file: "features/data-tables/data-source/locate-table.ts", pattern: /\bwhereThisTableLives\(/, says: "locateTable goes through whereThisTableLives" },
  { repo: "matrx-extend", file: "src/lib/records/tables.ts", pattern: /["']where_tables_live["']/, says: "the extension's one helper asks the store's one door" },
  { repo: "matrx-extend", file: "src/lib/supabase/user-tables.ts", pattern: /\btableLivesWhere\(/, says: "the extension's appends ask where the table lives" },
];

export function codeOnly(path: string, text: string): string {
  if (/\.py$/.test(path)) {
    const out: string[] = [];
    let inDoc: string | null = null;
    let prev = "";
    for (const line of text.split("\n")) {
      if (inDoc) {
        if (line.includes(inDoc)) inDoc = null;
        out.push("");
        continue;
      }
      const m = line.match(/^\s*[rRbBuU]?("""|''')/);
      if (m && (prev === "" || /:\s*$/.test(prev))) {
        const q = m[1]!;
        if (!line.slice(line.indexOf(q) + 3).includes(q)) inDoc = q;
        out.push("");
        continue;
      }
      const stripped = line.replace(/(^|\s)#.*$/, "$1");
      out.push(stripped);
      if (stripped.trim()) prev = stripped.trim();
    }
    return out.join("\n");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

const isRuntime = (repo: Repo, file: string) =>
  (repo === "aidream" ? /\.py$/ : /\.(ts|tsx)$/).test(file) &&
  !/(^|\/)(tests?|__tests__|__mocks__|migrations|scripts)\//.test(file) &&
  !/(\.test|\.spec|\.live\.test)\.[jt]sx?$|(^|\/)test_[^/]*\.py$|conftest\.py$/.test(file);

/** A copy probe that decides a store without asking the switch. */
export function offends(path: string, text: string): boolean {
  const code = codeOnly(path, text);
  return PROBE.some((p) => p.test(code)) && DECIDES.test(code) && !ASKS.test(code);
}

function git(repo: Repo, args: string[]): string {
  return execFileSync("git", ["-C", REPO_DIR[repo], ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function read(repo: Repo, rev: string | null, file: string): string | null {
  if (!rev) {
    const p = resolve(REPO_DIR[repo], file);
    return existsSync(p) ? execFileSync("cat", [p], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) : null;
  }
  try {
    return execFileSync("git", ["-C", REPO_DIR[repo], "show", `${rev}:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function candidates(repo: Repo, rev: string | null): string[] {
  const args = ["grep", "-l"];
  if (!rev) args.push("--untracked");
  args.push("-E", "read_records_by_ids|storeTables\\(");
  if (rev) args.push(rev);
  args.push("--", ...SCAN[repo]);
  let out = "";
  try {
    out = git(repo, args);
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    if (err.status === 1) return []; // grep found nothing
    throw e;
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => (rev ? l.slice(rev.length + 1) : l))
    .filter((f) => isRuntime(repo, f));
}

function selfTest(): number {
  const oldServer = `async def table_home(t, p):\n    kernel = await store._kernel_id("table")\n    rows = await store._read_rows("select id from custom.read_records_by_ids($1)", kernel)\n    return TableHome(t, "older", "")\n`;
  const newServer = `async def table_home(t, p):\n    rows = await store._read_rows("select lives_in from custom.where_tables_live(array[$1])", t)\n    kernel = await store._kernel_id("table")\n    x = await store._read_rows("select id from custom.read_records_by_ids($1)", kernel)\n    return TableHome(t, "older", "")\n`;
  const oldExt = `async function homeOf(id: string) {\n  const store = await storeTables(client);\n  return store.some((t) => t.id === id) ? 'record' : 'older';\n}\n`;
  const commented = `// storeTables(client) .some((t) => t.id === id) 'older'\nexport const x = 1;\n`;
  const checks: [string, boolean][] = [
    ["the pre-fix server resolver (kernel read by id, store decided) offends", offends("a.py", oldServer)],
    ["a resolver that asks the switch first does not offend", !offends("a.py", newServer)],
    ["the pre-fix extension resolver (store list searched for the id) offends", offends("a.ts", oldExt)],
    ["a probe in a comment is not code", !offends("a.ts", commented)],
  ];
  let failed = 0;
  for (const [what, ok] of checks) {
    console.log(`${ok ? "GREEN" : "RED  "}  ${what}`);
    if (!ok) failed++;
  }
  return failed === 0 ? 0 : 1;
}

function main(argv: string[]): number {
  if (argv.includes("--self-test")) return selfTest();
  const at: Partial<Record<Repo, string>> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--at") {
      const [repo, rev] = (argv[++i] ?? "").split("=") as [Repo, string];
      if (!(repo in REPO_DIR) || !rev) throw new Error(`--at takes <repo>=<commit>, repo one of ${Object.keys(REPO_DIR).join(", ")}`);
      at[repo] = rev;
    }
  }
  const problems: string[] = [];
  for (const repo of Object.keys(REPO_DIR) as Repo[]) {
    if (!existsSync(REPO_DIR[repo])) {
      problems.push(`${repo}: the checkout is not at ${REPO_DIR[repo]}, so it was not measured (unmeasured is never a pass)`);
      continue;
    }
    const rev = at[repo] ?? null;
    for (const file of candidates(repo, rev)) {
      const text = read(repo, rev, file);
      if (text && offends(file, text)) {
        problems.push(`${repo}:${file} decides whether a table is in the record store from whether a same-id copy exists. Ask the switch: custom.where_tables_live (server: table_home; app: tableLivesIn; extension: tableLivesWhere).`);
      }
    }
    for (const must of MUST_ASK.filter((m) => m.repo === repo)) {
      const text = read(repo, rev, must.file);
      if (!text || !must.pattern.test(codeOnly(must.file, text))) {
        problems.push(`${repo}:${must.file} — ${must.says}: not found${text ? "" : " (file missing)"}.`);
      }
    }
  }
  const where = Object.entries(at).map(([r, v]) => `${r}@${v}`).join(", ") || "the working trees";
  if (problems.length) {
    console.error(`check:table-home-reads-the-switch — RED (${where}):\n  ${problems.join("\n  ")}`);
    return 1;
  }
  console.log(`check:table-home-reads-the-switch — GREEN (${where}): every table resolver asks the organization's switch; none decides from a copy's existence.`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
