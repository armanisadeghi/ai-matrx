import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "../../../../..");

describe("FastFire scroll runway ownership", () => {
  it("puts assistant runway on the real scroll owner and disables the ancestor runway", () => {
    const page = readFileSync(
      join(repoRoot, "app/(core)/education/fastfire/page.tsx"),
      "utf8",
    );
    const shellCss = readFileSync(join(repoRoot, "styles/shell.css"), "utf8");

    expect(page).toContain(
      'className="scroll-page-end-space h-full overflow-y-auto"',
    );
    expect(shellCss).toContain(
      ".education-scroll-boundary:has(.scroll-page-end-space)",
    );
    expect(shellCss).toMatch(
      /\.education-scroll-boundary:has\(\.scroll-page-end-space\)\s*\{[^}]*padding-block-end:\s*0;[^}]*scroll-padding-bottom:\s*0;/s,
    );
  });
});
