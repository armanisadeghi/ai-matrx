/**
 * THE HOME IS ON THE ROW; THE LANES ARE THE STANDARD LANES (active-org law, 2026-09-30).
 *
 * A mandate's home is its ORGANIZATION (D-R3), so a blended list that cannot tell the platform's
 * jobs from the handful an organization added loses the distinction the one-resolution ruling is
 * about. Two things keep it: the Home column on every row, and the lanes — All (the platform's jobs
 * plus my organizations), My Orgs (ONLY my organizations), System (the platform's own). The
 * organization is the page's organization filter (`p_org_id`), never a lane and never a second
 * per-organization control in the Filters panel.
 */
import { mandateListConfig } from "../listConfig";
import { MANDATE_COLUMNS } from "../columns";
import { homeForScope } from "../service";
import { MANDATE_LIST_SCOPES } from "../types";
import { homeParam } from "@/features/mandates/list-door";
import type { EntityListConfig } from "@/lib/entity-list/config";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";

export function homeColumnOf(
  columns: readonly EntityColumnSpec<unknown>[],
): EntityColumnSpec<unknown> | undefined {
  return columns.find((column) => column.id === "home");
}

describe("the home is on every row", () => {
  it("puts a Home column on every row, and locks it on", () => {
    const column = homeColumnOf(
      MANDATE_COLUMNS as unknown as EntityColumnSpec<unknown>[],
    );
    expect(column).toBeDefined();
    expect(column?.label).toBe("Home");
    // Locked: a row whose owner is invisible is the defect itself.
    expect(column?.locked).toBe(true);
    expect(column?.defaultHidden).toBeFalsy();
  });

  it("bumps prefsVersion, so an existing user actually SEES the new column", () => {
    expect(mandateListConfig.prefsVersion).toBeGreaterThan(1);
  });

  it("proven against the shipped shape: without the column the check fails", () => {
    const shipped = MANDATE_COLUMNS.filter(
      (column) => column.id !== "home",
    ) as unknown as EntityColumnSpec<unknown>[];
    expect(homeColumnOf(shipped)).toBeUndefined();
  });
});

describe("the lanes are the standard lanes, and each asks the door for its own home", () => {
  it("declares All first and My Orgs, with no Mine and no My team", () => {
    expect(MANDATE_LIST_SCOPES).toEqual(["all", "orgs"]);
    expect(mandateListConfig.scopes).toBe(MANDATE_LIST_SCOPES);
    expect((mandateListConfig as EntityListConfig<unknown>).lanes).toEqual({ team: false });
  });

  it("All is the blended home, My Orgs is ONLY my organizations, System is the platform's own", () => {
    expect(homeParam(homeForScope({ kind: "all" }))).toBe("all");
    // The platform's own jobs belong to the System lane, never to My Orgs.
    expect(homeParam(homeForScope({ kind: "orgs" }))).toBe("orgs");
    expect(homeParam(homeForScope({ kind: "system" }))).toBe("system");
  });

  it("has no per-organization section of its own: the organization is the shell's filter", () => {
    expect(mandateListConfig.scopeSections).toBeUndefined();
    expect(
      mandateListConfig.facetSections.some((f) => f.filterId === "home"),
    ).toBe(false);
  });
});
