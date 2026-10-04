/**
 * Split needs room. In a narrow box (a Board note tile) two columns wrap the
 * text a character or two per line; below SPLIT_MIN_WIDTH_PX of the editor's
 * OWN width Split shows one pane with an Edit / Preview toggle (MatrxSplit
 * `singlePane`), and side by side returns when there is room.
 *
 * Proven failing before passing: without the measure, the narrow case passes
 * `singlePane` as undefined/false.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = { width: 0 };
jest.mock("@ai-matrx/kit/hooks", () => ({
  useMeasure: () => [() => undefined, { width: box.width, height: 400 }],
}));
const seen: Array<boolean | undefined> = [];
jest.mock("@/components/matrx/MatrxSplit", () => ({
  MatrxSplit: (props: { singlePane?: boolean }) => {
    seen.push(props.singlePane);
    return <div data-split-single={String(Boolean(props.singlePane))} />;
  },
}));
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => <textarea /> }));
jest.mock("@/features/audio/components/MicrophoneIconButton", () => ({ MicrophoneIconButton: () => null }));
jest.mock("@/features/rich-document/RichDocument", () => ({ RichDocument: () => null }));

import { NoteEditorCore, SPLIT_MIN_WIDTH_PX } from "../components/NoteEditorCore";

function render(width: number) {
  box.width = width;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<NoteEditorCore content="hello" onChange={() => {}} editorMode="split" />);
  });
  return {
    single: () => container.querySelector("[data-split-single]")?.getAttribute("data-split-single"),
    done: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

it("shows one pane in a 360px box", () => {
  const view = render(360);
  expect(view.single()).toBe("true");
  view.done();
});

it("shows one pane just under the threshold", () => {
  const view = render(SPLIT_MIN_WIDTH_PX - 1);
  expect(view.single()).toBe("true");
  view.done();
});

it("goes side by side when there is room", () => {
  const view = render(900);
  expect(view.single()).toBe("false");
  view.done();
});

it("keeps side by side until the box is measured", () => {
  const view = render(0);
  expect(view.single()).toBe("false");
  view.done();
});
