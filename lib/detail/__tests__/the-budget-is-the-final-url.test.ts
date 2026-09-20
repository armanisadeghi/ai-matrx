// 🚨 NEW-19 / NEW-20 (VERIFY-U-P1-R4) — THE BUDGET BELONGS TO THE FINAL URL.
//
// The trim measured the list VALUE one escaping layer too early, so the numbers
// the code promised were not the numbers the browser carried:
//
//   * a detail WINDOW's deep link measured 5,992 characters against a 6,000
//     budget and reached the address bar at 7,416, because `UrlPanelManager`
//     writes the token through `new URLSearchParams(...).toString()`, which
//     re-escapes every `%` the token's own escaping produced;
//   * a detail PAGE that also carries an open window was 13,433 characters —
//     `?l=…` (5,978) plus `panels=…` (7,352) in ONE address — past the 8 KB
//     request line the code itself names, so the edge answers 414 and the link
//     is dead. Nothing bounded the whole URL; each value was bounded alone.
//
// The rule: ONE budget, the request line's, measured on the FINAL serialized URL
// with everything else in it RESERVED. The id cap (`ui.detail.list_context_max_
// ids`) then decides everything that fits inside it — and its ceiling is the
// number that actually travels (NEW-20: at the old ceiling of 500 every value
// from 139 up behaved identically, while the knob's live basis text told an
// administrator 200 records would travel).

import { trimListContext } from "../listContext";
import {
  detailListToUrlArgs,
  finalPanelUrlLength,
  panelListValueBytes,
  panelUrlReserveBytes,
} from "../presentation";
import {
  DETAIL_LIST_CONTEXT_MAX_IDS_CEILING,
  DETAIL_URL_BUDGET_BYTES,
  type DetailRef,
} from "../types";

const items = (n: number, type = "file"): DetailRef[] =>
  Array.from({ length: n }, (_, i) => ({
    type,
    id: `${String(i).padStart(8, "0")}-2222-3333-4444-555555555555`,
  }));

/** The page presentation's href, spelled exactly as `detailPageHref` spells it. */
function pageUrl(list: { items: DetailRef[]; index: number; trimmedFrom?: number }): string {
  const encoded = list.items
    .map((r) => `${encodeURIComponent(r.type)}.${encodeURIComponent(r.id)}`)
    .join(",");
  const lt = list.trimmedFrom ? `&lt=${list.trimmedFrom}` : "";
  return `/detail/file/${items(1)[0].id}?l=${encoded}&i=${list.index}${lt}`;
}

describe("the URL a trimmed list really produces", () => {
  it("keeps a detail WINDOW's deep link inside the request-line budget, measured after the last escaping", () => {
    const list = { items: items(500), index: 250 };
    const args = detailListToUrlArgs(list, DETAIL_LIST_CONTEXT_MAX_IDS_CEILING, {
      reservedBytes: "/dashboard".length,
    });
    const final = finalPanelUrlLength("/dashboard", "detail:file.x:as-window", args);
    expect(final).toBeLessThanOrEqual(DETAIL_URL_BUDGET_BYTES);
    // And it still carries a usable window, not one record.
    expect(args.l).toBeTruthy();
    expect(Number(args.lt)).toBe(500);
  });

  it("keeps a detail PAGE that also carries an open window inside the same budget", () => {
    // The page's own query first — the address the person is already on.
    const page = trimListContext({ items: items(500), index: 250 }, DETAIL_LIST_CONTEXT_MAX_IDS_CEILING, {
      measure: (list) => pageUrl({ items: [...list], index: 250 }).length,
    });
    const here = pageUrl({ items: page!.items, index: page!.index, trimmedFrom: page!.trimmedFrom });
    expect(here.length).toBeLessThanOrEqual(DETAIL_URL_BUDGET_BYTES);
    // Now a record opened IN PLACE from that page: the window's token is merged
    // into the query that is already there, so the rest of the URL is reserved.
    const args = detailListToUrlArgs(
      { items: items(500), index: 250 },
      DETAIL_LIST_CONTEXT_MAX_IDS_CEILING,
      // What the page's own query costs ONCE `URLSearchParams` re-serializes it
      // beside the new `panels` parameter — its raw commas become `%2C` at that
      // instant, which is 70 characters this guard caught on its first run.
      { reservedBytes: panelUrlReserveBytes(here) },
    );
    const final = finalPanelUrlLength(here, "detail:file.x:as-window", args);
    expect(final).toBeLessThanOrEqual(DETAIL_URL_BUDGET_BYTES);
  });

  it("measures the panel list value as the address bar carries it, not as the token spells it", () => {
    const one = items(1);
    // `%2D` inside the token becomes `%252D` in the final URL: a uuid costs far
    // more than its own escaping suggests, which is the whole of NEW-19.
    expect(panelListValueBytes(one)).toBeGreaterThan(
      one[0].type.length + one[0].id.length + 1,
    );
    const args = detailListToUrlArgs({ items: items(200), index: 100 }, 200, {
      reservedBytes: 0,
    });
    const asTheTokenSpellsIt = args.l.length;
    const asTheUrlCarriesIt = encodeURIComponent(args.l).length;
    expect(asTheUrlCarriesIt).toBeGreaterThan(asTheTokenSpellsIt);
    expect(finalPanelUrlLength("/x", "detail:file.x:as-window", args)).toBeLessThanOrEqual(
      DETAIL_URL_BUDGET_BYTES,
    );
  });

  it("delivers the id cap the knob asks for, at every value up to its ceiling (NEW-20)", () => {
    // The ceiling is the promise the URL can keep: every value below it must
    // change what travels, or the knob is a setting that does nothing.
    const counts = new Set<number>();
    for (const max of [10, 25, 50, 75, DETAIL_LIST_CONTEXT_MAX_IDS_CEILING]) {
      const args = detailListToUrlArgs({ items: items(500), index: 250 }, max, {
        reservedBytes: "/dashboard".length,
      });
      const carried = args.l.split("%2C").length;
      expect(carried).toBe(max);
      counts.add(carried);
    }
    expect(counts.size).toBe(5);
  });
});
