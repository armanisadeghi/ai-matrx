#!/usr/bin/env npx tsx
/**
 * THE CUTOVER CENSUS — CUTOVER-PLAN rev 3 §2 Step 7's guard, and the one thing that decides the
 * Data tables switch's fact "every feature that reads or writes tables uses the new store".
 *
 *   npx tsx scripts/cutover-census/census.ts                      measure; print the table
 *   npx tsx scripts/cutover-census/census.ts --target clone        live reads on the dev clone
 *   npx tsx scripts/cutover-census/census.ts --record              ALSO write the fact through
 *                                                                  platform.cutover_census_record
 *   npx tsx scripts/cutover-census/census.ts --json <file>         write the census as JSON
 *   npx tsx scripts/cutover-census/census.ts --self-test           prove the scanner and the proofs
 *                                                                  can fail (no repos, no database)
 *
 * WHAT IT DOES. Reads `integrations.ts` (the 72 places the plan lists, plus any the census found),
 * runs every row's proofs against the code of matrx-frontend, aidream and matrx-extend (sibling
 * checkouts of this one) and against the live database, and scans every runtime file of those
 * repos and matrx-local for an older-door name in CODE (comments stripped). A file naming one that
 * no row claims is an UNLISTED finding. Exit 0 when nothing is open and nothing is unlisted, 1
 * otherwise, 2 when it could not measure (a repo or the database missing) — never a pass it did
 * not measure. `--record` refuses to write a census that did not read every repo and the database.
 *
 * The door computes `met` and the owner's sentence from the rows; this script never sends a verdict.
 * Lane CUTOVER-CENSUS, 2026-09-25.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";
import { loadDbEnvFrom } from "../lib/direct-db-env";
import {
  ALLOWED,
  INTEGRATIONS,
  NOT_THE_OLDER_STORE,
  OLDER_DOOR_PATTERN,
  type Integration,
  type Proof,
  type Repo,
} from "./integrations";

const ROOT = resolve(import.meta.dirname, "..", "..");
const REPOS: Repo[] = ["matrx-frontend", "aidream", "matrx-extend", "matrx-local"];
const REQUIRED_REPOS: Repo[] = ["matrx-frontend", "aidream", "matrx-extend"];

// ── pure helpers (exported for the self-test) ─────────────────────────────────────────────────

/** A path glob (`**`, `*`) as an anchored regex; every other character is literal. */
export function globToRegex(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") out += "[^/]*";
    else out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export const matchesAny = (path: string, globs: string[]) => globs.some((g) => globToRegex(g).test(path));

/** The CODE of a file: comments removed, strings kept (SQL lives in strings). */
export function codeOnly(path: string, text: string): string {
  if (/\.py$/.test(path)) {
    const lines = text.split("\n");
    const out: string[] = [];
    let inDoc: string | null = null;
    let prevCode = "";
    for (const line of lines) {
      if (inDoc) {
        if (line.includes(inDoc)) {
          inDoc = null;
        }
        out.push("");
        continue;
      }
      const m = line.match(/^\s*[rRbBuU]?("""|''')/);
      // A docstring: a triple-quoted string that opens a line right after a `def`/`class` (a line
      // ending with ':') or at the top of the module. A SQL string opens after `(`, `=` or `,`.
      if (m && (prevCode === "" || /:\s*$/.test(prevCode))) {
        const q = m[1]!;
        const rest = line.slice(line.indexOf(q) + 3);
        if (!rest.includes(q)) inDoc = q;
        out.push("");
        continue;
      }
      const stripped = line.replace(/(^|\s)#.*$/, "$1");
      out.push(stripped);
      if (stripped.trim()) prevCode = stripped.trim();
    }
    return out.join("\n");
  }
  // TS / JS: block comments, then line comments (not the `//` of a URL).
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

export interface Hit {
  repo: Repo;
  file: string;
  names: string[];
}

export function olderDoorNames(code: string): string[] {
  const re = new RegExp(OLDER_DOOR_PATTERN, "g");
  return [...new Set([...code.matchAll(re)].map((m) => m[0]))].sort();
}

export function claimsFor(repo: Repo): string[] {
  const out: string[] = [];
  for (const row of INTEGRATIONS) out.push(...(row.claims?.[repo] ?? []));
  for (const a of [...ALLOWED, ...NOT_THE_OLDER_STORE]) if (a.repo === repo) out.push(...a.claims);
  return out;
}

export function unlisted(hits: Hit[]): Hit[] {
  const byRepo = new Map<Repo, string[]>();
  return hits.filter((h) => {
    if (!byRepo.has(h.repo)) byRepo.set(h.repo, claimsFor(h.repo));
    return !matchesAny(h.file, byRepo.get(h.repo)!);
  });
}

// ── reading the repos ─────────────────────────────────────────────────────────────────────────

interface RepoTree {
  repo: Repo;
  root: string;
  sha: string;
  files: string[];
  code: Map<string, string>;
}

function runtimeFilter(repo: Repo, f: string): boolean {
  const tests = /(^|\/)(__tests__|tests?)\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || /(^|\/)test_[^/]*\.py$/.test(f) || /_test\.py$/.test(f) || /\.d\.ts$/.test(f);
  if (tests) return false;
  switch (repo) {
    case "matrx-frontend":
      return /^(app|features|components|lib|utils|hooks|providers)\//.test(f) && /\.(ts|tsx|js|mjs)$/.test(f);
    case "aidream":
      return /\.(py|ts|tsx)$/.test(f) && !/(^|\/)(scripts|migrations|node_modules|dist|\.venv)\//.test(f);
    case "matrx-extend":
      return /^src\//.test(f) && /\.(ts|tsx|js)$/.test(f);
    case "matrx-local":
      return /\.(py|ts|tsx)$/.test(f) && !/(^|\/)(scripts|node_modules|dist|\.venv)\//.test(f);
  }
}

function readRepo(repo: Repo): RepoTree | { repo: Repo; missing: string } {
  const root = repo === "matrx-frontend" ? ROOT : resolve(ROOT, "..", repo);
  if (!existsSync(resolve(root, ".git"))) return { repo, missing: `no checkout at ${root}` };
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const sha = git("rev-parse", "HEAD").trim();
  const files = git("ls-files").split("\n").filter(Boolean);
  return { repo, root, sha, files, code: new Map() };
}

function codeOf(tree: RepoTree, file: string): string | null {
  if (tree.code.has(file)) return tree.code.get(file)!;
  const abs = resolve(tree.root, file);
  if (!existsSync(abs)) return null;
  const code = codeOnly(file, readFileSync(abs, "utf8"));
  tree.code.set(file, code);
  return code;
}

// ── the proofs ────────────────────────────────────────────────────────────────────────────────

interface ProofResult {
  says: string;
  ok: boolean;
  detail: string;
}

async function runProof(p: Proof, trees: Map<Repo, RepoTree>, db: pg.Client | null): Promise<ProofResult> {
  if (p.kind === "db") {
    if (!db) return { says: p.says, ok: false, detail: "not measured: no database connection" };
    try {
      const r = await db.query(p.sql);
      const row = r.rows[0] ?? {};
      return { says: p.says, ok: row.ok === true, detail: String(row.detail ?? "") };
    } catch (e) {
      return { says: p.says, ok: false, detail: `the read failed: ${(e as Error).message}` };
    }
  }
  const tree = trees.get(p.repo);
  if (!tree) return { says: p.says, ok: false, detail: `not measured: ${p.repo} is not checked out beside this one` };
  if (p.kind === "contains") {
    let code = codeOf(tree, p.file);
    if (code === null) return { says: p.says, ok: false, detail: `${p.file} does not exist` };
    if (p.from) {
      const start = code.search(new RegExp(p.from));
      if (start < 0) return { says: p.says, ok: false, detail: `${p.file}: no ${p.from}` };
      code = code.slice(start);
      if (p.to) {
        const end = code.slice(1).search(new RegExp(p.to));
        if (end >= 0) code = code.slice(0, end + 1);
      }
    }
    const ok = new RegExp(p.pattern).test(code);
    return { says: p.says, ok, detail: ok ? `${p.file}: found` : `${p.file}: /${p.pattern}/ not found` };
  }
  if (p.kind === "lacks") {
    const re = new RegExp(p.pattern);
    const offenders = tree.files.filter((f) => matchesAny(f, p.files) && runtimeFilter(tree.repo, f) && re.test(codeOf(tree, f) ?? ""));
    return { says: p.says, ok: offenders.length === 0, detail: offenders.length ? `still in: ${offenders.join(", ")}` : "none" };
  }
  if (p.kind === "nowhere") {
    const re = new RegExp(p.pattern);
    const offenders = tree.files.filter((f) => runtimeFilter(tree.repo, f) && !matchesAny(f, p.except) && re.test(codeOf(tree, f) ?? ""));
    return { says: p.says, ok: offenders.length === 0, detail: offenders.length ? `still in: ${offenders.join(", ")}` : "none" };
  }
  if (p.kind === "no_importer") {
    const re = new RegExp(`(?:from\\s+[\"']?|import\\s+[\"']?|import\\(\\s*[\"'])[^\"'\\s]*${p.module}`, "m");
    const offenders = tree.files.filter((f) => runtimeFilter(tree.repo, f) && re.test(codeOf(tree, f) ?? ""));
    return { says: p.says, ok: offenders.length === 0, detail: offenders.length ? `imported by: ${offenders.join(", ")}` : "no importer" };
  }
  if (p.kind === "released") {
    try {
      const tags = execFileSync("git", ["-C", tree.root, "tag", "--contains", p.commit], { encoding: "utf8" }).split("\n").filter(Boolean);
      return { says: p.says, ok: tags.length > 0, detail: tags.length ? `in ${tags.sort().slice(0, 1)[0]} and later (${tags.length} tags)` : `${p.commit} is in no release tag` };
    } catch (e) {
      return { says: p.says, ok: false, detail: `${p.commit}: ${(e as Error).message.split("\n")[0]}` };
    }
  }
  return { says: "unknown proof", ok: false, detail: "unknown proof kind" };
}

export interface RowResult {
  id: string;
  what: string;
  status: "proven" | "flip_time" | "nothing" | "open";
  plain: string;
  owner: string;
  why: string;
  proofs: ProofResult[];
}

export function statusOf(row: Integration, proofs: ProofResult[]): RowResult["status"] {
  const allOk = proofs.every((p) => p.ok);
  if (row.disposition === "repointed") return proofs.length > 0 && allOk ? "proven" : "open";
  if (!allOk) return "open";
  return row.disposition;
}

// ── the database ──────────────────────────────────────────────────────────────────────────────

function readRef(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

async function connect(target: "production" | "clone"): Promise<pg.Client> {
  let cfg: pg.ClientConfig;
  if (target === "clone") {
    const ref = readRef(resolve(ROOT, "..", "common-docs/operations/clone/CLONE-REF"));
    const password = readFileSync(ref.password_file!, "utf8").trim();
    cfg = { host: ref.pooler_host, port: 5432, user: ref.pooler_user, password, database: ref.database };
  } else {
    const env = loadDbEnvFrom(ROOT);
    if ("missing" in env) throw new Error(`no database connection: ${env.missing.join(", ")} (looked in ${env.looked.join(", ")})`);
    cfg = { host: env.host, port: env.port, user: env.user, password: env.password, database: env.database };
  }
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false }, application_name: "cutover-census", connectionTimeoutMillis: 15_000 });
  await client.connect();
  // WHICH database: the clone runs no cron job (its quarantine); production does.
  const active = Number((await client.query("select count(*) as n from cron.job where active")).rows[0].n);
  if (target === "clone" && active > 0) throw new Error("--target clone reached a database with active cron jobs — that is not the clone; nothing measured");
  if (target === "production" && active === 0) throw new Error("--target production reached a database with no active cron job — that is the clone, not production; nothing measured");
  return client;
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--self-test")) return selfTest();
  const target = (argv[argv.indexOf("--target") + 1] ?? "production") as "production" | "clone";
  const targetGiven = argv.includes("--target") ? target : "production";
  if (!["production", "clone"].includes(targetGiven)) throw new Error("--target is production or clone");
  const record = argv.includes("--record");
  const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;

  const trees = new Map<Repo, RepoTree>();
  const missing: string[] = [];
  for (const repo of REPOS) {
    const t = readRepo(repo);
    if ("missing" in t) missing.push(`${repo}: ${t.missing}`);
    else trees.set(repo, t);
  }
  let db: pg.Client | null = null;
  try {
    db = await connect(targetGiven);
  } catch (e) {
    missing.push(`database: ${(e as Error).message}`);
  }

  // The scan: every runtime file that names an older door in code.
  const hits: Hit[] = [];
  for (const tree of trees.values()) {
    for (const f of tree.files) {
      if (!runtimeFilter(tree.repo, f)) continue;
      const code = codeOf(tree, f);
      if (!code) continue;
      const names = olderDoorNames(code);
      if (names.length) hits.push({ repo: tree.repo, file: f, names });
    }
  }
  const strays = unlisted(hits);

  const rows: RowResult[] = [];
  for (const row of INTEGRATIONS) {
    const proofs: ProofResult[] = [];
    for (const p of row.proofs ?? []) proofs.push(await runProof(p, trees, db));
    rows.push({ id: row.id, what: row.what, status: statusOf(row, proofs), plain: row.plain, owner: row.owner, why: row.why, proofs });
  }
  await db?.end();

  const count = (s: RowResult["status"]) => rows.filter((r) => r.status === s).length;
  const census = {
    target: targetGiven,
    repos: Object.fromEntries([...trees.values()].map((t) => [t.repo, t.sha])),
    script_sha256: createHash("sha256")
      .update(readFileSync(resolve(import.meta.dirname, "census.ts")))
      .update(readFileSync(resolve(import.meta.dirname, "integrations.ts")))
      .digest("hex"),
    rows: rows.map((r) => ({
      id: r.id, status: r.status, what: r.what, plain: r.status === "open" ? r.plain : "", owner: r.owner,
      failed: r.proofs.filter((p) => !p.ok).map((p) => `${p.says}: ${p.detail}`),
      proven_by: r.proofs.filter((p) => p.ok).map((p) => p.says),
    })),
    unlisted: strays.map((h) => ({ repo: h.repo, file: h.file, names: h.names })),
    scanned_hits: hits.length,
    not_measured: missing,
  };

  // The report.
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  console.log(`CUTOVER CENSUS — live reads on ${targetGiven}; code at ${Object.entries(census.repos).map(([k, v]) => `${k} ${String(v).slice(0, 10)}`).join(" · ")}`);
  console.log(`${rows.length} places: ${count("proven")} proven, ${count("flip_time")} change at the switch, ${count("nothing")} need nothing, ${count("open")} OPEN; ${hits.length} runtime files name an older door, ${strays.length} unlisted\n`);
  for (const r of rows) {
    const mark = r.status === "open" ? "OPEN " : r.status === "proven" ? "ok   " : r.status === "flip_time" ? "flip " : "—    ";
    console.log(`${mark}${pad(r.id, 5)}${pad(r.what, 96)}`);
    if (r.status === "open") for (const p of r.proofs.filter((x) => !x.ok)) console.log(`       ✗ ${p.says}: ${p.detail}`);
  }
  if (strays.length) {
    console.log("\nUNLISTED — runtime files that name an older door and that no row answers for:");
    for (const h of strays) console.log(`  ${h.repo}  ${h.file}  (${h.names.join(", ")})`);
  }
  if (missing.length) console.log(`\nNOT MEASURED: ${missing.join("; ")}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(census, null, 2));

  if (record) {
    const absent = REQUIRED_REPOS.filter((r) => !trees.has(r));
    if (absent.length || missing.some((m) => m.startsWith("database"))) {
      console.error(`\nREFUSED to record: this census did not read ${[...absent, ...(missing.some((m) => m.startsWith("database")) ? ["the database"] : [])].join(", ")}.`);
      return 2;
    }
    const w = await connect(targetGiven);
    try {
      const r = await w.query("select platform.cutover_census_record('older_tables', 'integrations_repointed', $1::jsonb) as out", [JSON.stringify(census)]);
      console.log(`\nRECORDED on ${targetGiven}: ${JSON.stringify(r.rows[0].out)}`);
    } finally {
      await w.end();
    }
  }
  if (missing.length) return 2;
  return count("open") === 0 && strays.length === 0 ? 0 : 1;
}

// ── the self-test: every way this census can go wrong must go red ─────────────────────────────

function selfTest(): number {
  const failures: string[] = [];
  const expect = (cond: boolean, what: string) => {
    if (!cond) failures.push(what);
  };

  // 1. A planted direct call in a file nobody claims is UNLISTED.
  const planted = `import { x } from "y";\nawait supabase.rpc("append_rows_to_user_table", { p_table_id });\n`;
  const plantedHit: Hit = { repo: "matrx-frontend", file: "features/new-thing/saveRows.ts", names: olderDoorNames(codeOnly("x.ts", planted)) };
  expect(plantedHit.names.includes("append_rows_to_user_table"), "a planted older RPC is seen");
  expect(unlisted([plantedHit]).length === 1, "a planted older RPC in an unclaimed file is unlisted");
  // …and the same call in a claimed file is not.
  expect(unlisted([{ ...plantedHit, file: "features/data-tables/save-to-table.ts" }]).length === 0, "a claimed file is not unlisted");
  // 2. A name only in a comment is not code.
  expect(olderDoorNames(codeOnly("a.ts", `// calls udt_bulk_write\n/* udt_datasets */\nconst u = "https://x//y";`)).length === 0, "TS comments are stripped");
  expect(olderDoorNames(codeOnly("a.py", `"""Reads udt_datasets."""\n# udt_dataset_rows\ndef f():\n    """udt_bulk_write here."""\n    return 1\n`)).length === 0, "Python docstrings and comments are stripped");
  expect(olderDoorNames(codeOnly("a.py", `rows = await conn.fetch(\n    """\n    select * from workbench.udt_dataset_rows\n    """\n)\n`)).includes("udt_dataset_rows"), "a Python SQL string is still code");
  // 3. Globs with route-group parentheses and dynamic segments.
  expect(matchesAny("app/(core)/organizations/[orgId]/tables/page.tsx", ["app/(core)/organizations/[orgId]/tables/page.tsx"]), "a literal route path matches itself");
  expect(!matchesAny("app/core/organizations/x/tables/page.tsx", ["app/(core)/organizations/[orgId]/tables/page.tsx"]), "parentheses and brackets are literal");
  expect(matchesAny("features/data-tables/hooks/useRows.ts", ["features/data-tables/**"]), "** spans directories");
  // 4. A repointed row whose proof fails is OPEN; one with no proof at all is OPEN; flip-time is not.
  const row = INTEGRATIONS.find((r) => r.id === "A2")!;
  expect(statusOf(row, [{ says: "routes by id", ok: false, detail: "x" }]) === "open", "a failed proof makes a repointed row open");
  expect(statusOf(row, []) === "open", "a repointed row with no proof is open, never proven");
  expect(statusOf(INTEGRATIONS.find((r) => r.id === "D7")!, []) === "flip_time", "a flip-time row does not block");
  expect(statusOf(INTEGRATIONS.find((r) => r.id === "A9")!, [{ says: "no importer", ok: false, detail: "x" }]) === "open", "a nothing row whose proof fails is open");
  // 5. The list answers for exactly the plan's 72 places, once each.
  const planIds = INTEGRATIONS.filter((r) => r.plan !== "found").map((r) => r.id);
  expect(planIds.length === 72 && new Set(planIds).size === 72, `the list carries the plan's 72 places once each (has ${planIds.length})`);
  expect(INTEGRATIONS.every((r) => r.disposition !== "repointed" || (r.proofs?.length ?? 0) > 0), "every repointed row carries a proof");
  expect(INTEGRATIONS.every((r) => r.disposition !== "repointed" || r.plain.length > 0), "every repointed row says what is left when it is open");

  if (failures.length) {
    console.error(`SELF-TEST RED — ${failures.length} failed:\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log("SELF-TEST GREEN — a planted older call is unlisted, comments are not code, a failed or missing proof is open, the list is the plan's 72.");
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`census could not run: ${(e as Error).message}`);
    process.exit(2);
  },
);
