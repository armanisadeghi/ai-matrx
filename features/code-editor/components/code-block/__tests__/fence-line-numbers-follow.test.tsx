/**
 * Line numbers follow the fence when it is edited in place.
 *
 * The break this guards (verify-RC-B7 r2, CodeBlock.tsx:105): the line-number
 * state was seeded once from the fence meta, so editing ```ts → ```ts
 * showLineNumbers (or back) in the source left the rendered block unchanged.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
}));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/styles/themes/useThemeMode", () => ({ useThemeMode: () => "dark" }));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({ useCanvas: () => ({ open: jest.fn() }) }));
jest.mock("@/features/overlays/openers/smartCodeEditorWindow", () => ({
  useOpenSmartCodeEditorWindow: () => jest.fn(),
}));
jest.mock("../SmallCodeEditor", () => ({ __esModule: true, default: () => null }));
jest.mock("../CodeBlockHeader", () => ({ __esModule: true, default: () => null }));
jest.mock("../StickyButtons", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/html-pages/services/htmlPageService", () => ({ HTMLPageService: {} }));
(globalThis as typeof globalThis & { IntersectionObserver?: unknown }).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import CodeBlock from "../CodeBlock";

const CODE = "const ROUTE_14_CAPACITY = 38;\nconst ROUTE_15_CAPACITY = 42;";

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

const gutter = () =>
  Array.from(container.querySelectorAll("[data-line] > span[aria-hidden]")).map(
    (el) => el.textContent,
  );

it("shows, renumbers and hides line numbers as the fence line changes", async () => {
  await act(async () => root.render(<CodeBlock code={CODE} language="ts" />));
  expect(gutter()).toEqual([]);

  await act(async () =>
    root.render(<CodeBlock code={CODE} language="ts" meta="showLineNumbers{40}" />),
  );
  expect(gutter()).toEqual(["40", "41"]);

  await act(async () => root.render(<CodeBlock code={CODE} language="ts" />));
  expect(gutter()).toEqual([]);
});
