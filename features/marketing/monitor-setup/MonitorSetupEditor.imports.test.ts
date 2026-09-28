import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("plain Input import boundary", () => {
  it("keeps every shipped plain Input import on the published package", () => {
    const candidateSourceFiles = execFileSync(
      "git",
      ["grep", "-l", "@/components/ui/input", "--", "*.ts", "*.tsx"],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    )
      .split("\n")
      .filter(
        (file) =>
          file.length > 0 &&
          !file.includes(".test.") &&
          !file.includes(".spec."),
      );
    const hostInputImports = candidateSourceFiles.filter((file) =>
      /import\s*\{[^}]*\bInput\b[^}]*\}\s*from\s*["']@\/components\/ui\/input["']/s.test(
        readFileSync(resolve(process.cwd(), file), "utf8"),
      ),
    );

    expect(hostInputImports).toEqual([]);
  });
});
