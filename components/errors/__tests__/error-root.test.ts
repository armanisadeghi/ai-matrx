/**
 * @jest-environment jsdom
 */
/**
 * RC-B12 verify F8: a menu inside a plain box (no role="alert") copied
 * "An error is shown on this page." instead of the error. The menu's root is
 * the box it sits in.
 */
import { errorRootFor, readRenderedError } from "@/components/errors/ErrorAlchemyMenu";

jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/components/errors/useErrorSurfaceSnapshot", () => ({ useErrorSurfaceSnapshot: () => ({}) }));

it("reads the words of the plain box the menu sits in", () => {
  document.body.innerHTML =
    '<p class="text-sm text-destructive">Something went wrong on our end. Please try once more. <span data-error-alchemy-menu=""><button>Copy</button></span></p>';
  const menu = document.querySelector("[data-error-alchemy-menu]");
  const read = readRenderedError(errorRootFor(menu));
  expect(read.message).toBe("Something went wrong on our end. Please try once more.");
});

it("still reads an alert region when the menu is nested deeper inside it", () => {
  document.body.innerHTML =
    '<div role="alert"><h5>Couldn\'t load schedules</h5><div><span data-error-alchemy-menu=""></span></div><p>query failed</p></div>';
  const menu = document.querySelector("[data-error-alchemy-menu]");
  // The immediate parent is an empty wrapper; the words live in the alert.
  expect(readRenderedError(errorRootFor(menu)).message).toContain("query failed");
});

it("reads a title together with the sentence of the small card it heads", () => {
  document.body.innerHTML =
    '<div class="card"><p>Couldn\'t load the saved artifact<span data-error-alchemy-menu=""></span></p><p>The Canvas kept its identity, but the saved content was not available.</p></div>';
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.message).toContain("saved content was not available");
});

it("keeps block elements apart when it reads a box's words (RC-B12 round 2, R2-3)", () => {
  document.body.innerHTML =
    '<div class="card"><p>Dashboard metrics couldn\'t load</p><p>Your workspace is still available.</p><span data-error-alchemy-menu=""></span></div>';
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(`${read.title ?? ""} ${read.message}`).not.toMatch(/loadYour/);
  expect(read.title).toBe("Dashboard metrics couldn't load");
  expect(read.message).toBe("Your workspace is still available.");
});
