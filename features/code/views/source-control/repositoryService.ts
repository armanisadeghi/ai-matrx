import type { ProcessResult } from "../../types";
import type { ProcessAdapter } from "../../adapters/ProcessAdapter";

const DEFAULT_SCAN_LIMIT = 24;

export interface RepositoryRemote {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export interface RepositoryBranch {
  name: string;
  current: boolean;
  upstream: string | null;
}

/** Git metadata for a selected checkout. `gitDir` can point outside the work
 * tree for a linked worktree, while `commonGitDir` names its shared store. */
export interface RepositoryMetadata {
  rootPath: string;
  gitDir: string;
  commonGitDir: string;
  branch: string | null;
  headSha: string | null;
  upstream: string | null;
  remotes: RepositoryRemote[];
  branches: RepositoryBranch[];
}

export interface RepositoryScanOptions {
  /** Bound nested discovery to avoid turning a workspace scan into a crawl. */
  maxResults?: number;
}

function safeAbsolutePath(path: string): string {
  if (!path.startsWith("/") || path.includes("\0")) {
    throw new Error("Repository paths must be absolute and cannot contain NUL characters.");
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Repository paths cannot contain dot segments.");
  }
  return path.replace(/\/+$/, "") || "/";
}

function isWithinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Quotes one Git argument for the ProcessAdapter shell boundary. */
export function quoteRepositoryShellArgument(value: string): string {
  if (value.includes("\0")) throw new Error("Git arguments cannot contain NUL characters.");
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function commandForGit(cwd: string, args: readonly string[]): string {
  const safeCwd = safeAbsolutePath(cwd);
  return ["git", "-C", quoteRepositoryShellArgument(safeCwd), ...args.map(quoteRepositoryShellArgument)].join(" ");
}

function commandError(result: ProcessResult): Error {
  return new Error((result.stderr || result.stdout || "Git command failed.").trim());
}

/** Executes a structured Git argv array through the workspace ProcessAdapter.
 * Every dynamic argument is shell-quoted; callers still place `--` before
 * file paths for Git's option parser. */
export async function executeRepositoryGit(
  process: ProcessAdapter,
  cwd: string,
  args: readonly string[],
  options: { timeoutSec?: number } = {},
): Promise<ProcessResult> {
  const result = await process.exec(commandForGit(cwd, args), {
    cwd: safeAbsolutePath(cwd),
    timeoutSec: options.timeoutSec ?? 30,
  });
  if (result.exitCode !== 0) throw commandError(result);
  return result;
}

function nullableLine(result: ProcessResult): string | null {
  if (result.exitCode !== 0) return null;
  const value = result.stdout.trim();
  return value || null;
}

function redactRemoteUrl(value: string): string {
  return value.replace(/^(https?:\/\/)[^/@]*@/i, "$1***@");
}

function parseRemotes(output: string): RepositoryRemote[] {
  const byName = new Map<string, RepositoryRemote>();
  for (const line of output.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!match) continue;
    const [, name, url, direction] = match;
    const current = byName.get(name) ?? { name, fetchUrl: null, pushUrl: null };
    if (direction === "fetch") current.fetchUrl = redactRemoteUrl(url);
    else current.pushUrl = redactRemoteUrl(url);
    byName.set(name, current);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function parseBranches(output: string): RepositoryBranch[] {
  return output
    .split("\u001e")
    .filter(Boolean)
    .map((record) => {
      const [name = "", current = "", upstream = ""] = record
        .replace(/^[\r\n]+|[\r\n]+$/g, "")
        .split("\0");
      return { name, current: current === "*", upstream: upstream || null };
    })
    .filter((branch) => branch.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Inspects a repository at or above `path`; linked worktrees resolve through
 * Git itself instead of guessing whether `.git` is a directory or file. */
export async function inspectRepository(
  process: ProcessAdapter,
  path: string,
): Promise<RepositoryMetadata | null> {
  const requestedPath = safeAbsolutePath(path);
  const identity = await process.exec(
    commandForGit(requestedPath, [
      "rev-parse",
      "--path-format=absolute",
      "--show-toplevel",
      "--absolute-git-dir",
      "--git-common-dir",
    ]),
    { cwd: requestedPath, timeoutSec: 15 },
  );
  if (identity.exitCode !== 0) {
    if (/not a git repository/i.test(`${identity.stderr}\n${identity.stdout}`)) return null;
    throw commandError(identity);
  }
  const [rootPath, gitDir, commonGitDir] = identity.stdout
    .trim()
    .split("\n")
    .map(safeAbsolutePath);
  if (!rootPath || !gitDir || !commonGitDir) {
    throw new Error("Git did not return complete repository metadata.");
  }

  const [branchResult, headResult, upstreamResult, remotesResult, branchesResult] =
    await Promise.all([
      process.exec(commandForGit(rootPath, ["branch", "--show-current"]), { cwd: rootPath }),
      process.exec(commandForGit(rootPath, ["rev-parse", "--verify", "--quiet", "HEAD"]), { cwd: rootPath }),
      process.exec(commandForGit(rootPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]), { cwd: rootPath }),
      executeRepositoryGit(process, rootPath, ["remote", "-v"]),
      executeRepositoryGit(process, rootPath, ["for-each-ref", "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%1e", "refs/heads"]),
    ]);

  return {
    rootPath,
    gitDir,
    commonGitDir,
    branch: nullableLine(branchResult),
    headSha: nullableLine(headResult),
    upstream: nullableLine(upstreamResult),
    remotes: parseRemotes(remotesResult.stdout),
    branches: parseBranches(branchesResult.stdout),
  };
}

/** Finds nested repositories by their `.git` marker, including linked
 * worktree `.git` files. The scan is intentionally shallow (four levels) and
 * skips dependency/build trees; callers must describe that scope rather than
 * presenting the capped result set as a complete workspace inventory. */
export async function discoverRepositories(
  process: ProcessAdapter,
  startingPath: string,
  options: RepositoryScanOptions = {},
): Promise<RepositoryMetadata[]> {
  const root = safeAbsolutePath(startingPath);
  const maxResults = Math.min(Math.max(options.maxResults ?? DEFAULT_SCAN_LIMIT, 1), 100);
  const direct = await inspectRepository(process, root);
  const scan = await process.exec(
    `find ${quoteRepositoryShellArgument(root)} -xdev -maxdepth 4 \\( -type d -name .git -print0 -prune \\) -o \\( -type d \\( -name node_modules -o -name .next \\) -prune \\) -o \\( -type f -name .git -print0 \\)`,
    { cwd: root, timeoutSec: 30 },
  );
  if (scan.exitCode !== 0) throw commandError(scan);

  const candidates = scan.stdout
    .split("\0")
    .filter(Boolean)
    .map((marker) => safeAbsolutePath(marker.slice(0, marker.lastIndexOf("/"))));
  const inspected = await Promise.all(
    candidates.slice(0, maxResults).map((candidate) => inspectRepository(process, candidate)),
  );
  const byRoot = new Map<string, RepositoryMetadata>();
  if (direct) byRoot.set(direct.rootPath, direct);
  for (const repository of inspected) {
    if (repository) byRoot.set(repository.rootPath, repository);
  }
  return [...byRoot.values()].sort((a, b) => a.rootPath.localeCompare(b.rootPath));
}

/** Initializes a repository only under the active sandbox filesystem root. */
export async function initRepository(
  process: ProcessAdapter,
  path: string,
  workspaceRoot = process.cwd,
): Promise<RepositoryMetadata> {
  const target = safeAbsolutePath(path);
  const allowedRoot = safeAbsolutePath(workspaceRoot);
  if (!isWithinRoot(target, allowedRoot)) {
    throw new Error("Repository initialization must stay inside the active sandbox workspace.");
  }
  await executeRepositoryGit(process, allowedRoot, ["init", "--", target]);
  const repository = await inspectRepository(process, target);
  if (!repository) throw new Error("Git initialized the folder but it could not be inspected.");
  return repository;
}

/** Unstages paths without discarding content. Unborn repositories have no
 * HEAD, so their index is cleared with `git rm --cached` instead. */
export async function unstageRepositoryPaths(
  process: ProcessAdapter,
  rootPath: string,
  paths: readonly string[],
): Promise<void> {
  if (paths.length === 0) return;
  const root = safeAbsolutePath(rootPath);
  const head = await process.exec(commandForGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]), {
    cwd: root,
  });
  if (head.exitCode === 0) {
    await executeRepositoryGit(process, root, ["restore", "--staged", "--", ...paths]);
  } else {
    await executeRepositoryGit(process, root, ["rm", "--cached", "-r", "--", ...paths]);
  }
}
