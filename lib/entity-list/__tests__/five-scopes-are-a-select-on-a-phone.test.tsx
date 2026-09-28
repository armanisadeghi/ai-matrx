/**
 * CONTROL-TYPE RULE on a phone: up to four scopes are tabs, five or more are a
 * select in the same slot (desktop keeps the tabs).
 *
 * THE DEFECT (verifier round 2 follow-up, 2026-09-27): at 375 /transcripts
 * showed two of its five scope tabs; "Shared" and "Public" sat past the edge.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";
import type { EntityScopeCounts } from "@/lib/entity-list/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COUNTS: EntityScopeCounts = { byKind: { mine: 420, team: 0, orgs: 843, shared: 0, public: 0 }, narrow: {} };

async function renderTabs(scopes: Parameters<typeof EntityScopeTabs>[0]["scopes"]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<EntityScopeTabs scope={makeScope("mine")} scopes={scopes} counts={COUNTS} onChange={() => undefined} />),
  );
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("five scopes: a phone gets one select in the slot, the tab row is desktop-only", async () => {
  const { container, root } = await renderTabs(["mine", "orgs", "shared", "public"]); // + My team = 5
  const trigger = container.querySelector('[role="combobox"][aria-label="List scope"]') as HTMLElement | null;
  expect(trigger).not.toBeNull();
  expect(trigger!.className).toMatch(/sm:hidden/);
  const tablist = container.querySelector('[role="tablist"]') as HTMLElement;
  expect(tablist.className).toMatch(/max-sm:hidden/);
  expect(trigger!.textContent).toContain("Mine (420)");
  await act(async () => root.unmount());
});

it("four or fewer scopes stay tabs everywhere", async () => {
  const { container, root } = await renderTabs(["mine", "shared", "public"]);
  expect(container.querySelector('[role="combobox"]')).toBeNull();
  expect((container.querySelector('[role="tablist"]') as HTMLElement).className).not.toMatch(/max-sm:hidden/);
  await act(async () => root.unmount());
});
