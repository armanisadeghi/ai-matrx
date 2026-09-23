#!/usr/bin/env node
/**
 * check:ledgered-files-unedited — a file production has already run is READ-ONLY.
 *
 * Three callers, one predicate (scripts/lib/ledger-snapshot.mjs):
 *
 *   --staged [--message-file <f>]   the git pre-commit / commit-msg hook. Judges the
 *                                   bytes about to enter a commit. Exit 1 refuses it.
 *   (no flag)                       the RELEASE GATE. Judges the working tree against
 *                                   migrations/LEDGER.json. Exit 1 fails the release.
 *   --self-test                     RED then GREEN, with no database and no git: the
 *                                   proof this guard can still catch what it exists for.
 *
 * WHY A SNAPSHOT AND NOT A LIVE QUERY. A git hook may not open a connection to the
 * production database — it would put a network round trip, a credential and an outage
 * mode in front of every commit in the repo. So the ledger is checked in, written by the
 * runner on every successful production apply and refreshed whole by the nightly
 * catch-up, and an unreadable snapshot REFUSES rather than passes.
 *
 * Read scripts/lib/ledger-snapshot.mjs for the rule itself and why it exists.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  REPO_ROOT,
  SNAPSHOT_REL,
  GRANDFATHERED,
  GUARDED_DIRS,
  REFUSAL_SENTENCE,
  emptySnapshot,
  formatRefusals,
  isGuardedPath,
  judge,
  readSnapshot,
  sha256,
  trailerLine,
  rebaseTrailerLine,
} from "./lib/ledger-snapshot.mjs";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => {
  const i = argv.indexOf(f);
  return i === -1 ? null : (argv[i + 1] ?? null);
};

function git(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** The staged content of a path, or null when it is being deleted. */
function stagedBytes(relPath, cwd) {
  try {
    return execFileSync("git", ["show", `:${relPath}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/* ─────────────────────────────── --staged ──────────────────────────────── */

function runStaged(cwd, messageFile) {
  // ACMRD: added, copied, modified, renamed, deleted. A rename shows its NEW path here
  // and its old path as a delete, so both halves are judged.
  const out = git(["diff", "--cached", "--name-status", "--diff-filter=ACMRD", "-z"], cwd);
  const fields = out.split("\0").filter((s) => s.length > 0);
  const touched = [];
  for (let i = 0; i < fields.length; ) {
    const status = fields[i++];
    const a = fields[i++];
    if (/^[RC]/.test(status)) {
      const b = fields[i++];
      touched.push({ status: "D", path: a });
      touched.push({ status: "M", path: b });
    } else {
      touched.push({ status: status[0], path: a });
    }
  }
  const candidates = touched
    .filter((t) => isGuardedPath(t.path))
    .map((t) => ({
      relPath: t.path,
      bytes: t.status === "D" ? null : stagedBytes(t.path, cwd),
    }));
  if (candidates.length === 0) return 0;

  const read = readSnapshot(join(cwd, SNAPSHOT_REL));
  if (!read.ok) {
    process.stderr.write(
      `\nCOMMIT REFUSED — ${read.why}\n\n` +
        `  ${candidates.length} file(s) under ${GUARDED_DIRS.join(" / ")} are staged and there is\n` +
        `  nothing to judge them against. An unreadable ledger snapshot is a refusal, never a\n` +
        `  fallback: restore it from origin/main, or refresh it with\n` +
        `      pnpm refresh:ledger-snapshot\n\n`,
    );
    return 1;
  }

  const message = messageFile && existsSync(messageFile) ? readFileSync(messageFile, "utf8") : null;
  const refusals = judge(candidates, read.snapshot, message);
  if (refusals.length === 0) return 0;
  process.stderr.write(formatRefusals(refusals, { where: "would change in this commit" }));
  return 1;
}

/* ───────────────────────────── release gate ────────────────────────────── */

function runGate(cwd) {
  const read = readSnapshot(join(cwd, SNAPSHOT_REL));
  if (!read.ok) {
    process.stderr.write(`[FAIL] ${read.why}\n       Refresh it: pnpm refresh:ledger-snapshot\n`);
    return 1;
  }
  const snapshot = read.snapshot;
  const paths = Object.keys(snapshot.files);
  const candidates = paths.map((relPath) => {
    const abs = join(cwd, relPath);
    return { relPath, bytes: existsSync(abs) ? readFileSync(abs) : null };
  });
  // No trailer escape at release time ON PURPOSE: a legal amend MOVED the snapshot onto
  // the new bytes, so it is already green here. A tree that still disagrees means bytes
  // reached main that the production ledger never saw.
  const refusals = judge(candidates, snapshot, null);
  if (refusals.length === 0) {
    const grandfathered = Object.keys(GRANDFATHERED).length;
    console.log(
      `[OK] ${paths.length} ledgered campaign/inverse file(s) are byte-identical to what ` +
        `production ran` +
        (grandfathered
          ? `, except ${grandfathered} that PREDATE this lock and are frozen by name and by both ` +
            `checksums in scripts/lib/ledger-lock-grandfathered.json (a further edit to any of ` +
            `them is refused like any other).`
          : `.`),
    );
    return 0;
  }
  process.stderr.write(
    formatRefusals(refusals, {
      where: "in the tree disagree with production",
      verdict: "RELEASE GATE FAILED",
    }),
  );
  process.stderr.write(
    `[FAIL] ${refusals.length} of ${paths.length} ledgered file(s) drifted from the production ledger.\n`,
  );
  return 1;
}

/* ─────────────────────────────── --self-test ───────────────────────────── */

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "ledger-lock-selftest-"));
  mkdirSync(join(dir, "migrations", "campaign"), { recursive: true });
  mkdirSync(join(dir, "migrations", "inverse"), { recursive: true });

  const REL = "migrations/campaign/ledgerlock_selftest_a_ledgered_file_is_frozen.sql";
  const APPLIED = "-- a file production ran\ncreate function public.x() returns int as $$ select 1 $$ language sql;\n";
  const EDITED = APPLIED.replace("create function", "create or replace function");
  const NEW_REL = "migrations/campaign/ledgerlock_selftest_a_new_file_is_free.sql";

  const snapshot = emptySnapshot();
  snapshot.files[REL] = {
    source: "campaign",
    filename: REL.split("/").pop(),
    checksum: sha256(APPLIED),
    applied_at: "2026-09-22T17:19:39.000Z",
  };

  const results = [];
  const check = (name, expectRefused, refusals) => {
    const refused = refusals.length > 0;
    const pass = refused === expectRefused;
    results.push({ name, pass, expectRefused, refused, refusals });
    return pass;
  };

  // RED-1 — the KNOB-GUARD case itself: a lane edits a ledgered campaign file.
  check("RED-1 edited ledgered file is refused", true, judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, null));
  // RED-2 — deleting one is the same class of edit to frozen history.
  check("RED-2 deleted ledgered file is refused", true, judge([{ relPath: REL, bytes: null }], snapshot, null));
  // RED-3 — a trailer naming the RIGHT path but the WRONG bytes launders nothing.
  check(
    "RED-3 trailer for other bytes is refused",
    true,
    judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, `x\n\n${trailerLine(REL, sha256("something else"))}\n`),
  );
  // RED-4 — a trailer naming the right bytes but a DIFFERENT path launders nothing.
  check(
    "RED-4 trailer for another path is refused",
    true,
    judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, `x\n\n${trailerLine(NEW_REL, sha256(EDITED))}\n`),
  );
  // GREEN-1 — untouched bytes.
  check("GREEN-1 byte-identical file passes", false, judge([{ relPath: REL, bytes: Buffer.from(APPLIED) }], snapshot, null));
  // GREEN-2 — a NEW campaign file production has never seen is a lane's to write.
  check("GREEN-2 new campaign file passes", false, judge([{ relPath: NEW_REL, bytes: Buffer.from(EDITED) }], snapshot, null));
  // GREEN-3 — the runner's trailer, exact path and exact new bytes.
  check(
    "GREEN-3 runner trailer passes",
    false,
    judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, `amend\n\n${trailerLine(REL, sha256(EDITED))}\n`),
  );
  // GREEN-4 — a file OUTSIDE the guarded dirs is never this guard's business.
  check(
    "GREEN-4 ordinary migration is out of scope",
    false,
    judge([{ relPath: "migrations/ordinary.sql", bytes: Buffer.from(EDITED) }], { files: { "migrations/ordinary.sql": snapshot.files[REL] } }, null),
  );
  // GREEN-5 — the refusal says the one sentence, verbatim.
  const text = formatRefusals(judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, null), { where: "t" });
  results.push({
    name: "GREEN-5 refusal prints the sentence verbatim",
    pass: text.includes(REFUSAL_SENTENCE),
  });
  // RED-5 / GREEN-7 — THE GRANDFATHER LIST IS BYTES, NOT A NAME. The eight files that
  // predate this lock pass at EXACTLY the bytes frozen with them, and the next edit to one
  // of them is refused like any other. Proven on a REAL entry, not a fixture.
  const gfPath = Object.keys(GRANDFATHERED)[0];
  if (gfPath) {
    const gf = GRANDFATHERED[gfPath];
    const gfSnap = emptySnapshot();
    gfSnap.files[gfPath] = {
      source: "campaign",
      filename: gfPath.split("/").pop(),
      checksum: gf.ledgered,
      applied_at: gf.applied_at,
    };
    const frozen = existsSync(join(REPO_ROOT, gfPath)) ? readFileSync(join(REPO_ROOT, gfPath)) : null;
    results.push({
      name: `GREEN-7 grandfathered file at its frozen bytes passes (${gfPath.split("/").pop()})`,
      pass: frozen !== null && sha256(frozen) === gf.tree && judge([{ relPath: gfPath, bytes: frozen }], gfSnap, null).length === 0,
    });
    check(
      "RED-5 a FURTHER edit to a grandfathered file is refused",
      true,
      judge([{ relPath: gfPath, bytes: Buffer.concat([frozen ?? Buffer.alloc(0), Buffer.from("\n-- one more edit\n")]) }], gfSnap, null),
    );
  }

  // GREEN-8 / RED-6 — A REBASED ROW (lane LEDGER-REBASE, `db:apply --ledger-rebase`). The
  // runner moves the production row AND this snapshot onto the file's committed bytes after the
  // dev clone proved they change nothing, and shrinks the grandfather list. The guard must take
  // the rebased row at those bytes with NO grandfather entry and NO trailer — and a further
  // edit after the rebase is refused like any other, even while a stale grandfather entry for
  // the lost bytes is still on disk. Proven on a REAL grandfathered file.
  if (gfPath) {
    const gf = GRANDFATHERED[gfPath];
    const bytes = existsSync(join(REPO_ROOT, gfPath)) ? readFileSync(join(REPO_ROOT, gfPath)) : null;
    const rebasedSnap = emptySnapshot();
    rebasedSnap.files[gfPath] = {
      source: "campaign",
      filename: gfPath.split("/").pop(),
      checksum: bytes ? sha256(bytes) : "",
      applied_at: gf.applied_at,
    };
    results.push({
      name: `GREEN-8 a rebased row at the committed bytes passes with no trailer (${gfPath.split("/").pop()})`,
      pass: bytes !== null && judge([{ relPath: gfPath, bytes }], rebasedSnap, null).length === 0,
    });
    check(
      "RED-6 a FURTHER edit after a rebase is refused",
      true,
      judge([{ relPath: gfPath, bytes: Buffer.concat([bytes ?? Buffer.alloc(0), Buffer.from("\n-- after the rebase\n")]) }], rebasedSnap, null),
    );
  }

  // GREEN-9 / RED-7 — the `ledger-rebase:` trailer `db:apply --ledger-rebase` writes when a
  // corrected INVERSE lands in its file (chair ruling 2026-09-23): honoured for the exact path
  // and bytes, and laundering nothing for any other path.
  check(
    "GREEN-9 the runner's ledger-rebase trailer passes",
    false,
    judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, `x\n\n${rebaseTrailerLine(REL, sha256(EDITED))}\n`),
  );
  check(
    "RED-7 a ledger-rebase trailer for another path is refused",
    true,
    judge([{ relPath: REL, bytes: Buffer.from(EDITED) }], snapshot, `x\n\n${rebaseTrailerLine(NEW_REL, sha256(EDITED))}\n`),
  );

  // GREEN-6 — an UNREADABLE snapshot refuses instead of passing.
  writeFileSync(join(dir, "migrations", "LEDGER.json"), "{ not json");
  const unreadable = readSnapshot(join(dir, "migrations", "LEDGER.json"));
  results.push({ name: "GREEN-6 unreadable snapshot is a refusal", pass: unreadable.ok === false });

  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? "  ok  " : "  FAIL"}  ${r.name}`);
  }
  console.log(
    failed === 0
      ? `[OK] check:ledgered-files-unedited self-test — ${results.length}/${results.length} clauses.`
      : `[FAIL] ${failed} of ${results.length} clauses failed.`,
  );
  console.log(`      scratch: ${dir}`);
  return failed === 0 ? 0 : 1;
}

const cwd = valueOf("--root") ? resolve(valueOf("--root")) : REPO_ROOT;
let code;
if (has("--self-test")) code = selfTest();
else if (has("--staged")) code = runStaged(cwd, valueOf("--message-file"));
else code = runGate(cwd);
process.exit(code);
