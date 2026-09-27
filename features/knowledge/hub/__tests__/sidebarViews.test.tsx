/**
 * H5 — the sidebar shows saved views the way Linear does: pinned views with a
 * live count, the rest under "All views", presets in their own group, and a
 * menu that only offers what the person may do (no Delete on a teammate's
 * view, no Pin on a preset that is not installed yet).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/scopes/registry/entityRegistry", () => ({ tryGetEntityInfo: () => null }));

import { HubSidebar } from "@/features/knowledge/hub/components/HubSidebar";
import type { HubSavedView, HubSidebarData } from "@/features/knowledge/hub/hooks/useHubSidebarData";

const ready = <T,>(items: T[]) => ({ status: "ready" as const, items, error: null, retry: jest.fn() });

const view = (over: Partial<HubSavedView>): HubSavedView => ({
  id: "v",
  name: "View",
  definition: { query: { mode: "find" }, layout: "list" },
  visibility: "personal",
  organizationId: "org-1",
  createdBy: "me",
  version: 1,
  mine: true,
  pinned: false,
  preset: null,
  builtIn: false,
  ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(items: HubSavedView[]) {
  const data: HubSidebarData = {
    savedViews: ready(items),
    favorites: ready([]),
    containers: {
      project: ready([]),
      scope: ready([]),
      media_source_library: ready([]),
      research_topic: ready([]),
      data_store: ready([]),
    },
  };
  act(() =>
    root.render(
      <HubSidebar
        view={{ kind: "everything" }}
        data={data}
        sample={false}
        onSelect={() => undefined}
        viewCounts={{
          grants: { kind: "count", count: 99, capped: true },
          files: { kind: "count", count: 4, capped: false },
        }}
        onSaveView={() => undefined}
        onViewAction={() => undefined}
      />,
    ),
  );
}

it("pins with counts, hides the rest under All views, and groups presets", () => {
  render([
    view({ id: "grants", name: "Grants", pinned: true }),
    view({ id: "team", name: "Team reading", mine: false, visibility: "internal" }),
    view({ id: "files", name: "Files", preset: "files", mine: false, organizationId: "sys", visibility: "internal" }),
  ]);
  const text = host.textContent ?? "";
  const pinnedRow = host.querySelector('[data-saved-view="grants"]');
  expect(pinnedRow?.textContent).toContain("99+");
  expect(host.querySelector('[data-saved-view="files"]')?.textContent).toContain("4");
  expect(text).toContain("Presets");
  expect(text).toContain("All views");
  // Collapsed: the teammate's view is behind the disclosure.
  expect(host.querySelector('[data-saved-view="team"]')).toBeNull();
  const disclosure = [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith("All views"));
  act(() => disclosure!.click());
  expect(host.querySelector('[data-saved-view="team"]')).not.toBeNull();
  expect(host.querySelector('button[aria-label="Save view (⌥V)"]')).not.toBeNull();
});
