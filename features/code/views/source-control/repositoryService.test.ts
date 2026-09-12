import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessAdapter } from "../../adapters/ProcessAdapter";
import {
  discoverRepositories,
  initRepository,
  inspectRepository,
  pushRepository,
  unstageRepositoryPaths,
} from "./repositoryService";

function result(stdout = "", exitCode = 0, stderr = "") {
  return { stdout, stderr, exitCode, cwd: "/workspace" };
}

function localProcess(cwd: string): ProcessAdapter {
  return {
    id: "local-test",
    isReady: true,
    cwd,
    async exec(command, options) {
      try {
        return {
          stdout: execFileSync("sh", ["-lc", command], {
          cwd: options?.cwd ?? cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          }),
          stderr: "",
          exitCode: 0,
          cwd: options?.cwd ?? cwd,
        };
      } catch (error) {
        const failure = error as {
          status?: number;
          stdout?: Buffer | string;
          stderr?: Buffer | string;
        };
        return {
          stdout: String(failure.stdout ?? ""),
          stderr: String(failure.stderr ?? ""),
          exitCode: failure.status ?? 1,
          cwd: options?.cwd ?? cwd,
        };
      }
    },
  };
}

describe("repositoryService", () => {
  it("uses Git's worktree metadata and redacts credential-bearing remote URLs", async () => {
    const exec = jest.fn(async (command: string) => {
      if (command.includes("'--show-toplevel'")) {
        return result("/workspace/repo-worktree\n/workspace/.git/worktrees/wt\n/workspace/.git\n");
      }
      if (command.includes("'branch' '--show-current'")) return result("feature/review\n");
      if (command.includes("'--verify' '--quiet' 'HEAD'")) return result("deadbeef\n");
      if (command.includes("'--symbolic-full-name'")) return result("origin/feature/review\n");
      if (command.includes("'remote' '-v'")) {
        return result(
          "origin\thttps://token@example.test/org/repo.git (fetch)\norigin\thttps://token@example.test/org/repo.git (push)\n",
        );
      }
      if (command.includes("'for-each-ref'")) return result("feature/review\0*\0origin/feature/review\u001e\nother\0 \0\u001e");
      throw new Error(`Unexpected command: ${command}`);
    });
    const process = { exec } as unknown as ProcessAdapter;

    await expect(inspectRepository(process, "/workspace/repo-worktree/src")).resolves.toEqual({
      rootPath: "/workspace/repo-worktree",
      gitDir: "/workspace/.git/worktrees/wt",
      commonGitDir: "/workspace/.git",
      branch: "feature/review",
      headSha: "deadbeef",
      upstream: "origin/feature/review",
      remotes: [{ name: "origin", fetchUrl: "https://***@example.test/org/repo.git", pushUrl: "https://***@example.test/org/repo.git" }],
      branches: [
        { name: "feature/review", current: true, upstream: "origin/feature/review" },
        { name: "other", current: false, upstream: null },
      ],
    });
  });

  it("does not initialize outside the active sandbox workspace", async () => {
    const exec = jest.fn();
    const process = { exec } as unknown as ProcessAdapter;
    await expect(initRepository(process, "/etc/project", "/workspace")).rejects.toThrow(
      "inside the active sandbox workspace",
    );
    expect(exec).not.toHaveBeenCalled();
  });

  it("keeps repository discovery shallow and excludes dependency/build trees", async () => {
    let identityCalls = 0;
    const exec = jest.fn(async (command: string) => {
      if (command.includes("'--show-toplevel'")) {
        identityCalls += 1;
        return identityCalls === 1
          ? result("", 1, "fatal: not a git repository")
          : result("/workspace/apps/site\n/workspace/apps/site/.git\n/workspace/apps/site/.git\n");
      }
      if (command.startsWith("find ")) return result("/workspace/apps/site/.git\0");
      throw new Error(`Unexpected command: ${command}`);
    });
    const process = { exec } as unknown as ProcessAdapter;

    await expect(discoverRepositories(process, "/workspace")).resolves.toEqual([
      expect.objectContaining({
        rootPath: "/workspace/apps/site",
        branch: null,
        remotes: [],
        branches: [],
      }),
    ]);
    const scanCommand = exec.mock.calls.find(([command]) => command.startsWith("find "))?.[0] as string;
    expect(scanCommand).toContain("-maxdepth 4");
    expect(scanCommand).toContain("-name node_modules");
    expect(scanCommand).toContain("-name .next");
    expect(scanCommand).not.toContain("|");
    expect(exec.mock.calls.map(([command]) => command).join("\n")).not.toContain("'remote' '-v'");
    expect(exec.mock.calls.map(([command]) => command).join("\n")).not.toContain("'for-each-ref'");
  });

  it("unstages an unborn repository without discarding its files", async () => {
    const exec = jest.fn(async (command: string) => {
      if (command.includes("'--verify' '--quiet' 'HEAD'")) return result("", 1);
      if (command.includes("'rm' '--cached' '-r' '--' 'new-file.ts'")) return result();
      throw new Error(`Unexpected command: ${command}`);
    });
    const process = { exec } as unknown as ProcessAdapter;
    await expect(
      unstageRepositoryPaths(process, "/workspace/repo", ["new-file.ts"]),
    ).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("inspects and discovers a real linked worktree, then unstages without losing content", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "matrx-repository-service-"));
    const repository = join(workspace, "repository");
    const worktree = join(workspace, "worktree");
    const git = (cwd: string, args: string[]) =>
      execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
    try {
      execFileSync("git", ["init", repository], { encoding: "utf8", stdio: "pipe" });
      git(repository, ["config", "user.name", "Test User"]);
      git(repository, ["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(repository, "tracked.txt"), "initial\n");
      git(repository, ["add", "--", "tracked.txt"]);
      git(repository, ["commit", "-m", "initial"]);
      git(repository, ["remote", "add", "origin", "https://token@example.test/org/repository.git"]);
      git(repository, ["worktree", "add", "-b", "review", worktree]);

      const process = localProcess(workspace);
      const metadata = await inspectRepository(process, worktree);
      const canonicalRepository = realpathSync(repository);
      const canonicalWorktree = realpathSync(worktree);
      expect(metadata).toMatchObject({
        rootPath: canonicalWorktree,
        commonGitDir: join(canonicalRepository, ".git"),
        branch: "review",
      });
      expect(metadata?.remotes[0]?.fetchUrl).toBe(
        "https://***@example.test/org/repository.git",
      );
      await expect(discoverRepositories(process, workspace)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rootPath: canonicalRepository }),
          expect.objectContaining({ rootPath: canonicalWorktree }),
        ]),
      );

      writeFileSync(join(repository, "tracked.txt"), "changed but retained\n");
      git(repository, ["add", "--", "tracked.txt"]);
      await unstageRepositoryPaths(process, repository, ["tracked.txt"]);
      expect(git(repository, ["diff", "--cached", "--name-only"])).toBe("");
      expect(git(repository, ["diff", "--", "tracked.txt"])).toContain(
        "changed but retained",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("publishes to a bare remote with an upstream, then uses normal pushes and pulls", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "matrx-repository-push-"));
    const repository = join(workspace, "repository");
    const remote = join(workspace, "remote.git");
    const clone = join(workspace, "clone");
    const git = (cwd: string, args: string[]) =>
      execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
    try {
      execFileSync("git", ["init", repository], { encoding: "utf8", stdio: "pipe" });
      execFileSync("git", ["init", "--bare", remote], { encoding: "utf8", stdio: "pipe" });
      git(repository, ["config", "user.name", "Test User"]);
      git(repository, ["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(repository, "initial.txt"), "initial\n");
      git(repository, ["add", "--", "initial.txt"]);
      git(repository, ["commit", "-m", "initial"]);
      git(repository, ["remote", "add", "origin", remote]);
      const branch = git(repository, ["branch", "--show-current"]).trim();
      const process = localProcess(repository);

      await pushRepository(process, repository, "origin", branch, { setUpstream: true });
      expect(git(repository, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).trim()).toBe(
        `origin/${branch}`,
      );
      expect(git(remote, ["show-ref", "--verify", `refs/heads/${branch}`])).toContain("refs/heads/");

      writeFileSync(join(repository, "second.txt"), "second\n");
      git(repository, ["add", "--", "second.txt"]);
      git(repository, ["commit", "-m", "second"]);
      await pushRepository(process, repository, "origin", branch);
      execFileSync("git", ["clone", remote, clone], { encoding: "utf8", stdio: "pipe" });
      git(clone, ["config", "user.name", "Other User"]);
      git(clone, ["config", "user.email", "other@example.invalid"]);
      writeFileSync(join(clone, "remote.txt"), "remote\n");
      git(clone, ["add", "--", "remote.txt"]);
      git(clone, ["commit", "-m", "remote"]);
      git(clone, ["push"]);

      git(repository, ["pull", "--ff-only"]);
      expect(git(repository, ["log", "-1", "--format=%s"]).trim()).toBe("remote");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
