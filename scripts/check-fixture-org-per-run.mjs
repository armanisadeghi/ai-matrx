#!/usr/bin/env node
// scripts/check-fixture-org-per-run.mjs — `node scripts/check-fixture-org-per-run.mjs [--self-test]`
//
// FIXTURE-ORGS (2026-09-23). NO SCRIPT MINTS A FIXTURE ORGANIZATION PER RUN.
//
// On 2026-09-23 the main database held thirteen "Rincon Plumbing Co…", eight "Ironclad Mobile
// Mechanic…" and eight "Ironline Fitness…" organizations — every one a suite, walk or seeder that
// created its organization under the same realistic name with a random slug suffix on each run,
// and then kept it. A member's Shared-with-me showed identical rows. 44 were archived; this guard
// keeps the door shut. It fails on:
//
//   SQL  an `insert into iam.organizations` that PERSISTS (autocommit, or inside a transaction
//        that commits) whose slug is computed per run (`||`, gen_random_uuid, random(), a clock).
//        A suite that only needs the organization for its assertions wraps it in
//        `begin; … rollback;`; a script that must keep one uses scripts/campaign-tests/_fixture_org.sql.
//   Node an `org_create` RPC called anywhere under scripts/ except the one helper,
//        scripts/lib/fixture-org.mjs (`fixtureOrg()` — found by slug, created once).
//
// Fixed-id suites that delete their own row before and after (`:ORG`, a literal uuid, a literal
// slug) are not this class and pass. `--self-test` plants each violation and proves it is caught.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = join(ROOT, "scripts");

/** Exempt files, each with the reason it is not the class. A stale entry fails too. */
const ALLOWED = {
  "scripts/lib/fixture-org.mjs": "the one helper — finds by slug, creates once",
  "scripts/lib/fixture-org.test.mjs": "the helper's forcing test (in-memory store)",
  "scripts/check-fixture-org-per-run.mjs": "this guard's own self-test fixtures",
  "scripts/access-matrix/check-org-ownership.ts":
    "mints prefixed disposable users AND organizations and its teardown verifies zero prefixed rows survive",
  "scripts/campaign-tests/portal_green.sql": "its DO block ends in an unconditional TEARDOWN raise, so the whole block rolls back",
  "scripts/campaign-tests/portal_red.sql": "its DO block ends in an unconditional ROLLBACK VERIFIED raise, so the whole block rolls back",
};

const PER_RUN_SLUG = /\|\||gen_random_uuid|random\(\)|Date\.now|Math\.random/i;

/** A `_name.sql` fragment is judged where it is INCLUDED, inside its includer's transaction. */
export function inlineFragments(text, readFragment) {
  return text
    .split("\n")
    .map((l) => {
      const m = l.trim().match(/^\\i\s+(\S*\/_[^/\s]+\.sql)\s*$/);
      if (!m) return l;
      const body = readFragment(m[1]);
      return body == null ? l : body;
    })
    .join("\n");
}

export function sqlFindings(text) {
  const lines = text.split("\n");
  let inTxn = false;
  let pending = [];
  const persisted = [];
  for (let i = 0; i < lines.length; i += 1) {
    const s = lines[i].trim().toLowerCase();
    if (s.startsWith("--")) continue;
    if (/^(begin|start transaction)\s*(transaction|work)?\s*;/.test(s)) { inTxn = true; pending = []; continue; }
    if (/^(rollback|abort)\s*;/.test(s)) { inTxn = false; pending = []; continue; }
    if (/^commit\s*;/.test(s)) { inTxn = false; persisted.push(...pending); pending = []; continue; }
    if (s.includes("insert into iam.organizations")) (inTxn ? pending : persisted).push(i);
  }
  if (inTxn) persisted.push(...pending);
  return persisted
    .filter((i) => PER_RUN_SLUG.test(lines.slice(i, i + 6).join("\n")))
    .map((i) => ({ line: i + 1, what: "persists an organization whose slug is computed per run" }));
}

export function jsFindings(text) {
  const out = [];
  text.split("\n").forEach((l, i) => {
    if (/rpc\(\s*["'`]org_create["'`]/.test(l)) out.push({ line: i + 1, what: "calls org_create directly — use fixtureOrg() from scripts/lib/fixture-org.mjs" });
  });
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(sql|mjs|js|ts|cjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

function selfTest() {
  let bad = 0;
  const expect = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${got} finding(s), expected ${want})`);
  };
  const autocommit = "do $g$\nbegin\n  insert into iam.organizations (id, name, slug)\n  values (v_org, 'Rincon Plumbing Co — Ojai Branch',\n          'rincon-plumbing-ojai-' || substr(v_org::text, 1, 8));\nend $g$;\n";
  expect("RED  autocommit DO block with a per-run slug", sqlFindings(autocommit).length, 1);
  expect("GREEN the same block inside begin; … rollback;", sqlFindings(`begin;\n${autocommit}rollback;\n`).length, 0);
  expect("RED  the same block inside begin; … commit;", sqlFindings(`begin;\n${autocommit}commit;\n`).length, 1);
  expect("GREEN a fixed-id suite with a literal slug", sqlFindings("begin;\ninsert into iam.organizations (id, name, slug)\nvalues (:ORG, 'Rincon Plumbing Co', 'rincon-plumbing-asof');\ncommit;\n").length, 0);
  const frag = "do $f$\nbegin\n  insert into iam.organizations (id, name, slug)\n  values (v_org, 'Meridian Software', 'meridian-software-' || substr(v_org::text, 1, 8));\nend $f$;";
  expect("RED  a fragment included OUTSIDE a transaction", sqlFindings(inlineFragments("\\i scripts/campaign-tests/_x.sql\n", () => frag)).length, 1);
  expect("GREEN a fragment included inside begin; … rollback;", sqlFindings(inlineFragments("begin;\n\\i scripts/campaign-tests/_x.sql\nrollback;\n", () => frag)).length, 0);
  expect("RED  a seeder calling org_create", jsFindings('const { data } = await client.rpc("org_create", { p_name: n, p_slug: s });').length, 1);
  expect("GREEN a seeder calling fixtureOrg()", jsFindings("const { org } = await fixtureOrg(client, { name });").length, 0);
  console.log(bad ? `\nSELF-TEST FAILED: ${bad}` : "\nSELF-TEST PASSED");
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--self-test")) selfTest();

const findings = [];
const seenAllowed = new Set();
for (const file of walk(SCAN)) {
  const rel = relative(ROOT, file);
  if (ALLOWED[rel]) { seenAllowed.add(rel); continue; }
  const isSql = file.endsWith(".sql");
  if (isSql && /^_/.test(file.split("/").pop())) continue; // judged inside each includer
  const raw = readFileSync(file, "utf8");
  const text = isSql
    ? inlineFragments(raw, (rel) => { try { return readFileSync(join(ROOT, rel), "utf8"); } catch { return null; } })
    : raw;
  const found = isSql ? sqlFindings(text) : jsFindings(text);
  for (const f of found) findings.push(`${rel}:${f.line}  ${f.what}`);
}
for (const rel of Object.keys(ALLOWED)) {
  try { statSync(join(ROOT, rel)); } catch { findings.push(`${rel}  STALE allow-list entry — the file is gone; remove it`); }
}
if (findings.length) {
  console.log(`FIXTURE ORG PER RUN: ${findings.length} finding(s)\n`);
  for (const f of findings) console.log(`  ${f}`);
  console.log("\nRemedy: a suite that only asserts builds inside begin; … rollback;. A script that must keep an organization gets it BY SLUG: fixtureOrg() (scripts/lib/fixture-org.mjs) or \\i scripts/campaign-tests/_fixture_org.sql.");
  process.exit(1);
}
console.log("FIXTURE ORG PER RUN: 0 findings — no script under scripts/ mints a fixture organization per run.");
