/**
 * Forcing-function tests for ReviewDeck (CONTRACTS §4.2).
 *
 * The two things that must never regress:
 *   1. one_by_one's A / R keys decide the CURSOR item, not the first item;
 *   2. accept_all NEVER runs on the click — it must raise the consequence
 *      sentence first, because "accept everything" is exactly the click the
 *      destructive-and-expensive-actions law was written for.
 *
 * Both were watched failing first: (1) against a deck that ignored `cursorId`,
 * (2) against an accept-all button wired straight to `onAccept`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ReviewDeck, type ReviewItem } from "./ReviewDeck";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: ReviewItem[] = [
  { id: "p1", title: "First proposal" },
  { id: "p2", title: "Second proposal" },
  { id: "p3", title: "Third proposal" },
];

function mount(ui: React.ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

function consequence(ids: string[], verb: "accept" | "reject"): string {
  return `This will ${verb} ${ids.length} proposals and cannot be undone.`;
}

function clickText(container: HTMLElement, text: string): void {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`no button containing "${text}"`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("ReviewDeck one_by_one", () => {
  it("A accepts and R rejects the CURSOR item, not the first one", () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    const { container, root } = mount(
      <ReviewDeck
        items={ITEMS}
        mode="one_by_one"
        onModeChange={jest.fn()}
        cursorId="p2"
        onCursorChange={jest.fn()}
        onAccept={onAccept}
        onReject={onReject}
        consequence={consequence}
      />,
    );

    expect(container.textContent).toContain("Second proposal");
    expect(container.textContent).toContain("2 of 3");

    const deck = container.firstElementChild!;
    act(() => {
      deck.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }),
      );
    });
    expect(onAccept).toHaveBeenCalledWith(["p2"]);

    act(() => root.unmount());
  });

  it("R rejects the cursor item", () => {
    const onReject = jest.fn();
    const { container, root } = mount(
      <ReviewDeck
        items={ITEMS}
        mode="one_by_one"
        onModeChange={jest.fn()}
        cursorId="p3"
        onCursorChange={jest.fn()}
        onAccept={jest.fn()}
        onReject={onReject}
        consequence={consequence}
      />,
    );

    act(() => {
      container.firstElementChild!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "r", bubbles: true, cancelable: true }),
      );
    });
    expect(onReject).toHaveBeenCalledWith(["p3"]);

    act(() => root.unmount());
  });

  it("ArrowDown / ArrowUp move the cursor", () => {
    const onCursorChange = jest.fn();
    const { container, root } = mount(
      <ReviewDeck
        items={ITEMS}
        mode="one_by_one"
        onModeChange={jest.fn()}
        cursorId="p2"
        onCursorChange={onCursorChange}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        consequence={consequence}
      />,
    );

    const deck = container.firstElementChild!;
    act(() => {
      deck.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(onCursorChange).toHaveBeenLastCalledWith("p3");
    act(() => {
      deck.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(onCursorChange).toHaveBeenLastCalledWith("p1");

    act(() => root.unmount());
  });
});

describe("ReviewDeck accept_all", () => {
  it("does NOT accept on the click — it raises the consequence first", () => {
    const onAccept = jest.fn();
    const spy = jest.fn(consequence);
    const { container, root } = mount(
      <ReviewDeck
        items={ITEMS}
        mode="accept_all"
        onModeChange={jest.fn()}
        cursorId={null}
        onCursorChange={jest.fn()}
        onAccept={onAccept}
        onReject={jest.fn()}
        consequence={spy}
      />,
    );

    clickText(container, "Accept all 3");

    // The write has NOT run.
    expect(onAccept).not.toHaveBeenCalled();
    // And the sentence the user must read names every id and the verb.
    expect(spy).toHaveBeenCalledWith(["p1", "p2", "p3"], "accept");
    // It reached the screen, not just the call log. The dialog portals to the
    // body, so the assertion is against the document, not the container.
    expect(document.body.textContent).toContain(
      "This will accept 3 proposals and cannot be undone.",
    );

    act(() => root.unmount());
  });
});

describe("ReviewDeck empty and mode switching", () => {
  it("renders the empty state and still offers the mode switcher", () => {
    const { container, root } = mount(
      <ReviewDeck
        items={[]}
        mode="one_by_one"
        onModeChange={jest.fn()}
        cursorId={null}
        onCursorChange={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        consequence={consequence}
        emptyState="Everything here has been reviewed."
      />,
    );
    expect(container.textContent).toContain("Everything here has been reviewed.");
    expect(container.textContent).toContain("One by one");
    act(() => root.unmount());
  });

  it("the switcher reports the chosen mode instead of changing it itself", () => {
    const onModeChange = jest.fn();
    const { container, root } = mount(
      <ReviewDeck
        items={ITEMS}
        mode="one_by_one"
        onModeChange={onModeChange}
        cursorId="p1"
        onCursorChange={jest.fn()}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        consequence={consequence}
      />,
    );

    clickText(container, "Batch");
    expect(onModeChange).toHaveBeenCalledWith("batch");
    // The deck is still in one_by_one: the mode is the host's (a knob), not
    // this component's local state.
    expect(container.textContent).toContain("1 of 3");

    act(() => root.unmount());
  });
});
