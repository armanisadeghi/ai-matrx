/**
 * "Add a link" must speak to the person, not to the engineer (W44, 2026-09-12).
 *
 * SUT: `WebpageResourcePickerCore`'s failure state. It OWNS: naming what
 * happened in plain words, offering an in-place way out (paste the text), and
 * keeping the stage/stack/Diagnostics JSON behind a "Details" disclosure.
 *
 * Real here: `classifyScrapeFailure` (the hook's own derivation — the mocked
 * hook returns exactly what the live one computes) and the picker's render.
 * Doubles: the network-touching `useScraperApi`, the snapshot viewer, and the
 * sub-view header.
 *
 * Reproduced from the live build: a Substack link answered `bad_status` and the
 * screen showed "…: bad_status — failed at useScraperApi.scrapeUrl →
 * validate_result_success (see errorDiagnostics)", a stack, and a
 * "Diagnostics JSON" block as the primary body.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  classifyScrapeFailure,
  type ScrapeFailure,
} from "@/features/scraper/failure/scrapeFailure";
import type { ScraperApiErrorDiagnostics } from "@/features/scraper/hooks/useScraperApi";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE_URL = "https://georgekao.substack.com/p/how-to-write-without-sounding-like";

const LIVE_DIAGNOSTICS: ScraperApiErrorDiagnostics = {
  hook: "useScraperApi",
  operation: "scrapeUrl",
  stage: "validate_result_success",
  message: `${LIVE_URL}: bad_status`,
  stack:
    "Error: bad_status\n    at assertRawScrapeRowSucceeded (features/scraper/hooks/useScraperApi.ts:236:11)",
  at: "2026-09-12T02:11:00.000Z",
  received: {
    requestedUrl: LIVE_URL,
    endpoint: "/scraper/quick-scrape",
    streamEventLog: [],
    resultsCount: 1,
    results: [],
    envelopeMetadata: {},
    firstResult: { success: false, failure_reason: "bad_status", status_code: 403 },
  },
};

const LIVE_ERROR = `${LIVE_URL}: bad_status — failed at useScraperApi.scrapeUrl → validate_result_success (see errorDiagnostics)`;

const LIVE_FAILURE: ScrapeFailure = classifyScrapeFailure({
  error: LIVE_ERROR,
  diagnostics: LIVE_DIAGNOSTICS,
});

jest.mock("@/features/scraper/hooks/useScraperApi", () => ({
  useScraperApi: () => ({
    scrapeUrl: jest.fn(),
    data: null,
    isLoading: false,
    hasError: true,
    error: LIVE_ERROR,
    errorDiagnostics: LIVE_DIAGNOSTICS,
    failure: LIVE_FAILURE,
    reset: jest.fn(),
  }),
}));

jest.mock("@/features/resource-manager/webpage/WebpageSnapshotView", () => ({
  WebpageSnapshotView: () => null,
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea
      value={props.value as string}
      onChange={props.onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
      placeholder={props.placeholder as string}
    />
  ),
}));

import { WebpageResourcePickerCore } from "../WebpageResourcePicker";

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
  jest.restoreAllMocks();
});

function renderPicker(onSelect = jest.fn()) {
  act(() => {
    root.render(<WebpageResourcePickerCore onSelect={onSelect} />);
  });
  return onSelect;
}

/** Everything the person reads before opening "Details". */
function primaryText(): string {
  return container.textContent ?? "";
}

it("says what happened in plain words — no stage, hook name, or stack", () => {
  renderPicker();
  const text = primaryText();

  for (const token of [
    "useScraperApi",
    "validate_result_success",
    "errorDiagnostics",
    "bad_status",
    "Diagnostics JSON",
    "assertRawScrapeRowSucceeded",
  ]) {
    expect(text).not.toContain(token);
  }
  // Plain words naming what happened, with the status the site answered with.
  expect(text).toContain("could not open the page");
  expect(text).toContain("403");
  expect(text.toLowerCase()).toContain("paste");
});

it("offers an in-place remedy that reveals a paste box and adds the text", () => {
  const onSelect = renderPicker();

  const remedy = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Paste the text instead"),
  );
  expect(remedy).toBeDefined();

  act(() => {
    remedy!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const box = container.querySelector("textarea");
  expect(box).not.toBeNull();

  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    setter.call(box!, "The article text, pasted by hand.");
    box!.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const add = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("Add this text"),
  );
  act(() => {
    add!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0][0].textContent).toBe(
    "The article text, pasted by hand.",
  );
});

it("keeps the diagnostics — behind Details, never as the body", () => {
  renderPicker();
  const details = Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === "Details",
  );
  expect(details).toBeDefined();

  act(() => {
    details!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(primaryText()).toContain("useScraperApi.scrapeUrl");
});
