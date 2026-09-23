/**
 * THE DEFAULT TABLE TELLS TWO SAME-NAMED RULEBOOKS APART — cold walk 22, D.
 *
 * `/masterwork/all`, default Table view: walk 21's two twins read
 *   "walk21-Repaint or Reco… · An assistant that decides, th… · Nothing yet ·
 *    0 · v1 · Draft · 6h ago · 6h ago"
 * — identical rows; the times existed only as hover titles. The card view
 * separated them to the minute (e061e09c22). A table cell cannot see its
 * neighbours, so the fix lives in the table primitive (`EntityListTable`),
 * fed by the SAME lookalike spec the cards use.
 *
 * Rendered through the real `EntityListPage` with the real Rulebook list
 * config and columns; only the data service is replaced with the walk's two
 * rows. RED before: both rows' visible text was identical.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/masterwork/all",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { makeStore } from "@/lib/redux/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { EMPTY_FACETS } from "@/lib/entity-list/types";
import type { EntityListConfig } from "@/lib/entity-list/config";
import { rulebookListConfig } from "../listConfig";
import type { RulebookListRow } from "../../types";

const GOAL =
  "An assistant that decides, the way I do as a residential repainting contractor, whether a wall gets a recoat or a full repaint";

function twin(id: string, createdAt: string): RulebookListRow {
  return {
    id,
    name: "walk21-Repaint or Recoat Verdict",
    slug: `walk21-repaint-or-recoat-verdict-${id}`,
    description: GOAL,
    source: {},
    sources: { state: "read", total: 0, partial: false, groups: [] },
    version: 1,
    status: "draft",
    visibility: "personal",
    rule_count: 0,
    created_by: "expert",
    organization_id: "org",
    created_at: createdAt,
    updated_at: createdAt,
  } as unknown as RulebookListRow;
}

// Walk 21's pair: one minute apart on the same day (12:34 PM vs 12:35 PM).
const TWINS = [
  twin("bdb58a94", "2026-09-22T19:34:31.000Z"),
  twin("7d54bcd7", "2026-09-22T19:35:34.000Z"),
];

let container: HTMLDivElement;
let root: Root;

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("two same-named Rulebooks never render as the same row twice", async () => {
  const config: EntityListConfig<RulebookListRow> = {
    ...rulebookListConfig,
    surfaceKey: `twins-${Math.random().toString(36).slice(2)}`,
    service: {
      fetchPage: async () => ({ rows: TWINS, total: TWINS.length }),
      fetchCounts: async () => ({ byKind: {}, narrow: {} }),
      fetchFacets: async () => EMPTY_FACETS,
    },
  } as EntityListConfig<RulebookListRow>;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={makeStore()}>
        <TooltipProvider>
          <EntityListPage config={config} />
        </TooltipProvider>
      </Provider>,
    );
  });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }

  const rows = Array.from(
    container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  ).filter((tr) => (tr.textContent ?? "").includes("walk21-Repaint"));
  expect(rows).toHaveLength(2);
  const [a, b] = rows.map((tr) => tr.textContent ?? "");
  expect(a).not.toBe(b);
  // The difference is the creation minute, in the visible cell, not a title.
  const notes = rows.map(
    (tr) => tr.querySelector("[data-lookalike-note]")?.textContent ?? "",
  );
  expect(notes[0]).toMatch(/^Started .+ at \d{1,2}:\d{2}/);
  expect(notes[1]).toMatch(/^Started .+ at \d{1,2}:\d{2}/);
  expect(notes[0]).not.toBe(notes[1]);
});
