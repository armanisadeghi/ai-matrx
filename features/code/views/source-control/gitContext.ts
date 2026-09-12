import type { GitStatusResponse } from "../../adapters/SandboxGitAdapter";
import type { RepositoryMetadata } from "./repositoryService";

/** Context key shared by the Source Control panel and the Code chat. */
export const GIT_REPOSITORY_CONTEXT_KEY = "source_control.repository";

export interface GitContextAttachmentLimits {
  maxDiffCharacters: number;
  maxUntrackedFileCharacters: number;
  maxUntrackedTotalCharacters: number;
}

export interface UntrackedFileContextInput {
  path: string;
  content?: string;
  error?: string;
}

interface CapturedText {
  content: string;
  truncated: boolean;
  omittedCharacters: number;
}

export interface RepositoryContextSnapshot {
  __kind: "git_repository_snapshot";
  capturedAt: string;
  repository: Pick<
    RepositoryMetadata,
    "rootPath" | "branch" | "headSha" | "upstream"
  >;
  status: GitStatusResponse;
  diffs: {
    staged: CapturedText;
    unstaged: CapturedText;
  };
  untracked: Array<{
    path: string;
    content?: string;
    truncated?: boolean;
    omittedCharacters?: number;
    omission?: string;
  }>;
  /** Every omitted byte is explicit: the agent must not assume absent content
   * means the file did not exist or was empty. */
  omissions: string[];
}

function captureText(text: string, limit: number): CapturedText {
  const content = text.slice(0, limit);
  return {
    content,
    truncated: content.length !== text.length,
    omittedCharacters: Math.max(0, text.length - content.length),
  };
}

/**
 * Builds a bounded, machine-readable Git snapshot for `instanceContext`.
 * Diffs retain their index/working-tree separation. Untracked files have no
 * Git diff, so their text is captured independently and every unavailable or
 * truncated file is recorded in `omissions`.
 */
export function buildRepositoryContextSnapshot({
  repository,
  status,
  stagedDiff,
  unstagedDiff,
  untrackedFiles,
  limits,
  capturedAt = new Date().toISOString(),
}: {
  repository: RepositoryMetadata;
  status: GitStatusResponse;
  stagedDiff: string;
  unstagedDiff: string;
  untrackedFiles: UntrackedFileContextInput[];
  limits: GitContextAttachmentLimits;
  capturedAt?: string;
}): RepositoryContextSnapshot {
  const omissions: string[] = [];
  let untrackedRemaining = limits.maxUntrackedTotalCharacters;
  const untracked = untrackedFiles.map(({ path, content, error }) => {
    if (error) {
      const omission = `${path}: could not read untracked content`;
      omissions.push(omission);
      return { path, omission };
    }
    if (content === undefined) {
      const omission = `${path}: untracked content was unavailable`;
      omissions.push(omission);
      return { path, omission };
    }
    const captured = captureText(
      content,
      Math.min(limits.maxUntrackedFileCharacters, untrackedRemaining),
    );
    untrackedRemaining -= captured.content.length;
    if (captured.truncated) {
      omissions.push(
        `${path}: omitted ${captured.omittedCharacters} untracked characters due to attachment limits`,
      );
    }
    return {
      path,
      content: captured.content,
      truncated: captured.truncated,
      omittedCharacters: captured.omittedCharacters,
    };
  });
  const staged = captureText(stagedDiff, limits.maxDiffCharacters);
  const unstaged = captureText(unstagedDiff, limits.maxDiffCharacters);
  if (staged.truncated) {
    omissions.push(
      `staged diff: omitted ${staged.omittedCharacters} characters due to attachment limits`,
    );
  }
  if (unstaged.truncated) {
    omissions.push(
      `unstaged diff: omitted ${unstaged.omittedCharacters} characters due to attachment limits`,
    );
  }
  return {
    __kind: "git_repository_snapshot",
    capturedAt,
    repository: {
      rootPath: repository.rootPath,
      branch: repository.branch,
      headSha: repository.headSha,
      upstream: repository.upstream,
    },
    status,
    diffs: { staged, unstaged },
    untracked,
    omissions,
  };
}
