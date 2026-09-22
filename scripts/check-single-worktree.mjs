#!/usr/bin/env node
/**
 * check-single-worktree — every repo holds exactly ONE worktree (the checkout
 * itself) and exactly ONE local branch (main).
 *
 * THE STANDING ORDER. Arman, 2026-09-20: "there is no reason for ever having a
 * worktree… Branches are ok for remote but not for local. They're forbidden."
 * The shared checkout on main is the one source of truth; a release ships it
 * every ~20 minutes. A linked worktree or a local branch is work that is not on
 * main — invisible to the release, to every other session, and to the next
 * reboot (`/private/tmp` is wiped).
 *
 * THE FAILURE THIS GUARDS. On 2026-09-20 a unify-main pass removed six
 * worktrees from matrx-frontend and watched local tooling spawn five more in 40
 * minutes: the shared-checkout guard hook RECOMMENDED `git worktree add --detach
 * "$(mktemp -d)"` in six of its remedy strings, an older git-disaster-recovery
 * skill opened "intake" worktrees on a loop, build-lab and the janitor's own
 * self-test registered theirs, and two aidream services did the same for every
 * scan. Each generator has been converted to `git archive <sha> | tar -x`
 * (a plain export git registers nowhere) or to a synthetic throwaway repo. This
 * guard is what keeps the class closed: it asks git, in every repo, and fails
 * the release while any extra entry exists.
 *
 * WHAT IT DOES NOT DO. It never deletes anything — nothing is ever lost. The
 * remedy for a worktree that holds work is to land that work on main; the sweep
 * for the ones that hold nothing is `pnpm worktree:janitor`.
 *
 *   node scripts/check-single-worktree.mjs                 # this repo + every sibling Matrx repo
 *   node scripts/check-single-worktree.mjs --repo <path>   # only the named repo(s), repeatable
 *   node scripts/check-single-worktree.mjs --self-test     # prove it can fail
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.dirname(ROOT);

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Worktree paths from `git worktree list --porcelain` output. */
export function worktreePaths(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

/** Local branch names from `git for-each-ref refs/heads` output. */
export function localBranches(refList) {
  return refList.split("\n").map((line) => line.trim()).filter(Boolean);
}

/**
 * The offences in one repo: every registered worktree beyond the checkout
 * itself, and every local branch other than `main`. Empty means clean.
 */
export function judgeRepo(repoDir) {
  const top = path.resolve(git(repoDir, ["rev-parse", "--show-toplevel"]).trim());
  const worktrees = worktreePaths(git(repoDir, ["worktree", "list", "--porcelain"]));
  const branches = localBranches(git(repoDir, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"]));
  const offences = [];
  for (const wt of worktrees) {
    if (path.resolve(wt) !== top) offences.push(`extra worktree ${wt}`);
  }
  for (const branch of branches) {
    if (branch !== "main") offences.push(`local branch ${branch}`);
  }
  return { top, worktrees: worktrees.length, branches: branches.length, offences };
}

/**
 * The AI Matrx repos the workspace root CLAUDE.md names (plus the agent plugins,
 * which carry the shared-checkout guard hook). Any other folder beside them is
 * "unrelated scratch" by that file's own words — a WordPress client repo with a
 * `staging` branch is not this platform's business and must not fail its
 * release. Name a repo explicitly with --repo to judge anything else.
 */
const MATRX_REPOS = [
  "matrx-frontend",
  "aidream",
  "common-docs",
  "matrx-sandbox",
  "matrx-extend",
  "matrx-local",
  "matrx-ship",
  "matrx-claude-plugin",
  "matrx-codex-plugin",
  "matrx-cursor-plugin",
];

/** This repo first, then every named sibling that is checked out on this machine. */
function siblingRepos() {
  const found = new Set([ROOT]);
  for (const name of MATRX_REPOS) {
    const dir = path.join(WORKSPACE, name);
    if (fs.existsSync(path.join(dir, ".git"))) found.add(dir);
  }
  return [...found];
}

function report(repos) {
  let failed = 0;
  for (const repo of repos) {
    let verdict;
    try {
      verdict = judgeRepo(repo);
    } catch (error) {
      console.log(`[FAIL] ${repo}: git could not answer (${String(error.message || error).split("\n")[0]})`);
      failed += 1;
      continue;
    }
    if (verdict.offences.length === 0) {
      console.log(`[OK]   ${path.basename(verdict.top)}: 1 worktree, 1 local branch`);
      continue;
    }
    failed += 1;
    console.log(`[FAIL] ${verdict.top}: ${verdict.worktrees} worktree(s), ${verdict.branches} local branch(es)`);
    for (const offence of verdict.offences) console.log(`         ${offence}`);
  }
  if (failed) {
    console.log("");
    console.log("EXTRA WORKTREES OR LOCAL BRANCHES — the standing order (Arman 2026-09-20) is exactly one of each per repo.");
    console.log("Nothing was deleted. Land any work they hold on main (commit + push), then `pnpm worktree:janitor` sweeps");
    console.log("the empty ones; whatever still creates them is a defect to convert to `git archive <sha> | tar -x`.");
  }
  return failed === 0;
}

/**
 * The guard must be able to fail: build a throwaway repo, prove it passes
 * clean, then register a linked worktree and a local branch and prove BOTH are
 * caught, by name. Never touches a real repo.
 */
function selfTest() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "single-worktree-selftest-"));
  const primary = path.join(base, "primary");
  const linked = path.join(base, "linked");
  const failures = [];
  try {
    fs.mkdirSync(primary);
    git(primary, ["init", "-q", "-b", "main"]);
    git(primary, ["config", "user.email", "self-test@example.invalid"]);
    git(primary, ["config", "user.name", "self-test"]);
    fs.writeFileSync(path.join(primary, "README.md"), "synthetic\n");
    git(primary, ["add", "README.md"]);
    git(primary, ["commit", "-q", "-m", "synthetic main"]);

    const clean = judgeRepo(primary);
    if (clean.offences.length !== 0) failures.push(`a clean repo was judged dirty: ${clean.offences.join("; ")}`);

    git(primary, ["worktree", "add", "-q", "--detach", linked, "HEAD"]);
    git(primary, ["branch", "scratch-branch"]);
    const dirty = judgeRepo(primary);
    if (!dirty.offences.some((o) => o.includes("extra worktree") && o.includes(path.basename(linked)))) {
      failures.push(`the linked worktree was not caught: ${dirty.offences.join("; ")}`);
    }
    if (!dirty.offences.includes("local branch scratch-branch")) {
      failures.push(`the local branch was not caught: ${dirty.offences.join("; ")}`);
    }

    // The fixtures must never have registered in THIS repo.
    const here = judgeRepo(ROOT);
    if (here.offences.some((o) => o.includes(base))) failures.push("a fixture registered itself in the real repo");
  } catch (error) {
    failures.push(`self-test crashed: ${String(error.stack || error)}`);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
  if (failures.length) {
    for (const f of failures) console.log(`SELF-TEST FAIL: ${f}`);
    return false;
  }
  console.log("SELF-TEST PASS: a clean repo passes; a linked worktree and a local branch are each caught by name.");
  return true;
}

function main(argv) {
  const repos = [];
  let selfTestMode = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--self-test") selfTestMode = true;
    else if (argv[i] === "--repo") repos.push(path.resolve(argv[++i]));
    else {
      console.error(`unknown argument ${argv[i]}`);
      return 2;
    }
  }
  if (selfTestMode) return selfTest() ? 0 : 1;
  return report(repos.length ? repos : siblingRepos()) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
