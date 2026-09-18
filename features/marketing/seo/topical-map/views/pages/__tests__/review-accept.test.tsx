/**
 * ACCEPTING A PROPOSAL SIGNS IT — it does not re-decide it.
 *
 * What must not regress:
 *   1. Accept re-sends the row's OWN intent (same disposition, same topic, same
 *      note) with `state: "accepted"` and `source: "human"`. Anything else
 *      writes a decision the person never made, under their name;
 *   2. only `proposed` rows are in the deck — an already-accepted row is not
 *      offered for accepting again;
 *   3. a row whose destination LEFT THE MAP still appears and says so, rather
 *      than being dropped or shown with a blank destination (round 22);
 *   4. Reject says, in the place the person clicks, that
 *      `seo.withdraw_page_intents` has no client wrapper yet — it is honest,
 *      not hidden and not quietly wired to something else.
 *
 * Watched failing first against an accept that sent `{disposition: "keep"}` for
 * every row (the "accepted means keep" reading), and against a deck built from
 * every row rather than the proposed ones.
 *
 * THE ROWS ARE RECORDED: `redux/__fixtures__/listPageIntentsRound22.ts`, real
 * bytes from `seo.list_page_intents` on 2026-09-17. Nothing here is hand-shaped
 * to fit the code.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { TopicalMapKnobs } from "../../../knobs";
import type { PageIntentsResult } from "../../../types";
import { RECORDED_PAGE_INTENTS_ROUND22 } from "../../../redux/__fixtures__/listPageIntentsRound22";
import type { PagesWorkspaceContext } from "../seams";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const writeMutate = jest.fn();
const dispatchMock = jest.fn();

jest.mock("../../../hooks", () => ({
  useSetPageIntents: () => ({ mutateAsync: writeMutate }),
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => ({ cursorSlug: null, cursorPageId: null }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, id }: { name?: string | null; id: string }) => (
    <span data-entity-ref={id}>{name ?? id}</span>
  ),
}));

const MAP_ID = "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11";
const SITE_ID = "46690e56-6b25-45b9-ac91-611c92b3cf61";
const MOVER = "61388277-224f-42b8-9414-015f9d3e4af7";

import { IntentReviewDeck, REJECT_UNAVAILABLE_SENTENCE } from "../review/IntentReviewDeck";

const RECORDED = RECORDED_PAGE_INTENTS_ROUND22 as PageIntentsResult;

/** The four keys this deck reads, cast the way the shipped `knobs.test.ts` casts its own. */
const KNOBS = {
  intent_review_mode: "one_by_one",
  bulk_action_confirm: "above_n",
  bulk_action_confirm_threshold: 25,
  intent_colors: {
    in_place: "green",
    leaving: "amber",
    arriving: "blue",
    delete: "red",
    missing: "gray_dashed",
    planned: "purple_dashed",
  },
} as unknown as TopicalMapKnobs;

const CONTEXT: PagesWorkspaceContext = {
  mapId: MAP_ID,
  siteId: SITE_ID,
  readOnly: false,
  knobs: KNOBS,
  organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  siteIds: [SITE_ID],
};

function click(button: Element | undefined, what: string): void {
  if (!button) throw new Error(`no ${what}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/**
 * A DECISION button, never the mode switcher. The switcher's "Accept all"
 * contains the word "Accept" and sits earlier in the DOM, so a plain
 * text search clicks the wrong thing — which is exactly how this test first
 * reported zero writes.
 */
function clickDecision(scope: ParentNode, text: string): void {
  click(
    [...scope.querySelectorAll("button")].find(
      (candidate) =>
        !candidate.hasAttribute("aria-pressed") && candidate.textContent?.includes(text),
    ),
    `decision button containing "${text}"`,
  );
}

function clickMode(scope: ParentNode, text: string): void {
  click(
    [...scope.querySelectorAll("button[aria-pressed]")].find(
      (candidate) => candidate.textContent === text,
    ),
    `mode button "${text}"`,
  );
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("IntentReviewDeck", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSettled = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    writeMutate.mockResolvedValue({
      ok: true,
      map_id: MAP_ID,
      set: 1,
      kept: 0,
      failed: 0,
      results: [{ ok: true, page_id: MOVER }],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <IntentReviewDeck
          context={CONTEXT}
          items={RECORDED.items}
          onSettled={onSettled}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers only the proposed rows", () => {
    // Four of the six recorded rows carry an intent; one of those is already
    // `accepted` (the arriver) and is not something to accept again.
    expect(container.textContent).toContain("1 of 3");
    expect(container.textContent).not.toContain("/arriver");
  });

  it("re-sends the recorded row's own intent with state accepted, source human", async () => {
    clickDecision(container, "Accept");
    await settle();

    expect(writeMutate).toHaveBeenCalledTimes(1);
    const [call] = writeMutate.mock.calls[0] as [
      { siteId: string; items: Record<string, unknown>[]; source: string },
    ];
    expect(call.siteId).toBe(SITE_ID);
    expect(call.source).toBe("human");
    expect(call.items).toEqual([
      {
        page_id: MOVER,
        // The recorded intent: move → live-there. Unchanged.
        disposition: "move",
        topic_slug: "live-there",
        state: "accepted",
      },
    ]);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("says a destination that left the map instead of showing a blank one", () => {
    // `orphan-one` carries an intent with NO `topic` key because its topic was
    // rejected. The row survives (round 22) and the deck names the state
    // rather than printing a blank destination. Batch shows every row at once.
    clickMode(container, "Batch");
    expect(container.textContent).toContain("destination left the map");
    expect(container.textContent).toContain("/orphan-one");
  });

  it("says why Reject cannot act, where the person clicks", () => {
    expect(container.textContent).toContain(REJECT_UNAVAILABLE_SENTENCE);
    expect(container.textContent).toContain("seo.withdraw_page_intents");
  });
});
