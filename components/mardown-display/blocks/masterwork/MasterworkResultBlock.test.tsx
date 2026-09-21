/**
 * Walk 18, defect D — the structured half.
 *
 * The one token on screen (`violations_not_fixed: []`) rode in the ruling's
 * PROSE, and `features/masterwork/__tests__/a-field-name-never-reaches-the-
 * expert.test.ts` holds that guard. This is the other end of the same class:
 * a `masterwork_result` payload carrying a field beyond the three the kind
 * declares was dropped by this component without a trace — nothing on screen,
 * nothing said, and a raw key waiting for whoever rendered it next.
 *
 * Every field the run emits now reaches the Expert under its own name IN
 * WORDS, and an empty list reads as a sentence.
 *
 * PROVEN FAILING FIRST: with the `extras` block removed from
 * `MasterworkResultBlock`, all four legs below redden.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MasterworkResultBlock } from "./MasterworkResultBlock";

jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The walk's own run, plus the Editor's shape it was reasoning about
 * (`aidream/services/masterworks/build.py`) arriving as structure rather than
 * as a sentence — which is the direction this contract is moving.
 */
const PAYLOAD = {
  deliverable: "I can schedule the camera inspection for Monday.",
  approach: null,
  ruling: "## The Ruling\n\nThe letter as submitted is a same-visit pitch.",
  violations_not_fixed: [],
  word_count_after: 96,
};

describe("a masterwork_result never drops a field, and never prints its key", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(<MasterworkResultBlock serverData={PAYLOAD} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows the extra field instead of dropping it", () => {
    expect(host.querySelector('[data-masterwork-result="extras"]')).not.toBe(
      null,
    );
  });

  it("names it in words, never as a key", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("Violations not fixed");
    expect(text).toContain("Word count after");
    expect(text).not.toContain("violations_not_fixed");
    expect(text).not.toContain("word_count_after");
  });

  it("reads an empty list as a word, never as `[]`", () => {
    const text = host.textContent ?? "";
    expect(text).toContain("None");
    expect(text).not.toContain("[]");
  });

  it("still renders the work and the ruling first", () => {
    expect(
      host.querySelector('[data-masterwork-result="deliverable"]')?.textContent,
    ).toContain("camera inspection");
    expect(
      host.querySelector('[data-masterwork-result="ruling"]')?.textContent,
    ).toContain("The Ruling");
  });
});

describe("a result with only its declared fields draws no extras at all", () => {
  it("renders nothing where there is nothing to say", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <MasterworkResultBlock
          serverData={{
            deliverable: "The letter.",
            approach: null,
            ruling: "The ruling.",
          }}
        />,
      );
    });
    expect(host.querySelector('[data-masterwork-result="extras"]')).toBe(null);
    act(() => root.unmount());
    host.remove();
  });
});
