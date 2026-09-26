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

it("reads the sentence of a destructive card a short title heads", () => {
  document.body.innerHTML =
    '<div class="rounded border-destructive/40 bg-destructive/5"><p>Couldn\'t load the saved artifact<span data-error-alchemy-menu=""></span></p><p>The saved content was not available.</p></div>';
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.message).toContain("saved content was not available");
});

/*
 * RC-B12 round 4 (R4-1): a short error sentence must never pull in the page
 * around it. These fixtures are the three pages the verifier caught.
 */
const menu = '<span data-error-alchemy-menu=""><button>Copy</button></span>';

it("/crm: a short error strip copies itself, not the toolbar and saved-views row around it", () => {
  document.body.innerHTML = `<section><nav><a>Duplicates</a><a>Outreach lists</a><a>Inbox</a><a>Chasebox</a><a>Import</a></nav>
    <div><h3>Views</h3><p>None yet — filter the list, then save it as a view your team can work.</p></div>
    <div class="mt-2 rounded-md border border-destructive/20 bg-destructive/10 text-destructive">forced failure (RC-B12 verify) (XX500)${menu}</div></section>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.title).toBeUndefined();
  expect(read.message).toBe("forced failure (RC-B12 verify) (XX500)");
});

it("/crm/chasebox: a plain error line copies itself, not the tab heading and its description", () => {
  document.body.innerHTML = `<div><h2>Inbox</h2><p>A real person wrote back and nobody has answered or cleared it yet.</p>
    <p class="text-sm text-destructive">forced failure (RC-B12 verify) (XX500)${menu}</p></div>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.message).toBe("forced failure (RC-B12 verify) (XX500)");
  expect(read.title).toBeUndefined();
});

it("/organizations: an error line copies itself, not the counters beside it", () => {
  document.body.innerHTML = `<div><p><span>0</span>workspaces. <span>0</span>teams.</p>
    <div><p class="font-medium">We couldn't load your organizations</p><p class="text-destructive">forced failure (RC-B12 verify)${menu}</p></div></div>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(`${read.title ?? ""} ${read.message}`).not.toMatch(/workspaces|teams/);
  expect(read.message).toContain("forced failure (RC-B12 verify)");
});

it("never doubles a sentence's full stop", () => {
  document.body.innerHTML = `<div class="border-destructive"><p>Couldn't reach your computer — check it is on, then try again.. The steps below still work.</p>${menu}</div>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(`${read.title ?? ""} ${read.message}`).not.toMatch(/\.\./);
});

it("keeps block elements apart when it reads a box's words (RC-B12 round 2, R2-3)", () => {
  document.body.innerHTML =
    '<div class="card"><p>Dashboard metrics couldn\'t load</p><p>Your workspace is still available.</p><span data-error-alchemy-menu=""></span></div>';
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(`${read.title ?? ""} ${read.message}`).not.toMatch(/loadYour/);
  expect(read.title).toBe("Dashboard metrics couldn't load");
  expect(read.message).toBe("Your workspace is still available.");
});

it("keeps a real ellipsis and a question's own mark", () => {
  document.body.innerHTML = `<div class="border-destructive"><p>Still waiting... is the server up?. Retry soon.</p>${menu}</div>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.message).toBe("Still waiting... is the server up? Retry soon.");
});

it("a message line inside a red card reads the card's title too — the card is the error box", () => {
  document.body.innerHTML = `<div class="p-8 bg-red-50 border-red-200"><div class="text-center"><h3>Failed to Load Organizations</h3>
    <p class="text-red-700">forced failure${menu}</p><button>Try Again</button></div></div>`;
  const read = readRenderedError(errorRootFor(document.querySelector("[data-error-alchemy-menu]")));
  expect(read.title).toBe("Failed to Load Organizations");
  expect(read.message).toBe("forced failure");
});
