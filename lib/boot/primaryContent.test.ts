/** @jest-environment jsdom */
// lib/boot/primaryContent.test.ts — lane PAGE-BUNDLE-2: the shell's background reads wait for
// the page's rows, and never longer than the hold's cap.
import { holdPrimaryContent, resetPrimaryContentHolds, whenPrimaryContentShown } from "./primaryContent";

afterEach(() => {
  resetPrimaryContentHolds();
  jest.useRealTimers();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

it("waits for the page to release its hold", async () => {
  const release = holdPrimaryContent("table-rows");
  let shown = false;
  void whenPrimaryContentShown().then(() => (shown = true));
  await flush();
  expect(shown).toBe(false);
  release();
  await flush();
  expect(shown).toBe(true);
});

it("never waits past the hold's cap", async () => {
  jest.useFakeTimers();
  holdPrimaryContent("table-rows", 4_000);
  let shown = false;
  void whenPrimaryContentShown().then(() => (shown = true));
  await Promise.resolve();
  jest.advanceTimersByTime(4_001);
  await Promise.resolve();
  await Promise.resolve();
  expect(shown).toBe(true);
});

it("with no hold, resolves at load", async () => {
  await expect(whenPrimaryContentShown()).resolves.toBeUndefined();
});
