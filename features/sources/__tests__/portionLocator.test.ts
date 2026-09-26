import { formatMs, portionLabel } from "@/features/sources/portionLocator";

const r = (
  portion_kind: string,
  locator: unknown,
  extra: Partial<{ page_number: number; speaker: string | null }> = {},
) => ({
  page_index: 2,
  page_number: extra.page_number ?? 3,
  portion_kind,
  locator,
  speaker: extra.speaker ?? null,
});

describe("portionLabel names each portion from its locator", () => {
  it("a page by its number", () => {
    expect(portionLabel(r("page", { page: 12 }))).toBe("Page 12");
    expect(portionLabel(r("page", {}))).toBe("Page 3");
  });
  it("a web section by its heading path joined with ›", () => {
    expect(
      portionLabel(
        r("section", {
          heading_path: ["IANA", "Example domains"],
          text_fragment: "x",
        }),
      ),
    ).toBe("IANA › Example domains");
    expect(
      portionLabel(
        r("section", { heading_path: [], text_fragment: "Plain intro" }),
      ),
    ).toBe("“Plain intro”");
    expect(portionLabel(r("section", {}))).toBe("Section 3");
  });
  it("a transcript segment by time range and speaker", () => {
    expect(
      portionLabel(
        r("segment", { t0_ms: 65_000, t1_ms: 92_000, speaker: "Ana" }),
      ),
    ).toBe("01:05–01:32 · Ana");
    expect(portionLabel(r("segment", { t0_ms: 0 }, { speaker: "Bo" }))).toBe(
      "00:00 · Bo",
    );
    expect(formatMs(3_725_000)).toBe("1:02:05");
  });
  it("an unknown kind reads as a page, never blank", () => {
    expect(portionLabel(r("mystery", {}))).toBe("Page 3");
  });
});
