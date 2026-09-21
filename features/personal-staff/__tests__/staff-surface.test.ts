/** @jest-environment node */
/**
 * WHERE THE STAFF THREAD SAYS IT IS STANDING.
 *
 * `/staff` mounts the SAME room as `/chat`, and that room opts out of
 * launch-time surface adoption (`runtime: { surfaceName: null }`) — so
 * `client.surface` on a staff turn is resolved from the PATHNAME through
 * `SURFACE_ROUTE_MAPPINGS`. Lose that row and the Holder resolves against
 * `matrx-user/chat`, or nothing, and answers a person sitting at a full screen
 * with the brevity it uses for a text message. Four real turns showed exactly
 * that before the `ui.ui_surface` row existed.
 *
 * `source_feature` is the other half: an unregistered slug is refused outright
 * by aidream's `AgentStartRequest`, so this pins the one we send against the
 * generated allow-list rather than a hopeful literal.
 */

import { SOURCE_FEATURES } from "@/types/python-generated/source-attribution";
import {
  SURFACE_ROUTE_MAPPINGS,
  surfaceFromPathname,
} from "@/features/surfaces/utils/route-to-surface";
import { ALL_MANIFESTS } from "@/features/surfaces/manifests/registry";
import { STAFF_SURFACE_NAME } from "@/features/surfaces/manifests/staff.manifest";

describe("the /staff route declares its surface", () => {
  it("resolves /staff to matrx-user/staff", () => {
    expect(surfaceFromPathname("/staff")).toBe(STAFF_SURFACE_NAME);
  });

  it("does NOT let /chat's mapping swallow it, and does not swallow /chat", () => {
    expect(surfaceFromPathname("/chat")).toBe("matrx-user/chat");
    expect(surfaceFromPathname("/chat/new")).toBe("matrx-user/chat");
  });

  it("is not a phantom — the mapping has a registered manifest", () => {
    // `pnpm check:surface-routes` fails the build on a mapping with no
    // manifest; this is the same assertion, close to the change that would
    // break it.
    const manifestNames = new Set(ALL_MANIFESTS.map((m) => m.surfaceName));
    const staffMapping = SURFACE_ROUTE_MAPPINGS.find(
      (mapping) => mapping.prefix === "/staff",
    );
    expect(staffMapping?.surface).toBe(STAFF_SURFACE_NAME);
    expect(manifestNames.has(STAFF_SURFACE_NAME)).toBe(true);
  });

  it("declares no `intro` — the live ui_surface row owns those words", () => {
    // The manifest's `intro` is MIRRORED to `ui_surface.intro`. That row is
    // already authored (aidream migration 0977); a copy here could only drift
    // from it or overwrite it.
    const manifest = ALL_MANIFESTS.find(
      (m) => m.surfaceName === STAFF_SURFACE_NAME,
    );
    expect(manifest).toBeDefined();
    expect(manifest?.intro).toBeUndefined();
  });
});

describe("the /staff route declares its provenance", () => {
  it("sends a source feature aidream has registered", () => {
    expect(SOURCE_FEATURES).toContain("personal-staff");
  });
});
