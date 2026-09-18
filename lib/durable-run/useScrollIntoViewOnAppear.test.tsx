/**
 * AN HONEST SENTENCE THE PERSON CANNOT SEE IS A SILENT FAILURE.
 *
 * The incident (masterwork-methods-census wall W17, 2026-09-16): the Prediction
 * Ledger's "Turn the answered ones into rules" was pressed live with one
 * correctly scored, reasoned call. The server refused honestly and durably —
 * `platform.masterwork_run` a6f401b9, `masterwork_prediction_not_enough_outcomes`,
 * "Still waiting on outcomes: 1 of your 2 prediction(s) have an answer, and this
 * needs 5…". The dialog rendered that sentence verbatim. Reading the DOM found
 * it; looking at the screen found an unchanged dialog and no rules, because the
 * dialog body scrolls and the refusal landed below the fold.
 *
 * So the notice now scrolls itself to the person. These tests render the REAL
 * `DurableRunFailure` into a REAL DOM and assert on the REAL `scrollIntoView`
 * call — nothing about the component or the hook is stubbed.
 *
 * PLANT THE BUG TO SEE THESE GO RED (proven 2026-09-16):
 *
 * * delete the `useScrollIntoViewOnAppear` call from `DurableRunFailure` →
 *   three of these four fail, `a failure scrolls itself to the person` with 0
 *   calls where it needs 1.
 *
 * HONEST LIMIT, because a guard nobody can make fail is not a guard: removing
 * the hook's `announced` latch does NOT turn any of these red. The effect's
 * dependency array already means an identical re-render does not re-run it, so
 * the latch earns its place only against React's dev-mode double invocation,
 * which jest does not reproduce. The once-per-notice assertions below are
 * therefore a statement of the behaviour a person gets, not a proof of that one
 * line.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DurableRunFailure } from "./DurableRunFailure";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const scrolled = jest.fn();

beforeAll(() => {
  // jsdom has no layout, so it ships no scrollIntoView. Install the real
  // signature and count the calls the component makes.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: scrolled,
  });
});

beforeEach(() => {
  scrolled.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const REFUSAL =
  "Still waiting on outcomes: 1 of your 2 prediction(s) have an answer, and " +
  "this needs 5. Nothing was added to the Rulebook.";

function render(error: string | null): void {
  act(() => {
    root.render(
      <DurableRunFailure error={error} retry={null} running={false} />,
    );
  });
}

test("nothing is scrolled while the run is fine", () => {
  render(null);

  expect(container.textContent).toBe("");
  expect(scrolled).not.toHaveBeenCalled();
});

test("a failure scrolls itself to the person", () => {
  render(null);
  render(REFUSAL);

  // The server's sentence is on screen…
  expect(container.textContent).toContain("this needs 5");
  // …and the screen moved to where it is.
  expect(scrolled).toHaveBeenCalledTimes(1);
  expect(scrolled).toHaveBeenCalledWith(
    expect.objectContaining({ block: "nearest" }),
  );
});

test("the same failure is announced once, a new one announces again", () => {
  render(REFUSAL);
  expect(scrolled).toHaveBeenCalledTimes(1);

  // A re-render of the SAME refusal must not yank the page around again.
  render(REFUSAL);
  expect(scrolled).toHaveBeenCalledTimes(1);

  // A DIFFERENT refusal is a new thing to say, and is said.
  render("We couldn't find any email threads in that.");
  expect(scrolled).toHaveBeenCalledTimes(2);
});

test("a failure that clears and returns is announced again", () => {
  render(REFUSAL);
  render(null);
  render(REFUSAL);

  expect(scrolled).toHaveBeenCalledTimes(2);
});
