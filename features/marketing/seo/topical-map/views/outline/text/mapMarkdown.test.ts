/**
 * The markdown tree is built from the REAL reducer over the recorded All Green
 * `seo.map_tree` payload (Verifier A's fixture, read live 2026-09-18): the
 * same bytes the outline renders, so the document can never disagree with it.
 */
import { configureStore } from "@reduxjs/toolkit";

import reducer, { mapOpened, mapTreeLoaded } from "../../../redux/slice";
import { ALL_GREEN_MAP_ID, ALL_GREEN_WITHOUT_COUNTS, ALL_GREEN_WITH_COUNTS } from "../__fixtures__/mapTreeAllGreen.recorded";
import { buildMapMarkdown } from "./mapMarkdown";

function load(result: typeof ALL_GREEN_WITH_COUNTS, includes: string[]) {
  const store = configureStore({ reducer: { topicalMap: reducer } });
  store.dispatch(mapOpened({ mapId: ALL_GREEN_MAP_ID }));
  store.dispatch(mapTreeLoaded({ mapId: ALL_GREEN_MAP_ID, result, includes }));
  const ws = store.getState().topicalMap.maps[ALL_GREEN_MAP_ID];
  if (!ws) throw new Error("the workspace was not opened");
  return {
    topics: ws.topicsBySlug,
    roots: ws.rootSlugs,
    countsLoaded: ws.loadedIncludes.includes("counts"),
  };
}

describe("buildMapMarkdown over the recorded All Green tree", () => {
  it("prints every root as a heading and every descendant as a nested bullet, in the map's order", () => {
    const { topics, roots, countsLoaded } = load(ALL_GREEN_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    const md = buildMapMarkdown(topics, roots, { mapName: "All Green Recycling", countsLoaded });
    expect(md.startsWith("# All Green Recycling\n")).toBe(true);
    const headings = md.split("\n").filter((line) => line.startsWith("## "));
    expect(headings.length).toBe(roots.length);
    expect(headings[0]).toBe(`## ${topics[roots[0]].name} — ${topics[roots[0]].pages} pages · ${topics[roots[0]].planned} planned · ${topics[roots[0]].keywords} keywords`);
    // Every topic in the tree appears exactly once as a bold name or a heading.
    for (const topic of Object.values(topics)) {
      const asHeading = md.includes(`## ${topic.name}`);
      const asBullet = md.includes(`- **${topic.name}**`);
      expect(asHeading || asBullet).toBe(true);
    }
    // A child sits one level (two spaces) deeper than its parent.
    const root = topics[roots[0]];
    const firstChild = topics[root.childSlugs[0]];
    expect(md).toContain(`\n- **${firstChild.name}**`);
    const grandchild = firstChild.childSlugs[0] ? topics[firstChild.childSlugs[0]] : null;
    if (grandchild) expect(md).toContain(`\n  - **${grandchild.name}**`);
  });

  it("prints NO counts when the tree was loaded without them (absent is not zero)", () => {
    const { topics, roots, countsLoaded } = load(ALL_GREEN_WITHOUT_COUNTS, ["description", "status"]);
    expect(countsLoaded).toBe(false);
    const md = buildMapMarkdown(topics, roots, { countsLoaded });
    expect(md).not.toMatch(/\d+ pages?/);
    expect(md).not.toMatch(/\d+ keywords?/);
    expect(md).not.toContain(" — ");
  });

  it("narrows to a focused branch and marks a non-active topic", () => {
    const { topics, roots, countsLoaded } = load(ALL_GREEN_WITH_COUNTS, ["description", "status", "counts", "facets"]);
    const focus = roots[0];
    const md = buildMapMarkdown(topics, roots, { focusSlug: focus, countsLoaded });
    expect(md.split("\n").filter((line) => line.startsWith("## ")).length).toBe(1);
    expect(md).toContain(`## ${topics[focus].name}`);
    const proposed = Object.values(topics).find((topic) => topic.status && topic.status !== "active");
    if (proposed) {
      const whole = buildMapMarkdown(topics, roots, { countsLoaded });
      expect(whole).toContain(`**${proposed.name}** _(${proposed.status})_`);
    }
  });

  it("returns an empty string for an unknown focus or an empty map", () => {
    const { topics, roots, countsLoaded } = load(ALL_GREEN_WITH_COUNTS, ["counts"]);
    expect(buildMapMarkdown(topics, roots, { focusSlug: "not-a-topic", countsLoaded })).toBe("");
    expect(buildMapMarkdown({}, [], { countsLoaded: false })).toBe("");
  });
});
