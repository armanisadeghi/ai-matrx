import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxGitAdapter } from "./SandboxGitAdapter";
import {
  parseDaemonGitStatus,
  sanitizeGitErrorDetail,
} from "./SandboxGitWireFormat";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

describe("SandboxGitAdapter daemon translation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses porcelain produced by a real git repository, including spaces and a rename", () => {
    const repository = mkdtempSync(join(tmpdir(), "matrx-git-adapter-"));
    try {
      git(repository, ["init"]);
      git(repository, ["config", "user.name", "Test User"]);
      git(repository, ["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(repository, "tracked.txt"), "before\n");
      writeFileSync(join(repository, "old name.txt"), "rename me\n");
      git(repository, ["add", "."]);
      git(repository, ["commit", "-m", "initial"]);
      git(repository, ["mv", "old name.txt", "renamed file.txt"]);
      writeFileSync(join(repository, "tracked.txt"), "after\n");
      writeFileSync(join(repository, "untracked file.txt"), "new\n");

      const rawOutput = git(repository, ["status", "--porcelain", "-b"]);
      const status = parseDaemonGitStatus({
        branch: rawOutput.split("\n")[0],
        raw_output: rawOutput,
      });

      expect(status.branch).not.toBe("");
      expect(status.staged).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "renamed file.txt", status: "R " }),
        ]),
      );
      expect(status.unstaged).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "tracked.txt", status: " M" }),
        ]),
      );
      expect(status.untracked).toContain("untracked file.txt");
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it("preserves ahead/behind, conflicts, and unborn branch semantics", () => {
    expect(
      parseDaemonGitStatus({
        branch: "## main...origin/main [ahead 2, behind 3]",
        raw_output: "## main...origin/main [ahead 2, behind 3]\nUU conflict file.txt\n",
      }),
    ).toMatchObject({
      branch: "main",
      ahead: 2,
      behind: 3,
      conflicted: ["conflict file.txt"],
    });
    expect(
      parseDaemonGitStatus({
        branch: "## No commits yet on main",
        raw_output: "## No commits yet on main\n?? first file.txt\n",
      }),
    ).toMatchObject({ branch: "main", untracked: ["first file.txt"] });
  });

  it("normalizes daemon clone, diff, and mutation response shapes", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "success", output: "Cloning into 'demo'..." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ diff: "diff --git a/a b/a\n" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "success", output: "[main abc] message" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: "success", output: "" }),
      }) as unknown as typeof fetch;

    const adapter = new SandboxGitAdapter({
      instanceId: "sandbox-row",
      workspaceRoot: "/workspace",
    });
    await expect(adapter.clone({ url: "https://example.invalid/demo.git", dest: "demo" })).resolves.toEqual({
      ok: true,
      path: "/workspace/demo",
    });
    await expect(adapter.diff({ cwd: "/home/agent/demo", path: "a", staged: true })).resolves.toEqual({
      path: "a",
      staged: true,
      text: "diff --git a/a b/a\n",
    });
    await expect(
      adapter.commit({
        cwd: "/home/agent/demo",
        message: "message",
        author: { name: "A User", email: "a@example.invalid" },
      }),
    ).resolves.toEqual({ ok: true, output: "[main abc] message" });

    const commitRequest = JSON.parse(
      (globalThis.fetch as jest.Mock).mock.calls[2][1].body as string,
    );
    expect(commitRequest.author).toBe("A User <a@example.invalid>");

    await adapter.add({ cwd: "/home/agent/demo", paths: ["-not-a-flag.ts"] });
    const addRequest = JSON.parse(
      (globalThis.fetch as jest.Mock).mock.calls[3][1].body as string,
    );
    expect(addRequest.paths).toEqual(["--", "-not-a-flag.ts"]);
  });

  it("redacts credential-bearing diagnostics before callers or capture see them", () => {
    expect(
      sanitizeGitErrorDetail(
        "fatal: https://user:secret@example.invalid/repo?access_token=abc ghp_secret",
      ),
    ).not.toContain("secret");
  });
});
