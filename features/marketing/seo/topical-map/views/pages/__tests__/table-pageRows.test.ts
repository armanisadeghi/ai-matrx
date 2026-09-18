// features/marketing/seo/topical-map/views/pages/__tests__/table-pageRows.test.ts
//
// The pages workspace's client-side narrowing, over the RECORDED bytes of
// `seo.list_page_intents` (`redux/__fixtures__/listPageIntentsRound22.ts` —
// planted and read inside one rolled-back transaction on the live database on
// 2026-09-17, not typed by hand). A fixture an agent writes to fit its own
// filter proves only that the agent agrees with itself.
//
// The numbers asserted below are the fixture's ACTUAL contents, counted from
// the recorded rows: six pages, every one of them `clicks: 0`, two decided by
// `human` (arriver, mover), two by `agent` (the two orphans), and two carrying
// no intent at all (p1, p2).

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import { emptyMapPageFilters, type MapPageFilters } from "../../../redux/types";
import type { PageIntentItem } from "../../../types";
import {
  hasAnyPageFilter,
  hasClientSideNarrowing,
  loadedIntentProgress,
  narrowPageRows,
  pageTrafficNumbers,
  proposedIntentRows,
} from "../pageRows";

const ITEMS = RECORDED_PAGE_INTENTS_ROUND22.items;

function filters(patch: Partial<MapPageFilters> = {}): MapPageFilters {
  return { ...emptyMapPageFilters(), ...patch };
}

/**
 * The ONE allowed edit to a recorded row: DELETING the `clicks` key, to build
 * the "this page was never measured" case. The server strips a key rather than
 * sending null, and a `web_page` pointer the caller cannot open carries no
 * traffic at all — but every row in this fixture happens to be measurable, so
 * the absence has to be produced from a real row rather than invented as a
 * whole new one. Nothing else about the row is touched.
 */
function withoutClicks(item: PageIntentItem): PageIntentItem {
  const page = { ...item.page };
  delete (page as Partial<typeof page>).clicks;
  return { ...item, page };
}

describe("pageRows — what the recorded rows actually contain", () => {
  it("is six recorded pages, every one of them a real zero-click page", () => {
    expect(ITEMS).toHaveLength(6);
    expect(ITEMS.every((item) => pageTrafficNumbers(item)?.clicks === 0)).toBe(true);
  });
});

describe("pageRows — traffic", () => {
  it("keeps every recorded zero-click row under `low` with the knob at 0", () => {
    // `clicks: 0` is a REAL zero, and 0 <= 0, so a low-traffic filter with the
    // threshold at 0 must keep all six. A `!clicks` test would keep none.
    const result = narrowPageRows(ITEMS, filters({ traffic: "low" }), 0);
    expect(result.rows).toHaveLength(6);
    expect(result.hidden).toBe(0);
    expect(result.narrowed).toBe(true);
  });

  it("keeps none of them under `with traffic` with the knob at 0", () => {
    const result = narrowPageRows(ITEMS, filters({ traffic: "with_traffic" }), 0);
    expect(result.rows).toHaveLength(0);
    expect(result.hidden).toBe(6);
  });

  it("matches NEITHER side when the row carries no reading at all", () => {
    const unmeasured = [withoutClicks(ITEMS[0])];
    expect(pageTrafficNumbers(unmeasured[0])).toBeNull();
    expect(narrowPageRows(unmeasured, filters({ traffic: "low" }), 0).rows).toHaveLength(0);
    expect(
      narrowPageRows(unmeasured, filters({ traffic: "with_traffic" }), 0).rows,
    ).toHaveLength(0);
    // …and is untouched when no traffic filter is on, so an unmeasured page is
    // never quietly dropped from the list.
    expect(narrowPageRows(unmeasured, filters(), 0).rows).toHaveLength(1);
  });
});

describe("pageRows — text", () => {
  it("matches the recorded url", () => {
    const result = narrowPageRows(ITEMS, filters({ text: "orphan" }), 0);
    expect(result.rows.map((item) => item.page.url)).toEqual([
      "https://tmdc-a-7a6b5311.invalid/orphan-one",
      "https://tmdc-a-7a6b5311.invalid/orphan-two",
    ]);
    expect(result.loaded).toBe(6);
    expect(result.hidden).toBe(4);
  });

  it("ignores case and whitespace around the needle", () => {
    expect(narrowPageRows(ITEMS, filters({ text: "  ARRIVER " }), 0).rows).toHaveLength(1);
  });

  it("matches nothing the recorded urls do not contain", () => {
    expect(narrowPageRows(ITEMS, filters({ text: "no-such-page" }), 0).rows).toHaveLength(0);
  });
});

describe("pageRows — source", () => {
  it("narrows to the rows whose intent that source decided", () => {
    expect(narrowPageRows(ITEMS, filters({ source: "human" }), 0).rows).toHaveLength(2);
    expect(narrowPageRows(ITEMS, filters({ source: "agent" }), 0).rows).toHaveLength(2);
    // `mapper` decided none of the recorded rows.
    expect(narrowPageRows(ITEMS, filters({ source: "mapper" }), 0).rows).toHaveLength(0);
  });

  it("drops the two rows that carry no intent at all", () => {
    const humans = narrowPageRows(ITEMS, filters({ source: "human" }), 0).rows;
    expect(humans.every((item) => item.intent !== null)).toBe(true);
  });
});

describe("pageRows — which filters are this file's", () => {
  it("does not narrow by the four the SERVER takes", () => {
    // topicSlug / disposition / state reach `seo.list_page_intents`; narrowing
    // them a second time here would silently hide rows the server already
    // answered for.
    const serverOnly = filters({ topicSlug: "live-there", disposition: "keep", state: "done" });
    expect(hasClientSideNarrowing(serverOnly)).toBe(false);
    expect(narrowPageRows(ITEMS, serverOnly, 0).rows).toHaveLength(6);
    // …but the bar still knows a filter is on, so the empty state says so.
    expect(hasAnyPageFilter(serverOnly)).toBe(true);
  });

  it("reports no narrowing at all when nothing is set", () => {
    expect(hasClientSideNarrowing(filters())).toBe(false);
    expect(hasAnyPageFilter(filters())).toBe(false);
    const result = narrowPageRows(ITEMS, filters(), 0);
    expect(result.narrowed).toBe(false);
    expect(result.rows).toBe(ITEMS);
  });
});

describe("pageRows — intent progress over the loaded rows", () => {
  it("counts the recorded states and leaves the intentless rows out of both", () => {
    // Recorded: arriver accepted; mover, orphan-one, orphan-two proposed;
    // p1 and p2 carry no intent.
    expect(loadedIntentProgress(ITEMS)).toEqual({
      proposed: 3,
      accepted: 1,
      done: 0,
      withIntent: 4,
      loaded: 6,
    });
  });

  it("hands the review deck exactly the proposed rows", () => {
    expect(proposedIntentRows(ITEMS).map((item) => item.page.label)).toEqual([
      "https://tmdc-a-7a6b5311.invalid/mover",
      "https://tmdc-a-7a6b5311.invalid/orphan-one",
      "https://tmdc-a-7a6b5311.invalid/orphan-two",
    ]);
  });
});
