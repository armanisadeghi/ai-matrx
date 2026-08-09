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
  KIND_CREATOR_SLOT_KEY,
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
  it("names the kind-creator slot the studio resolves at trigger time", () => {
    // The creator agent is no longer a code constant — it's the
    // content_ir.kind_creator slot, resolved via features/agents/slots.
    expect(KIND_CREATOR_SLOT_KEY).toBe("content_ir.kind_creator");
  });

  it("builds encoded detail/test/schema hrefs from one base", () => {
    expect(shapeDetailHref("flashcard_set")).toBe("/shapes/flashcard_set");
    expect(shapeTestHref("flashcard_set")).toBe("/shapes/flashcard_set/test");
    expect(shapeSchemaHref("a b")).toBe("/shapes/a%20b/schema");
  });
});
