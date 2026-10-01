/**
 * Enter in "Add a link" previews the link and NEVER submits or navigates
 * (PB-04 run 2, 2026-10-01: Enter reloaded the whole page and wiped every
 * attached chip, twice, while the arrow button worked).
 *
 * SUT: `WebpageResourcePickerCore`'s URL field. It OWNS Enter: the keystroke
 * starts the scrape and is consumed there — default prevented (a form's
 * implicit submit) and propagation stopped (every Enter handler above the
 * picker in the React tree). Real: the picker's render and key handling.
 * Doubles: the network-touching `useScraperApi` and the snapshot viewer.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const scrapeUrl = jest.fn(async () => null);

jest.mock("@/features/scraper/hooks/useScraperApi", () => ({
  useScraperApi: () => ({
    scrapeUrl,
    data: null,
    isLoading: false,
    hasError: false,
    error: null,
    errorDiagnostics: null,
    failure: null,
    reset: jest.fn(),
  }),
}));

jest.mock("@/features/resource-manager/webpage/WebpageSnapshotView", () => ({
  WebpageSnapshotView: () => null,
}));

import { WebpageResourcePickerCore } from "../WebpageResourcePicker";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  scrapeUrl.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("Enter previews the link and is consumed — no form submit, no ancestor handler", async () => {
  const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
  const ancestorEnter = jest.fn();
  act(() => {
    root.render(
      <form onSubmit={onSubmit}>
        <div onKeyDown={(e) => e.key === "Enter" && ancestorEnter()}>
          <WebpageResourcePickerCore
            onSelect={jest.fn()}
            initialUrl="https://example.com/page"
          />
        </div>
      </form>,
    );
  });

  const input = container.querySelector(
    'input[type="url"]',
  ) as HTMLInputElement;
  expect(input).not.toBeNull();

  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    input.dispatchEvent(enter);
  });

  // A non-prevented Enter in a field is what a browser turns into a submit.
  expect(enter.defaultPrevented).toBe(true);
  expect(ancestorEnter).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(scrapeUrl).toHaveBeenCalledWith("https://example.com/page");
});
