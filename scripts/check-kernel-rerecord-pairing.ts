#!/usr/bin/env npx tsx
/**
 * A kernel-function replace and its D249 rerecord must land in the SAME change.
 *
 * THE CLASS THIS CLOSES (measured live, 2026-09-19)
 * ------------------------------------------------
 * `levelfix_membership_confers_the_organizations_level` CREATE OR REPLACE'd
 * `iam.has_access_for_base(...)` — one of the sixteen bodies
 * `iam.entity_read_kernel_fingerprint()` hashes — and shipped. Nothing in the
 * same change re-recorded `iam.entity_read_kernel_expected()`. Live fingerprint
 * `5d60ed8c…` ≠ recorded `2fcedce3…`. A comment is not a gate. This script is.
 *
 * THE RULE
 * --------
 * If a change CREATE OR REPLACE's any fingerprinted kernel function, the same
 * change must also CREATE OR REPLACE `iam.entity_read_kernel_expected()`. Same
 * file is enough (dd263). A sibling file in the same change is enough. Neither
 * is not enough (levelfix). Historical files already on main are not re-judged.
 *
 *   pnpm check:kernel-rerecord-pairing
 *   pnpm check:kernel-rerecord-pairing --self-test
 */
import { exitAfterDrain } from "./lib/exit-after-drain";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RED = process.stdout.isTTY ? "\u001b[31m" : "";
const GREEN = process.stdout.isTTY ? "\u001b[32m" : "";
const CYAN = process.stdout.isTTY ? "\u001b[36m" : "";
const DIM = process.stdout.isTTY ? "\u001b[2m" : "";
const RESET = process.stdout.isTTY ? "\u001b[0m" : "";

const FINGERPRINTED = new Set([
  "iam.has_access_for",
  "iam.has_access_for_base",
  "iam.accessible_entity_ids",
  "iam.has_org_access_for",
  "files.has_access_for",
  "files.is_crawl_artifact",
  "files.crawl_site_conveys",
  "platform.entity_row_access_attrs",
  "public.user_can_read_via_library_grant",
  "public.library_is_open",
  "public.is_rulebook_curator",
  "public.is_pack_curator",
  "public._edu_can_read_via_assignment",
  "public.has_permission_for",
  "public.is_org_admin_for",
  "public.user_can_read_data_store_via_grant",
]);
const FINGERPRINTED_NAMES = new Set(
  [...FINGERPRINTED].map((full) => full.slice(full.indexOf(".") + 1)),
);
const RERECORD = "iam.entity_read_kernel_expected";

const IDENT = `(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const CREATE_RE = new RegExp(
  `\\bCREATE\\s+OR\\s+REPLACE\\s+(?:FUNCTION|PROCEDURE)\\s+(?:(${IDENT})\\s*\\.\\s*)?(${IDENT})\\s*\\(`,
  "gi",
);

export interface Replacement {
  schema: string;
  name: string;
  line: number;
}

function unquote(ident: string | undefined): string {
  if (!ident) return "";
  const trimmed = ident.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toLowerCase();
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
            .replace(/--[^\n]*/g, "");
}

export function replacementsIn(sql: string): Replacement[] {
  const stripped = stripComments(sql);
  const out: Replacement[] = [];
  CREATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CREATE_RE.exec(stripped))) {
    const schema = unquote(match[1]);
    const name = unquote(match[2]);
    if (!name) continue;
    out.push({
      schema,
      name,
      line: stripped.slice(0, match.index).split("\n").length,
    });
  }
  return out;
}

function isRerecord(rep: Replacement): boolean {
  return rep.name === "entity_read_kernel_expected" && (rep.schema === "" || rep.schema === "iam");
}

function isFingerprinted(rep: Replacement): boolean {
  if (rep.schema) return FINGERPRINTED.has(`${rep.schema}.${rep.name}`);
  return FINGERPRINTED_NAMES.has(rep.name);
}

export interface PairingVerdict {
  ok: boolean;
  reason: string;
  kernelHits: Array<{ path: string; rep: Replacement }>;
  rerecordHits: Array<{ path: string; rep: Replacement }>;
}

export function judgeTexts(files: Record<string, string>): PairingVerdict {
  const kernelHits: Array<{ path: string; rep: Replacement }> = [];
  const rerecordHits: Array<{ path: string; rep: Replacement }> = [];
  for (const [path, sql] of Object.entries(files)) {
    for (const rep of replacementsIn(sql)) {
      if (isRerecord(rep)) rerecordHits.push({ path, rep });
      if (isFingerprinted(rep)) kernelHits.push({ path, rep });
    }
  }
  if (kernelHits.length > 0 && rerecordHits.length === 0) {
    const names = [...new Set(kernelHits.map(({ rep }) => (rep.schema ? `${rep.schema}.` : "") + rep.name))].sort();
    return {
      ok: false,
      kernelHits,
      rerecordHits,
      reason:
        `this change CREATE OR REPLACE's fingerprinted kernel function(s) ${names.join(", ")} ` +
        "but does not re-record iam.entity_read_kernel_expected() in the same change",
    };
  }
  return { ok: true, kernelHits, rerecordHits, reason: "paired or untouched" };
}

function gitNames(args: string[]): string[] {
  try {
    const out = execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
    return out.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function changedSqlFiles(): Record<string, string> {
  const names = new Set<string>([
    ...gitNames(["diff", "--name-only", "--diff-filter=ACMR", "origin/main...HEAD"]),
    ...gitNames(["diff", "--name-only", "--diff-filter=ACMR"]),
    ...gitNames(["diff", "--name-only", "--cached", "--diff-filter=ACMR"]),
  ]);
  const out: Record<string, string> = {};
  for (const name of [...names].sort()) {
    if (!name.endsWith(".sql")) continue;
    const path = resolve(ROOT, name);
    if (!existsSync(path)) continue;
    out[name] = readFileSync(path, "utf8");
  }
  return out;
}

function selfTest(): number {
  console.log(`${CYAN}check-kernel-rerecord-pairing --self-test${RESET}${DIM}  (fixtures, no git)${RESET}`);
  const cases: Array<{ label: string; files: Record<string, string>; expectOk: boolean }> = [
    {
      label: "levelfix shape: kernel replace, no rerecord",
      files: {
        "campaign/levelfix.sql":
          "CREATE OR REPLACE FUNCTION iam.has_access_for_base(" +
          "p_user_id uuid) RETURNS boolean AS $$ SELECT true $$ LANGUAGE sql;",
      },
      expectOk: false,
    },
    {
      label: "dd263 shape: kernel replace AND rerecord in the SAME file",
      files: {
        "migrations/dd263.sql":
          "CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid) RETURNS boolean AS $$ SELECT true $$ LANGUAGE sql;\n" +
          "CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text AS $$ SELECT 'abc' $$ LANGUAGE sql;",
      },
      expectOk: true,
    },
    {
      label: "sibling-file pairing",
      files: {
        "campaign/g0a.sql":
          "CREATE OR REPLACE FUNCTION public.has_permission_for(p_user_id uuid) RETURNS boolean AS $$ SELECT true $$ LANGUAGE sql;",
        "migrations/0927.sql":
          "CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text AS $$ SELECT 'abc' $$ LANGUAGE sql;",
      },
      expectOk: true,
    },
    {
      label: "rerecord alone is fine",
      files: {
        "migrations/0934.sql":
          "CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected() RETURNS text AS $$ SELECT 'abc' $$ LANGUAGE sql;",
      },
      expectOk: true,
    },
    {
      label: "unrelated function replace is fine",
      files: {
        "migrations/x.sql":
          "CREATE OR REPLACE FUNCTION billing.plan_status(p uuid) RETURNS text AS $$ SELECT 'ok' $$ LANGUAGE sql;",
      },
      expectOk: true,
    },
    {
      label: "dynamic EXECUTE of has_access_for_base still counts",
      files: {
        "campaign/hidden.sql":
          "DO $$ BEGIN EXECUTE $ddl$CREATE OR REPLACE FUNCTION iam.has_access_for_base(p uuid) RETURNS boolean LANGUAGE sql AS $fn$ SELECT true $fn$;$ddl$; END $$;",
      },
      expectOk: false,
    },
    {
      label: "empty change is fine",
      files: {},
      expectOk: true,
    },
  ];
  const failures: string[] = [];
  for (const testCase of cases) {
    const got = judgeTexts(testCase.files);
    const passed = got.ok === testCase.expectOk;
    const mark = passed ? `${GREEN}[ OK ]${RESET}` : `${RED}[FAIL]${RESET}`;
    const want = testCase.expectOk ? "green" : "RED";
    const gotLabel = got.ok ? "green" : "RED";
    console.log(`  ${mark} ${testCase.label} → ${gotLabel} (expected ${want})`);
    if (!passed) failures.push(testCase.label);
  }
  if (failures.length) {
    console.log(`${RED}✗ self-test FAILED: ${failures.join(", ")}${RESET}`);
    return 1;
  }
  console.log(
    `${GREEN}✓ the gate goes red on a kernel replace without a rerecord, and green when they land together or the kernel is untouched.${RESET}`,
  );
  return 0;
}

function printHuman(verdict: PairingVerdict, files: Record<string, string>): number {
  console.log(`${CYAN}D249 kernel rerecord pairing${RESET}${DIM}  (same change)${RESET}`);
  if (Object.keys(files).length === 0) {
    console.log(`${GREEN}  ✓ no SQL in this change${RESET}`);
    return 0;
  }
  for (const [path, sql] of Object.entries(files)) {
    const reps = replacementsIn(sql);
    const kernel = reps.filter(isFingerprinted);
    const rerecord = reps.filter(isRerecord);
    if (kernel.length) {
      const names = kernel.map((r) => `${r.schema ? `${r.schema}.` : ""}${r.name}:${r.line}`).join(", ");
      console.log(`  ${CYAN}kernel  ${RESET} ${path}  ${DIM}${names}${RESET}`);
    }
    if (rerecord.length) {
      console.log(`  ${GREEN}rerecord${RESET} ${path}  ${DIM}line ${rerecord[0]!.line}${RESET}`);
    }
  }
  if (verdict.ok) {
    console.log(`${GREEN}✓ ${verdict.reason}${RESET}`);
    return 0;
  }
  console.log(`${RED}✗ ${verdict.reason}${RESET}`);
  console.log(
    `${DIM}  FIX: re-prove lost=0, then CREATE OR REPLACE iam.entity_read_kernel_expected() in this same change.${RESET}`,
  );
  return 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const explicit = process.argv.includes("--files")
    ? process.argv.slice(process.argv.indexOf("--files") + 1).filter((a) => !a.startsWith("--"))
    : [];
  let files: Record<string, string>;
  if (explicit.length) {
    files = {};
    for (const raw of explicit) {
      const path = existsSync(raw) ? raw : resolve(ROOT, raw);
      if (!existsSync(path)) {
        console.log(`${RED}✗ no such file: ${raw}${RESET}`);
        return 2;
      }
      files[raw] = readFileSync(path, "utf8");
    }
  } else {
    files = changedSqlFiles();
  }
  return printHuman(judgeTexts(files), files);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exitAfterDrain(main());
}
