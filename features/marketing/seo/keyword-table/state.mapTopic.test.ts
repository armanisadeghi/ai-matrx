// features/marketing/seo/keyword-table/state.mapTopic.test.ts
//
// `?topic=<slug>` — the map topic a link-in arrives from.
//
// The topical map's `links.keywordWorkbench(siteId, topicSlug)` has emitted
// `?topic=` since it was written, with a comment saying the workbench "does not
// read a `topic` key YET". It does now: the key is part of the table's URL
// state, so it survives a reload, a sort and a Back — otherwise the banner
// explaining the narrowing disappears under the person on their first click.
//
// Red before `mapTopicSlug` existed: the parse returned no such field.

import {
  defaultKeywordTableState,
  keywordTableSearchParams,
  parseKeywordTableState,
} from "./state";

const parse = (query: string, prefix?: string) =>
  parseKeywordTableState(new URLSearchParams(query), prefix ? { prefix } : {});

describe("the keyword table reads the map topic out of the URL", () => {
  it("reads ?topic=", () => {
    expect(parse("topic=live-there").mapTopicSlug).toBe("live-there");
  });

  it("is null when the link carries none", () => {
    expect(parse("kq=metal").mapTopicSlug).toBeNull();
    expect(defaultKeywordTableState().mapTopicSlug).toBeNull();
  });

  it("treats an empty or blank topic as none, never as a filter on nothing", () => {
    expect(parse("topic=").mapTopicSlug).toBeNull();
    expect(parse("topic=%20%20").mapTopicSlug).toBeNull();
  });

  it("decodes what the link encoded", () => {
    expect(parse("topic=metals%2Fscrap").mapTopicSlug).toBe("metals/scrap");
  });

  it("writes it back, so a reload and a Back keep the narrowing", () => {
    const state = { ...defaultKeywordTableState(), mapTopicSlug: "live-there" };
    expect(keywordTableSearchParams(state).get("topic")).toBe("live-there");
  });

  it("writes nothing when there is no topic", () => {
    expect(keywordTableSearchParams(defaultKeywordTableState()).get("topic")).toBeNull();
  });

  it("round-trips through a prefixed surface's own slice of the query string", () => {
    const state = { ...defaultKeywordTableState(), mapTopicSlug: "live-there" };
    const written = keywordTableSearchParams(state, { prefix: "unplaced" });
    expect(written.get("unplaced_topic")).toBe("live-there");
    expect(parse(written.toString(), "unplaced").mapTopicSlug).toBe("live-there");
    // …and a bare `topic=` is NOT that surface's.
    expect(parse("topic=live-there", "unplaced").mapTopicSlug).toBeNull();
  });
});
