import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("plain Input import boundary", () => {
  it("keeps every shipped plain Input import on the published package", () => {
    const trackedSourceFiles = execFileSync(
      "git",
      ["ls-files", "*.ts", "*.tsx"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(
        (file) =>
          file.length > 0 &&
          !file.includes(".test.") &&
          !file.includes(".spec."),
      );
    const hostInputImports = trackedSourceFiles.filter((file) =>
      /import\s*\{[^}]*\bInput\b[^}]*\}\s*from\s*["']@\/components\/ui\/input["']/s.test(
        readFileSync(resolve(process.cwd(), file), "utf8"),
      ),
    );

    expect(hostInputImports).toEqual([]);
  });
});
