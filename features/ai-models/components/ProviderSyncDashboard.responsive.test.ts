import { readFileSync } from "node:fs";

const source = readFileSync(
  "features/ai-models/components/ProviderSyncDashboard.tsx",
  "utf8",
);

describe("ProviderSyncDashboard responsive toolbar", () => {
  it("gives mobile stats and toolbar sections full-width wrapping lanes", () => {
    expect(source).toContain(
      "matrx-touch-targets shrink-0 flex flex-wrap items-center",
    );
    expect(source).toContain(
      "grid w-full grid-cols-5 gap-x-2 sm:flex sm:w-auto",
    );
    expect(source).toContain(
      "flex w-full flex-wrap items-center gap-x-3 gap-y-1",
    );
    expect(source).toContain(
      "flex w-full items-center justify-end gap-1 sm:w-auto",
    );
  });

  it("restores the compact one-row desktop toolbar at the sm breakpoint", () => {
    expect(source).toContain("sm:flex-nowrap sm:gap-4 sm:px-4");
    expect(source).toContain("hidden flex-1 sm:block");
    expect(source).toContain("sm:flex-row sm:items-baseline sm:gap-1");
  });
});
