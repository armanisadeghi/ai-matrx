#!/usr/bin/env node
// scripts/check-admin-client-governed-writes.mjs
//
// THE SERVICE-ROLE PROVENANCE GUARD.
//
// Since wf_051 (2026-09-12) `platform._stamp_actor_tier` REFUSES (23514) any
// write whose actor resolves to tier `code` with no `app.actor_system` — and a
// write through `createAdminClient()` (the sb_secret_* service-role key) is
// exactly that: no auth.uid(), no GUC, so it "declares" code + NULL. On every
// table that carries a *_by_tier column the insert/update fails, and the UI
// shows a bare "Failed to create system agent" (2026-09-20, Linked Agent Sync).
//
// A Next.js API route or server action acts FOR a signed-in person, so the
// correct fix is never a declaration hack — it is the person's own client
// (`createClient()` from utils/supabase/server), whose session stamps `human`
// + their id, and whose RLS `platform_admin_all` policy already lets a
// platform admin write these tables.
//
// This guard fails when a variable bound to `createAdminClient()` reaches
// `.insert(` / `.update(` / `.upsert(` on a governed table in the same file.
// The governed set is the live list of tables carrying updated_by_tier /
// created_by_tier (10 on 2026-09-20); extend it when a table gains the column.
//
//   pnpm check:admin-client-governed-writes
//   pnpm check:admin-client-governed-writes --self-test   (RED fixture → must fail)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "features", "lib", "utils", "components", "hooks"];

// schema → tables that carry a *_by_tier column (information_schema.columns,
// column_name in ('updated_by_tier','created_by_tier'), 2026-09-20).
const GOVERNED = {
  agent: ["definition", "definition_version"],
  content_ir: ["kind_instance"],
  crm: ["party"],
  platform: ["associations", "org_change_policy"],
  tool: ["definition", "definition_version"],
  workflow: ["definition", "definition_version"],
};

const WRITE = /\.(insert|update|upsert)\s*\(/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) yield p;
  }
}

/** Every finding in one file's source: [{line, schema, table}]. */
export function findGovernedAdminWrites(src) {
  if (!src.includes("createAdminClient(")) return [];
  const vars = new Set();
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createAdminClient\(\)/g)) {
    vars.add(m[1]);
  }
  // Inline use: `createAdminClient().schema(...)` — treat the call itself as a var.
  const roots = [...vars, "createAdminClient\\(\\)"].map((v) => v.replace(/\$/g, "\\$"));
  if (roots.length === 0) return [];
  const findings = [];
  // A chain: <root> [.schema("s")] .from("t") ...anything not ending the statement... .insert|update|upsert(
  const chain = new RegExp(
    `\\b(?:${roots.join("|")})\\s*(?:\\.schema\\(\\s*["'](\\w+)["']\\s*\\))?\\s*\\.from\\(\\s*["'](\\w+)["']\\s*\\)([^;]*?)(?=;|$)`,
    "gs",
  );
  for (const m of src.matchAll(chain)) {
    const schema = m[1] ?? "public";
    const table = m[2];
    const rest = m[3];
    if (!(GOVERNED[schema] ?? []).includes(table)) continue;
    if (!WRITE.test(rest)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    findings.push({ line, schema, table });
  }
  return findings;
}

function selfTest() {
  const red = `
import { createAdminClient } from "@/utils/supabase/adminClient";
export async function POST() {
  const admin = createAdminClient();
  const { error } = await admin
    .schema("agent")
    .from("definition")
    .insert({ name: "x" })
    .select("id")
    .single();
  return error;
}`;
  const green = `
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
export async function POST() {
  const supabase = await createClient();
  const admin = createAdminClient();
  await admin.schema("agent").from("definition").select("id").eq("id", "x");
  await admin.schema("app").from("definition").insert({ name: "not governed" });
  await supabase.schema("agent").from("definition").insert({ name: "person's own client" });
}`;
  const r = findGovernedAdminWrites(red);
  const g = findGovernedAdminWrites(green);
  if (r.length !== 1 || r[0].schema !== "agent" || r[0].table !== "definition") {
    console.error("[self-test] RED fixture did not fail:", r);
    process.exit(1);
  }
  if (g.length !== 0) {
    console.error("[self-test] GREEN fixture produced findings:", g);
    process.exit(1);
  }
  console.log("[self-test] ok — RED fails, GREEN passes");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const findings = [];
  for (const dir of SCAN_DIRS) {
    let files;
    try { files = [...walk(join(ROOT, dir))]; } catch { continue; }
    for (const f of files) {
      for (const hit of findGovernedAdminWrites(readFileSync(f, "utf8"))) {
        findings.push({ file: relative(ROOT, f), ...hit });
      }
    }
  }
  if (findings.length === 0) {
    console.log("check:admin-client-governed-writes — no service-role write to a provenance-governed table");
    return;
  }
  console.error(
    `check:admin-client-governed-writes — ${findings.length} service-role write(s) to a provenance-governed table.\n` +
      "The DB refuses these (23514: actor_tier=code with no actor_system). Write through the\n" +
      "signed-in person's client (`await createClient()` from @/utils/supabase/server) instead —\n" +
      "RLS `platform_admin_all` already admits a platform admin, and the row is stamped `human`.\n",
  );
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.schema}.${f.table}`);
  process.exit(1);
}

main();
