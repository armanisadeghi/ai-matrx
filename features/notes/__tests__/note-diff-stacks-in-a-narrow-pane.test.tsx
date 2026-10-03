/**
 * A note's Content compare stacks (one column) when ITS container is narrow —
 * two side-by-side columns in a 360px canvas pane cut words mid-line
 * ("separat"). Side by side returns when there is room, and a view the person
 * picks in the toolbar is kept.
 *
 * Proven failing before passing: with the old fixed `defaultView="split"` the
 * narrow case renders "split".
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = { width: 0 };
jest.mock("@ai-matrx/kit/hooks", () => ({
  useMeasure: () => [() => undefined, { width: box.width, height: 400 }],
}));
const views: Array<{ view: string | undefined; pick: (v: string) => void }> = [];
jest.mock("@ai-matrx/diff/react", () => {
  const actual = jest.requireActual("@ai-matrx/diff/react");
  return {
    ...actual,
    TextDiff: (props: { view?: string; onViewChange?: (v: string) => void }) => {
      views.push({ view: props.view, pick: (v) => props.onViewChange?.(v) });
      return <p data-text-diff={props.view} />;
    },
  };
});

import { NoteDiffViewer } from "../components/diff/NoteDiffViewer";

function render(width: number) {
  box.width = width;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NoteDiffViewer
        oldNote={{ content: "the separate columns" }}
        newNote={{ content: "the separate cumulative columns" }}
        oldLabel="v9"
        newLabel="Current"
      />,
    );
  });
  const shown = () => container.querySelector("[data-text-diff]")?.getAttribute("data-text-diff");
  return {
    shown,
    done: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

it("stacks in a 360px pane", () => {
  const view = render(360);
  expect(view.shown()).toBe("inline");
  view.done();
});

it("goes side by side when there is room", () => {
  const view = render(900);
  expect(view.shown()).toBe("split");
  view.done();
});

it("keeps the view the person picks", () => {
  const view = render(360);
  act(() => views[views.length - 1]?.pick("split"));
  expect(view.shown()).toBe("split");
  view.done();
});
