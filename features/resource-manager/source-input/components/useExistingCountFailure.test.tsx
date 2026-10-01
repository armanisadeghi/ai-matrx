/**
 * "Use existing" when the count read fails (2026-09-30: "Counting your items failed: statement
 * timeout" on every reload). A failed count is a dash on each kind it could not count — the kinds
 * stay, open and list as usual — never one red error block that replaces the whole row.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/scopes/hooks/useKindCounts", () => ({
  useKindCounts: () => ({
    counts: new Map(),
    tokens: [],
    loading: false,
    error: new Error("Counting your items failed: canceling statement due to statement timeout (57014)"),
    retry: jest.fn(),
  }),
}));
jest.mock("@/features/scopes/hooks/useKindItems", () => ({
  useKindItems: () => ({ items: [], loading: false, error: null, hasMore: false, loadMore: jest.fn() }),
}));
jest.mock("@/features/resource-manager/source-input/savedWebPages", () => ({
  SAVED_SOURCE_TOKEN: "processed_document",
  countSavedSources: () => Promise.resolve(4),
  fetchSavedSourcesPage: () => Promise.resolve([]),
}));
jest.mock("@/features/resource-manager/source-input/itemStage", () => ({ useKindItemStages: () => new Map() }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (sel: () => unknown) => sel() }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "user-1" }));

import { UseExisting } from "./UseExisting";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("shows every kind with a dash instead of one red error block", async () => {
  await act(async () => {
    root.render(
      <UseExisting scope={{ kind: "all" }} query="" isPicked={() => false} onToggle={() => undefined} />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  const tiles = [...host.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent ?? "");
  expect(tiles.some((t) => t.startsWith("Files") && t.endsWith("—"))).toBe(true);
  expect(tiles.some((t) => t.startsWith("Notes") && t.endsWith("—"))).toBe(true);
  // A kind counted another way still shows its number.
  expect(tiles.some((t) => t.startsWith("Websites") && t.endsWith("4"))).toBe(true);
});
