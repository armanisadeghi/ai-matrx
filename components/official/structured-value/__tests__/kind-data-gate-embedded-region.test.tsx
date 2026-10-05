/**
 * H1 (round 5) — the raw data viewers' bottom-layer refusal (`KindDataGate`)
 * sees a kind EMBEDDED in a string value, not only a string that starts with
 * `{`/`[`. `{answer: "Here are your cards: ```json {…kind…}```"}` handed to a
 * JSON tree used to pass as plain and draw the `__kind` key raw.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  __esModule: true,
  KindValueFrontDoor: () => <div data-value-door="" />,
  default: () => <div data-value-door="" />,
}));
const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (input: unknown) => mockCaptureError(input),
}));

import { KindDataGate } from "../KindDataGate";
import { resetKindAtRawRendererReports } from "@/features/content-ir/surfaces/report-kind-at-raw-renderer";

const CARDS = '{"__kind":"flashcard_set","cards":[{"front":"Capital of France","back":"Paris"}]}';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockCaptureError.mockClear();
  resetKindAtRawRendererReports();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function draw(data: unknown) {
  act(() => {
    root.render(
      <KindDataGate component="JsonTreeViewer" data={data}>
        <pre data-raw-tree="">{JSON.stringify(data)}</pre>
      </KindDataGate>,
    );
  });
}

describe("KindDataGate — a kind embedded in a string value", () => {
  it.each([
    ["prose then a ```json fence", { answer: `Here are your cards:\n\n\`\`\`json\n${CARDS}\n\`\`\`` }],
    ["prose then inline kind JSON", { answer: `Here are your cards: ${CARDS}` }],
    ["a bare string, prose first", `Study these:\n\n${CARDS}`],
  ])("%s → the value door, never the raw tree", (_label, data) => {
    draw(data);
    expect(container.querySelector("[data-raw-tree]")).toBeNull();
    expect(container.querySelector("[data-value-door]")).not.toBeNull();
    expect(container.textContent).not.toContain("__kind");
  });

  it("quoted source in a string stays the raw tree", () => {
    draw({ answer: 'Write `{"__kind":"timeline"}` to route a payload.' });
    expect(container.querySelector("[data-raw-tree]")).not.toBeNull();
    expect(container.querySelector("[data-value-door]")).toBeNull();
  });
});
