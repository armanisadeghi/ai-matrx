// features/marketing/seo/topical-map/panel/associationGroups.test.ts
//
// The panel's ONE reading of `seo.map_topic_associations`, driven with the
// function's RECORDED answer for a real All Green topic (see the fixture
// header) plus one composed row of a kind the panel never names.
//
// What each case defends:
//   · a page's traffic reaches the pages section as the function's own numbers
//     over the function's own window — never re-derived, never defaulted;
//   · a facet-value edge is NOT a generic row (the facets section owns it);
//   · a kind the panel has never heard of is grouped under the exact string the
//     function returned — a switch over kinds would drop it silently;
//   · the dormant hidden-count variant (migration 18 removed it) is counted,
//     never listed, if a reader ever meets one.

import { splitAssociations, itemLabel, SPECIAL_KINDS } from "./associationGroups";
import {
  COMPOSED_GENERIC_ROW,
  RECORDED_ASSOCIATIONS,
} from "./__fixtures__/mapTopicAssociationsRecorded";
import type { MapTopicAssociation } from "../types";

describe("splitAssociations over the recorded rows", () => {
  const split = splitAssociations(RECORDED_ASSOCIATIONS);

  it("hands the live page to the pages section with the function's traffic and window", () => {
    expect(split.pages).toHaveLength(1);
    const { item, row } = split.pages[0];
    expect(item.id).toBe("bf089006-3b35-4b80-89b0-c8d3055ad8cb");
    expect(item.clicks).toBe(2);
    expect(item.impressions).toBe(586);
    expect(item.performance_window_days).toBe(28);
    expect(row.association.role).toBe("covers");
    expect(row.association.direction).toBe("in");
  });

  it("keeps a facet-value edge out of the generic section", () => {
    expect(split.generic).toEqual([]);
    expect(split.planned).toEqual([]);
    expect(split.keywords).toEqual([]);
  });
});

describe("a kind the panel never special-cases", () => {
  it("is grouped under exactly the string the function returned, and labelled by the item", () => {
    expect(SPECIAL_KINDS.has(COMPOSED_GENERIC_ROW.association.kind)).toBe(false);
    const split = splitAssociations([...RECORDED_ASSOCIATIONS, COMPOSED_GENERIC_ROW]);
    expect(split.generic.map((group) => group.kind)).toEqual(["web_youtube_video"]);
    expect(split.generic[0].rows).toHaveLength(1);
    expect(itemLabel(split.generic[0].rows[0])).toBe("How we shred hard drives");
    expect(split.generic[0].hidden).toBe(0);
    // The special sections are untouched by it.
    expect(split.pages).toHaveLength(1);
  });

  it("falls back to the id when the item carries no name at all", () => {
    const bare: MapTopicAssociation = {
      topic: "cable-and-wire-recycling",
      association: { kind: "rulebook", direction: "in" },
      item: { type: "rulebook", id: "9a9a9a9a-0000-4000-8000-000000000001" },
    };
    const split = splitAssociations([bare]);
    expect(itemLabel(split.generic[0].rows[0])).toBe("9a9a9a9a-0000-4000-8000-000000000001");
  });
});

describe("the dormant hidden-count variant", () => {
  it("is counted on its kind, never listed as a row", () => {
    const hidden: MapTopicAssociation = {
      topic: "cable-and-wire-recycling",
      association: { kind: "rulebook", direction: "in" },
      item: { type: "rulebook", hidden: 3 },
    };
    const split = splitAssociations([hidden]);
    expect(split.generic).toEqual([{ kind: "rulebook", rows: [], hidden: 3 }]);
  });
});
