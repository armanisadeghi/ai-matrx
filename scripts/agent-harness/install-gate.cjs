'use strict';
//
// install-gate.cjs — the gate that actually runs BEFORE pnpm relinks
// node_modules in this shared checkout.
//
// WHY THIS FILE EXISTS (measured 2026-09-12, pnpm 10.29.2):
//   The first version of this guard was wired as the root package.json
//   "preinstall" script. It does not work, and here is the proof. In a throwaway
//   fixture with `"preinstall": "exit 1"`:
//
//     $ rm -rf node_modules && pnpm install
//     exit=1
//     node_modules exists: YES   (66 entries — every dependency linked)
//
//   pnpm runs the ROOT project's npm-compat lifecycle scripts (preinstall,
//   install, postinstall, prepare) AFTER resolution AND AFTER LINKING, as the
//   last phase of the install. A refusal there is a refusal after the damage.
//   Worse, three common commands never run it at all:
//
//     pnpm install                 -> preinstall RAN
//     pnpm update                  -> preinstall RAN
//     pnpm add <pkg>               -> preinstall DID NOT RUN
//     pnpm remove <pkg>            -> preinstall DID NOT RUN
//     pnpm install --ignore-scripts-> preinstall DID NOT RUN
//     (up-to-date + --frozen-lockfile short-circuits it too)
//
//   `.pnpmfile.cjs` is the mechanism that ALWAYS runs, and always first. Same
//   fixture, a pnpmfile that logs whether a package is still linked:
//
//     pnpm install                    -> PNPMFILE_TOPLEVEL is-even_present=true
//     pnpm add / remove / update      -> PNPMFILE_TOPLEVEL is-even_present=true
//     pnpm install --ignore-scripts   -> PNPMFILE_TOPLEVEL is-even_present=true
//
//   `pnpm remove is-even` still saw is-even linked when the pnpmfile loaded:
//   the pnpmfile is read while assembling the install context, before a single
//   symlink moves. That is where a refusal is still free.
//
// WHAT THE GATE DOES, in order:
//   1. Ignores every pnpm command that cannot move a symlink (run, exec, list,
//      --lockfile-only, ...).
//   2. Refuses while this checkout's shared preview lease is live, with the
//      remedy. Override: MATRX_ALLOW_INSTALL_WITH_PREVIEW=1.
//   3. Serialises installs across the sessions that share this checkout: one
//      install at a time, the second waits, then refuses naming the first's pid.
//
// THE INCIDENT (2026-09-12, three times): a `pnpm install` in this shared
// checkout relinked @ai-matrx/design-system while the :3001 preview was
// compiling. 1,268 files import it, so Turbopack reported module-not-found for
// all of them with full import traces — 3,565,305 trace lines, ~460 MB in one
// compile's issue set. Next serialises that to every HMR client with
// JSON.stringify; past V8's ~512 MB string limit it throws RangeError from a
// socket callback, an uncaughtException, and the dev server exits. Every agent
// signed in to :3001 lost its surface. Two of those three deaths had a second
// `pnpm install --prefer-offline` running concurrently, which is why step 3
// exists as well as step 2.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR =
  process.env.MATRX_PREVIEW_STATE_DIR ||
  path.join(process.env.TMPDIR || '/tmp', `matrx-frontend-preview-${process.getuid ? process.getuid() : 0}`);
const PREVIEW_META = path.join(STATE_DIR, 'shared-next-dev.meta');

// A git-ignored directory that survives `rm -rf node_modules` (the lock must
// outlive the very thing an install destroys). It ignores itself so the shared
// checkout's root .gitignore — edited by whichever session is mid-task — is
// never a dependency of this guard working.
const LOCK_DIR = path.join(REPO_ROOT, '.matrx-harness');
const LOCK_FILE = path.join(LOCK_DIR, 'install.lock');

const WAIT_SEC = Number(process.env.MATRX_INSTALL_LOCK_WAIT_SEC || 600);

// pnpm subcommands that can add, remove, or relink anything under node_modules.
const MUTATING = new Set([
  'install', 'i', 'add', 'update', 'up', 'upgrade', 'remove', 'rm', 'uninstall',
  'un', 'link', 'ln', 'unlink', 'import', 'dedupe', 'prune', 'rebuild', 'rb',
  'patch', 'patch-commit', 'patch-remove', 'fetch', 'deploy',
]);

function say(line) {
  process.stderr.write(`[install-gate] ${line}\n`);
}

function argvWords() {
  // pnpm may hand the pnpmfile a single joined argument or separate ones;
  // measured both. Flatten, then split, so either shape parses.
  return process.argv.slice(2).join(' ').trim().split(/\s+/).filter(Boolean);
}

function mutatingCommand() {
  const words = argvWords();
  if (words.length === 0) return null;
  // `--lockfile-only` resolves and rewrites pnpm-lock.yaml without touching
  // node_modules — measured: node_modules mtime unchanged. Always allowed, and
  // it is the safe way to refresh the lockfile while the preview is live.
  if (words.some((w) => w === '--lockfile-only' || w === '--resolution-only' || w === '-h' || w === '--help')) {
    return null;
  }
  const command = words.find((w) => !w.startsWith('-'));
  if (!command || !MUTATING.has(command)) return null;
  return words.join(' ');
}

function metaValue(file, key) {
  try {
    const line = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : '';
  } catch {
    return '';
  }
}

// macOS reaches the same directory as both /var/... and /private/var/..., and a
// checkout may be behind a symlink. Compare what the filesystem actually points
// at, never the spelling.
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function alive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function refuse(lines) {
  process.stderr.write('\n');
  say('============================================================');
  for (const line of lines) say(line);
  say('============================================================');
  process.stderr.write('\n');
  process.exit(1);
}

// ---------------------------------------------------------------- preview lease
function checkPreviewLease(command) {
  if (!fs.existsSync(PREVIEW_META)) return;
  const pid = metaValue(PREVIEW_META, 'PID');
  const root = metaValue(PREVIEW_META, 'ROOT');
  const port = metaValue(PREVIEW_META, 'PORT') || '3001';
  if (!alive(pid)) return;            // a dead lease must never block an install
  if (real(root) !== real(REPO_ROOT)) return; // another checkout's preview, another node_modules

  if (process.env.MATRX_ALLOW_INSTALL_WITH_PREVIEW) {
    process.stderr.write('\n');
    say(`OVERRIDE IN FORCE — running "pnpm ${command}" with the preview live.`);
    say(`The dev server on port ${port} (pid ${pid}) may die with`);
    say('"RangeError: Invalid string length" while packages relink, and every');
    say('agent signed in to it loses its session.');
    process.stderr.write('\n');
    return;
  }

  refuse([
    'INSTALL REFUSED — the shared preview is running right now.',
    '',
    `Command: pnpm ${command}`,
    `Preview: port ${port}, pid ${pid}, this checkout.`,
    '',
    'Relinking node_modules under a compiling Turbopack server floods it with',
    'module-not-found traces (~460 MB measured) and kills it. Everyone on',
    `http://localhost:${port} loses their session.`,
    '',
    'What to do instead:',
    '  1. Tell whoever owns the preview you need to install.',
    '  2. pnpm preview:stop',
    `  3. pnpm ${command}`,
    '  4. pnpm preview:start',
    '',
    'To refresh only the lockfile (safe while the preview runs):',
    '  pnpm install --lockfile-only',
    '',
    'To accept the risk anyway:',
    `  MATRX_ALLOW_INSTALL_WITH_PREVIEW=1 pnpm ${command}`,
  ]);
}

// ------------------------------------------------------------- install serialiser
function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function releaseLock() {
  const held = readLock();
  if (held && held.pid === process.pid) {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {
      /* already gone */
    }
  }
}

function tryClaim(command) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const selfIgnore = path.join(LOCK_DIR, '.gitignore');
  if (!fs.existsSync(selfIgnore)) fs.writeFileSync(selfIgnore, '*\n');
  // Write the whole record FIRST, then link it into place. `open(…, 'wx')`
  // followed by `write` leaves a window in which the lock exists but is empty,
  // and a competing install that reads it in that window reads `null`, calls it
  // stale, deletes it and claims the lock the first process is already holding.
  // Measured: two `pnpm install` runs both entered in the same millisecond.
  // `link()` is atomic and the file is complete the instant it appears.
  const staging = `${LOCK_FILE}.${process.pid}`;
  fs.writeFileSync(
    staging,
    JSON.stringify({ pid: process.pid, command, startedAt: new Date().toISOString() }, null, 2),
  );
  try {
    fs.linkSync(staging, LOCK_FILE);
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return false;
  } finally {
    try {
      fs.unlinkSync(staging);
    } catch {
      /* nothing to clean */
    }
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function serialiseInstall(command) {
  const deadline = Date.now() + WAIT_SEC * 1000;
  let announced = false;
  let unreadableSince = 0;

  for (;;) {
    if (tryClaim(command)) break;

    const held = readLock();
    if (!held || !alive(held.pid)) {
      // The holder died without releasing. Steal the lock rather than block
      // every future install on a corpse — but never on the first read: an
      // unreadable lock is also what a half-written one looks like. Only a lock
      // that still reads dead after a full second is actually abandoned.
      if (!unreadableSince) {
        unreadableSince = Date.now();
      } else if (Date.now() - unreadableSince > 1000) {
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch {
          /* someone else cleaned it first */
        }
        unreadableSince = 0;
      }
      sleepSync(200);
      continue;
    }
    unreadableSince = 0;

    if (!announced) {
      announced = true;
      say(`WAITING — another install is running in this checkout: pid ${held.pid} ("pnpm ${held.command}", started ${held.startedAt}).`);
      say(`Two installs relinking node_modules at once is what leaves it momentarily empty. Waiting up to ${WAIT_SEC}s.`);
    }

    if (Date.now() > deadline) {
      refuse([
        'INSTALL REFUSED — another install is still running in this checkout.',
        '',
        `Holder: pid ${held.pid}, "pnpm ${held.command}", started ${held.startedAt}.`,
        `This install waited ${WAIT_SEC}s and gave up rather than relink node_modules underneath it.`,
        '',
        'What to do:',
        `  1. Wait for pid ${held.pid} to finish, then run your install again.`,
        `  2. If that pid is gone, delete the stale lock: rm ${LOCK_FILE}`,
        '',
        `To wait longer: MATRX_INSTALL_LOCK_WAIT_SEC=1800 pnpm ${command}`,
      ]);
    }
    sleepSync(500);
  }

  process.on('exit', releaseLock);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      releaseLock();
      process.exit(1);
    });
  }
}

function run() {
  const command = mutatingCommand();
  if (!command) return;
  if (process.env.MATRX_INSTALL_GATE_DISABLE) return;
  checkPreviewLease(command);
  serialiseInstall(command);
}

module.exports = { run, mutatingCommand, LOCK_FILE, LOCK_DIR, PREVIEW_META, REPO_ROOT };
