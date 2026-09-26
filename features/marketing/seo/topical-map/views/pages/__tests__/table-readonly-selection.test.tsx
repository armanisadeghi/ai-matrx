// features/marketing/seo/topical-map/views/pages/__tests__/table-readonly-selection.test.tsx
//
// 🚨 `readOnly` MEANS THE WRITE CONTROLS ARE ABSENT, NOT DISABLED. A record-only
// grantee and a canvas viewer must not see a checkbox column or a bulk bar at
// all — a greyed checkbox advertises a write `seo.set_page_intents` would
// refuse, and a bulk bar that appears and then explains itself is the dead
// control law 4 forbids.
//
// The checkbox column and the bulk bar are BOTH owned by `MatrxDataTable`'s
// `selection` prop: the package renders the leading column, the per-row
// control and the bar if and only if that key is present (see its
// `MatrxDataTableSelectionConfig`, and the same contract spelled out in
// `lib/entity-list/components/EntityListTable.tsx` — "passing a zero-state
// selection object instead would add a checkbox column to eighteen list
// surfaces on the strength of a default"). So the falsifiable assertion is on
// the props the table actually receives: the KEY IS ABSENT, not present and
// empty. Pass `selection={undefined}` instead of spreading and this goes red.
//
// The table primitive itself is mocked to a prop recorder — it is a
// third-party grid with its own tests, and driving its internals here would
// test the package rather than this lane's contract with it.
//
// Harness: `react-dom/client` + React 19 `act`, the repo's own convention —
// @testing-library/react is deliberately not a dependency (test-utils/renderHook.tsx).

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let lastTableProps: Record<string, unknown> | null = null;
let bulkActionsRendered = 0;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  ...jest.requireActual("@ai-matrx/design-system/data-table"),
  MatrxDataTable: (props: Record<string, unknown>) => {
    lastTableProps = props;
    return null;
  },
}));

jest.mock("@/components/official/MatrxDataTableHost", () => ({
  MatrxDataTableHost: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The sibling builder owns this path and it does not exist at this commit, so
// the mock is virtual. The seam it stands in for is `PagesBulkActionsProps`
// from `../seams.ts`, which is frozen.
jest.mock(
  "../bulk/PagesBulkActions",
  () => ({
    PagesBulkActions: () => {
      bulkActionsRendered += 1;
      return null;
    },
  }),
  { virtual: true },
);

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  // The table reads exactly one thing from the store here: the checked page
  // ids. Nothing selected is the honest starting state.
  useAppSelector: () => [],
}));

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import type { TopicalMapKnobs } from "../../../knobs";
import type { PageIntentItem } from "../../../types";
import { PagesTable } from "../PagesTable";
import type { PagesWorkspaceContext } from "../seams";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RESULT = RECORDED_PAGE_INTENTS_ROUND22;

const INTENT_COLORS = {
  in_place: "green",
  leaving: "amber",
  arriving: "blue",
  delete: "red",
  missing: "gray_dashed",
  planned: "purple_dashed",
} as const;

/**
 * The columns read exactly one knob (`intent_colors`), and the workspace
 * context carries the whole set. `Object.create` gives a real `TopicalMapKnobs`
 * object with that one key set, without casting a partial literal into the
 * full 53-key shape — the knobs this table touches are honest, and any other
 * key it started reading would come back `undefined` loudly rather than being
 * silently type-approved.
 */
const KNOBS: TopicalMapKnobs = Object.assign(Object.create(null) as TopicalMapKnobs, {
  intent_colors: INTENT_COLORS,
  pages_low_traffic_clicks_max: 0,
});

function contextWith(readOnly: boolean): PagesWorkspaceContext {
  return {
    mapId: "map-under-test",
    siteId: "46690e56-6b25-45b9-ac91-611c92b3cf61",
    readOnly,
    knobs: KNOBS,
    organizationId: "org-under-test",
    siteIds: ["46690e56-6b25-45b9-ac91-611c92b3cf61"],
  };
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  lastTableProps = null;
  bulkActionsRendered = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderTable(readOnly: boolean) {
  await act(async () =>
    root.render(
      <PagesTable
        context={contextWith(readOnly)}
        result={RESULT}
        narrowed={{
          rows: RESULT.items,
          loaded: RESULT.items.length,
          narrowed: false,
          hidden: 0,
        }}
        page={1}
        pageSize={50}
        onQueryChange={() => {}}
        isFetching={false}
        onNoTopicCount={0}
        filtersActive={false}
        onClearFilters={() => {}}
        onSettled={() => {}}
      />,
    ),
  );
  if (!lastTableProps) throw new Error("The table never rendered.");
  return lastTableProps;
}

describe("readOnly — the write controls are absent", () => {
  it("hands the table NO `selection` key at all, so there is no checkbox column and no bulk bar", async () => {
    const props = await renderTable(true);
    expect("selection" in props).toBe(false);
    expect(props.selection).toBeUndefined();
    expect(bulkActionsRendered).toBe(0);
  });

  it("still renders every row — a read-only viewer sees the whole list", async () => {
    const props = await renderTable(true);
    expect(props.data).toHaveLength(RESULT.items.length);
  });
});

describe("a writer — the selection contract", () => {
  it("hands the table a real `selection`, which is what draws the checkbox column", async () => {
    const props = await renderTable(false);
    expect("selection" in props).toBe(true);
    const selection = props.selection as {
      selectedIds: string[];
      noun: string;
      isRowSelectable: (item: PageIntentItem) => boolean;
      actions: (selected: PageIntentItem[], ids: string[]) => React.ReactNode;
    };
    expect(selection.noun).toBe("page");
    expect(selection.selectedIds).toEqual([]);
  });

  it("offers no checkbox on a row that carries no site — the write would have no site to name", async () => {
    const props = await renderTable(false);
    const selection = props.selection as {
      isRowSelectable: (item: PageIntentItem) => boolean;
    };
    // Every recorded row carries `site_id`.
    expect(RESULT.items.every((item) => selection.isRowSelectable(item))).toBe(true);

    // Delete the key from a recorded row — the shape a page the caller cannot
    // fully resolve comes back as — and the checkbox must be refused rather
    // than rendered and then rejected by `seo.set_page_intents`.
    const recorded = RESULT.items[0];
    const page = { ...recorded.page };
    delete (page as Partial<typeof page>).site_id;
    expect(selection.isRowSelectable({ ...recorded, page })).toBe(false);
  });

  it("puts the sibling bulk bar behind that selection, not on the page", async () => {
    const props = await renderTable(false);
    const selection = props.selection as {
      actions: (selected: PageIntentItem[], ids: string[]) => React.ReactNode;
    };
    // Nothing rendered it while nothing was selected…
    expect(bulkActionsRendered).toBe(0);
    // …and the bar the table would raise IS the sibling's component.
    await act(async () =>
      root.render(<>{selection.actions([RESULT.items[0]], [RESULT.items[0].page.id])}</>),
    );
    expect(bulkActionsRendered).toBe(1);
  });
});
