import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const revision = process.env.STUDY_KIT_TOUCH_TARGET_REF;

function readSource(relativePath: string): string {
  if (revision) {
    return execFileSync("git", ["show", `${revision}:${relativePath}`], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
  }

  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("study-kit phone touch targets", () => {
  it("keeps every focused kit-overview door at 44px before the desktop breakpoint", () => {
    const source = readSource("features/education/home/blocks/KitsBlock.tsx");

    expect(source).toContain(
      '"flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold",',
    );
    expect(source).toContain(
      'className="col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 text-xs font-semibold text-foreground"',
    );
    expect(source).toContain(
      '"inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors hover:brightness-110 sm:min-h-7",',
    );
  });

  it("keeps the kit hub doors at 44px on phones without widening desktop controls", () => {
    const hub = readSource("features/education/kits/components/KitHub.tsx");
    const makeMore = readSource(
      "features/education/kits/components/MakeMoreFromKit.tsx",
    );

    expect(hub).toContain('className="min-h-11 gap-1.5 sm:min-h-10"');
    expect(makeMore).toContain('className="min-h-11 gap-1.5 sm:min-h-0"');
  });
});
