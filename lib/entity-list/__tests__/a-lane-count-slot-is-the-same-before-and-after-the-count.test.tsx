/**
 * A LANE'S COUNT SLOT IS THE SAME SIZE BEFORE AND AFTER THE COUNT (STABLE-2, /data home: the lane tabs
 * widened when their counts landed). While counts are read each lane holds an empty three-digit pill
 * (no digit — a number is never invented); the real pill wears the same width class. Break: no pill
 * while loading → red.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RO = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = RO;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const EMPTY: EntityScopeCounts = { byKind: {}, narrow: {} };
const COUNTED: EntityScopeCounts = { byKind: { mine: 583, orgs: 2 }, narrow: {} };

async function render(counts: EntityScopeCounts, countsLoading: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <EntityScopeTabs scope={makeScope("mine")} scopes={["mine", "orgs"]} counts={counts} countsLoading={countsLoading} onChange={() => undefined} />,
    );
  });
  return { container, root };
}

it("every lane holds a digit-free three-digit slot while counting, and the counted pill wears the same slot", async () => {
  const loading = await render(EMPTY, true);
  const waiting = Array.from(loading.container.querySelectorAll<HTMLElement>("[data-scope-count]"));
  expect(waiting.length).toBeGreaterThanOrEqual(2); // Mine, My Orgs, plus the All / My team tabs that join every bar
  waiting.forEach((pill) => {
    expect(pill.getAttribute("data-scope-count")).toBe("pending");
    expect(pill.textContent?.trim()).toBe("");
    expect(pill.className).toMatch(/min-w-\[calc\(4ch\+0\.5rem\)\]/);
  });
  await act(async () => loading.root.unmount());
  document.body.innerHTML = "";
  const counted = await render(COUNTED, false);
  const ready = Array.from(counted.container.querySelectorAll<HTMLElement>("[data-scope-count]"));
  expect(ready.map((p) => p.textContent)).toEqual(expect.arrayContaining(["583", "2"]));
  ready.forEach((pill) => expect(pill.className).toMatch(/min-w-\[calc\(4ch\+0\.5rem\)\]/));
  await act(async () => counted.root.unmount());
});
