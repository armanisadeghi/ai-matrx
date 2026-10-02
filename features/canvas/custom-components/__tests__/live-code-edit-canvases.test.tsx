/**
 * Guards for THE CLASS: "a canvas tab's buttons are functions smuggled through
 * its data."
 *
 * The code editor opened `code_preview` / `code_edit_error` tabs whose data
 * carried `onApply` / `onDiscard` / `onCloseModal` / `onClose` FUNCTIONS. The
 * canvas stores tabs as JSON and refuses anything else (loudly), so those
 * opens were refused outright. Now the data carries string ids registered in
 * `liveCallbacks.ts`, and the body resolves them — or says plainly that the
 * editor is gone.
 *
 * Proven failing before passing:
 *   a. json-safe       → put the raw functions back into `data`; the real
 *      controller refused the open (null id) → RED.
 *   b. resolves-by-id  → made `resolveCanvasCallback` return null; Apply was
 *      replaced by the closed-editor line → RED.
 *   c. honest-when-gone → skipped `releaseAll`; the stale Apply button kept
 *      rendering after the editor closed → RED. And with the body resolving
 *      ids once per render (`resolveCanvasCallback`, no registry
 *      subscription) the release left the stale buttons on screen → RED.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createCanvasController, createCanvasStore } from "@ai-matrx/canvas";

import { artifactOpenInput } from "@/features/canvas/host/artifactItem";
import {
  createCanvasCallbackScope,
  resolveCanvasCallback,
} from "@/features/canvas/liveCallbacks";
import {
  LiveCodeEditErrorCanvas,
  LiveCodePreviewCanvas,
  type CodePreviewCanvasData,
} from "../LiveCodeEditCanvases";

// The real preview pulls in the Shiki/Monaco code view; the wiring under test
// is which handlers reach its buttons, so the leaf is a plain button row.
jest.mock("../CodePreviewCanvas", () => ({
  CodePreviewCanvas: (props: {
    onApply: () => void;
    onDiscard: () => void;
    onCloseModal?: () => void;
  }) => (
    <div>
      <button type="button" onClick={props.onApply}>
        Apply
      </button>
      <button type="button" onClick={props.onDiscard}>
        Discard
      </button>
      <button
        type="button"
        disabled={!props.onCloseModal}
        onClick={props.onCloseModal}
      >
        Close and view
      </button>
    </div>
  ),
}));
jest.mock("../CodeEditErrorCanvas", () => ({
  CodeEditErrorCanvas: (props: { onClose: () => void; errors: string[] }) => (
    <div>
      <p>{props.errors.join(", ")}</p>
      <button type="button" onClick={props.onClose}>
        Close
      </button>
    </div>
  ),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    ) ?? null
  );
}

function previewData(scope: ReturnType<typeof createCanvasCallbackScope>, handlers: {
  onApply: () => void;
  onDiscard: () => void;
  onCloseModal: () => void;
}): CodePreviewCanvasData {
  return {
    originalCode: "a",
    modifiedCode: "b",
    language: "ts",
    edits: [],
    explanation: "swap a for b",
    callbacks: scope.register(handlers),
  };
}

describe("code-edit canvas tabs carry callback ids, never functions", () => {
  it("json-safe: the real canvas accepts the preview the editor opens", () => {
    const scope = createCanvasCallbackScope();
    const data = previewData(scope, {
      onApply: jest.fn(),
      onDiscard: jest.fn(),
      onCloseModal: jest.fn(),
    });
    const onError = jest.fn();
    const canvas = createCanvasController({ store: createCanvasStore(), onError });

    const id = canvas.open(
      artifactOpenInput({ type: "code_preview", data, metadata: { title: "Code Preview" } }),
    );

    expect(onError).not.toHaveBeenCalled();
    expect(id).not.toBeNull();
    act(() => scope.releaseAll());
  });

  it("resolves-by-id: the preview's buttons call the editor's handlers", () => {
    const scope = createCanvasCallbackScope();
    const onApply = jest.fn();
    const onDiscard = jest.fn();
    const onCloseModal = jest.fn();
    const data = previewData(scope, { onApply, onDiscard, onCloseModal });

    act(() => root.render(<LiveCodePreviewCanvas data={data} />));
    act(() => button("Apply")?.click());
    act(() => button("Discard")?.click());
    act(() => button("Close and view")?.click());

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCloseModal).toHaveBeenCalledTimes(1);
    // A handler stays callable: Apply twice is the editor's call, not ours.
    expect(resolveCanvasCallback(data.callbacks.onApply)).not.toBeNull();
    act(() => scope.releaseAll());
  });

  it("honest-when-gone: once the editor closes, the tab says so instead of dead buttons", () => {
    const scope = createCanvasCallbackScope();
    const data = previewData(scope, {
      onApply: jest.fn(),
      onDiscard: jest.fn(),
      onCloseModal: jest.fn(),
    });
    const errorClose = jest.fn();
    const errorData = {
      errors: ["no match"],
      warnings: [],
      rawResponse: "",
      callbacks: scope.register({ onClose: errorClose }),
    };

    act(() =>
      root.render(
        <>
          <LiveCodePreviewCanvas data={data} />
          <LiveCodeEditErrorCanvas data={errorData} />
        </>,
      ),
    );
    act(() => button("Close")?.click());
    expect(errorClose).toHaveBeenCalledTimes(1);
    expect(button("Apply")).not.toBeNull();

    // The editor closes. Nothing re-renders the tab from outside — no new
    // data, no parent render — so only a subscription to the registry can
    // swap the buttons for the honest line.
    act(() => scope.releaseAll());

    expect(button("Apply")).toBeNull();
    expect(button("Close")).toBeNull();
    expect(container.textContent).toContain("The editor that made this is closed.");
  });

  it("a tab restored without ids (an old snapshot) is honest too", () => {
    act(() =>
      root.render(
        <LiveCodePreviewCanvas
          data={{
            originalCode: "",
            modifiedCode: "",
            language: "ts",
            edits: [],
            callbacks: undefined as unknown as CodePreviewCanvasData["callbacks"],
          }}
        />,
      ),
    );
    expect(button("Apply")).toBeNull();
    expect(container.textContent).toContain("The editor that made this is closed.");
  });
});
