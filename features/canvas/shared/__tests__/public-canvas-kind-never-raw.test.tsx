/**
 * V8 — the public canvas page's unsupported-type fallback printed a "Debug
 * Info" JSON dump: a kind payload there goes through the one kind door; the
 * debug dump stays only for kindless data.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/official/structured-value/KindValueFrontDoor", () => ({
  __esModule: true,
  KindValueFrontDoor: ({ value }: { value: unknown }) => (
    <div data-kind-door={typeof value === "string" ? "text" : "value"} />
  ),
  default: () => null,
}));
jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  ArtifactRender: () => <div data-artifact="1" />,
  hasArtifactRenderer: () => false,
}));
jest.mock("@ai-matrx/rich-content/display/blocks/common/SandboxedHtml", () => ({
  __esModule: true,
  default: () => <div data-sandboxed-html="1" />,
}));

import { PublicCanvasRenderer } from "../PublicCanvasRenderer";

const KIND = { __kind: "timeline", title: "History <1900>", events: [{ year: 1900 }] };

describe("public canvas: a kind is never a debug dump (V8)", () => {
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

  it.each([
    ["a kind object", KIND, "value"],
    ["kind JSON text (with < > inside)", JSON.stringify(KIND), "text"],
    ["a kind nested in data", { result: KIND }, "value"],
  ])("%s goes through the kind door", (_label, data, door) => {
    act(() => root.render(<PublicCanvasRenderer content={{ type: "zz_future_type", data }} />));
    expect(container.querySelector(`[data-kind-door="${door}"]`)).not.toBeNull();
    expect(container.textContent).not.toContain("__kind");
    expect(container.textContent).not.toContain("Debug Info");
  });

  it("kindless data keeps its debug dump", () => {
    act(() => root.render(<PublicCanvasRenderer content={{ type: "zz_future_type", data: { a: 1 } }} />));
    expect(container.textContent).toContain("Debug Info");
  });
});
