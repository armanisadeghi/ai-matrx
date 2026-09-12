import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProcessAdapter } from "../../adapters/ProcessAdapter";
import {
  applyRepositoryStash,
  createRepositoryStash,
  dropRepositoryStash,
  listRepositoryStashes,
  parseRepositoryStashes,
} from "./RepositoryStashes";

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

describe("RepositoryStashes", () => {
  it("parses the deterministic stash list format", () => {
    expect(
      parseRepositoryStashes("stash@{0}\x001725926400\x00Matrx recovery\nstash@{1}\x00bad\x00older\n"),
    ).toEqual([
      { reference: "stash@{0}", createdAt: 1725926400000, message: "Matrx recovery" },
      { reference: "stash@{1}", createdAt: null, message: "older" },
    ]);
  });

  it("saves untracked files, applies without dropping, and discards only on request", async () => {
    const repository = mkdtempSync(join(tmpdir(), "matrx-stashes-"));
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" });
    try {
      git(["init"]);
      git(["config", "user.name", "Test User"]);
      git(["config", "user.email", "test@example.invalid"]);
      writeFileSync(join(repository, "tracked.txt"), "initial\n");
      git(["add", "--", "tracked.txt"]);
      git(["commit", "-m", "initial"]);
      writeFileSync(join(repository, "tracked.txt"), "saved edit\n");
      writeFileSync(join(repository, "untracked.txt"), "saved untracked\n");

      const process = localProcess(repository);
      await createRepositoryStash(process, repository);
      const [stash] = await listRepositoryStashes(process, repository);
      expect(stash?.reference).toBe("stash@{0}");
      expect(stash?.message).toContain("Matrx saved changes");
      expect(git(["status", "--porcelain"])).toBe("");

      await applyRepositoryStash(process, repository, stash!.reference);
      expect(git(["status", "--porcelain"])).toContain("untracked.txt");
      await expect(listRepositoryStashes(process, repository)).resolves.toHaveLength(1);

      git(["reset", "--hard"]);
      git(["clean", "-fd"]);
      await dropRepositoryStash(process, repository, stash!.reference);
      await expect(listRepositoryStashes(process, repository)).resolves.toEqual([]);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
