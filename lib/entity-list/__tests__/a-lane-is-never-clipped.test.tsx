/**
 * A LANE IS NEVER CLIPPED (coordinator, /agents/all beside the chat panel 2026-10-04: "My Orgs"
 * cut mid-word under "Any dimension"; Shared, Public and System hidden). When the tab row does not
 * fit its slot — at any width — the slot holds the select of every lane, and the row is kept only
 * to be measured: invisible, inert, out of flow. Break: the row scrolls/clips again → red.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COUNTS: EntityScopeCounts = { byKind: { mine: 192, team: 1, orgs: 228, shared: 10, public: 0 }, narrow: {} };
const RO = globalThis.ResizeObserver;
let spies: jest.SpyInstance[] = [];

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = RO;
});
afterEach(() => {
  spies.forEach((s) => s.mockRestore());
  spies = [];
  document.body.innerHTML = "";
});

async function renderWith(natural: number, slot: number) {
  spies = [
    jest.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(natural),
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(slot),
  ];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<EntityScopeTabs scope={makeScope("mine")} scopes={["mine", "orgs"]} counts={COUNTS} onChange={() => undefined} />),
  );
  return { container, root };
}

it("tabs that do not fit their slot become the one select, at every width", async () => {
  const { container, root } = await renderWith(620, 380);
  expect(container.querySelector("[data-entity-scope-lanes]")?.getAttribute("data-entity-scope-lanes")).toBe("select");
  const trigger = container.querySelector('[role="combobox"][aria-label="List scope"]') as HTMLElement;
  expect(trigger.className).not.toMatch(/sm:hidden/);
  const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
  expect(tablist.getAttribute("aria-hidden")).toBe("true");
  expect(tablist.className).toMatch(/\binvisible\b/);
  expect(tablist.className).not.toMatch(/overflow-x-auto/);
  await act(async () => root.unmount());
});

it("tabs that fit stay tabs", async () => {
  const { container, root } = await renderWith(300, 380);
  expect(container.querySelector("[data-entity-scope-lanes]")?.getAttribute("data-entity-scope-lanes")).toBe("tabs");
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  await act(async () => root.unmount());
});
