/**
 * THE REDIRECT FLOW IS TWO CLICKS, and the second one says what it costs.
 *
 * What must not regress:
 *   1. "Redirect" alone writes NOTHING — it opens the picker;
 *   2. "Preview and apply" rehearses through `seo.map_dry_run` and raises the
 *      consequence sentence before `seo.set_page_intents` is called once;
 *   3. the batch that goes out is 200 items, `disposition: "redirect"`, the
 *      chosen `into_page_id`, `state: "accepted"`, `source: "human"`;
 *   4. `bulk_action_confirm: "never"` skips the DIALOG and nothing else — the
 *      write still runs, and the same sentence is still produced;
 *   5. a page covering no topic is NAMED in the sentence when Keep is run
 *      without a topic override (it is the 22023 the writer will raise).
 *
 * Watched failing first against (a) a bar wired straight to `mutateAsync`, and
 * (b) a consequence sentence built from `selected.length` rather than the
 * rehearsal's own answer.
 *
 * THE ROWS ARE RECORDED. Every selected row is a clone of the `mover` row in
 * `redux/__fixtures__/listPageIntentsRound22.ts` — real bytes from
 * `seo.list_page_intents` on 2026-09-17 — with ONLY `page.id` changed, so 200
 * rows can be selected without hand-writing a page shape that happens to fit
 * this code.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { TopicalMapKnobs } from "../../../knobs";
import type { PageIntentItem, PageIntentsResult } from "../../../types";
import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import type { PagesWorkspaceContext } from "../seams";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver and no pointer capture; Radix's popover
// positioning asks for both. Neither is a stand-in for behaviour under test.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver =
  ResizeObserverStub;
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

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

// The cmdk engine is not what these assertions are about; a plain button per
// item makes "the person picked this topic" a click, exactly as it is on screen.
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

const SITE_ID = "46690e56-6b25-45b9-ac91-611c92b3cf61";
const TARGET_PAGE_ID = "0b6f6f19-5f2a-4a5e-9f3d-1c7f1b9a44aa";
const MAP_ID = "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11";

import { PagesBulkActions } from "../bulk/PagesBulkActions";

const RECORDED = RECORDED_PAGE_INTENTS_ROUND22 as PageIntentsResult;
const RECORDED_MOVER = RECORDED.items.find((item) =>
  item.page.url?.endsWith("/mover"),
)!;
const RECORDED_ORPHAN = RECORDED.items.find((item) =>
  item.page.url?.endsWith("/orphan-one"),
)!;

/** 200 selected rows: the recorded `mover` row, with only its id changed. */
function twoHundredRecordedRows(): PageIntentItem[] {
  return Array.from({ length: 200 }, (_unused, index) => ({
    ...RECORDED_MOVER,
    page: { ...RECORDED_MOVER.page, id: `page-${index.toString().padStart(3, "0")}` },
  }));
}

/**
 * The knobs this bar reads. A partial fixture cast the way the shipped
 * `knobs.test.ts` casts its own (`{ … } as TopicalMapKnobs`): the test is about
 * the four keys below, and inventing the other 49 would say things about them
 * that nobody measured.
 */
function knobsWith(
  bulk_action_confirm: string,
  bulk_action_confirm_threshold = 25,
): TopicalMapKnobs {
  return {
    bulk_action_confirm,
    bulk_action_confirm_threshold,
    intent_review_mode: "one_by_one",
    intent_colors: {
      in_place: "green",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    },
  } as unknown as TopicalMapKnobs;
}

function contextWith(knobs: TopicalMapKnobs): PagesWorkspaceContext {
  return {
    mapId: MAP_ID,
    siteId: SITE_ID,
    readOnly: false,
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
  const button = buttonsIn(scope).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`no button containing "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function clickAction(scope: ParentNode, action: string): void {
  const button = scope.querySelector<HTMLButtonElement>(
    `[data-bulk-intent-action="${action}"]`,
  );
  if (!button) throw new Error(`no bulk action button for "${action}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function typeInto(label: string, value: string): void {
  const input = document.body.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!input) throw new Error(`no input labelled "${label}"`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
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

describe("PagesBulkActions — the redirect flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    dryRunMutate.mockImplementation(
      async ({ args }: { args: [string, { page_id: string }[], string] }) =>
        rehearsalOf(args[1]),
    );
    writeMutate.mockImplementation(
      async ({ items }: { items: { page_id: string }[] }) => ({
        ok: true,
        map_id: MAP_ID,
        set: items.length,
        kept: 0,
        failed: 0,
        results: items.map((item) => ({ ok: true, page_id: item.page_id })),
      }),
    );
    confirmMock.mockResolvedValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(knobs: TopicalMapKnobs, selected = twoHundredRecordedRows()) {
    const onSettled = jest.fn();
    act(() => {
      root.render(
        <PagesBulkActions
          context={contextWith(knobs)}
          selected={selected}
          selectedIds={selected.map((item) => item.page.id)}
          onSettled={onSettled}
        />,
      );
    });
    return { onSettled, selected };
  }

  it("writes nothing on the first click, and sends 200 accepted redirects on the second", async () => {
    const { onSettled } = render(knobsWith("above_n"));

    clickAction(container, "redirect");
    expect(dryRunMutate).not.toHaveBeenCalled();
    expect(writeMutate).not.toHaveBeenCalled();

    clickText(document.body, "Electronics recycling");
    typeInto("Search this map's pages by URL", "electronics");
    clickText(document.body, "https://tmdc-a-7a6b5311.invalid/electronics-recycling");

    clickText(document.body, "Preview and apply");
    await settle();

    expect(dryRunMutate).toHaveBeenCalledTimes(1);
    const [rehearsal] = dryRunMutate.mock.calls[0] as [
      { fn: string; args: [string, unknown[], string] },
    ];
    expect(rehearsal.fn).toBe("set_page_intents");
    expect(rehearsal.args[0]).toBe(SITE_ID);
    expect(rehearsal.args[1]).toHaveLength(200);
    expect(rehearsal.args[2]).toBe("human");

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const [question] = confirmMock.mock.calls[0] as [{ description: string }];
    expect(question.description).toContain("200");
    // The destination is NAMED — the page these 200 will point at, and the
    // topic they will sit under — not a bare "Are you sure?".
    expect(question.description).toContain(
      "«https://tmdc-a-7a6b5311.invalid/electronics-recycling»",
    );
    expect(question.description).toContain("under topic «electronics-recycling»");
    expect(question.description).toContain("0 kept (a person already decided them)");
    expect(question.description).toContain("Each page's existing intent is replaced.");

    expect(writeMutate).toHaveBeenCalledTimes(1);
    const [written] = writeMutate.mock.calls[0] as [
      { siteId: string; items: Record<string, unknown>[]; source: string },
    ];
    expect(written.siteId).toBe(SITE_ID);
    expect(written.source).toBe("human");
    expect(written.items).toHaveLength(200);
    for (const item of written.items) {
      expect(item.disposition).toBe("redirect");
      expect(item.into_page_id).toBe(TARGET_PAGE_ID);
      expect(item.topic_slug).toBe("electronics-recycling");
      expect(item.state).toBe("accepted");
    }
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does not raise the dialog when bulk_action_confirm is never — and still writes", async () => {
    render(knobsWith("never"));

    clickAction(container, "redirect");
    clickText(document.body, "Electronics recycling");
    typeInto("Search this map's pages by URL", "electronics");
    clickText(document.body, "https://tmdc-a-7a6b5311.invalid/electronics-recycling");
    clickText(document.body, "Preview and apply");
    await settle();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(writeMutate).toHaveBeenCalledTimes(1);
    const [written] = writeMutate.mock.calls[0] as [{ items: unknown[] }];
    expect(written.items).toHaveLength(200);
  });

  it("names the pages that cover no topic when Keep is run without a topic override", async () => {
    // The recorded `orphan-one` row: `current_topics: []` because its only
    // topic was REJECTED. Without a topic the writer has nothing to derive one
    // from and raises 22023 — the sentence has to say so before the click.
    const selected: PageIntentItem[] = [
      { ...RECORDED_MOVER },
      { ...RECORDED_ORPHAN },
    ];
    render(knobsWith("always"), selected);

    clickAction(container, "keep");
    clickText(document.body, "Preview and apply");
    await settle();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const [question] = confirmMock.mock.calls[0] as [{ description: string }];
    expect(question.description).toContain("1 of these pages cover no topic");
    expect(question.description).toContain("22023");
  });
});
