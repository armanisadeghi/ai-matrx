/**
 * EVERY CONTEXT VALUE SITS WHERE THE PAGE ALREADY SAYS IT DOES.
 *
 * Use case: on a brand's Marketing cockpit, the person opens the composer's
 * value list and sees "Marketing › Marketing Brand Cockpit", under it the
 * page's own groups (Brand identity, Brand context, Brand portfolio, Generic
 * baselines) with the page's own labels, then "AI Matrx" for who they are.
 *
 * Breaks this catches: a group label typed by hand (drifts from the
 * manifest), the platform level reading "System", the page's route landing
 * under the platform (its switch would not turn it off), a section missing
 * because the navigation seam was not registered.
 *
 * SUT: the real placement over the real registered manifests and navigation.
 */

import { loadSurfaceBody } from "@ai-matrx/chat/surfaces/runtime/registry";
import { placeContextRow } from "@ai-matrx/chat/agents/redux/execution-system/context-rules/context-hierarchy";

const BRAND = "matrx-user/marketing-brand";

describe("a value's place in the context list", () => {
  it("a page value sits under the page's section and name, in the manifest's own group", async () => {
    const place = placeContextRow({ key: "brand_name", surfaceKey: BRAND, origin: "page" }, BRAND);
    expect(place.level.path).toEqual(["Marketing", "Marketing Brand Cockpit"]);
    const declared = (await loadSurfaceBody(BRAND))!;
    const group = declared.groups.find((g) => g.key === "brand_identity")!;
    expect(place.group).toEqual({ id: `${BRAND}:brand_identity`, label: group.label, order: group.sortOrder });
    expect(place.group?.label).toBe("Brand identity");
  });

  it("a baseline the page inherits sits in the manifest's synthesized group", () => {
    const place = placeContextRow({ key: "text_before", surfaceKey: BRAND, origin: "page" }, BRAND);
    expect(place.group?.label).toBe("Generic baselines");
  });

  it("who the person is sits under AI Matrx — never 'System'", () => {
    for (const key of ["user", "organization", "client", "active_scopes"]) {
      expect(placeContextRow({ key, surfaceKey: "_default", origin: "system" }, BRAND).level.path).toEqual([
        "AI Matrx",
      ]);
    }
  });

  it("the page's own route sits under the page, whose switch turns it off", () => {
    const place = placeContextRow({ key: "route_brief", surfaceKey: "_default", origin: "system" }, BRAND);
    expect(place.level.id).toBe(BRAND);
    expect(placeContextRow({ key: "route_brief", surfaceKey: "_default", origin: "system" }, null).level.id).toBe(
      "ai_matrx",
    );
    // A sent turn's receipt files it as client-sent ("attached"); it is still the page's.
    expect(placeContextRow({ key: "route_brief", surfaceKey: "_default", origin: "attached" }, BRAND).level.id).toBe(
      BRAND,
    );
  });

  it("an attached file sits under Attached", () => {
    expect(
      placeContextRow({ key: "resource_file_1", surfaceKey: "_default", origin: "attached" }, BRAND).level.path,
    ).toEqual(["Attached"]);
  });
});
