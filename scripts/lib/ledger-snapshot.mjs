/**
 * migrations/LEDGER.json — the checked-in snapshot of what the PRODUCTION migration
 * ledger holds, and the predicate that makes a ledgered file READ-ONLY TO LANES AT
 * COMMIT TIME.
 *
 * WHY THIS EXISTS (lane LEDGER-LOCK, 2026-09-22, from the KNOB-GUARD row in the
 * campaign BUILD-LOG). A lane edited `settings3_a_retired_knob_is_archived_not_deleted.sql`
 * — a file already ledgered on production — to share a predicate. The edit was correct
 * engineering and it still produced the exact failure this system exists to prevent:
 * `origin/main` now disagrees with the bytes production actually ran, and the LIVE body
 * stayed old. Nothing caught it. `pnpm check:migrations` would have screamed DRIFT at
 * release time, hours later; the chair caught it first, by reading.
 *
 * The class fix is not another release-time report. It is that the bytes of a file
 * production has already run CANNOT ENTER A COMMIT. There are exactly two legal ways
 * past this guard, and both are the runner's:
 *
 *   1. THE BYTES STILL HASH TO THE LEDGERED CHECKSUM. Reformatting, moving, renaming a
 *      neighbouring file — anything that leaves these bytes alone — is invisible here.
 *   2. THE COMMIT CARRIES AN `amend-idempotent:` TRAILER THE RUNNER WROTE. The ONLY legal
 *      edit to a ledgered file is the amend-idempotent primitive in apply-migration.ts:
 *      keyword-only (`CREATE FUNCTION` -> `CREATE OR REPLACE FUNCTION`), proven by the
 *      runner against the bytes git says actually ran, and with the production ledger row
 *      AMENDED so the tree and the ledger agree again. That run writes a receipt into the
 *      git dir; `prepare-commit-msg` turns the receipt into the trailer, so the exemption
 *      is a thing the runner did, never a sentence a lane typed.
 *
 * Anything else — a "small fix", a shared predicate, a typo — is a NEW migration:
 *
 *      this file is ledgered on production; write a new migration with -- supersedes-function
 *
 * THE SNAPSHOT IS NEVER OLDER THAN THIS MACHINE'S LAST APPLY. `pnpm db:apply` writes the
 * row it just ledgered into LEDGER.json on every successful production apply, and the
 * nightly catch-up refreshes the whole file from production. A snapshot that cannot be
 * read is a REFUSAL, never a fallback — the same rule the DDL-lock census runs on.
 *
 * NO DEPENDENCIES ON PURPOSE. This module is imported by a git hook, which must run in
 * milliseconds on a checkout whose node_modules may be mid-install (the shared checkout's
 * `tsx` shim has been broken for days). Node builtins only.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** matrx-frontend: <root>/migrations. aidream mirrors this in Python (db/ledger_snapshot.py). */
export const REPO_ROOT = resolve(HERE, "..", "..");
export const MIGRATIONS_REL = "migrations";
export const SNAPSHOT_REL = `${MIGRATIONS_REL}/LEDGER.json`;
export const SNAPSHOT_PATH = join(REPO_ROOT, SNAPSHOT_REL);

/**
 * THE GUARDED DIRECTORIES. A campaign file and its inverse are the two halves of one
 * applied change, so both are frozen the moment production runs them. Ordinary
 * `migrations/*.sql` are deliberately NOT in scope here: that inventory predates the
 * campaign, carries 88 standing drift findings check:migrations already reports, and
 * widening this guard onto it would refuse hundreds of commits on day one — a guard
 * everybody disables is not a guard. Widening it is a census, not an edit.
 */
export const GUARDED_DIRS = [`${MIGRATIONS_REL}/campaign/`, `${MIGRATIONS_REL}/inverse/`];

/** The one sentence a refused commit prints. Asserted verbatim by the self-test. */
export const REFUSAL_SENTENCE =
  "this file is ledgered on production; write a new migration with -- supersedes-function";

/**
 * THE FILES THAT PREDATE THE LOCK. Eight files already carried a post-apply edit on
 * origin/main the first time this guard ran (2026-09-22). Each entry binds BOTH the
 * production checksum and the exact tree bytes that existed at that moment, so the
 * exemption covers those bytes and NOTHING ELSE: the next edit to one of them is refused
 * like any other. Adding a name here is not a fix — the same sentence the DDL-lock census
 * carries about WINDOW_CLASS_GRANDFATHERED, for the same reason.
 */
export const GRANDFATHERED = (() => {
  try {
    const raw = readFileSync(join(HERE, "ledger-lock-grandfathered.json"), "utf8");
    return JSON.parse(raw).files ?? {};
  } catch {
    // Unreadable means STRICTER, never looser: with no exemptions every drift refuses.
    return {};
  }
})();

/** `amend-idempotent: <path> <sha256>` — written by the runner, never typed by a lane. */
export const TRAILER_KEY = "amend-idempotent";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isGuardedPath(relPath) {
  const p = relPath.replace(/\\/g, "/");
  return p.endsWith(".sql") && GUARDED_DIRS.some((d) => p.startsWith(d));
}

/**
 * Read the snapshot. An ABSENT or UNREADABLE snapshot is a refusal the caller must
 * surface — never an empty map that silently lets every ledgered file through.
 */
export function readSnapshot(path = SNAPSHOT_PATH) {
  if (!existsSync(path)) {
    return { ok: false, why: `${SNAPSHOT_REL} is missing — nothing can be judged against it.` };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { ok: false, why: `${SNAPSHOT_REL} is not readable JSON: ${(err && err.message) || err}` };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.files || typeof parsed.files !== "object") {
    return { ok: false, why: `${SNAPSHOT_REL} has no "files" object — it is not a ledger snapshot.` };
  }
  return { ok: true, snapshot: parsed };
}

export function emptySnapshot() {
  return {
    note:
      "Checked-in snapshot of public._schema_migrations for the files under migrations/campaign " +
      "and migrations/inverse. Written by `pnpm db:apply` on every successful production apply " +
      "and refreshed whole by the nightly catch-up. Never hand-edited: a self-written checksum " +
      "is a claim nobody can check. Guard: pnpm check:ledgered-files-unedited.",
    generated_at: null,
    files: {},
  };
}

export function writeSnapshot(snapshot, path = SNAPSHOT_PATH) {
  const files = {};
  for (const key of Object.keys(snapshot.files).sort()) files[key] = snapshot.files[key];
  const out = { ...snapshot, files };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, "utf8");
}

/**
 * Record ONE row the runner just ledgered. Called from the success path of
 * `pnpm db:apply … --target production` and from `--amend-idempotent`, so the snapshot
 * on this machine is never older than the last apply made from it.
 *
 * Returns the relative path written, or null when the file is outside the guarded dirs
 * (an ordinary migration, a rehearsal-only apply) — the caller says nothing in that case.
 */
export function recordAppliedRow({ relPath, source, filename, checksum, appliedAt }, path = SNAPSHOT_PATH) {
  const rel = relPath.replace(/\\/g, "/");
  if (!isGuardedPath(rel)) return null;
  const read = readSnapshot(path);
  const snapshot = read.ok ? read.snapshot : emptySnapshot();
  snapshot.files[rel] = {
    source,
    filename,
    checksum,
    applied_at: appliedAt ?? new Date().toISOString(),
  };
  snapshot.generated_at = new Date().toISOString();
  writeSnapshot(snapshot, path);
  return rel;
}

/**
 * Does this commit message carry the runner's trailer for this exact path and these
 * exact bytes? The path AND the checksum are both required: a trailer copied from an
 * older commit names older bytes and must not launder a second edit.
 */
export function messageAllows(message, relPath, newChecksum) {
  if (!message) return false;
  const re = new RegExp(
    `^\\s*${TRAILER_KEY}:\\s*(\\S+)\\s+([0-9a-f]{64})\\s*$`.replace(/\n/g, ""),
    "gm",
  );
  let m;
  while ((m = re.exec(message)) !== null) {
    if (m[1] === relPath && m[2] === newChecksum) return true;
  }
  return false;
}

/**
 * THE PREDICATE. `candidates` is [{ relPath, bytes|null }] — bytes null means the file is
 * being DELETED or RENAMED AWAY, which is an edit to frozen history like any other.
 * Returns the refusals, in path order. An unreadable snapshot returns one refusal naming
 * that, so the guard fails CLOSED.
 */
export function judge(candidates, snapshot, message) {
  const refusals = [];
  for (const { relPath, bytes } of candidates) {
    const rel = relPath.replace(/\\/g, "/");
    if (!isGuardedPath(rel)) continue;
    const row = snapshot.files[rel];
    if (!row) continue; // never applied to production — a lane owns it outright
    if (bytes === null || bytes === undefined) {
      refusals.push({
        relPath: rel,
        ledgered: row.checksum,
        got: null,
        why: `removed or renamed away, and production ran it on ${row.applied_at}`,
      });
      continue;
    }
    const got = sha256(bytes);
    if (got === row.checksum) continue;
    const old = GRANDFATHERED[rel];
    if (old && old.ledgered === row.checksum && old.tree === got) continue;
    if (messageAllows(message, rel, got)) continue;
    refusals.push({
      relPath: rel,
      ledgered: row.checksum,
      got,
      why: `production ran ${row.checksum.slice(0, 12)} on ${row.applied_at}; these bytes are ${got.slice(0, 12)}`,
    });
  }
  return refusals.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** How a refusal is printed — one block per file, then the one sentence. */
export function formatRefusals(refusals, { where, verdict = "COMMIT REFUSED" }) {
  const lines = [];
  lines.push("");
  lines.push(`${verdict} — ${refusals.length} ledgered migration file(s) ${where}.`);
  lines.push("");
  for (const r of refusals) {
    lines.push(`  ${r.relPath}`);
    lines.push(`      ${r.why}`);
  }
  lines.push("");
  lines.push(`  ${REFUSAL_SENTENCE}`);
  lines.push("");
  lines.push(
    "  A file production has already run is frozen history. The one legal edit is the",
  );
  lines.push(
    "  runner's amend-idempotent primitive, which proves the only change is idempotency",
  );
  lines.push("  and moves the production ledger onto the new bytes:");
  lines.push("");
  lines.push("      pnpm db:apply --amend-idempotent <file> --target production");
  lines.push("");
  lines.push(
    "  It writes the trailer this guard honours. Nothing else does — not a flag, not a",
  );
  lines.push("  hand-typed trailer, not editing migrations/LEDGER.json.");
  lines.push("");
  return lines.join("\n");
}

/** The trailer line the runner emits after a successful amend. */
export function trailerLine(relPath, newChecksum) {
  return `${TRAILER_KEY}: ${relPath} ${newChecksum}`;
}

/** Where the runner leaves the receipt prepare-commit-msg turns into that trailer. */
export function receiptPath(gitDir) {
  return join(gitDir, "matrx-amend-idempotent");
}
