import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";

describe("parseSnapshotHeadTags", () => {
  it("reads title and meta description from scraper head_tags", () => {
    expect(
      parseSnapshotHeadTags({
        title: " AI Matrx ",
        meta_description: " Enterprise AI platform ",
        og: {},
      }),
    ).toEqual({
      title: "AI Matrx",
      metaDescription: "Enterprise AI platform",
    });
  });

  it("returns nulls for missing or invalid payloads", () => {
    expect(parseSnapshotHeadTags(null)).toEqual({
      title: null,
      metaDescription: null,
    });
    expect(parseSnapshotHeadTags({ title: "   " })).toEqual({
      title: null,
      metaDescription: null,
    });
  });
});
