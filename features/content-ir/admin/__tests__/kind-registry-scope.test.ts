import { describe, expect, it } from "vitest";
import {
  buildAdminKindCatalogScope,
  buildAdminKindDetailScope,
} from "@/features/content-ir/admin/kind-registry-scope";
import type {
  KindDetailData,
  KindStatusBoardModel,
} from "@/features/content-ir/admin/kind-detail-types";

const detail = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "research_board",
  label: "Research Board",
  isActive: true,
  version: 7,
  visibility: "public",
  updatedAt: "2026-08-23T12:00:00Z",
  fieldData: [{ name: "title", type: "string" }],
  emittedJsonSchema: {
    type: "object",
    properties: { title: { type: "string" } },
  },
  doctorRow: { kind: "research_board", assets: {} },
  skills: [{ skillId: "kind_research_board", syntax: "json" }],
  contentBlocks: [{ id: "block-1", label: "Research board" }],
  components: [
    {
      id: "component-1",
      platform: "web",
      role: "output",
      componentKey: "research_board",
      source: "db",
      isActive: true,
      isDefault: true,
    },
  ],
  surfaces: [],
  warnings: [],
} as unknown as KindDetailData;

describe("Kind Registry runtime scope", () => {
  it("publishes the existing kind, schema, example, and component source without discovery calls", () => {
    const scope = buildAdminKindDetailScope({
      detail,
      tab: "code",
      examples: [
        {
          id: "example-1",
          label: "Canonical",
          description: null,
          isCanonical: true,
          source: "manual",
          validationStatus: "passed",
          kindVersion: 7,
          data: { __kind: "research_board", title: "Market map" },
          updatedAt: "2026-08-23T12:00:00Z",
        },
      ],
      componentEditor: {
        rows: [],
        selected: {
          id: "component-1",
          kindDefinitionId: detail.id,
          platform: "web",
          role: "output",
          componentKey: "research_board",
          source: "db",
          componentSource:
            "export default function Board({ data }) { return <div>{data.title}</div>; }",
          config: { allowed_imports: [] },
          isActive: true,
          isDefault: true,
          semver: "1.0.0",
          version: 3,
          updatedAt: "2026-08-23T12:00:00Z",
        },
        draft:
          "export default function Board({ data }) { return <main>{data.title}</main>; }",
        saving: false,
      },
    });

    expect(scope.current_kind).toBe("research_board");
    expect(scope.kind_detail_tab).toBe("code");
    expect(scope.kind_creator_task_brief).toContain(
      "Create or improve the output component",
    );
    expect(scope.kind_creator_schema).toContain('"title"');
    expect(scope.kind_creator_data_sample).toContain("Market map");
    expect(scope.kind_creator_existing_context).toContain("component-1");
    expect(scope.kind_component_saved_source).toContain("<div>");
    expect(scope.kind_component_draft_source).toContain("<main>");
    expect(scope.kind_component_editor_state).toMatchObject({
      editable: true,
      dirty: true,
      saving: false,
    });
  });

  it("publishes the catalog data already loaded by the page", () => {
    const board = {
      rows: [{ kind: "research_board", isActive: true }],
      totals: { kinds: 1 },
      redFindings: [],
      yellowFindingCount: 2,
      driftedRowCount: 0,
    } as unknown as KindStatusBoardModel;

    expect(buildAdminKindCatalogScope({ board, tab: "board" })).toMatchObject({
      kind_registry_section: "catalog",
      catalog_tab: "board",
      kind_catalog_rows: board.rows,
      kind_catalog_totals: {
        kinds: 1,
        active: 1,
        red: 0,
        yellow: 2,
        drifted: 0,
      },
    });
  });
});
