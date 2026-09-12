#!/usr/bin/env node
/**
 * check-dependency-dirs-untracked — `node_modules` must never be tracked, in
 * ANY shape, at ANY depth.
 *
 * THE FAILURE THIS GUARDS. A self-referencing SYMLINK named `node_modules`
 * (mode 120000) was committed to main THREE times — 2026-08-11, 2026-08-31 and
 * 2026-09-11. Every `git pull`/`merge` that brings that tree into a checkout
 * replaces the real dependency directory with the broken link, and every node
 * or pnpm command then dies with `ELOOP: too many symbolic links encountered`
 * until someone deletes the link and reinstalls.
 *
 * WHY IT KEPT COMING BACK. `.gitignore` said `node_modules/`. A trailing slash
 * matches DIRECTORIES ONLY, and a symlink is not a directory — so once a
 * checkout's `node_modules` had become a link, any broad `git add -A` staged it
 * again. The slashless rule that closes it was added on 2026-09-11 23:54 and
 * deleted three minutes later by a session "keeping the dependency ignore
 * canonical": beside `node_modules/`, a bare `node_modules` reads like a
 * harmless duplicate. So this guard checks BEHAVIOUR, not text — it builds real
 * symlinks in a throwaway repository and asks git whether the repo's actual
 * `.gitignore` blocks them. Rewording the rule is fine; weakening it fails.
 *
 * It never touches the checkout's own `node_modules` — this is a shared
 * checkout, and swapping that directory for a link would break every session
 * using it.
 *
 *   node scripts/check-dependency-dirs-untracked.mjs              # check
 *   node scripts/check-dependency-dirs-untracked.mjs --self-test  # prove it can fail
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Symlink shapes that must be ignored: the root link and a nested package's. */
const PROBES = ["node_modules", "packages/example/node_modules"];

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Tracked paths that are, or sit inside, a `node_modules` segment. */
export function trackedDependencyPaths(lsFilesOutput) {
  return lsFilesOutput
    .split("\n")
    .filter(Boolean)
    .filter((p) => p.split("/").includes("node_modules"));
}

/**
 * Which probe symlinks the given `.gitignore` text FAILS to ignore. Runs in a
 * fresh temp repo so the answer reflects the rule, not this checkout's state.
 */
export function unignoredSymlinkProbes(gitignoreText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dep-dirs-untracked-"));
  try {
    git(dir, ["init", "-q"]);
    fs.writeFileSync(path.join(dir, ".gitignore"), gitignoreText);
    for (const probe of PROBES) {
      const link = path.join(dir, probe);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(link, link);
    }
    return PROBES.filter((probe) => {
      try {
        git(dir, ["check-ignore", "-q", probe]);
        return false;
      } catch {
        return true;
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  const broken = [];
  if (trackedDependencyPaths("src/a.ts\nnode_modules\n").length !== 1) {
    broken.push("a tracked root `node_modules` symlink was NOT reported");
  }
  if (trackedDependencyPaths("packages/x/node_modules/y/index.js\n").length !== 1) {
    broken.push("a tracked file under a nested `node_modules` was NOT reported");
  }
  if (trackedDependencyPaths("src/node_modules_helper.ts\ndocs/node_modules.md\n").length !== 0) {
    broken.push("a path merely CONTAINING the word node_modules was reported");
  }
  if (unignoredSymlinkProbes("node_modules/\n").length === 0) {
    broken.push("the slash-only `node_modules/` rule was accepted — it does NOT block a symlink");
  }
  if (unignoredSymlinkProbes("/node_modules\n").join() !== "packages/example/node_modules") {
    broken.push("a root-anchored `/node_modules` rule was not reported as missing the nested link");
  }
  if (unignoredSymlinkProbes("node_modules\n").length !== 0) {
    broken.push("the correct slashless `node_modules` rule was reported as broken");
  }
  if (broken.length) {
    console.error(`check-dependency-dirs-untracked self-test FAILED:\n  - ${broken.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("check-dependency-dirs-untracked self-test PASSED (it can fail) — tracked links and weak ignore rules are both caught.");
  process.exit(0);
}

const failures = [];

const tracked = trackedDependencyPaths(git(ROOT, ["ls-files"]));
if (tracked.length) {
  failures.push(
    `node_modules is TRACKED (${tracked.length} path(s), first: ${tracked[0]}). A tracked symlink here replaces ` +
      "every checkout's dependencies with a broken link on the next pull.\n" +
      "    fix: git rm --cached <path> and commit that removal on its own.",
  );
}

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
const missed = unignoredSymlinkProbes(gitignore);
if (missed.length) {
  failures.push(
    `.gitignore does not block a SYMLINK at: ${missed.join(", ")}. A trailing-slash rule (\`node_modules/\`) matches ` +
      "directories only, so a link is staged by the next `git add -A`.\n" +
      "    fix: use the slashless rule `node_modules` (matches a directory OR a link, at any depth).",
  );
}

if (failures.length) {
  console.error(`❌ check-dependency-dirs-untracked:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("✅ check-dependency-dirs-untracked: nothing under node_modules is tracked, and .gitignore blocks a node_modules symlink at the root and nested.");
