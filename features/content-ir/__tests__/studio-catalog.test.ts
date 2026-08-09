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

const ME = "11111111-1111-1111-1111-111111111111";
const TEAMMATE = "22222222-2222-2222-2222-222222222222";

function row(overrides: Partial<ShapeDefinitionRowLite>): ShapeDefinitionRowLite {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "flashcard_set",
    label: "Flashcard Set",
    created_by: null,
    is_active: true,
    is_contract_artifact: false,
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

  it("excludes contract-artifact rows but keeps human-named workflow_io shapes", () => {
    const entries = buildShapeStudioList(
      [
        // Machine-minted contract bookkeeping rows — hidden regardless of family.
        row({
          id: "1",
          kind: "agent_io_x_deadbeef_output",
          label: "A output",
          is_contract_artifact: true,
          metadata: { family: "agent_io" },
        }),
        row({
          id: "2",
          kind: "tool_io_y_deadbeef_output",
          label: "T output",
          is_contract_artifact: true,
          metadata: { family: "tool_io" },
        }),
        // Human-named shapes in the workflow_io family ARE browsable
        // (named-shapes campaign 2026-08-09).
        row({ id: "3", kind: "agent_result", label: "Agent Result", metadata: { family: "workflow_io" } }),
        row({ id: "5", kind: "flash", label: "Flash", metadata: { family: "render_block" } }),
        row({ id: "6", kind: "plain", label: "Plain", metadata: {} }),
      ],
      new Set(),
    );
    expect(entries.map((e) => e.kind).sort()).toEqual(["agent_result", "flash", "plain"]);
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

describe("partitionShapes (ownership, not visibility)", () => {
  it("mine = created_by me (even when PUBLIC); everything else visible = platform", () => {
    const entries = buildShapeStudioList(
      [
        // My own PUBLIC kind is still MINE.
        row({ id: "1", kind: "my_public", label: "My Public", created_by: ME, visibility: "public" }),
        row({ id: "2", kind: "my_internal", label: "My Internal", created_by: ME, visibility: "internal" }),
        // A teammate's granted non-public kind is NOT mine.
        row({ id: "3", kind: "granted_internal", label: "Granted", created_by: TEAMMATE, visibility: "internal" }),
        // Platform/system kind (creator null).
        row({ id: "4", kind: "system_public", label: "System", created_by: null, visibility: "public" }),
      ],
      new Set(),
    );
    const { mine, platform } = partitionShapes(entries, ME);
    expect(mine.map((e) => e.kind).sort()).toEqual(["my_internal", "my_public"]);
    expect(platform.map((e) => e.kind).sort()).toEqual([
      "granted_internal",
      "system_public",
    ]);
  });

  it("mine is empty only when the user created nothing (or no user id)", () => {
    const entries = buildShapeStudioList(
      [
        row({ id: "1", kind: "sys", label: "Sys", created_by: null }),
        row({ id: "2", kind: "granted", label: "Granted", created_by: TEAMMATE, visibility: "internal" }),
      ],
      new Set(),
    );
    expect(partitionShapes(entries, ME).mine).toEqual([]);
    // Null user id (session not hydrated) never claims ownership of null creators.
    const anon = partitionShapes(entries, null);
    expect(anon.mine).toEqual([]);
    expect(anon.platform).toHaveLength(2);
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
