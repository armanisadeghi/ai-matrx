import { buildRepositoryContextSnapshot } from "./gitContext";

describe("buildRepositoryContextSnapshot", () => {
  it("keeps staged and unstaged diffs separate and names unavailable untracked content", () => {
    const snapshot = buildRepositoryContextSnapshot({
      sandboxId: "test-sandbox",
      repository: {
        rootPath: "/workspace/project",
        gitDir: "/workspace/project/.git",
        commonGitDir: "/workspace/project/.git",
        branch: "feature/context",
        headSha: "abc123",
        upstream: "origin/feature/context",
        remotes: [],
        branches: [],
      },
      status: {
        branch: "feature/context",
        ahead: 1,
        behind: 0,
        staged: [{ path: "staged.ts", status: "M " }],
        unstaged: [{ path: "working.ts", status: " M" }],
        untracked: ["new.ts", "unreadable.ts"],
        conflicted: [],
      },
      stagedDiff: "staged diff",
      unstagedDiff: "working diff",
      limits: {
        maxDiffCharacters: 100,
        maxUntrackedFileCharacters: 100,
        maxUntrackedTotalCharacters: 100,
        maxUntrackedFiles: 2,
      },
      untrackedFiles: [
        { path: "new.ts", content: "export const newFile = true;" },
        { path: "unreadable.ts", omission: "could not read untracked content" },
      ],
      capturedAt: "2026-09-12T00:00:00.000Z",
    });

    expect(snapshot.diffs.staged.content).toBe("staged diff");
    expect(snapshot.diffs.unstaged.content).toBe("working diff");
    expect(snapshot.untracked).toEqual([
      expect.objectContaining({
        path: "new.ts",
        content: "export const newFile = true;",
      }),
      expect.objectContaining({
        path: "unreadable.ts",
        omission: expect.any(String),
      }),
    ]);
    expect(snapshot.sandboxId).toBe("test-sandbox");
    expect(snapshot.__kind).toBe("git_repository_snapshot");
    expect(snapshot.omissions).toContain(
      "unreadable.ts: could not read untracked content",
    );
  });
});
