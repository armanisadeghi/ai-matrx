import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePyprojectScripts, pyprojectEntrypointCommand } from "./pyprojectScripts";

describe("pyproject console scripts", () => {
  it("invokes the declared callable, where python -m alone would not", () => {
    const root = mkdtempSync(join(tmpdir(), "matrx-pyproject-"));
    try {
      mkdirSync(join(root, "demo"));
      writeFileSync(join(root, "demo", "cli.py"), "from pathlib import Path\ndef main(): Path('marker.txt').write_text('called')\n");
      const entrypoint = parsePyprojectScripts("[project.scripts]\ndemo = 'demo.cli:main'\n")[0]!;
      const command = pyprojectEntrypointCommand(entrypoint.entrypoint)!;
      // Sandboxes expose `python`; the test host exposes only `python3`.
      execFileSync("sh", ["-c", command.replace(/^python\b/, "python3")], { cwd: root });
      expect(execFileSync("cat", ["marker.txt"], { cwd: root, encoding: "utf8" })).toBe("called");
      expect(pyprojectEntrypointCommand("demo.cli:main;rm -rf /")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
