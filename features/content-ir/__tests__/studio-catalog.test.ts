/**
 * Shapes studio — pure list assembly + partition + creator-agent gating.
 * The list is an RLS-scoped browser read; these tests cover the pure merge
 * (`buildShapeStudioList`) and the mine/platform split (`partitionShapes`)
 * from fixture rows, plus the loud not-configured creator-agent gate.
 */

import {
  buildShapeStudioList,
  partitionShapes,
  type ShapeDefinitionRowLite,
} from "../studio/studio-catalog";
import {
  SHAPE_CREATOR_AGENT_ID,
  shapeCreatorAgentId,
  shapeDetailHref,
  shapeSchemaHref,
  shapeTestHref,
} from "../studio/constants";

function row(overrides: Partial<ShapeDefinitionRowLite>): ShapeDefinitionRowLite {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "flashcard_set",
    label: "Flashcard Set",
    is_active: true,
    visibility: "public",
    metadata: {},
    version: 1,
    updated_at: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

describe("buildShapeStudioList", () => {
  it("merges rows, flags components, extracts metadata.family, sorts by label", () => {
    const entries = buildShapeStudioList(
      [
        row({ id: "b", kind: "zeta", label: "Zeta", metadata: { family: "render_block" } }),
        row({ id: "a", kind: "alpha", label: "Alpha", is_active: false }),
      ],
      new Set(["b"]),
    );
    expect(entries.map((e) => e.kind)).toEqual(["alpha", "zeta"]);
    expect(entries[0]).toMatchObject({
      hasComponent: false,
      isActive: false,
      family: null,
    });
    expect(entries[1]).toMatchObject({
      hasComponent: true,
      family: "render_block",
    });
  });

  it("excludes generated machine-contract families (agent_io / tool_io / action_io / workflow_io)", () => {
    const entries = buildShapeStudioList(
      [
        row({ id: "1", kind: "a_out", label: "A", metadata: { family: "agent_io" } }),
        row({ id: "2", kind: "t_out", label: "T", metadata: { family: "tool_io" } }),
        row({ id: "3", kind: "w_out", label: "W", metadata: { family: "workflow_io" } }),
        row({ id: "4", kind: "act", label: "Act", metadata: { family: "action_io" } }),
        row({ id: "5", kind: "flash", label: "Flash", metadata: { family: "render_block" } }),
        row({ id: "6", kind: "plain", label: "Plain", metadata: {} }),
      ],
      new Set(),
    );
    expect(entries.map((e) => e.kind).sort()).toEqual(["flash", "plain"]);
  });

  it("treats non-object / familyless metadata as family: null", () => {
    const entries = buildShapeStudioList(
      [
        row({ id: "1", kind: "a", label: "A", metadata: null }),
        row({ id: "2", kind: "b", label: "B", metadata: [1, 2] }),
        row({ id: "3", kind: "c", label: "C", metadata: { family: 7 } }),
      ],
      new Set(),
    );
    expect(entries.every((e) => e.family === null)).toBe(true);
  });
});

describe("partitionShapes", () => {
  it("puts public rows in the platform section and everything else in mine", () => {
    const entries = buildShapeStudioList(
      [
        row({ id: "1", kind: "mine_org", label: "Mine", visibility: "org" }),
        row({ id: "2", kind: "mine_private", label: "Private", visibility: "private" }),
        row({ id: "3", kind: "platform", label: "Platform", visibility: "public" }),
      ],
      new Set(),
    );
    const { mine, platform } = partitionShapes(entries);
    expect(mine.map((e) => e.kind).sort()).toEqual(["mine_org", "mine_private"]);
    expect(platform.map((e) => e.kind)).toEqual(["platform"]);
  });
});

describe("creator agent gating + route helpers", () => {
  it("returns null (loud not-configured) while the constant is unset", () => {
    // When K2's agent id lands in SHAPE_CREATOR_AGENT_ID this expectation
    // flips — update it alongside the constant.
    if (SHAPE_CREATOR_AGENT_ID.trim() === "") {
      expect(shapeCreatorAgentId()).toBeNull();
    } else {
      expect(shapeCreatorAgentId()).toBe(SHAPE_CREATOR_AGENT_ID.trim());
    }
  });

  it("builds encoded detail/test/schema hrefs from one base", () => {
    expect(shapeDetailHref("flashcard_set")).toBe("/shapes/flashcard_set");
    expect(shapeTestHref("flashcard_set")).toBe("/shapes/flashcard_set/test");
    expect(shapeSchemaHref("a b")).toBe("/shapes/a%20b/schema");
  });
});
