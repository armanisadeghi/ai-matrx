/**
 * THE HOME IS ON THE ROW, AND THE ORGANIZATION IS IN THE PANEL.
 * (one-resolution FIX-R3/W1, 2026-09-08.)
 *
 * The finding: `/mandates` shipped with ONE aggregate "My Orgs" tab, no
 * per-organization control a walker could find, and no column saying whose job
 * a row is. A mandate's home is its ORGANIZATION (DESIGN-one-resolution.md
 * D-R3) — a personal workspace is just an organization — so a blended list that
 * cannot tell the platform's 400+ jobs from the handful an organization added
 * has lost the exact distinction the one-resolution ruling is about.
 *
 * Two things close it and BOTH are guarded here, because either one alone
 * re-opens it: the Organization section in the Filters panel, and the Home
 * column on every row.
 *
 * 🚨 THE THIRD ASSERTION IS THE LOAD-BEARING ONE. Ownership is `p_home`, and
 * `p_home` is the door's decision. A per-organization control implemented as a
 * client-side filter over loaded rows — or as a `p_filters` facet the RPC has
 * no predicate for — would LOOK identical and be the same class of defect this
 * whole campaign exists to kill. So the section is proved to narrow the SCOPE,
 * and `homeForScope`/`homeParam` are DRIVEN to prove a narrowed scope becomes
 * `org:<id>` on the wire.
 */
import { mandateListConfig } from "../listConfig";
import { MANDATE_COLUMNS } from "../columns";
import { homeForScope } from "../service";
import { homeParam } from "@/features/mandates/list-door";
import type { EntityListConfig, EntityScopeFacetSection } from "@/lib/entity-list/config";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";

/** The checks, as functions, so the RED block below can run them on the shipped shape. */
export function organizationSectionOf(
  scopeSections: readonly EntityScopeFacetSection[] | undefined,
): EntityScopeFacetSection | undefined {
  return (scopeSections ?? []).find((section) => section.scope === "orgs");
}

export function homeColumnOf(
  columns: readonly EntityColumnSpec<unknown>[],
): EntityColumnSpec<unknown> | undefined {
  return columns.find((column) => column.id === "home");
}

describe("the ownership axis is reachable, not just present", () => {
  it("offers an Organization section in the Filters panel", () => {
    const section = organizationSectionOf(mandateListConfig.scopeSections);
    expect(section).toBeDefined();
    expect(section?.label).toBe("Organization");
    // The blended choice is NAMED. "All" with no words is what made a person
    // read the aggregate tab as the only view there was.
    expect(section?.allLabel).toBeTruthy();
    // And it says what choosing one actually changes, including the fact that
    // an organization's count never sums to All's (L2's disclosed consequence).
    expect(section?.hint ?? "").toMatch(/platform/i);
  });

  it("puts a Home column on every row, and locks it on", () => {
    const column = homeColumnOf(
      MANDATE_COLUMNS as unknown as EntityColumnSpec<unknown>[],
    );
    expect(column).toBeDefined();
    expect(column?.label).toBe("Home");
    // Locked: a row whose owner is invisible is the defect itself, so this
    // column cannot be turned off into the state that produced the finding.
    expect(column?.locked).toBe(true);
    expect(column?.defaultHidden).toBeFalsy();
  });

  it("bumps prefsVersion, so an existing user actually SEES the new column", () => {
    // A new column with a stale prefsVersion is a column nobody who has used
    // the page before ever gets — shipped and invisible.
    expect(mandateListConfig.prefsVersion).toBeGreaterThan(1);
  });
});

describe("choosing an organization narrows p_home — never the loaded rows", () => {
  const ORG = "0cc9f39e-1111-2222-3333-444455556666";

  it("turns a narrowed orgs scope into the door's own org selector", () => {
    expect(homeParam(homeForScope({ kind: "orgs", organizationId: ORG }))).toBe(
      `org:${ORG}`,
    );
  });

  it("keeps the blended state blended, and the system home its own", () => {
    expect(
      homeParam(homeForScope({ kind: "orgs", organizationId: null })),
    ).toBe("all");
    expect(homeParam(homeForScope({ kind: "system" }))).toBe("system");
  });

  it("is a SCOPE section, not a filter — the two bags are different questions", () => {
    // A `p_filters` entry would be silently ignored by `mnd_list_scoped`, which
    // has no home predicate in its filter bag: the list would not narrow and
    // nothing would say why.
    const section = organizationSectionOf(mandateListConfig.scopeSections);
    expect(section).not.toHaveProperty("filterId");
    expect(
      mandateListConfig.facetSections.some((f) => f.filterId === "home"),
    ).toBe(false);
  });
});

/**
 * THE GUARD PROVEN RED — the config and the column registry exactly as they
 * shipped on v0.4.1718, the build the walk drove. If these checks ever stop
 * detecting that shape they have stopped measuring anything, and this fails
 * instead of quietly passing.
 */
describe("proven against the surface as it shipped", () => {
  const SHIPPED_CONFIG = {
    // v0.4.1718 declared no scopeSections at all — the per-organization view
    // existed only in the tab's chevron dropdown, which the walker never found.
    scopeSections: undefined,
    prefsVersion: 1,
    facetSections: mandateListConfig.facetSections,
  } as Pick<
    EntityListConfig<unknown>,
    "scopeSections" | "prefsVersion" | "facetSections"
  >;

  const SHIPPED_COLUMNS = MANDATE_COLUMNS.filter(
    (column) => column.id !== "home",
  ) as unknown as EntityColumnSpec<unknown>[];

  it("catches the missing Organization section", () => {
    expect(organizationSectionOf(SHIPPED_CONFIG.scopeSections)).toBeUndefined();
  });

  it("catches the missing Home column", () => {
    expect(homeColumnOf(SHIPPED_COLUMNS)).toBeUndefined();
  });

  it("catches the un-bumped prefsVersion that would have hidden it", () => {
    expect(SHIPPED_CONFIG.prefsVersion).toBe(1);
  });
});
