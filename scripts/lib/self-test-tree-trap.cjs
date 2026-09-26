/**
 * THE SELF-TEST TREE TRAP — a `--require` preload that watches every filesystem write a process
 * (and every Node child it spawns, through NODE_OPTIONS) makes, and names the ones that land in
 * THIS checkout's source tree.
 *
 * Why it exists: ~20 check self-tests used to plant their RED fixtures straight into features/,
 * app/, lib/ … and delete them afterwards. `scripts/checks/run.mjs` runs checks six at a time, so
 * while a fixture sat in the real tree every OTHER scanner saw it — reporting it as a real finding,
 * or crashing with ENOENT when it vanished mid-scan (`check:unwired`, 2026-09-25) — and a
 * concurrent `git add` sweep of this shared checkout could commit it. A self-test plants in
 * memory or in a private `mkdtempSync(join(tmpdir(), …))` directory and points the check there.
 *
 * Used by `scripts/check-self-tests-stay-out-of-tree.ts --dynamic` (the census). Environment:
 *   SELF_TEST_TREE_TRAP_ROOT  the checkout to protect (required; the trap is inert without it)
 *   SELF_TEST_TREE_TRAP_LOG   file each offending write is appended to, one JSON line each
 *
 * What counts as "the tree": any path under ROOT that is not under an ignored scratch directory
 * (tmp/, node_modules/, .next/, .git/, .wt/, coverage/). The guard filters the log once more with
 * `git check-ignore`, so a gitignored build artifact is never a finding.
 */
"use strict";

const ROOT = process.env.SELF_TEST_TREE_TRAP_ROOT;
const LOG = process.env.SELF_TEST_TREE_TRAP_LOG;

if (ROOT && LOG) {
  const fs = require("node:fs");
  const path = require("node:path");
  const { syncBuiltinESMExports } = require("node:module");

  // Opened BEFORE patching and written with writeSync (never patched): appendFileSync goes
  // through the exported fs.writeFileSync internally, so logging with it would trap itself.
  const logFd = fs.openSync(LOG, "a");
  const append = (line) => fs.writeSync(logFd, line);
  const SCRATCH = ["tmp", "node_modules", ".next", ".git", ".wt", "coverage", ".turbo"];
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

  const toPath = (target) => {
    if (target == null) return null;
    if (typeof target === "number") return null; // a file descriptor — already opened
    if (target instanceof URL) return require("node:url").fileURLToPath(target);
    if (Buffer.isBuffer(target)) return target.toString();
    return typeof target === "string" ? target : null;
  };

  const record = (op, target) => {
    const raw = toPath(target);
    if (!raw) return;
    const abs = path.resolve(raw);
    if (!abs.startsWith(rootWithSep)) return;
    const rel = abs.slice(rootWithSep.length);
    const top = rel.split(path.sep)[0];
    if (SCRATCH.includes(top)) return;
    try {
      append(JSON.stringify({ op, path: rel, pid: process.pid, argv: process.argv.slice(1, 3) }) + "\n");
    } catch (err) {
      process.stderr.write(`[self-test-tree-trap] could not record ${op}(${rel}): ${err}\n`);
    }
  };

  const WRITE_FLAGS = /[wa+]/;
  const wrap = (holder, name, argIndex, decide) => {
    const original = holder[name];
    if (typeof original !== "function") return;
    holder[name] = function trapped(...args) {
      if (!decide || decide(args)) record(name, args[argIndex]);
      return original.apply(this, args);
    };
  };

  const writesByFlag = (flagIndex, defaultWrites) => (args) => {
    const flag = args[flagIndex];
    if (typeof flag === "string") return WRITE_FLAGS.test(flag);
    if (typeof flag === "number") return (flag & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) !== 0;
    if (flag && typeof flag === "object" && typeof flag.flags === "string") return WRITE_FLAGS.test(flag.flags);
    return defaultWrites;
  };

  for (const holder of [fs, fs.promises]) {
    wrap(holder, holder === fs ? "writeFileSync" : "writeFile", 0);
    wrap(holder, holder === fs ? "appendFileSync" : "appendFile", 0);
    wrap(holder, holder === fs ? "mkdirSync" : "mkdir", 0);
    wrap(holder, holder === fs ? "copyFileSync" : "copyFile", 1);
    wrap(holder, holder === fs ? "cpSync" : "cp", 1);
    wrap(holder, holder === fs ? "renameSync" : "rename", 1);
    wrap(holder, holder === fs ? "symlinkSync" : "symlink", 1);
    wrap(holder, holder === fs ? "openSync" : "open", 0, writesByFlag(1, false));
  }
  wrap(fs, "writeFile", 0);
  wrap(fs, "appendFile", 0);
  wrap(fs, "mkdir", 0);
  wrap(fs, "copyFile", 1);
  wrap(fs, "cp", 1);
  wrap(fs, "rename", 1);
  wrap(fs, "symlink", 1);
  wrap(fs, "open", 0, writesByFlag(1, false));
  wrap(fs, "createWriteStream", 0);

  // ESM `import { writeFileSync } from "node:fs"` binds to a snapshot; this re-points it.
  syncBuiltinESMExports();
}
