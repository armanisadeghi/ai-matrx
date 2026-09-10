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
});
