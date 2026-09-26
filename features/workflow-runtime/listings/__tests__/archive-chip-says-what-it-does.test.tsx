/**
 * THE WORKFLOW PICKER'S ARCHIVE CHIP SAYS WHAT IT DOES (2026-09-26).
 *
 * The chip read "All" while it was HIDING archived workflows (the default), so a
 * person who clicked it to see "all" live workflows was offered archived ones —
 * on the mandate Binding tab an archived workflow was picked and the save was
 * refused. The chip now speaks the platform archive filter's words, the same as
 * the agent picker (THE ARCHIVED-ITEMS LAW, common-docs/policies/archived-items.md):
 * hide archived → "Archive", show all → "All + archived", archived only → "Archived only".
 *
 * RED against the old chip ("All" in the default state), GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { WorkflowFilterBar } from "../core/WorkflowFilterBar";
import type { WorkflowListControls } from "../useWorkflowListCore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function controlsFor(archived: "active" | "all" | "archived"): WorkflowListControls {
  const noop = () => undefined;
  return {
    tab: "mine",
    setTab: noop,
    searchTerm: "",
    setSearchTerm: noop,
    deepSearch: false,
    setDeepSearch: noop,
    sortBy: "updated-desc",
    setSortBy: noop,
    includedCats: [],
    toggleCategory: noop,
    includedTags: [],
    toggleTag: noop,
    favFilter: "all",
    setFavFilter: noop,
    archived,
    setArchived: noop,
    favoritesFirst: true,
    setFavoritesFirst: noop,
    resetFilters: noop,
  } as unknown as WorkflowListControls;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function chipTexts(archived: "active" | "all" | "archived"): string[] {
  act(() => {
    root.render(
      <WorkflowFilterBar
        controls={controlsFor(archived)}
        allCategories={[]}
        allTags={[]}
        activeFilterCount={0}
        isMobile={false}
        rightPanel={null}
        onFilterChipClick={() => undefined}
      />,
    );
  });
  return Array.from(container.querySelectorAll("button")).map((b) => (b.textContent ?? "").trim());
}

describe("workflow picker archive chip", () => {
  it("never reads 'All' while archived workflows are hidden", () => {
    const texts = chipTexts("active");
    expect(texts).not.toContain("All");
    expect(texts).toContain("Archive");
  });

  it("names the state when archived workflows are shown", () => {
    expect(chipTexts("all")).toContain("All + archived");
    expect(chipTexts("archived")).toContain("Archived only");
  });
});

// ── The row says it is archived (2026-09-26) ─────────────────────────────────
import { WorkflowRow } from "../core/WorkflowRow";

function renderRow(isArchived: boolean): HTMLElement {
  act(() => {
    root.render(
      <WorkflowRow
        workflow={{ id: "wf-1", name: "Summarize text to markdown", isArchived, isFavorite: false, stepCount: 5, isOwner: true } as never}
        isActive={false}
        isHovered={false}
        isMobile={false}
        onClick={() => undefined}
        onHover={() => undefined}
        onHoverEnd={() => undefined}
        onDetailPress={() => undefined}
      />,
    );
  });
  return container;
}

describe("workflow picker row", () => {
  it("an archived workflow's row carries the Archived badge; a live one does not", () => {
    expect(renderRow(true).querySelector("[data-testid='workflow-row-archived']")?.textContent).toBe("Archived");
    expect(renderRow(false).querySelector("[data-testid='workflow-row-archived']")).toBeNull();
  });
});
