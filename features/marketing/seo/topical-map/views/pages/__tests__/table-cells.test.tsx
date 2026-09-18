// features/marketing/seo/topical-map/views/pages/__tests__/table-cells.test.tsx
//
// THE TWO ROUND-22 CELLS AND THE ABSENT-IS-NOT-ZERO CELL, rendered from the
// RECORDED bytes of `seo.list_page_intents`
// (`redux/__fixtures__/listPageIntentsRound22.ts`).
//
// It renders the real `cell` renderers `pageColumns()` hands the table — the
// exact functions `MatrxDataTable` calls once per row — rather than driving the
// whole grid. The grid is a third-party primitive with its own tests; what this
// lane owes a guard for is that a recorded `current_topics: []` prints the
// words "on no topic", a recorded intent with NO `topic` key prints
// "destination left the map", and a page ref with no `clicks` key prints an em
// dash and not "0". Each of those goes red on its own if the cell falls back to
// `?.` and stops, or to `?? 0`.
//
// 🚨 WHY NOT @testing-library/react: it is not a dependency of this repo and
// never has been — see `test-utils/renderHook.tsx`, which documents the ruling
// and uses `react-dom/client` + React 19's built-in `act` instead. This file
// follows that existing repo pattern. The lane brief named the library; the
// library is absent, and adding one to the lockfile is not this builder's to
// do, so the harness below is eleven lines of the repo's own convention.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import type { MapLinks } from "../../../links";
import type { PageIntentItem } from "../../../types";
import { pageColumns } from "../pageColumns";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const MAP_ID = "map-under-test";

/**
 * The org's `intent_colors` knob, as the lane brief pins it. Every colour on
 * this screen comes from the knob — never from a constant in a component — so
 * a test must supply one rather than let a default appear from nowhere.
 */
const INTENT_COLORS = {
  in_place: "green",
  leaving: "amber",
  arriving: "blue",
  delete: "red",
  missing: "gray_dashed",
  planned: "purple_dashed",
} as const;

/** A real `MapLinks`, not a partial cast — the brand-free id doors. */
const LINKS: MapLinks = {
  brandSeg: null,
  home: () => null,
  mapView: (mapId, screen) => `/map/${mapId}/${screen}`,
  topic: (mapId, slug) => `/map/${mapId}?topic=${slug}`,
  topicById: (topicId) => `/topics/${topicId}`,
  page: (pageId) => `/marketing/pages/${pageId}`,
  planNode: (nodeId) => `/marketing/content-plan/nodes/${nodeId}`,
  site: (siteId) => `/marketing/sites/${siteId}`,
  keywordWorkbench: () => null,
};

const COLUMNS = pageColumns({ mapId: MAP_ID, knobs: { intent_colors: INTENT_COLORS }, links: LINKS });

function columnById(id: string) {
  const column = COLUMNS.find((candidate) => candidate.id === id);
  if (!column?.cell) throw new Error(`No cell renderer for the "${id}" column.`);
  return column.cell;
}

const ITEMS = RECORDED_PAGE_INTENTS_ROUND22.items;

function recorded(label: string): PageIntentItem {
  const item = ITEMS.find((candidate) => candidate.page.label?.endsWith(`/${label}`));
  if (!item) throw new Error(`The recorded fixture has no "${label}" row.`);
  return item;
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderCell(columnId: string, item: PageIntentItem): Promise<HTMLElement> {
  const cell = columnById(columnId);
  await act(async () => root.render(<>{cell(item, 0)}</>));
  return container;
}

describe("the `Covers` cell — `current_topics: []` is a real state", () => {
  it('says "on no topic" for a recorded row whose only topic was rejected', async () => {
    // orphan-one: recorded with `current_topics: []` because its topic was
    // REJECTED. Before round 22 this page fell out of the read entirely.
    const node = await renderCell("current_topics", recorded("orphan-one"));
    expect(node.textContent).toContain("on no topic");
    expect(node.textContent?.trim()).not.toBe("");
  });

  it("lists the live topics of a recorded row that covers some", async () => {
    // p2 is recorded covering two live topics.
    const node = await renderCell("current_topics", recorded("p2"));
    expect(node.textContent).toContain("Alpha");
    expect(node.textContent).toContain("Sect-B");
    expect(node.textContent).not.toContain("on no topic");
    // Every topic named is a door, addressed by slug.
    const hrefs = [...node.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      `/map/${MAP_ID}?topic=alpha`,
      `/map/${MAP_ID}?topic=sect-b`,
    ]);
  });

  it("carries the recorded confidence and source in the chip's title", async () => {
    const node = await renderCell("current_topics", recorded("p1"));
    expect(node.querySelector("a")?.getAttribute("title")).toBe(
      "alpha · confidence 70 · by agent",
    );
  });
});

describe("the `Going to` cell — an intent whose destination left the map", () => {
  it('says "destination left the map" for a recorded intent with NO `topic` key', async () => {
    // orphan-two: recorded intent (disposition `keep`, state `proposed`) whose
    // topic was RETIRED, so the server renders the intent and omits `topic`.
    const orphan = recorded("orphan-two");
    expect("topic" in (orphan.intent ?? {})).toBe(false);

    const node = await renderCell("destination", orphan);
    expect(node.textContent).toContain("destination left the map");
  });

  it("links the destination of a recorded intent whose topic is live", async () => {
    // arriver: recorded intent `move` → the live topic `live-there`.
    const node = await renderCell("destination", recorded("arriver"));
    expect(node.textContent).toContain("Live there");
    expect(node.textContent).not.toContain("destination left the map");
    expect(node.querySelector("a")?.getAttribute("href")).toBe(
      `/map/${MAP_ID}?topic=live-there`,
    );
  });

  it("says there is no intent — audibly — for a recorded row that carries none", async () => {
    // p1 is recorded with `intent: null`.
    const node = await renderCell("destination", recorded("p1"));
    expect(node.textContent).toContain("—");
    // A screen reader gets the word, not a dash. (The cell carries two sr-only
    // nodes: `IntentDot`'s own tone sentence comes first, then this one.)
    const spoken = [...node.querySelectorAll(".sr-only")].map((el) => el.textContent);
    expect(spoken).toContain("no intent");
  });
});

describe("the `Clicks` cell — absent is not zero", () => {
  it("renders a recorded `clicks: 0` as a real 0", async () => {
    const node = await renderCell("clicks", recorded("p1"));
    expect(node.textContent).toContain("0");
    expect(node.textContent).not.toContain("—");
  });

  it('renders an em dash, not "0", when the page ref carries no `clicks` key', async () => {
    // THE ONLY ALLOWED EDIT TO A RECORDED ROW: delete the key. The server
    // strips a key rather than sending null, and a `web_page` pointer the
    // caller cannot open carries no traffic at all — but every row recorded
    // here happens to be measurable, so the absence is produced by removing the
    // key from a real row instead of inventing a whole page that never existed.
    const measured = recorded("p1");
    const page = { ...measured.page };
    delete (page as Partial<typeof page>).clicks;
    const unmeasured: PageIntentItem = { ...measured, page };

    const node = await renderCell("clicks", unmeasured);
    expect(node.textContent).toContain("—");
    expect(node.textContent).not.toContain("0");
    expect(node.querySelector("[title]")?.getAttribute("title")).toBe(
      "not measured for this page",
    );
  });

  it("does the same on the impressions column, independently of clicks", async () => {
    const measured = recorded("p1");
    const page = { ...measured.page };
    delete (page as Partial<typeof page>).impressions;
    const node = await renderCell("impressions", { ...measured, page });
    expect(node.textContent).toContain("—");
    expect(node.textContent).not.toContain("0");
  });
});

describe("every column refuses a control the read cannot serve", () => {
  it("declares no sort and no filter anywhere — the read has no ORDER BY", async () => {
    // A sortable column here could only re-order the loaded page while looking
    // like a sort of all of them.
    expect(COLUMNS.every((column) => column.sortable === false)).toBe(true);
    expect(COLUMNS.every((column) => column.filter === false)).toBe(true);
  });
});

describe("the `Region` cell — the read carries no region, and the column says so", () => {
  it("stands where the plan puts it, between Impressions and Note", async () => {
    expect(COLUMNS.map((column) => column.id)).toEqual([
      "page",
      "current_topics",
      "destination",
      "disposition",
      "state",
      "source",
      "clicks",
      "impressions",
      "region",
      "note",
    ]);
  });

  it("renders the stated absence for a recorded row — never a blank cell", async () => {
    // Every row `seo.list_page_intents` returns is recorded here, and NOT ONE
    // of them carries a region: the function takes no region argument and its
    // `web_page` refs are `seo._tm_ref`s without the facet. A blank cell would
    // read as "this page has no region", which is a different and unknown
    // fact, so the cell says what is true — nobody measured it on this read.
    for (const item of ITEMS) {
      const node = await renderCell("region", item);
      expect(node.textContent?.trim()).not.toBe("");
      expect(node.textContent).toContain("—");
      expect(node.querySelector("[title]")?.getAttribute("title")).toContain(
        "not measured on this read",
      );
    }
  });

  it("carries the reason on the column HEADER, not only in the cell", async () => {
    // The person scanning a column of dashes reads the header first, so the
    // header itself says why every cell is empty and where a region DOES live.
    const region = COLUMNS.find((column) => column.id === "region");
    if (!region) throw new Error("There is no region column.");
    await act(async () => root.render(<>{region.header}</>));
    const titled = container.querySelector("[title]")?.getAttribute("title") ?? "";
    expect(container.textContent).toContain("Region");
    expect(titled).toContain("not measured on this read");
    expect(titled).toContain("seo.list_page_intents");
  });
});
