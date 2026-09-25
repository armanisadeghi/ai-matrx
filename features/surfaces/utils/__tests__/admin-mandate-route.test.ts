/**
 * `/administration/mandates/<key>` is ONE job's workspace — its own surface —
 * while the console, `new`, and `advanced` stay on `matrx-admin/mandates`.
 * Prefix matching cannot say "children but not the parent", so a resolver
 * does; this pins the boundary in both directions.
 */
import { surfaceFromPathname } from "../route-to-surface";

describe("admin mandate route → surface", () => {
  it("maps a mandate key (dots, no slash) to the workspace surface", () => {
    expect(
      surfaceFromPathname("/administration/mandates/research_client.output_slides"),
    ).toBe("matrx-admin/mandate-workspace");
    expect(surfaceFromPathname("/administration/mandates/mandate.goal_writer")).toBe(
      "matrx-admin/mandate-workspace",
    );
  });

  it("keeps the console and its non-mandate siblings on the console surface", () => {
    expect(surfaceFromPathname("/administration/mandates")).toBe("matrx-admin/mandates");
    expect(surfaceFromPathname("/administration/mandates/")).toBe("matrx-admin/mandates");
    expect(surfaceFromPathname("/administration/mandates/new")).toBe("matrx-admin/mandates");
    expect(surfaceFromPathname("/administration/mandates/advanced")).toBe(
      "matrx-admin/mandates",
    );
    // The fleet reference board (campaign L7) is a list over every repo, not
    // one job's workspace — it must NOT read as a mandate key.
    expect(surfaceFromPathname("/administration/mandates/references")).toBe(
      "matrx-admin/mandates",
    );
  });

  it("maps the new admin suite: record pages to the workspace, the rest to the console", () => {
    const home = "/administration/intelligence/mandates";
    expect(surfaceFromPathname(home)).toBe("matrx-admin/mandates");
    for (const page of ["dashboard", "health", "unconverted", "window"]) {
      expect(surfaceFromPathname(`${home}/${page}`)).toBe("matrx-admin/mandates");
    }
    expect(surfaceFromPathname(`${home}/research_client.output_slides`)).toBe(
      "matrx-admin/mandate-workspace",
    );
    expect(surfaceFromPathname(`${home}/research_client.output_slides/overrides`)).toBe(
      "matrx-admin/mandate-workspace",
    );
  });

  it("maps the member record pages to the surface the record page mounts", () => {
    expect(surfaceFromPathname("/mandates/record-preview/agent_apps.auto_create")).toBe(
      "matrx-admin/mandate-workspace",
    );
    expect(
      surfaceFromPathname("/organizations/884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f/mandates/seo.ai_visibility"),
    ).toBe("matrx-admin/mandate-workspace");
  });

  it("never hands a member list an admin mandate surface", () => {
    expect(surfaceFromPathname("/mandates/list-preview")).toBeNull();
    expect(surfaceFromPathname("/intelligence")).toBeNull();
    expect(surfaceFromPathname("/intelligence/research")).toBeNull();
    // The org list and its "new" page stay on the organizations hub.
    const org = "/organizations/884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f/mandates";
    expect(surfaceFromPathname(org)).toBe("matrx-user/organizations");
    expect(surfaceFromPathname(`${org}/new`)).toBe("matrx-user/organizations");
  });
});
