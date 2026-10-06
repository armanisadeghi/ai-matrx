/**
 * LANDING ON A DEEP-LINKED RECORD NEVER FIGHTS THE PERSON.
 *
 * Walk 2026-10-05: real mouse clicks in the Press Room did nothing while scripted clicks
 * worked. The deep-link landing re-ran `scrollIntoView` on EVERY render until the record read as
 * on screen — a record it could not bring on screen was re-scrolled on every render, so the page
 * moved under the pointer between press and release. Landing now has a budget: a few tries in
 * the first seconds after a link opens a record, then it lets go for good.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { LAND_MAX_TRIES, useLandOnRecord } from "../useLandOnRecord";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scrolls = jest.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrolls;
});
beforeEach(() => scrolls.mockClear());

function Probe({ focusKey, tick }: { focusKey: string | null; tick: number }) {
  useLandOnRecord(focusKey, () => document.getElementById("target"));
  return <div data-tick={tick} />;
}

test("a record that never reads as on screen is tried a few times, then left alone", async () => {
  document.body.innerHTML = '<div id="target"></div><div id="host"></div>';
  const root = createRoot(document.getElementById("host")!);
  for (let tick = 0; tick < 40; tick++) {
    await act(async () => root.render(<Probe focusKey="angle:a1" tick={tick} />));
  }
  expect(scrolls.mock.calls.length).toBeGreaterThan(0);
  expect(scrolls.mock.calls.length).toBeLessThanOrEqual(LAND_MAX_TRIES);
});

test("a new record gets its own landing", async () => {
  document.body.innerHTML = '<div id="target"></div><div id="host"></div>';
  const root = createRoot(document.getElementById("host")!);
  for (let tick = 0; tick < 20; tick++) {
    await act(async () => root.render(<Probe focusKey="angle:a1" tick={tick} />));
  }
  const first = scrolls.mock.calls.length;
  await act(async () => root.render(<Probe focusKey="angle:a2" tick={99} />));
  expect(scrolls.mock.calls.length).toBe(first + 1);
});
