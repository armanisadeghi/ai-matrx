/**
 * THE SYSTEM TAB NEVER CLAIMS TO BE ADMIN-ONLY.
 *
 * The shared scope strip's `system` tab carried the hover text "The platform's
 * own records — visible to Matrx admins". Since the mandate member pages
 * (2026-09-24) every signed-in member sees a System tab listing the platform's
 * mandates, so on those pages the tooltip told a member the thing in front of
 * them was hidden from them. Who can see a tab is the SURFACE's decision (it
 * chooses its `scopes`); the shared strip only says what the tab holds.
 *
 * RED against the old title; GREEN on the neutral one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { EntityScopeTabs } from "../components/EntityScopeTabs";
import { makeScope } from "@/lib/list-scope/types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

it("the System tab's hover text says what it holds, not who may see it", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <EntityScopeTabs
        scope={makeScope("mine")}
        scopes={["mine", "system"]}
        counts={{ byKind: { mine: 1, system: 2 }, narrow: {} }}
        onChange={() => undefined}
      />,
    );
  });
  const titles = Array.from(container.querySelectorAll("[title]")).map(
    (node) => node.getAttribute("title") ?? "",
  );
  const system = titles.find((title) => /platform/i.test(title));
  expect(system).toBeDefined();
  expect(system).not.toMatch(/admin/i);
});
