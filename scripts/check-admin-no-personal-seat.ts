#!/usr/bin/env npx tsx
/**
 * check:admin-no-personal-seat — the admin seat never acts as itself.
 *
 * 🚨 THE RULE (Arman, 2026-09-26): "No one acts as themselves in admin. An
 * admin cannot ever act as themselves, so the concept of 'mine' is ridiculous
 * and 'my org' is ridiculous. Make sure that concept doesn't exist in admin…
 * anywhere." An admin page answers PLATFORM questions — System /
 * Organizations / Users / All (`ADMIN_LIST_SCOPES` in lib/list-scope/types.ts)
 * — with a column naming the owning organization or person. It never offers
 * Mine / My Orgs / Shared, which are personal-seat questions.
 *
 * WHAT THIS FLAGS, in every file an `app/(admin)/**` route reaches through its
 * imports within MAX_DEPTH hops (a shared component rendered by an admin page
 * is an admin surface; app chrome and surface manifests are not followed):
 *   1. SCOPE LANES — `scopes: [...]` / `scopes={[...]}` array literals that
 *      name "mine", "orgs" or "shared", and `defaultScope={{ kind: "mine" |
 *      "orgs" | "shared" }}`.
 *   2. SEAT LABELS — the string literal or JSX text "Mine", "My Orgs",
 *      "My Organizations".
 *
 * NOT scanned: lib/list-scope and lib/entity-list (they DEFINE the vocabulary
 * for user pages too), tests, and demo displays (official-components, mock
 * data).
 *
 * THE ONE LEGAL POSTURE for a shared component that serves user pages too: the
 * PAGE passes the scope (`scopes={ADMIN_LIST_SCOPES}` on the admin route), or
 * the component branches on `adminDoorOpen()`. A line that must keep a user
 * word inside such a branch carries `personal-seat-ok: <reason>` on the same
 * line or the line above — a reason is required.
 *
 *   pnpm check:admin-no-personal-seat
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const ADMIN_ROOT = path.join(ROOT, "app", "(admin)");
const EXTS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

const NOT_SCANNED = [
  /\/lib\/list-scope\//,
  /\/lib\/entity-list\//,
  /\/node_modules\//,
  /\.test\.tsx?$/,
  /\/__tests__\//,
  /\/administration\/ui\/official-components\//,
  /mock-data\.ts$/,
];
// Imports never followed (infrastructure, not surfaces) — keeps the walk fast.
const NOT_FOLLOWED = [
  /\/lib\/redux\//,
  /\/types\//,
  /\/utils\/supabase\//,
  /\/components\/ui\//,
  // App chrome and metadata every page carries (the user menu, nav data,
  // surface manifests) — not the admin page's own content.
  /\/features\/shell\//,
  /\/features\/surfaces\/manifests\//,
];
// How far into the import graph an admin page's CONTENT reaches: the route
// file, its page component, that component's parts, and their parts. Deeper
// hops are generic plumbing shared by every page.
const MAX_DEPTH = 4;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTS) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(p, out);
    else if (/\.(tsx?)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:from|import\()\s*["']([^"']+)["']/g;

function reachableFromAdmin(): Set<string> {
  const seen = new Set<string>();
  const queue: [string, number][] = listFiles(ADMIN_ROOT).map((f) => [f, 0]);
  for (const [f] of queue) seen.add(f);
  for (let i = 0; i < queue.length; i += 1) {
    const [file, depth] = queue[i];
    if (depth >= MAX_DEPTH) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, match[1]);
      if (!target || seen.has(target)) continue;
      if (NOT_FOLLOWED.some((re) => re.test(target))) continue;
      seen.add(target);
      queue.push([target, depth + 1]);
    }
  }
  return seen;
}

interface Finding {
  file: string;
  line: number;
  rule: "scope-lane" | "seat-label";
  text: string;
}

const PERSONAL = `"(?:mine|orgs|shared)"`;
const SCOPE_ARRAY_RE = new RegExp(`scopes\\s*(?::|=\\{)\\s*\\[[^\\]]*${PERSONAL}`, "s");
const DEFAULT_SCOPE_RE = new RegExp(`defaultScope=\\{\\{\\s*kind:\\s*${PERSONAL}`);
const LABEL_RE = /(["'`])(?:Mine|My Orgs|My Organizations)\1|>\s*(?:Mine|My Orgs|My Organizations)\s*</;
const ALLOW_RE = /personal-seat-ok:\s*\S+/;

export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  const allowed = (i: number) => ALLOW_RE.test(lines[i]) || (i > 0 && ALLOW_RE.test(lines[i - 1]));
  // Scope arrays can span lines: test each `scopes` occurrence over a window.
  lines.forEach((line, i) => {
    if (/scopes\s*(?::|=\{)\s*\[/.test(line)) {
      const window = lines.slice(i, i + 12).join("\n");
      const closing = window.indexOf("]");
      const slice = closing >= 0 ? window.slice(0, closing + 1) : window;
      if (SCOPE_ARRAY_RE.test(slice) && !allowed(i)) {
        findings.push({ file, line: i + 1, rule: "scope-lane", text: line.trim() });
      }
    }
    if (DEFAULT_SCOPE_RE.test(line) && !allowed(i)) {
      findings.push({ file, line: i + 1, rule: "scope-lane", text: line.trim() });
    }
    const code = line.replace(/^\s*(\/\/|\*).*$/, "");
    if (LABEL_RE.test(code) && !allowed(i)) {
      findings.push({ file, line: i + 1, rule: "seat-label", text: line.trim() });
    }
  });
  return findings;
}

function main(): void {
  const files = [...reachableFromAdmin()].filter(
    (f) => !NOT_SCANNED.some((re) => re.test(f)),
  );
  const findings = files.flatMap((f) =>
    scanText(path.relative(ROOT, f), fs.readFileSync(f, "utf8")),
  );
  if (findings.length === 0) {
    console.log(
      `check:admin-no-personal-seat — clean: ${files.length} files reachable from app/(admin) carry no Mine / My Orgs / Shared scope or label.`,
    );
    return;
  }
  console.error(
    `check:admin-no-personal-seat — ${findings.length} personal-seat concept(s) on admin surfaces.\n` +
      `No one acts as themselves in admin (Arman, 2026-09-26). Use ADMIN_LIST_SCOPES (System / Organizations / Users / All)\n` +
      `from lib/list-scope/types.ts on the admin page, with a column naming the owning organization or person.\n`,
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.text}`);
  process.exit(1);
}

main();
