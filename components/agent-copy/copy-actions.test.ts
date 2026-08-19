import { resolveCopyActions } from "@/components/agent-copy/copy-actions";

describe("resolveCopyActions", () => {
  it("shows Copy + AI and hides Export when asked", () => {
    expect(
      resolveCopyActions({
        hide: ["export"],
        hasCopy: true,
        hasAi: true,
        hasExport: true,
      }),
    ).toEqual({ copy: true, ai: true, export: false, count: 2 });
  });

  it("drops a segment that has no data even when not hidden", () => {
    expect(
      resolveCopyActions({
        hasCopy: true,
        hasAi: true,
        hasExport: false,
      }),
    ).toEqual({ copy: true, ai: true, export: false, count: 2 });
  });
});
