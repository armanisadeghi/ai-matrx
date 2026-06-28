#!/usr/bin/env tsx
/**
 * check-dead-relations — the clean-cut enforcer.
 *
 * The 2026 DB transition doctrine: when a table is MOVED or RETIRED, the old name
 * ceases to exist (no shim, no compat view). Stale references therefore ERROR at
 * runtime — but AI coding agents routinely leave such references behind. This guard
 * makes the TERMINAL LIGHT UP RED until every reference to a dead relation is gone.
 *
 * Reads scripts/dead-relations.json (mirror of platform.deprecated_relations) and
 * scans source for references to each OLD name:
 *   - bare   `.from("notes")`            (resolves to public → dead; needs `.schema("workbench").from(...)`)
 *   - qualified `public.notes`           (raw SQL / strings)
 *   - typed  Database["public"]["Tables"]["notes"]
 *
 * Default: prints the red report, exits 0 (non-blocking, like check:migrations — so it
 * screams on every commit without wedging you). `--strict`: exits 1 (CI gate).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const RED = "\x1b[31m",
  BOLD = "\x1b[1m",
  DIM = "\x1b[2m",
  RESET = "\x1b[0m",
  YELLOW = "\x1b[33m";

type Entry = {
  relation: string;
  old: string;
  newSchema: string;
  new: string;
  since: string;
  reason: string;
};
const manifest = JSON.parse(
  readFileSync(join(ROOT, "scripts/dead-relations.json"), "utf8"),
).relations as Entry[];

const SCAN_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
]);
const SKIP_DIR = new Set([
  "node_modules",
  ".next",
  ".next-preview",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "migrations",
  "docs",
]);
// Generated / self / historical — references here are expected and not "dead code".
const SKIP_FILE = new Set([
  "types/database.types.ts",
  "scripts/dead-relations.json",
  "scripts/check-dead-relations.ts",
]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!SKIP_DIR.has(name) && !name.startsWith(".")) yield* walk(full);
    } else if (SCAN_EXT.has(extname(name))) yield full;
  }
}

type Hit = {
  file: string;
  line: number;
  text: string;
  entry: Entry;
  kind: string;
};
const hits: Hit[] = [];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILE.has(rel)) continue;
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  for (const entry of manifest) {
    const r = esc(entry.relation),
      os = esc(entry.old.split(".")[0]),
      ns = entry.newSchema;
    // 1) bare .from("rel") / .table("rel") NOT carrying the new schema on the same line
    const bare = new RegExp(`\\.(from|table)\\(\\s*['"\\\`]${r}['"\\\`]`);
    // 2) qualified old name: public.notes  (word-boundary so note_folders isn't matched by notes)
    const qualified = new RegExp(`\\b${os}\\.${r}\\b`);
    // 3) typed Database["public"]["Tables"]["rel"]
    const typed = new RegExp(
      `Database\\[\\s*['"]${os}['"]\\s*\\]\\[\\s*['"]Tables['"]\\s*\\]\\[\\s*['"]${r}['"]`,
    );
    lines.forEach((text, i) => {
      // The `.schema("docproc")` qualifier is frequently on a PRECEDING line of a
      // multiline method chain (`.schema(...)\n  .from(...)`). Evaluate the new-schema
      // signal against the whole chain — walk back over continuation lines (those whose
      // trimmed text starts with `.`) up to and including the line that opens the chain.
      let chainStart = i;
      while (chainStart > 0 && lines[chainStart].trim().startsWith("."))
        chainStart--;
      const chain = lines.slice(chainStart, i + 1).join("\n");
      const hasNewSchema =
        chain.includes(`schema("${ns}")`) ||
        chain.includes(`schema('${ns}')`) ||
        chain.includes(`"${ns}"`) ||
        chain.includes(`'${ns}'`);
      let kind = "";
      if (bare.test(text) && !hasNewSchema)
        kind = "bare .from/.table (resolves to old schema)";
      else if (typed.test(text))
        kind = `Database["${entry.old.split(".")[0]}"] type ref`;
      else if (qualified.test(text) && !text.includes(entry.new))
        kind = `qualified ${entry.old}`;
      if (kind)
        hits.push({
          file: rel,
          line: i + 1,
          text: text.trim().slice(0, 140),
          entry,
          kind,
        });
    });
  }
}

if (hits.length === 0) {
  console.log(
    `${DIM}✓ check-dead-relations: no references to ${manifest.length} dead relation(s).${RESET}`,
  );
  process.exit(0);
}

const byRel = new Map<string, Hit[]>();
for (const h of hits)
  (
    byRel.get(h.entry.relation) ??
    byRel.set(h.entry.relation, []).get(h.entry.relation)!
  ).push(h);

console.error("");
console.error(
  `${RED}${BOLD}╔══════════════════════════════════════════════════════════════════════╗${RESET}`,
);
console.error(
  `${RED}${BOLD}║  DEAD RELATION REFERENCES — these point at tables that NO LONGER EXIST ║${RESET}`,
);
console.error(
  `${RED}${BOLD}║  Clean-cut doctrine: there is no shim. Repoint them or they ERROR.     ║${RESET}`,
);
console.error(
  `${RED}${BOLD}╚══════════════════════════════════════════════════════════════════════╝${RESET}`,
);
for (const [reln, list] of byRel) {
  const e = list[0].entry;
  console.error(
    `\n${RED}${BOLD}● ${e.old} → ${e.new}${RESET}  ${DIM}(since ${e.since})${RESET}`,
  );
  console.error(`  ${YELLOW}${e.reason}${RESET}`);
  for (const h of list) {
    console.error(
      `  ${RED}${h.file}:${h.line}${RESET}  ${DIM}[${h.kind}]${RESET}`,
    );
    console.error(`      ${h.text}`);
  }
}
console.error(
  `\n${RED}${BOLD}${hits.length} dead reference(s) across ${new Set(hits.map((h) => h.file)).size} file(s).${RESET}`,
);
console.error(
  `${DIM}Fix: bare .from("X") → .schema("<newSchema>").from("X"); public.X → <newSchema>.X; Database["public"]→Database["<newSchema>"].${RESET}\n`,
);

process.exit(STRICT ? 1 : 0);
