import {
  summarizeLensSelection,
  type LensChipNode,
} from "@/features/scopes/components/active-context/LensChip";

describe("summarizeLensSelection", () => {
  it("lists each selected organization by abbreviation before count summaries", () => {
    const nodes: LensChipNode[] = [
      { kind: "org", label: "ME" },
      { kind: "org", label: "PBW" },
      { kind: "scope" },
      { kind: "scope" },
      { kind: "project" },
    ];

    expect(summarizeLensSelection(nodes)).toBe(
      "ME · PBW · 2 scopes · 1 project",
    );
  });

  it("keeps the count fallback when organization metadata has not loaded", () => {
    expect(
      summarizeLensSelection([
        { kind: "org" },
        { kind: "scope" },
      ]),
    ).toBe("1 org · 1 scope");
  });

  it("does not collapse organizations that share an abbreviation", () => {
    expect(
      summarizeLensSelection([
        { kind: "org", label: "ABC" },
        { kind: "org", label: "ABC" },
      ]),
    ).toBe("ABC · ABC");
  });
});
