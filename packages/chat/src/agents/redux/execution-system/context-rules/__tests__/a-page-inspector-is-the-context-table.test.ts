/**
 * THE SURFACE CONTEXT WINDOW IS THE CONTEXT TABLE.
 *
 * Use case: on a brand's cockpit, someone opens "Surface Context" to see what
 * the page holds. They see every value the page declares (supplied or not),
 * any key the page emits without declaring it, under the same page heading and
 * the same manifest groups as the composer's chip — and each row's switch is
 * their real rule for this page.
 *
 * Breaks this catches: a declared-but-unsupplied value dropped from the list,
 * an undeclared runtime key hidden, an undeclared key's rule written under the
 * page's row (the server reads it from "_default"), an inspector heading or
 * group that differs from the chip's.
 */

import { surfaceContextRows, surfaceInspectorPlacer } from "../surface-context-rows";
import { placeContextRow } from "../context-hierarchy";

const BRAND = "matrx-user/marketing-brand";

describe("a page's inspector rows", () => {
  const { rows, status } = surfaceContextRows(
    BRAND,
    { brand_id: "52a7eea1-0260-4a6f-a392-90bea1dda941", brand_name: "Data Destruction", sites_summary: [], debug_flag: true },
    { [BRAND]: { brand_name: { include: false } } },
  );
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it("lists every declared value, supplied or not, and every undeclared key", () => {
    expect(row("brand_profile")).toBeTruthy();
    expect(status.brand_profile).toEqual({ supplied: "absent", required: false, declared: true });
    expect(status.brand_id).toEqual({ supplied: "present", required: true, declared: true });
    expect(status.sites_summary.supplied).toBe("empty");
    expect(status.debug_flag).toEqual({ supplied: "present", required: false, declared: false });
    expect(row("debug_flag").label).toBe("Debug Flag");
  });

  it("carries the person's real rule for this page; an undeclared key's rule lives under _default", () => {
    expect(row("brand_name").include).toBe(false);
    expect(row("brand_name").surfaceKey).toBe(BRAND);
    expect(row("debug_flag").surfaceKey).toBe("_default");
    expect(row("brand_profile").chars).toBeNull();
  });

  it("sits under the same page heading and groups as the composer's chip", () => {
    const place = surfaceInspectorPlacer(BRAND);
    expect(place(row("brand_name"))).toEqual(placeContextRow({ key: "brand_name", surfaceKey: BRAND, origin: "page" }, BRAND));
    expect(place(row("brand_name")).level.path).toEqual(["Marketing", "Marketing Brand Cockpit"]);
    expect(place(row("debug_flag")).level.id).toBe(BRAND);
    expect(place(row("debug_flag")).group).toBeNull();
  });
});
