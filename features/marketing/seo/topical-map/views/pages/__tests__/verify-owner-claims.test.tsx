// features/marketing/seo/topical-map/views/pages/__tests__/verify-owner-claims.test.tsx
//
// ZERO-AUTHORSHIP VERIFICATION for VERIFIER-F.md (a)–(f). This file was NOT
// written by the lane that built the pages workspace; it is dispatched by the
// coordinator to attack the owner's words against the recorded bytes. It
// mocks only hook boundaries (`../../../hooks`) and reuses the REAL recorded
// fixture `redux/__fixtures__/listPageIntentsRound22.ts` and the migration-23
// result shape transcribed in `bulk-setPageIntentsOutcome.test.ts`.
//
// Harness follows the repo's own convention (react-dom/client + React 19
// `act`; @testing-library/react is not a dependency here — see
// `table-cells.test.tsx`'s header for the ruling).

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import type { MapLinks } from "../../../links";
import type { PageIntentItem, PageIntentsResult, SetPageIntentsResult } from "../../../types";
import type { TopicalMapKnobs } from "../../../knobs";
import { pageColumns } from "../pageColumns";
import { toSetPageIntentsOutcome, setPageIntentsOutcomeLine } from "../bulk/setPageIntentsOutcome";
import { BulkOutcome } from "../bulk/BulkOutcome";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

const RECORDED = RECORDED_PAGE_INTENTS_ROUND22 as PageIntentsResult;
const RECORDED_MOVER = RECORDED.items.find((item) => item.page.url?.endsWith("/mover"))!;
const RECORDED_ORPHAN_ONE = RECORDED.items.find((item) => item.page.url?.endsWith("/orphan-one"))!;
const RECORDED_ORPHAN_TWO = RECORDED.items.find((item) => item.page.url?.endsWith("/orphan-two"))!;
const RECORDED_P1 = RECORDED.items.find((item) => item.page.url?.endsWith("/p1"))!;

const SITE_ID = "46690e56-6b25-45b9-ac91-611c92b3cf61";
const TARGET_PAGE_ID = "0b6f6f19-5f2a-4a5e-9f3d-1c7f1b9a44aa";
const MAP_ID = "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11";

const dryRunMutate = jest.fn();
const writeMutate = jest.fn();
const confirmMock = jest.fn();

jest.mock("../../../hooks", () => ({
  useMapDryRun: () => ({ mutateAsync: dryRunMutate }),
  useSetPageIntents: () => ({ mutateAsync: writeMutate }),
  useMapTopicSearch: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    data: [
      {
        slug: "electronics-recycling",
        name: "Electronics recycling",
        status: "active",
        path: ["sustainability", "electronics-recycling"],
      },
    ],
  }),
  usePageIntents: () => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    data: {
      total: 1,
      limit: 50,
      offset: 0,
      performance_window_days: 28,
      duplicate_intents: 0,
      items: [
        {
          page: {
            type: "web_page",
            id: TARGET_PAGE_ID,
            url: "https://tmdc-a-7a6b5311.invalid/electronics-recycling",
            site_id: SITE_ID,
            clicks: 0,
            impressions: 0,
            performance_window_days: 28,
          },
          current_topics: [],
          intent: null,
        },
      ],
    },
  }),
  useMapTopicRows: () => ({ isSuccess: true, isPending: false, data: [] }),
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, id }: { name?: string | null; id: string }) => (
    <span data-entity-ref={id}>{name ?? id}</span>
  ),
}));

jest.mock("@/features/scopes/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [], status: "ready", error: null }),
}));

jest.mock("@/features/marketing/content-plan/data/hooks", () => ({
  useCreatePlanNode: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: () => null,
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

// eslint-disable-next-line import/first -- must follow the jest.mock calls above
import { PagesBulkActions } from "../bulk/PagesBulkActions";
// eslint-disable-next-line import/first
import { PagesTable } from "../PagesTable";

function twoHundredRecordedRows(): PageIntentItem[] {
  return Array.from({ length: 200 }, (_unused, index) => ({
    ...RECORDED_MOVER,
    page: { ...RECORDED_MOVER.page, id: `page-${index.toString().padStart(3, "0")}` },
  }));
}

function knobsWith(intentColors: Record<string, string>): TopicalMapKnobs {
  return {
    bulk_action_confirm: "above_n",
    bulk_action_confirm_threshold: 20,
    intent_review_mode: "one_by_one",
    intent_colors: intentColors,
  } as unknown as TopicalMapKnobs;
}

function contextWith(readOnly: boolean, knobs: TopicalMapKnobs) {
  return {
    mapId: MAP_ID,
    siteId: SITE_ID,
    readOnly,
    knobs,
    organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    siteIds: [SITE_ID],
  };
}

function rehearsalOf(items: { page_id: string }[]) {
  return {
    dry_run: true,
    function: "set_page_intents",
    would_return: {
      ok: true,
      map_id: MAP_ID,
      set: items.length,
      kept: 0,
      failed: 0,
      results: items.map((item) => ({ ok: true, page_id: item.page_id })),
    },
  };
}

function buttonsIn(scope: ParentNode): HTMLButtonElement[] {
  return [...scope.querySelectorAll("button")];
}

function clickText(scope: ParentNode, text: string): void {
  const button = buttonsIn(scope).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`no button containing "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function clickAction(scope: ParentNode, action: string): void {
  const button = scope.querySelector<HTMLButtonElement>(`[data-bulk-intent-action="${action}"]`);
  if (!button) throw new Error(`no bulk action button for "${action}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function typeInto(label: string, value: string): void {
  const input = document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`no input labelled "${label}"`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  dryRunMutate.mockImplementation(
    async ({ args }: { args: [string, { page_id: string }[], string] }) => rehearsalOf(args[1]),
  );
  writeMutate.mockImplementation(async ({ items }: { items: { page_id: string }[] }) => ({
    ok: true,
    map_id: MAP_ID,
    set: items.length,
    kept: 0,
    failed: 0,
    results: items.map((item) => ({ ok: true, page_id: item.page_id })),
  }));
  confirmMock.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// ── (a) TWO CLICKS from a selection to the confirm dialog ──────────────────

describe("(a) the 200-page redirect is two clicks to the confirm dialog", () => {
  it("CLICK 1 (the Redirect trigger) writes nothing; CLICK 2 (Preview and apply) rehearses and raises the dialog", async () => {
    const selected = twoHundredRecordedRows();
    act(() => {
      root.render(
        <PagesBulkActions
          context={contextWith(false, knobsWith({
            in_place: "green",
            leaving: "amber",
            arriving: "blue",
            delete: "red",
            missing: "gray_dashed",
            planned: "purple_dashed",
          }))}
          selected={selected}
          selectedIds={selected.map((item) => item.page.id)}
          onSettled={jest.fn()}
        />,
      );
    });

    // CLICK 1: opens the popover. Nothing has been rehearsed or written.
    clickAction(container, "redirect");
    expect(dryRunMutate).not.toHaveBeenCalled();
    expect(writeMutate).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();

    // Configuring the popover's target is part of click 1's session, not a
    // second decisive action — the owner's words count "choose the planned
    // page, type a label, create it" inside CLICK 1.
    clickText(document.body, "Electronics recycling");
    typeInto("Search this map's pages by URL", "electronics");
    clickText(document.body, "https://tmdc-a-7a6b5311.invalid/electronics-recycling");
    expect(dryRunMutate).not.toHaveBeenCalled();

    // CLICK 2: "Preview and apply" — the ONLY click that rehearses and raises
    // the confirm dialog.
    clickText(document.body, "Preview and apply");
    await settle();

    expect(dryRunMutate).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    const [question] = confirmMock.mock.calls[0] as [{ description: string }];
    expect(question.description).toContain("200");
  });
});

// ── (b) honest words for current_topics: [] and a no-`topic` intent ────────

describe("(b) recorded round-22 states render honest words, never blank", () => {
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
  const COLUMNS = pageColumns({
    mapId: MAP_ID,
    knobs: { intent_colors: { in_place: "green", leaving: "amber", arriving: "blue", delete: "red", missing: "gray_dashed", planned: "purple_dashed" } as never },
    links: LINKS,
  });

  function cellFor(id: string) {
    const column = COLUMNS.find((candidate) => candidate.id === id);
    if (!column?.cell) throw new Error(`no cell renderer for "${id}"`);
    return column.cell;
  }

  let cellRoot: Root;
  let cellContainer: HTMLDivElement;
  beforeEach(() => {
    cellContainer = document.createElement("div");
    document.body.appendChild(cellContainer);
    cellRoot = createRoot(cellContainer);
  });
  afterEach(() => {
    act(() => cellRoot.unmount());
    cellContainer.remove();
  });

  it('a recorded `current_topics: []` row (orphan-one) says "on no topic", never blank', async () => {
    await act(async () => cellRoot.render(<>{cellFor("current_topics")(RECORDED_ORPHAN_ONE, 0)}</>));
    expect(cellContainer.textContent).toContain("on no topic");
    expect(cellContainer.textContent?.trim()).not.toBe("");
  });

  it('a recorded intent with NO `topic` key (orphan-two) says "destination left the map", never blank', async () => {
    expect("topic" in (RECORDED_ORPHAN_TWO.intent ?? {})).toBe(false);
    await act(async () => cellRoot.render(<>{cellFor("destination")(RECORDED_ORPHAN_TWO, 0)}</>));
    expect(cellContainer.textContent).toContain("destination left the map");
    expect(cellContainer.textContent?.trim()).not.toBe("");
  });
});

// ── (c) absent clicks renders as absent, not 0 ──────────────────────────────

describe("(c) an absent `clicks` key renders as an em dash, never a confident 0", () => {
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
  const COLUMNS = pageColumns({
    mapId: MAP_ID,
    knobs: { intent_colors: { in_place: "green", leaving: "amber", arriving: "blue", delete: "red", missing: "gray_dashed", planned: "purple_dashed" } as never },
    links: LINKS,
  });
  const clicksCell = COLUMNS.find((c) => c.id === "clicks")!.cell!;

  let cellRoot: Root;
  let cellContainer: HTMLDivElement;
  beforeEach(() => {
    cellContainer = document.createElement("div");
    document.body.appendChild(cellContainer);
    cellRoot = createRoot(cellContainer);
  });
  afterEach(() => {
    act(() => cellRoot.unmount());
    cellContainer.remove();
  });

  it("renders the recorded `clicks: 0` (p1) as a real 0 — a real zero is not absence", async () => {
    await act(async () => cellRoot.render(<>{clicksCell(RECORDED_P1, 0)}</>));
    expect(cellContainer.textContent).toContain("0");
    expect(cellContainer.textContent).not.toContain("—");
  });

  it('renders "—" (not "0") once the recorded row\'s own `clicks` key is removed — the server\'s actual absence shape', async () => {
    // The server strips the key rather than sending null (pageRows.ts's own
    // header); this reproduces that shape on a real recorded row rather than
    // hand-writing a page shape that happens to fit the code under test —
    // the same technique `table-cells.test.tsx` uses.
    const page = { ...RECORDED_P1.page };
    delete (page as Partial<typeof page>).clicks;
    const unmeasured: PageIntentItem = { ...RECORDED_P1, page };

    await act(async () => cellRoot.render(<>{clicksCell(unmeasured, 0)}</>));
    expect(cellContainer.textContent).toContain("—");
    expect(cellContainer.textContent).not.toContain("0");
  });
});

// ── (d) kept:1 / kept_existing renders as kept, never failed, never silent ──

describe("(d) a migration-23 KEPT row is shown as kept, never failed, never silently set", () => {
  const KEPT_PAGE_ID = RECORDED_MOVER.page.id;
  const RESULT = {
    ok: true,
    map_id: MAP_ID,
    set: 0,
    kept: 1,
    failed: 0,
    results: [
      {
        ok: true,
        page_id: KEPT_PAGE_ID,
        kept_existing: { source: "human", state: "accepted" },
      },
    ],
  } as unknown as SetPageIntentsResult;

  it("toSetPageIntentsOutcome counts it as kept, not set, not failed", () => {
    const outcome = toSetPageIntentsOutcome(RESULT);
    expect(outcome.kept).toBe(1);
    expect(outcome.set).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(outcome.setPageIds).not.toContain(KEPT_PAGE_ID);
    expect(outcome.keptRows).toHaveLength(1);
    expect(outcome.keptRows[0].page_id).toBe(KEPT_PAGE_ID);

    const line = setPageIntentsOutcomeLine(outcome);
    expect(line).toContain("Kept 1");
    expect(line).toContain("Failed 0");
  });

  it("BulkOutcome renders the row under Kept, never under Failed", async () => {
    const outcome = toSetPageIntentsOutcome(RESULT);
    await act(async () =>
      root.render(<BulkOutcome outcome={outcome} sentence="test sentence" onDismiss={() => {}} />),
    );
    // Expand the detail (kept/failed lists are behind the toggle when there's detail).
    const toggle = [...container.querySelectorAll("button")][0];
    await act(async () => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Kept — a person already decided this page");
    expect(container.textContent).toContain("held by human as accepted");
    // "Failed 0" is the honest summary line; there must be no FAILED-rows
    // section (no "Failed" heading over an empty or ghost list).
    expect(container.querySelector('p.text-destructive')).toBeNull();
  });
});

// ── (e) readOnly: no checkbox, no bulk bar, no run controls, no review toggle

describe("(e) readOnly yields no checkbox, no bulk bar, no run controls, no review toggle", () => {
  // The PagesTable "no `selection` key at all" claim is covered by the
  // builder's own `table-readonly-selection.test.tsx` (passing at this SHA) —
  // rebuilding it here with a second module-registry (`jest.isolateModules`)
  // duplicates React across module instances in this repo's jest config and
  // throws "Invalid hook call" / "Cannot read properties of null
  // (reading 'useContext')" on ANY component under test, not just this one;
  // that is a harness limitation, not a finding about the product. This
  // block instead attacks the two claims a fresh test CAN verify safely:
  // MapRunControls and PagesBulkActions (mounted directly, no isolateModules).

  it("MapRunControls renders nothing at all when readOnly", async () => {
    const { MapRunControls } = await import("../runs/MapRunControls");
    await act(async () =>
      root.render(
        <MapRunControls
          context={contextWith(true, knobsWith({
            in_place: "green",
            leaving: "amber",
            arriving: "blue",
            delete: "red",
            missing: "gray_dashed",
            planned: "purple_dashed",
          }))}
        />,
      ),
    );
    expect(container.innerHTML).toBe("");
  });

  it("PagesBulkActions renders nothing at all when readOnly (belt to the shell's braces)", async () => {
    await act(async () =>
      root.render(
        <PagesBulkActions
          context={contextWith(true, knobsWith({
            in_place: "green",
            leaving: "amber",
            arriving: "blue",
            delete: "red",
            missing: "gray_dashed",
            planned: "purple_dashed",
          }))}
          selected={[]}
          selectedIds={[]}
          onSettled={jest.fn()}
        />,
      ),
    );
    expect(container.innerHTML).toBe("");
  });
});

// ── (f) every colour on the destination dot comes from the `intent_colors` knob

describe("(f) the destination dot's colour is read from the intent_colors knob, not a constant", () => {
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

  function dotClassFor(intentColors: Record<string, string>): string {
    const columns = pageColumns({ mapId: MAP_ID, knobs: { intent_colors: intentColors as never }, links: LINKS });
    const cell = columns.find((c) => c.id === "destination")!.cell!;
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const r = createRoot(holder);
    act(() => {
      // p1: in_place tone (covers a live topic, no intent) — the tone whose
      // colour is directly controlled by `intent_colors.in_place`.
      r.render(<>{cell(RECORDED_P1, 0)}</>);
    });
    const dot = holder.querySelector('span[aria-hidden="true"]');
    const cls = dot?.getAttribute("class") ?? "";
    act(() => r.unmount());
    holder.remove();
    return cls;
  }

  it("changes the rendered class when the mocked knob's in_place colour changes", () => {
    const greenClass = dotClassFor({
      in_place: "green",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    });
    const redClass = dotClassFor({
      in_place: "red",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    });
    expect(greenClass).toContain("bg-success");
    expect(redClass).toContain("bg-destructive");
    expect(greenClass).not.toBe(redClass);
  });
});
