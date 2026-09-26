/**
 * The files THIS checkout holds, as git sees them — the one file list a repo-wide check walks.
 *
 * Why not readdirSync from the root: the checkout carries gitignored scratch that is not this
 * repo. `work/aidream` is a SYMLINK to the whole aidream checkout, and `statSync` follows it, so
 * a hand-rolled walker (2026-09-25) scanned aidream's migrations and generated API types and
 * reported them as this repo's findings (`access-guard-check`: "work/aidream/db/migrations/…",
 * `visibility-vocabulary`: "work/aidream/aidream/api/generated/api-types.ts"), and
 * `check:retired-db-ref` took 5m51s alone and timed out at 900 s on every release run.
 *
 * `git ls-files --cached --others --exclude-standard` answers in ~0.3 s: tracked files plus
 * untracked files that are not ignored, minus tracked files deleted from the working tree. It
 * never descends a symlink. If git cannot answer, this THROWS — a check must report itself
 * UNMEASURED, never scan nothing and print green.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const REPO_ROOT = resolve(__dirname, "..", "..");

function gitList(root: string, args: string[]): string[] {
  const listed = spawnSync("git", ["ls-files", "-z", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (listed.status !== 0) {
    throw new Error(`git ls-files ${args.join(" ")} failed in ${root}: ${(listed.stderr || String(listed.error ?? "")).trim()}`);
  }
  return listed.stdout.split("\0").filter(Boolean);
}

export interface RepoFilesOptions {
  /** Keep only files under these repo-relative directories (e.g. ["app", "features"]). */
  under?: string[];
  /** Keep only files whose path matches. */
  match?: RegExp;
}

/** Repo-relative POSIX paths, sorted. */
export function repoFiles(root: string = REPO_ROOT, options: RepoFilesOptions = {}): string[] {
  const deleted = new Set(gitList(root, ["--deleted"]));
  const prefixes = options.under?.map((dir) => `${dir.replace(/\/+$/, "")}/`);
  const files = new Set<string>();
  for (const rel of gitList(root, ["--cached", "--others", "--exclude-standard"])) {
    if (deleted.has(rel)) continue;
    if (prefixes && !prefixes.some((p) => rel.startsWith(p))) continue;
    if (options.match && !options.match.test(rel)) continue;
    files.add(rel);
  }
  return [...files].sort();
}
