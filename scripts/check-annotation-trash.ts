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

/** One row of platform.trash_annotation_title_census(). */
export interface TitleCensusRow {
  kind: string;
  trashed: number;
  empty_titles: number;
}

/**
 * Every annotation /trash kind is present in the title census, and no trashed row's title is
 * empty (a blank row on /trash is a row nobody can recognise to restore).
 */
export function evaluateTitles(kinds: readonly AnnotationKindStorage[], census: readonly TitleCensusRow[] | null): string[] {
  if (census === null) return ["platform.trash_annotation_title_census() is not in the database — apply migrations/annotation_trash_titles_and_passage_links.sql"];
  const findings: string[] = [];
  const titled = new Set(["comment", "passage_link"]);
  for (const k of kinds) {
    const kind = "registry" in k.trashKind ? k.trashKind.registry : k.trashKind.filtered;
    if (!titled.has(kind)) continue;
    const row = census.find((r) => r.kind === kind);
    if (!row) findings.push(`${k.kinds.join("/")}: the title census has no "${kind}" row — the trash kind is not live`);
    else if (Number(row.empty_titles) > 0) findings.push(`${k.kinds.join("/")}: ${row.empty_titles} of ${row.trashed} trashed rows would show an empty title on /trash`);
  }
  return findings;
}

export function evaluate(kinds: readonly AnnotationKindStorage[], rows: readonly RegistryRow[]): string[] {
  const findings: string[] = [];
  for (const k of kinds) {
    if ("filtered" in k.trashKind) continue; // a filtered kind is proven by the title census
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

async function pullCensus(): Promise<TitleCensusRow[] | null | string> {
  const env = loadEnv();
  if (!env) return "no Supabase URL/secret key in env or .env files";
  try {
    const res = await fetch(`${env.url.replace(/\/$/, "")}/rest/v1/rpc/trash_annotation_title_census`, {
      method: "POST",
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Profile": "platform", "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) return `HTTP ${res.status}`;
    return (await res.json()) as TitleCensusRow[];
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function pull(): Promise<RegistryRow[] | string> {
  const env = loadEnv();
  if (!env) return "no Supabase URL/secret key in env or .env files";
  const tokens = [...new Set(ANNOTATION_KINDS.filter((k) => "registry" in k.trashKind).map((k) => k.entityToken))].join(",");
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
    const gapKinds = ANNOTATION_KINDS.map((k) => (k.entityToken === "agent_surface_binding" ? { ...k, trashGap: "planted gap", trashKind: { registry: "link" } } : k));
    const staleGap = evaluate(gapKinds, [
      { token: "comment", has_soft_delete: true, user_artifact_kind: "comment" },
      { token: "document", has_soft_delete: true, user_artifact_kind: "content_document" },
      { token: "agent_surface_binding", has_soft_delete: true, user_artifact_kind: "link" },
    ]);
    const blank = evaluateTitles(ANNOTATION_KINDS, [
      { kind: "comment", trashed: 21, empty_titles: 1 },
      { kind: "passage_link", trashed: 13, empty_titles: 0 },
    ]);
    const missingKind = evaluateTitles(ANNOTATION_KINDS, [{ kind: "comment", trashed: 21, empty_titles: 0 }]);
    const notApplied = evaluateTitles(ANNOTATION_KINDS, null);
    const ok =
      red.length === 1 && red[0].startsWith("comment/") &&
      stale.length === 0 && staleGap.length === 1 && staleGap[0].startsWith("link:") &&
      blank.length === 1 && blank[0].includes("empty title") &&
      missingKind.length === 1 && missingKind[0].includes("passage_link") &&
      notApplied.length === 1;
    console.log(ok ? "✓ self-test: an unregistered kind, a stale gap, a blank title, a missing filtered kind and an unapplied census all go red" : `✖ self-test failed: ${JSON.stringify({ red, stale, staleGap, blank, missingKind, notApplied })}`);
    process.exit(ok ? 0 : 1);
  }
  const rows = await pull();
  if (typeof rows === "string") {
    console.log(`⚠ LIVE PULL FAILED (UNMEASURED — not a pass): ${rows}`);
    process.exit(STRICT ? 1 : 0);
  }
  const census = await pullCensus();
  if (typeof census === "string") {
    console.log(`⚠ LIVE PULL FAILED (UNMEASURED — not a pass): title census: ${census}`);
    process.exit(STRICT ? 1 : 0);
  }
  const findings = [...evaluate(ANNOTATION_KINDS, rows), ...evaluateTitles(ANNOTATION_KINDS, census)];
  if (findings.length === 0) {
    console.log(`✓ check:annotation-trash — ${ANNOTATION_KINDS.length} annotation kinds: every soft-deleting one is on /trash with a non-empty title.`);
    process.exit(0);
  }
  for (const f of findings) console.log(`✖ ${f}`);
  process.exit(STRICT ? 1 : 0);
}

void main();
