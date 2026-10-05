/**
 * A PRESS ROOM DEEP LINK OPENS WHAT IT NAMES, AND A RELOAD KEEPS IT OPEN.
 *
 * Acceptance (2026-10-05): an angle's "Link to this angle" opened the Press Room without the
 * angle. Two causes, one class:
 *  1. every Press Room href was built on the retired flat `/marketing/pr`, which redirects to
 *     the client roster and drops the query (`?focus=` included);
 *  2. a link without `?brand=&site=` had those filled in by the page's defaulting effects
 *     through `set()`, and `set()` treats a brand/site change as the person switching business
 *     — it clears `focus`. A default is not a choice: filling one must keep the record open.
 * Census: angle, HARO request and coverage story all ride `?focus=`; a calendar moment rides
 * `?moment=` (see calendar-model.test.ts).
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = "";
const pathname = "/marketing/all-green/pr";
const push = jest.fn((url: string) => apply(url));
const replace = jest.fn((url: string) => apply(url));
function apply(url: string) {
  const u = new URL(url, `http://x${pathname}`);
  search = u.search.slice(1);
}
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => pathname,
}));

import { usePressRoomUrl, type PressRoomUrlState } from "../routes";

let state: PressRoomUrlState;
function Probe() {
  state = usePressRoomUrl();
  return null;
}
async function mount() {
  const host = document.createElement("div");
  await act(async () => {
    createRoot(host).render(<Probe />);
  });
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});

test("a shared link is built on THIS brand's Press Room, never the retired flat route", async () => {
  search = "brand=b1&site=s1";
  await mount();
  expect(state.href({ view: "all", focus: { kind: "angle", id: "a1" } })).toBe(
    "/marketing/all-green/pr?brand=b1&site=s1&view=all&focus=angle%3Aa1",
  );
});

test("filling the default brand and site keeps the deep-linked record open", async () => {
  search = "focus=angle%3Aa1";
  await mount();
  act(() => state.fill({ brand: "b1" }));
  await mount();
  act(() => state.fill({ site: "s1" }));
  expect(new URLSearchParams(search).get("focus")).toBe("angle:a1");
  expect(new URLSearchParams(search).get("brand")).toBe("b1");
  expect(new URLSearchParams(search).get("site")).toBe("s1");
  // A default is not a history entry: Back must not land on a half-filled page.
  expect(push).not.toHaveBeenCalled();
});

test.each([
  ["angle", "angle:a1"],
  ["request", "request:r1"],
  ["coverage", "coverage:c1"],
])("a %s deep link survives the defaults", async (_kind, focus) => {
  search = `focus=${encodeURIComponent(focus)}`;
  await mount();
  act(() => state.fill({ brand: "b1", site: "s1" }));
  expect(new URLSearchParams(search).get("focus")).toBe(focus);
});

test("a person switching business still clears the open record", async () => {
  search = "brand=b1&site=s1&focus=angle%3Aa1";
  await mount();
  act(() => state.set({ brand: "b2" }));
  expect(new URLSearchParams(search).get("focus")).toBeNull();
});
