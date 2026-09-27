#!/usr/bin/env npx tsx
/**
 * Annotation trash — can every removed annotation be brought back?
 *
 * The soft-delete law: anything important can be archived and restored, never lost. On
 * 2026-09-26 passage comments soft-deleted (cmt_delete) with no way back: platform.comments
 * carried no `user_artifact_kind`, so THE trash (public._trash_kind_rows) never listed them.
 *
 * This reads platform.entity_types LIVE for every token declared in
 * features/rich-document/annotations/annotation-kinds.ts and fails when a soft-deleting
 * kind has no trash registration and is not a declared gap — and when a declared gap has
 * since been registered (the gap list only shrinks). The declaration itself is kept
 * complete by `__tests__/annotation-kinds.census.test.ts`.
 *
 *   pnpm check:annotation-trash              # loud, exit 0
 *   pnpm check:annotation-trash --strict     # exit 1 on any finding or an unmeasured run
 *   pnpm check:annotation-trash --self-test  # proves the evaluation goes red
 *
 * UNMEASURED IS NOT PASSED: no credentials or a failed pull prints LIVE PULL FAILED.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ANNOTATION_KINDS, type AnnotationKindStorage } from "../features/rich-document/annotations/annotation-kinds";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

export interface RegistryRow {
  token: string;
  has_soft_delete: boolean;
  user_artifact_kind: string | null;
}

export function evaluate(kinds: readonly AnnotationKindStorage[], rows: readonly RegistryRow[]): string[] {
  const findings: string[] = [];
  for (const k of kinds) {
    const row = rows.find((r) => r.token === k.entityToken);
    const name = k.kinds.join("/");
    if (!row) {
      findings.push(`${name}: token "${k.entityToken}" is not in platform.entity_types`);
      continue;
    }
    const registered = row.user_artifact_kind !== null;
    if (row.has_soft_delete && !registered && !k.trashGap) {
      findings.push(`${name}: "${k.entityToken}" soft-deletes but is not on /trash — set its user_artifact_kind (and a restore door if it needs one), or declare the gap with its reason`);
    }
    if (registered && k.trashGap) {
      findings.push(`${name}: "${k.entityToken}" is now on /trash — remove its trashGap from annotation-kinds.ts`);
    }
  }
  return findings;
}

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  for (const f of [".env.local", ".env"]) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
      if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
    }
  }
  return url && key ? { url, key } : null;
}

async function pull(): Promise<RegistryRow[] | string> {
  const env = loadEnv();
  if (!env) return "no Supabase URL/secret key in env or .env files";
  const tokens = [...new Set(ANNOTATION_KINDS.map((k) => k.entityToken))].join(",");
  try {
    const res = await fetch(
      `${env.url.replace(/\/$/, "")}/rest/v1/entity_types?select=token,has_soft_delete,user_artifact_kind&token=in.(${tokens})`,
      { headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Accept-Profile": "platform" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return `HTTP ${res.status}`;
    return (await res.json()) as RegistryRow[];
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const red = evaluate(ANNOTATION_KINDS, [
      { token: "comment", has_soft_delete: true, user_artifact_kind: null },
      { token: "document", has_soft_delete: true, user_artifact_kind: "content_document" },
      { token: "agent_surface_binding", has_soft_delete: true, user_artifact_kind: null },
    ]);
    const stale = evaluate(ANNOTATION_KINDS, [
      { token: "comment", has_soft_delete: true, user_artifact_kind: "comment" },
      { token: "document", has_soft_delete: true, user_artifact_kind: "content_document" },
      { token: "agent_surface_binding", has_soft_delete: true, user_artifact_kind: "link" },
    ]);
    const ok = red.length === 1 && red[0].startsWith("comment/") && stale.length === 1 && stale[0].startsWith("link:");
    console.log(ok ? "✓ self-test: an unregistered soft-deleting kind and a stale gap both go red" : `✖ self-test failed: ${JSON.stringify({ red, stale })}`);
    process.exit(ok ? 0 : 1);
  }
  const rows = await pull();
  if (typeof rows === "string") {
    console.log(`⚠ LIVE PULL FAILED (UNMEASURED — not a pass): ${rows}`);
    process.exit(STRICT ? 1 : 0);
  }
  const findings = evaluate(ANNOTATION_KINDS, rows);
  if (findings.length === 0) {
    console.log(`✓ check:annotation-trash — ${ANNOTATION_KINDS.length} annotation kinds: every soft-deleting one is on /trash or a declared gap.`);
    process.exit(0);
  }
  for (const f of findings) console.log(`✖ ${f}`);
  process.exit(STRICT ? 1 : 0);
}

void main();
