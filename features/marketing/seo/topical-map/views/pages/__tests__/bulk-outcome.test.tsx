/**
 * A KEPT PAGE IS SAID OUT LOUD.
 *
 * `seo.set_page_intents` LEAVES a page alone when a higher source (human >
 * agent > mapper) already holds its intent, or when that intent is already
 * accepted/done. Nothing went wrong and nothing was written — and both of the
 * easy readings are defects: counted as set, the screen claims 200 pages moved
 * when 199 did; counted as failed, somebody retries a decision a colleague
 * already made.
 *
 * Watched failing first against an outcome line built as
 * `Set ${set} · Failed ${failed + kept}`, which passed every other assertion in
 * this lane.
 *
 * The page id and url are the RECORDED ones from
 * `redux/__fixtures__/listPageIntentsRound22.ts`.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SetPageIntentsResult } from "../../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, id }: { name?: string | null; id: string }) => (
    <span data-entity-ref={id}>{name ?? id}</span>
  ),
}));

const ORPHAN_ONE = "2c03ce6d-e399-41cb-9c75-21f02f080c28";
const ORPHAN_TWO = "16eedfd2-ca75-4de2-ac3c-ea7233fc1c40";
const MOVER = "61388277-224f-42b8-9414-015f9d3e4af7";

import { BulkOutcome } from "../bulk/BulkOutcome";
import { toSetPageIntentsOutcome } from "../bulk/setPageIntentsOutcome";

const RESULT = {
  ok: false,
  map_id: "9f0d6f4c-1d2f-4a0a-9f27-2f0f0a3b2f11",
  set: 1,
  kept: 1,
  failed: 1,
  results: [
    { ok: true, page_id: MOVER, url: "https://tmdc-a-7a6b5311.invalid/mover" },
    {
      ok: true,
      page_id: ORPHAN_ONE,
      url: "https://tmdc-a-7a6b5311.invalid/orphan-one",
      kept_existing: { source: "human", state: "accepted" },
    },
    {
      ok: false,
      page_id: ORPHAN_TWO,
      url: "https://tmdc-a-7a6b5311.invalid/orphan-two",
      error:
        "set_page_intents: page covers no topic in this map and no topic_slug was given",
    },
  ],
} as unknown as SetPageIntentsResult;

function clickText(scope: ParentNode, text: string): void {
  const button = [...scope.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`no button containing "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("BulkOutcome", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <BulkOutcome
          outcome={toSetPageIntentsOutcome(RESULT)}
          sentence="Redirect 3 pages: 1 would be set, 1 kept (a person already decided them), 1 would fail."
          onDismiss={jest.fn()}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("says a kept page was kept because a person already decided it", () => {
    expect(container.textContent).toContain(
      "Kept 1 (a person already decided this page)",
    );
  });

  it("never folds kept into failed", () => {
    expect(container.textContent).toContain("Failed 1");
    expect(container.textContent).not.toContain("Failed 2");
  });

  it("names who holds a kept page, and quotes a failure verbatim", () => {
    clickText(container, "Kept 1");

    expect(container.textContent).toContain("held by human as accepted");
    expect(container.textContent).toContain(
      "set_page_intents: page covers no topic in this map and no topic_slug was given",
    );
    expect(container.querySelector(`[data-entity-ref="${ORPHAN_ONE}"]`)).not.toBeNull();
  });
});
