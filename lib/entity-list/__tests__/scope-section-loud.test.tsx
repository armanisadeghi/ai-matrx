/**
 * A DECLARED SCOPE SECTION IS OFFERED OR IT EXPLAINS ITSELF — NEVER ABSENT.
 *
 * 🚨 THE DEFECT (one-resolution FIX-R6/F1, fresh Sonnet walk of production
 * v0.4.1722, admin@admin.com, nine organizations). `/mandates` declares a
 * scope section — `{ scope: "orgs", label: "Organization" }` — and the Filters
 * panel rendered it only `if (options.length > 0)`. Live, `counts.narrow.orgs`
 * was empty (the shell asked for counts once, before the caller's memberships
 * had loaded, and never re-asked), so the section was simply NOT THERE. The
 * walker reported `/mandates` as having no per-organization view at all, and
 * nothing on the screen said otherwise. That is the fourth law's silent
 * failure: the page did not lie, it went quiet, which is worse.
 *
 * These two tests pin the rule at the level of the SHARED SHELL, not of one
 * page:
 *
 *   1. a declared section with zero options renders anyway, carrying a reason;
 *   2. the reason is the SERVICE'S own words when it supplied one, so a
 *      refused count reaches the reader instead of a console line.
 *
 * RED against HEAD before the fix: both fail with the section absent from the
 * panel (`Organization` never appears in the rendered text).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { EntityFilterPanel } from "../components/EntityFilterPanel";
import {
  DEFAULT_ENTITY_LIST_QUERY,
  EMPTY_FACETS,
  type EntityScopeCounts,
} from "../types";
import type { EntityScopeFacetSection } from "../config";

const ORGANIZATION_SECTION: EntityScopeFacetSection = {
  scope: "orgs",
  label: "Organization",
  allLabel: "All homes",
  hint: "Whose job it is.",
};

let container: HTMLDivElement;
let root: Root;

function render(
  counts: EntityScopeCounts,
  extra: { countsLoading?: boolean; countsError?: string | null } = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <EntityFilterPanel
        query={{ ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "orgs" } }}
        facets={EMPTY_FACETS}
        columns={[]}
        facetSections={[]}
        scopeSections={[ORGANIZATION_SECTION]}
        counts={counts}
        countsLoading={extra.countsLoading ?? false}
        countsError={extra.countsError ?? null}
        onScopeChange={() => undefined}
        hasFavorites={false}
        hasArchived={false}
        sort="label"
        direction="asc"
        favoritesFirst={false}
        onPatchQuery={() => undefined}
        onSortChange={() => undefined}
        onFavoritesFirstChange={() => undefined}
        onResetFilters={() => undefined}
      />,
    );
  });
  // The sections live inside the popover; open it the way a person does.
  const trigger = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Filters and sort"]',
  );
  if (!trigger) throw new Error("the Filters trigger did not render at all");
  act(() => {
    trigger.click();
  });
  return `${container.textContent ?? ""}${document.body.textContent ?? ""}`;
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a declared scope section with no options", () => {
  it("still renders, and says why there is nothing to narrow to", () => {
    const text = render({
      byKind: { orgs: 409 },
      narrow: {},
      narrowUnavailable: {
        orgs: "Still reading which organizations you belong to.",
      },
    });
    expect(text).toContain("Organization");
    expect(text).toContain(
      "Still reading which organizations you belong to.",
    );
  });

  it("carries a refusal in the SERVICE's own words, never a console line", () => {
    const text = render({
      byKind: {},
      narrow: {},
      narrowUnavailable: {
        orgs: "The list door refused a count for Titanium (You are not a member of that organization).",
      },
    });
    expect(text).toContain("Organization");
    expect(text).toContain("You are not a member of that organization");
  });

  it("says something even when the surface supplied no reason at all", () => {
    // A surface that forgets to explain itself is a defect, and the shell says
    // so on screen rather than hiding the section and hiding the defect.
    const text = render({ byKind: {}, narrow: {} });
    expect(text).toContain("Organization");
    expect(text).toMatch(/could not be listed/i);
  });
});

describe("a declared scope section WITH options", () => {
  it("offers them with the counts query's own numbers", () => {
    const text = render({
      byKind: { orgs: 409 },
      narrow: {
        orgs: [
          { id: "org-1", label: "Write Target Sandbox", count: 3 },
          { id: "org-2", label: "Titanium", count: 0 },
        ],
      },
    });
    expect(text).toContain("Organization");
    expect(text).toContain("Write Target Sandbox");
    expect(text).toContain("All homes");
  });
});
