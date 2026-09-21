import {
  podcastShowSearchText,
  PODCAST_TABLE_ROW_ACTION_REVEAL_CLASS,
} from "./shows-table-contract";

describe("podcast shows table search contract", () => {
  it("keeps an ID-only query in the shared table search projection", () => {
    expect(
      podcastShowSearchText({
        id: "show-uuid-only",
        title: "A title",
        slug: "a-title",
        author: null,
      } as never),
    ).toContain("show-uuid-only");
  });

  it("uses the shared row group and keeps row actions keyboard-reachable", () => {
    expect(PODCAST_TABLE_ROW_ACTION_REVEAL_CLASS).toContain(
      "group-hover/matrx-row:opacity-100",
    );
    expect(PODCAST_TABLE_ROW_ACTION_REVEAL_CLASS).toContain(
      "focus-visible:opacity-100",
    );
  });
});
