/**
 * THE FILTERS BUTTON NEVER OPENS AN EMPTY BOX (page-pass 2026-09-27,
 * /connected-sources: no sortable column, no facet, no archive axis — the
 * button opened a panel holding only its title). Break: the trigger renders
 * with nothing behind it → red.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EntityFilterPanel } from "../components/EntityFilterPanel";
import { DEFAULT_ENTITY_LIST_QUERY, EMPTY_FACETS } from "../types";
import type { EntityColumnSpec } from "../columns";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string; name: string };
const col = (id: string, sortable?: boolean) =>
  ({ id, label: id, column: { id, header: id, ...(sortable === undefined ? {} : { sortable }) } }) as unknown as EntityColumnSpec<Row>;

async function render(columns: EntityColumnSpec<Row>[], hasArchived: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <EntityFilterPanel<Row>
        query={DEFAULT_ENTITY_LIST_QUERY}
        facets={EMPTY_FACETS}
        columns={columns}
        hasFavorites={false}
        hasArchived={hasArchived}
        sort="updated"
        direction="desc"
        favoritesFirst={false}
        onPatchQuery={() => {}}
        onSortChange={() => {}}
        onFavoritesFirstChange={() => {}}
        onResetFilters={() => {}}
      />,
    );
  });
  const found = host.querySelector('button[aria-label^="Filters"]');
  act(() => root.unmount());
  host.remove();
  return found;
}

it("nothing to filter or sort → no Filters button", async () => {
  expect(await render([col("name", false)], false)).toBeNull();
});

it("something to sort, or an archive axis → the button is there", async () => {
  expect(await render([col("name")], false)).not.toBeNull();
  expect(await render([col("name", false)], true)).not.toBeNull();
});
