/**
 * Use existing offers EXACTLY the kinds the organization page's Resources grid
 * shows under "Sources" and "Sources & Outputs", read from the grid's own
 * definition — never Utilities, Outputs or Workspaces, never the registry's
 * wider `content_role` set (Arman, 2026-09-30: "We want sources… Just a list
 * of the things that are in either sources or sources and outputs").
 */
import { offeredKinds } from "./UseExisting";
import {
  CONTENT_ROLES,
  entriesByRole,
  SOURCE_CONTENT_ROLES,
} from "@/features/organizations/resource-catalogue";

describe("Use existing kinds", () => {
  it("are the grid's Sources + Sources & Outputs entries, in the grid's order", () => {
    // What the org page renders: one section per role, entriesByRole(role) in each.
    const gridSourceSections = CONTENT_ROLES.filter((r) =>
      (SOURCE_CONTENT_ROLES as readonly string[]).includes(r.id),
    ).flatMap((r) => entriesByRole(r.id).map((e) => e.labelPlural));
    expect(offeredKinds().map((k) => k.plural)).toEqual(gridSourceSections);
  });

  it("are the seven kinds the page shows (Files … Notes), Websites and Datasets included", () => {
    expect(offeredKinds().map((k) => k.plural)).toEqual([
      "Files",
      "Transcripts",
      "Websites",
      "Datasets",
      "Lists",
      "Workbooks",
      "Notes",
    ]);
  });

  it("gives every kind a way to count and list it (no grid kind is dropped)", () => {
    for (const k of offeredKinds()) {
      expect(k.token).toBeTruthy();
      if (k.plural === "Websites") {
        expect(k.token).toBe("processed_document");
        expect(k.savedSourceGroup).toBe("web_page");
      }
    }
  });
});
