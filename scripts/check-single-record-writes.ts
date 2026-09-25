#!/usr/bin/env npx tsx
/**
 * check:single-record-writes — A SINGLE-RECORD WRITE PROVES IT LANDED.
 *
 * THE CLASS (flashcards, 2026-09-25). PostgREST answers an `.update()` or
 * `.delete()` that row-level security filters to zero rows with
 * `{ data: [], error: null }` — status 200, NO error. A caller that judges
 * success by `error == null` therefore reports "Card deleted" while nothing
 * happened. Law: nothing fails silently.
 *
 * WHAT THIS FLAGS: a supabase-js `.update(...)` / `.delete()` on a
 * `.from(...)` chain (any client or schema wrapper — `supabase.schema("x")`,
 * `EDU()`, `db`), filtered to ONE record with `.eq("id", …)`, whose chain has
 * no `.select(...)` — so the write cannot know whether any row changed.
 *
 * WHAT PASSES:
 *   - the chain ends in `.select(...)` (the rows written come back); the
 *     canonical form is the primitive `writeOne` / `tryWriteOne` from
 *     `utils/supabase/writeOne.ts`, which also turns zero rows into a
 *     plain-English refusal;
 *   - `.update(patch, { count: "exact" })` / `.delete({ count })` — the
 *     caller reads the count;
 *   - a chain assigned to a variable that later gets `.select(` in the same
 *     function (`let q = …update().eq("id"); … await q.select()`);
 *   - an exemption comment on the line above, WITH a reason:
 *     `// write-lands-exempt: <why zero rows is fine here>`.
 * Not judged: `.upsert()` (an ON CONFLICT DO UPDATE that fails an UPDATE
 * policy's USING raises an error — it does not go silent), bulk `.in("id")`
 * writes, and storage (`.storage.from(bucket)`). Tests, `.d.ts`, and
 * `packages/` are skipped.
 *
 * THE BASELINE IS A RATCHET. `scripts/single-record-writes-baseline.json`
 * holds, per file, how many unproven sites existed when the guard was built.
 * A file above its baseline count exits 1. `--write` rewrites the baseline to
 * the counts STILL present and never raises one (with no file yet it seeds).
 *
 *   pnpm check:single-record-writes
 *   pnpm check:single-record-writes --census   # every site, grouped by feature
 *   pnpm check:single-record-writes --json
 *   pnpm check:single-record-writes:write      # ratchet the baseline down
 *   pnpm check:single-record-writes:self-test  # proves the detector can fail
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_FILE = join(ROOT, "scripts", "single-record-writes-baseline.json");
const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "utils", "providers", "actions"];
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "__tests__", "__mocks__"]);
const EXEMPT_RE = /\/\/[ \t]*write-lands-exempt:[ \t]*[^\s]/;

export interface Site {
  file: string;
  line: number;
  op: "update" | "delete";
  side: "client" | "server";
}

function listFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p);
  }
}

/** Method names and root identifier of the receiver chain below a call. */
function chainBelow(node: ts.Expression): string[] {
  const out: string[] = [];
  let cur: ts.Expression = node;
  for (;;) {
    if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isPropertyAccessExpression(cur)) {
      out.push(cur.name.text);
      cur = cur.expression;
    } else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur)) {
      cur = cur.expression;
    } else break;
  }
  return out;
}

function isIdLiteral(arg: ts.Expression | undefined): boolean {
  return !!arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && arg.text === "id";
}

function enclosingFunction(node: ts.Node): ts.Node {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionLike(cur)) return cur;
    cur = cur.parent;
  }
  return node.getSourceFile();
}

function isServerFile(rel: string, src: string): boolean {
  return (
    /^app\/api\//.test(rel) ||
    /^\s*["']use server["']/m.test(src) ||
    /utils\/supabase\/(server|adminClient)|createAdminClient|["']server-only["']/.test(src)
  );
}

/** Every unproven single-record write in one source text. Exported for the self-test. */
export function findSites(rel: string, src: string): Site[] {
  if (!/\.(update|delete)\s*\(/.test(src)) return [];
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = src.split("\n");
  const side = isServerFile(rel, src) ? "server" : "client";
  const sites: Site[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      (n.expression.name.text === "update" || n.expression.name.text === "delete")
    ) {
      const below = chainBelow(n.expression.expression);
      if (below.includes("from") && !below.includes("storage")) {
        let top: ts.Node = n;
        let single = false;
        let selected = false;
        while (
          ts.isPropertyAccessExpression(top.parent) &&
          top.parent.expression === top &&
          ts.isCallExpression(top.parent.parent)
        ) {
          const name = top.parent.name.text;
          const call = top.parent.parent;
          if (name === "eq" && isIdLiteral(call.arguments[0])) single = true;
          if (name === "select") selected = true;
          top = call;
        }
        const counted = n.arguments.some((a) => /\bcount\b/.test(a.getText(sf)));
        if (single && !selected && !counted) {
          // `let q = …update().eq("id")` → later `q.select(` in the same function.
          let viaVariable = false;
          const holder = top.parent;
          const varName =
            holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)
              ? holder.name.text
              : holder && ts.isBinaryExpression(holder) && ts.isIdentifier(holder.left)
                ? holder.left.text
                : null;
          if (varName) {
            const fnText = enclosingFunction(n).getText(sf);
            viaVariable = new RegExp(`\\b${varName}\\s*\\.\\s*select\\s*\\(`).test(fnText);
          }
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line; // 0-based line of `.update(`
          const stmtLine = sf.getLineAndCharacterOfPosition(top.getStart(sf)).line;
          const window = lines.slice(Math.max(0, stmtLine - 2), line + 1).join("\n");
          const exempt = EXEMPT_RE.test(window);
          if (!viaVariable && !exempt) {
            sites.push({ file: rel, line: line + 1, op: n.expression.name.text as "update" | "delete", side });
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return sites;
}

function scan(): Site[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) listFiles(join(ROOT, d), files);
  const sites: Site[] = [];
  for (const f of files) sites.push(...findSites(relative(ROOT, f), readFileSync(f, "utf8")));
  return sites;
}

function countByFile(sites: Site[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sites) out[s.file] = (out[s.file] ?? 0) + 1;
  return out;
}

function featureOf(file: string): string {
  const parts = file.split("/");
  return parts[0] === "features" || parts[0] === "components" || parts[0] === "lib" ? `${parts[0]}/${parts[1]}` : parts[0];
}

function selfTest(): number {
  const cases: { name: string; src: string; expect: number }[] = [
    {
      name: "bare update by id (the flashcards defect)",
      src: `async function f(){ const { error } = await supabase.schema("education").from("fc_card").update({ deleted_at: now }).eq("id", id); if (error) throw error; }`,
      expect: 1,
    },
    { name: "bare delete by id", src: `async function f(){ await db.from("notes").delete().eq("id", id); }`, expect: 1 },
    { name: "wrapper client EDU()", src: `async function f(){ await EDU().from("fc_set").update(p).eq("id", id).eq("created_by", u); }`, expect: 1 },
    { name: "update with .select()", src: `async function f(){ await db.from("notes").update(p).eq("id", id).select("id"); }`, expect: 0 },
    { name: "writeOne", src: `async function f(){ await writeOne(db.from("notes").delete().eq("id", id).select("id"), { action: "delete", noun: "note" }); }`, expect: 0 },
    { name: "count option", src: `async function f(){ const { count } = await db.from("notes").delete({ count: "exact" }).eq("id", id); }`, expect: 0 },
    { name: "bulk .in()", src: `async function f(){ await db.from("notes").delete().in("id", ids); }`, expect: 0 },
    { name: "not a single record", src: `async function f(){ await db.from("notes").delete().eq("user_id", u); }`, expect: 0 },
    { name: "storage", src: `async function f(){ await supabase.storage.from("b").update(path, file).eq("id", id); }`, expect: 0 },
    { name: "Map.delete", src: `function f(){ cache.delete(key); }`, expect: 0 },
    { name: "variable then .select()", src: `async function f(){ let q = db.from("n").update(p).eq("id", id); if (x) q = q.eq("v", 1); const { data } = await q.select("id").maybeSingle(); }`, expect: 0 },
    { name: "variable never selected", src: `async function f(){ let q = db.from("n").update(p).eq("id", id); if (x) q = q.eq("v", 1); const { error } = await q; }`, expect: 1 },
    { name: "exempt with reason", src: `async function f(){\n  // write-lands-exempt: best-effort last-seen stamp; zero rows is fine\n  await db.from("n").update(p).eq("id", id);\n}`, expect: 0 },
    { name: "exempt WITHOUT reason still flags", src: `async function f(){\n  // write-lands-exempt:\n  await db.from("n").update(p).eq("id", id);\n}`, expect: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = findSites("features/x/service.ts", c.src).length;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (expected ${c.expect}, found ${got})`);
  }
  // The ratchet: a file above its baseline fails.
  const over = judge([{ file: "a.ts", line: 1, op: "update", side: "client" }, { file: "a.ts", line: 2, op: "update", side: "client" }], { "a.ts": 1 });
  const ratchetOk = over.newSites.length > 0 && judge(over.newSites.slice(0, 1), { "a.ts": 1 }).newSites.length === 0;
  if (!ratchetOk) failed += 1;
  console.log(`${ratchetOk ? "PASS" : "FAIL"}  ratchet: a file above its baseline count fails`);
  console.log(failed === 0 ? "\nself-test: the detector fails on every planted defect." : `\nself-test: ${failed} case(s) wrong.`);
  return failed === 0 ? 0 : 1;
}

function judge(sites: Site[], baseline: Record<string, number>) {
  const counts = countByFile(sites);
  const newSites: Site[] = [];
  const fell: string[] = [];
  for (const [file, n] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 0;
    if (n > allowed) newSites.push(...sites.filter((s) => s.file === file));
  }
  for (const [file, allowed] of Object.entries(baseline)) if ((counts[file] ?? 0) < allowed) fell.push(file);
  return { counts, newSites, fell };
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const sites = scan();
  const total = sites.length;
  const client = sites.filter((s) => s.side === "client").length;

  if (args.has("--json")) {
    console.log(JSON.stringify({ total, client, server: total - client, sites }, null, 2));
    return 0;
  }
  if (args.has("--census")) {
    const byFeature = new Map<string, Site[]>();
    for (const s of sites) byFeature.set(featureOf(s.file), [...(byFeature.get(featureOf(s.file)) ?? []), s]);
    for (const [feature, list] of [...byFeature.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${feature}  ${list.length}`);
      for (const s of list) console.log(`  ${s.file}:${s.line}  ${s.op}  ${s.side}`);
    }
    console.log(`\n${total} unproven single-record writes (${client} client-side, ${total - client} server-side)`);
    return 0;
  }

  const hasBaseline = existsSync(BASELINE_FILE);
  const baseline: Record<string, number> = hasBaseline ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : {};

  if (args.has("--write")) {
    const counts = countByFile(sites);
    const next: Record<string, number> = {};
    for (const [file, n] of Object.entries(counts).sort()) {
      next[file] = hasBaseline ? Math.min(n, baseline[file] ?? 0) : n;
      if (next[file] === 0) delete next[file];
    }
    writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
    const sum = Object.values(next).reduce((a, b) => a + b, 0);
    console.log(`${hasBaseline ? "ratcheted" : "seeded"} ${relative(ROOT, BASELINE_FILE)}: ${sum} sites in ${Object.keys(next).length} files`);
    return 0;
  }

  const { newSites, fell } = judge(sites, baseline);
  const allowed = Object.values(baseline).reduce((a, b) => a + b, 0);
  if (newSites.length > 0) {
    console.log("FAIL  a single-record update/delete judges success by error alone.");
    console.log("      PostgREST answers a write RLS refused with NO error and zero rows — the screen would say it worked.");
    console.log("      Fix: wrap it in writeOne / tryWriteOne (utils/supabase/writeOne.ts) with .select(\"id\").\n");
    for (const s of newSites) console.log(`  ${s.file}:${s.line}  ${s.op}`);
    console.log(`\n${total} sites now, baseline allows ${allowed}.`);
    return 1;
  }
  console.log(`PASS  ${total} unproven single-record writes, baseline allows ${allowed} (only falls).`);
  if (fell.length > 0) console.log(`      ${fell.length} file(s) fell below baseline — run pnpm check:single-record-writes:write to lock it in.`);
  return 0;
}

exitAfterDrain(main());
