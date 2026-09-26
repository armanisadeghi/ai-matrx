/**
 * NO FILE REACHES PRODUCTION WITHOUT A PASSING RULE 27 OF ITS EXACT BYTES.
 *
 * Mirror of `../aidream/db/migration_rehearsal.py` — same records, same rules; keep them
 * identical. The incident, the rule, the grandfathering and the emergency door are written
 * down in that module's docstring and in FOUND_DEFECTS.md "RULE27-GATE" (2026-09-26: the
 * release sweep applied `rca5d_c_definer_doors_ask_each_record.sql` to production before
 * its rehearsal, and every sidebar load timed out for 51 minutes).
 *
 * `pnpm db:rehearse` writes `<migrations root>/rehearsed/<sha256 of raw bytes>.json` for
 * the up and its inverse ONLY after rule 27 passed end to end. At `--target production`
 * `pnpm db:apply` and aidream's runner refuse a file whose current bytes have no passing
 * record, unless those exact bytes are already ledgered (grandfathered).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const RECORD_DIRNAME = "rehearsed";
export const RECORD_KIND = "rule27-rehearsal";
export const EMERGENCY_FLAG = "--unrehearsed-emergency";
export const EMERGENCY_MIN_CHARS = 12;
const NESTED_DIRS = new Set(["inverse", "campaign", "rehearsal"]);

export interface RehearsalRecord {
  readonly kind: string;
  readonly passed: boolean;
  readonly target: string;
  readonly file: string;
  readonly role: "up" | "inverse";
  readonly sha256: string;
  readonly paired_with: { file: string; sha256: string } | null;
  readonly clone_ref: string;
  readonly legs_ms: Record<string, number>;
  readonly rehearsed_at: string;
  readonly rehearsed_by: string;
  readonly tool: string;
}

/** SHA-256 of the file's RAW bytes — no normalization. */
export function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function migrationsRoot(path: string): string {
  const parent = dirname(resolve(path));
  return NESTED_DIRS.has(basename(parent)) ? dirname(parent) : parent;
}

export function recordPath(path: string, sha: string): string {
  return join(migrationsRoot(path), RECORD_DIRNAME, `${sha}.json`);
}

/** The passing record for these exact bytes, or null. Malformed / failed / non-clone = null. */
export function loadRecord(path: string, sha: string = fileSha256(path)): RehearsalRecord | null {
  const rp = recordPath(path, sha);
  if (!existsSync(rp)) return null;
  try {
    const rec = JSON.parse(readFileSync(rp, "utf8")) as RehearsalRecord;
    if (!rec || typeof rec !== "object") return null;
    if (rec.kind !== RECORD_KIND || rec.sha256 !== sha) return null;
    if (rec.passed !== true || rec.target !== "clone") return null;
    return rec;
  } catch {
    return null;
  }
}

function isAidreamStyle(root: string): boolean {
  return !existsSync(join(dirname(root), "package.json"));
}

/** The exact command that produces the record for this file. */
export function rehearseCommand(path: string): string {
  const p = resolve(path);
  const root = migrationsRoot(p);
  const parent = basename(dirname(p));
  const nested = NESTED_DIRS.has(parent) ? parent : null;
  if (isAidreamStyle(root)) {
    return `uv run python db/rehearse_migration.py db/migrations/${basename(p)} --target clone   (in aidream)`;
  }
  const target =
    nested === "inverse"
      ? "<the up file this inverse belongs to>"
      : `migrations/${nested ? `${nested}/` : ""}${basename(p)}`;
  const extra = nested === "campaign" ? " --source campaign --lane <lane>" : "";
  return `pnpm db:rehearse ${target} --target clone${extra}   (in matrx-frontend)`;
}

/** Null when these exact bytes passed rule 27; otherwise the honest sentence. */
export function rehearsalRefusal(path: string, display: string): string | null {
  const sha = fileSha256(path);
  if (loadRecord(path, sha)) return null;
  return (
    `${display} has NOT passed rule 27 (up -> inverse -> up on the dev clone) for these ` +
    `exact bytes (sha256 ${sha.slice(0, 12)}…), so it does not go to production.\n` +
    `  No passing record at ${recordPath(path, sha)}.\n` +
    `  Rehearse it — this writes the record for the up and its inverse:\n` +
    `    ${rehearseCommand(path)}\n` +
    `  then commit the record(s) under ${RECORD_DIRNAME}/ with the file. A record of an earlier ` +
    `draft is a record of a different file.\n` +
    `  Incident this closes: 2026-09-26, rca5d_c reached production through the release ` +
    `sweep before its rehearsal and timed out every sidebar load for 51 minutes.`
  );
}

/** Written ONLY after rule 27 passed end to end. */
export function writeRecord(
  path: string,
  opts: {
    role: "up" | "inverse";
    pairedWith: string | null;
    cloneRef: string;
    legsMs: Record<string, number>;
    tool: string;
  },
): string {
  const sha = fileSha256(path);
  const rp = recordPath(path, sha);
  mkdirSync(dirname(rp), { recursive: true });
  const rec: RehearsalRecord = {
    kind: RECORD_KIND,
    passed: true,
    target: "clone",
    file: basename(path),
    role: opts.role,
    sha256: sha,
    paired_with: opts.pairedWith
      ? { file: basename(opts.pairedWith), sha256: fileSha256(opts.pairedWith) }
      : null,
    clone_ref: opts.cloneRef,
    legs_ms: opts.legsMs,
    rehearsed_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    rehearsed_by: process.env.USER ?? process.env.LOGNAME ?? "unknown",
    tool: opts.tool,
  };
  writeFileSync(rp, `${JSON.stringify(rec, null, 2)}\n`, "utf8");
  return rp;
}

export function emergencyReasonProblem(reason: string | null): string | null {
  if (reason === null) return null;
  if (reason.trim().length < EMERGENCY_MIN_CHARS) {
    return (
      `${EMERGENCY_FLAG} needs a real reason (at least ${EMERGENCY_MIN_CHARS} characters) — ` +
      `it is written into the ledger row forever.`
    );
  }
  return null;
}

export function emergencyNote(reason: string, sha: string): string {
  const who = process.env.USER ?? process.env.LOGNAME ?? "unknown";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
  return (
    `UNREHEARSED EMERGENCY (${EMERGENCY_FLAG}): ${reason.trim()} — sha256 ${sha.slice(0, 12)} had ` +
    `no passing rule-27 record; applied ${now} by ${who}`
  );
}
