/**
 * `npx tsx scripts/census-drop-without-based-on.ts [--json]` — every campaign file on origin/main
 * that DROPs a function, trigger or view it then recreates, and declares no `-- based-on:` line
 * for it (lane RUNNER-DROP-BASEDON, 2026-09-23).
 *
 * WHY: until 08af876e8a (matrx-frontend) / 3f8096cec5 (aidream) neither runner judged a DROP
 * the same file recreates, so a campaign file could put an older body back over a peer lane's
 * change with no warning (PROGRESS-S2: lane S3's record_aggregate / agg_sql). Both runners now
 * refuse that shape at apply time — against the LIVE catalogue, so a file whose dropped object
 * does not exist live needs no line. This census is the STATIC half: it names every file whose
 * bytes carry the shape without a declaration, and whether the ledger has already seen it.
 *
 *   ledgered   → frozen history. Its bytes ran; it is never re-judged and NEVER edited.
 *   unledgered → the next apply is judged by the new rule. The lane that owns it adds the
 *                line (`pnpm db:based-on migrations/campaign/<file>.sql`), or the apply refuses.
 *
 * Reads git objects at origin/main only (never the working tree) plus the two checked-in ledger
 * snapshots (`migrations/LEDGER.json` here, `db/migrations/LEDGER.json` in aidream). Opens no
 * database connection. Always exits 0: it is a census, not a gate — the gate is the runner.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  findDroppedTriggersRecreated,
  findDroppedViewsRecreated,
  findReplaceOccurrences,
  parseBasedOnLines,
} from "./migration-based-on";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AIDREAM = resolve(ROOT, "..", "aidream");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

interface Repo {
  readonly label: string;
  readonly cwd: string;
  readonly dirs: readonly string[];
  readonly ledger: string;
}
const REPOS: readonly Repo[] = [
  { label: "matrx-frontend", cwd: ROOT, dirs: ["migrations/campaign"], ledger: "migrations/LEDGER.json" },
  { label: "aidream", cwd: AIDREAM, dirs: ["db/migrations/campaign"], ledger: "db/migrations/LEDGER.json" },
];

/** Every filename the snapshot says the ledger has seen, keyed by basename. */
function ledgered(repo: Repo): Set<string> {
  try {
    const d = JSON.parse(git(repo.cwd, ["show", `origin/main:${repo.ledger}`])) as {
      files?: Record<string, { filename?: string }>;
    };
    return new Set(Object.entries(d.files ?? {}).map(([k, v]) => v.filename ?? k.split("/").pop()!));
  } catch {
    return new Set();
  }
}

const bareFn = (s: string) => s.replace(/"/g, "").replace(/\(.*$/, "").toLowerCase();
const nameEq = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

interface Row {
  repo: string;
  file: string;
  ledgered: boolean;
  undeclared: string[];
}

const rows: Row[] = [];
for (const repo of REPOS) {
  const seen = ledgered(repo);
  for (const dir of repo.dirs) {
    let files: string[];
    try {
      files = git(repo.cwd, ["ls-tree", "--name-only", "origin/main", `${dir}/`])
        .split("\n")
        .filter((f) => f.endsWith(".sql"));
    } catch {
      continue;
    }
    for (const path of files) {
      const sql = git(repo.cwd, ["show", `origin/main:${path}`]);
      if (!/\bdrop\s+(function|procedure|trigger|view|materialized\s+view)\b/i.test(sql)) continue;
      const { lines } = parseBasedOnLines(sql);
      const fnDeclared = lines.filter((l) => l.kind === "function").map((l) => bareFn(l.signature));
      const trigDeclared = lines.filter((l) => l.kind === "trigger").map((l) => l.signature.toLowerCase());
      const viewDeclared = lines.filter((l) => l.kind === "view").map((l) => l.signature.toLowerCase());
      const undeclared = new Set<string>();
      for (const o of findReplaceOccurrences(sql)) {
        if (!o.snippet.startsWith("DROP") || !o.name) continue; // replaces are DD-220's census
        const n = bareFn(o.name);
        if (!fnDeclared.some((d) => nameEq(d, n))) undeclared.add(`function ${n}`);
      }
      for (const t of findDroppedTriggersRecreated(sql)) {
        const sig = `${t.name} on ${t.table ?? "?"}`.toLowerCase();
        if (!trigDeclared.includes(sig)) undeclared.add(`trigger ${sig}`);
      }
      for (const v of findDroppedViewsRecreated(sql)) {
        const n = v.name.toLowerCase();
        if (!viewDeclared.some((d) => nameEq(d, n))) undeclared.add(`view ${n}`);
      }
      if (undeclared.size === 0) continue;
      const file = path.split("/").pop()!;
      rows.push({ repo: repo.label, file, ledgered: seen.has(file), undeclared: [...undeclared].sort() });
    }
  }
}

rows.sort((a, b) => Number(a.ledgered) - Number(b.ledgered) || a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const un = rows.filter((r) => !r.ledgered);
  const led = rows.filter((r) => r.ledgered);
  console.log(`campaign files on origin/main that DROP-and-recreate without a based-on line: ${rows.length}`);
  console.log(`  unledgered (the owning lane adds the line, or the next apply refuses): ${un.length}`);
  for (const r of un) console.log(`    ${r.repo}/${r.file}\n        ${r.undeclared.join("\n        ")}`);
  console.log(`  ledgered (frozen history — never edited, never re-judged): ${led.length}`);
  for (const r of led) console.log(`    ${r.repo}/${r.file}  — ${r.undeclared.join(", ")}`);
}
