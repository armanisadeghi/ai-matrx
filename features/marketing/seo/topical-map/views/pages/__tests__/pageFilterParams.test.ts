// features/marketing/seo/topical-map/views/pages/__tests__/pageFilterParams.test.ts
//
// The URL filter contract. Red before `pageFilterParams.ts` existed: the pages
// workspace read nothing from the query string, so "Map these pages" and the
// Keyword Workbench's map door both opened the whole unfiltered list.

import {
  ignoredParamsSentence,
  pageFiltersFromSearchParams,
} from "../pageFilterParams";

const parse = (query: string) => pageFiltersFromSearchParams(new URLSearchParams(query));

describe("pageFiltersFromSearchParams", () => {
  it("reads nothing out of an empty query string", () => {
    expect(parse("")).toEqual({ filters: {}, ignored: [] });
  });

  it("ignores ?site= — the route owns it, not the filter bag", () => {
    expect(parse("site=46690e56-6b25-45b9-ac91-611c92b3cf61")).toEqual({
      filters: {},
      ignored: [],
    });
  });

  it("reads a topic slug", () => {
    expect(parse("topic=live-there").filters).toEqual({ topicSlug: "live-there" });
  });

  it("reads a disposition and a state together", () => {
    expect(parse("disposition=redirect&state=proposed").filters).toEqual({
      disposition: "redirect",
      state: "proposed",
    });
  });

  it("reads the bare-pages tab", () => {
    expect(parse("onNoTopic=1").filters).toEqual({ onNoTopic: true });
    expect(parse("onNoTopic=true").filters).toEqual({ onNoTopic: true });
    expect(parse("onNoTopic=0").filters).toEqual({ onNoTopic: false });
  });

  it("NAMES a disposition that does not exist instead of swallowing it", () => {
    // Silently dropping it leaves the person reading an unfiltered list they
    // believe is filtered.
    expect(parse("disposition=retire")).toEqual({
      filters: {},
      ignored: ["disposition=retire"],
    });
  });

  it("names a misspelled state and still applies the rest of the link", () => {
    expect(parse("state=accpeted&disposition=move")).toEqual({
      filters: { disposition: "move" },
      ignored: ["state=accpeted"],
    });
  });

  it("names a flag it cannot read", () => {
    expect(parse("onNoTopic=maybe")).toEqual({
      filters: {},
      ignored: ["onNoTopic=maybe"],
    });
  });

  it("refuses an empty topic rather than filtering on nothing", () => {
    expect(parse("topic=")).toEqual({ filters: {}, ignored: ["topic="] });
  });

  it("decodes what the link encoded", () => {
    expect(parse("topic=metals%2Fscrap").filters).toEqual({ topicSlug: "metals/scrap" });
  });
});

describe("ignoredParamsSentence", () => {
  it("says what was dropped, in one plain sentence", () => {
    expect(ignoredParamsSentence(["state=accpeted"])).toContain("state=accpeted");
    expect(ignoredParamsSentence(["state=accpeted"])).toContain("was not applied");
    expect(ignoredParamsSentence(["a=1", "b=2"])).toContain("a=1 and b=2");
  });
});
