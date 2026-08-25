import {
  analyzeShapeSample,
  buildConvertToShapeSeed,
  buildShapeReadiness,
  type ShapeDefinitionSnapshot,
} from "@/features/content-ir/studio/convert-to-shape";
import type { KindComponentProjection } from "@/features/content-ir/registry/schema-source-kind-components";

const DEFINITION: ShapeDefinitionSnapshot = {
  id: "kind-definition-id",
  kind: "sales_summary",
  label: "Sales summary",
  isActive: true,
  version: 4,
  visibility: "public",
  emittedJsonSchema: {
    type: "object",
    properties: { total: { type: "number" } },
  },
  metadata: { loading_component: "card" },
  authoringOwner: "typescript",
  isContractArtifact: false,
};

function component(
  patch: Partial<KindComponentProjection> = {},
): KindComponentProjection {
  return {
    kind: "sales_summary",
    platform: "web",
    role: "output",
    componentKey: "db_kind_component",
    source: "db",
    isActive: true,
    config: {},
    componentSource: "export default function SalesSummary() { return null; }",
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-08-24T00:00:00Z",
    createdAt: "2026-08-24T00:00:00Z",
    id: "component-id",
    createdBy: "user-id",
    ...patch,
  };
}

describe("convert-to-shape preflight", () => {
  it("detects only a root __kind and suggests a readable name", () => {
    expect(analyzeShapeSample('{"__kind":"sales_summary","total":42}')).toEqual(
      {
        isValidJson: true,
        rootKind: "sales_summary",
        suggestedName: "Sales summary",
        errorMessage: null,
      },
    );

    expect(
      analyzeShapeSample('[{"__kind":"nested_item","value":1}]').rootKind,
    ).toBeNull();
  });

  it("surfaces invalid JSON instead of coercing it", () => {
    const result = analyzeShapeSample('{"broken":');
    expect(result.isValidJson).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });

  it("distinguishes an unregistered kind from a registered generic fallback", () => {
    const unregistered = buildShapeReadiness({ rootKind: "sales_summary" });
    expect(unregistered.definition).toBeNull();
    expect(unregistered.focus).toBe("register_shape");

    const generic = buildShapeReadiness({
      rootKind: "sales_summary",
      definition: { ...DEFINITION, metadata: {} },
      components: [
        component({
          componentKey: "generic_structured",
          source: "bundled",
          componentSource: null,
        }),
      ],
    });
    expect(generic.component.state).toBe("generic");
    expect(generic.schema.state).toBe("stored");
    expect(generic.loading.state).toBe("generic");
    expect(generic.focus).toBe("build_component");
  });

  it("does not mistake a registration without a schema for a complete Shape", () => {
    const readiness = buildShapeReadiness({
      rootKind: "sales_summary",
      definition: { ...DEFINITION, emittedJsonSchema: null },
      components: [component()],
    });

    expect(readiness.schema.state).toBe("missing");
    expect(readiness.focus).toBe("repair_schema");
  });

  it("recognizes complete custom output and loading assets", () => {
    const readiness = buildShapeReadiness({
      rootKind: "sales_summary",
      definition: DEFINITION,
      components: [component()],
    });

    expect(readiness.component.state).toBe("custom");
    expect(readiness.loading).toEqual({ state: "custom", slug: "card" });
    expect(readiness.focus).toBe("review_shape");
  });

  it("fills every declared creator variable when existing data is available", () => {
    const readiness = buildShapeReadiness({
      rootKind: "sales_summary",
      definition: DEFINITION,
      components: [component()],
    });
    const seed = buildConvertToShapeSeed({
      requestedName: "Sales Summary",
      sampleContent: '{"__kind":"sales_summary","total":42}',
      readiness,
    });

    expect(seed.draftText).toBe('I want to call this Shape "Sales Summary".');
    expect(Object.keys(seed.variables).sort()).toEqual(
      [
        "existing_component_context",
        "existing_component_source",
        "existing_kind_context",
        "kind_schema",
        "task_brief",
        "user_data_sample",
      ].sort(),
    );
    for (const value of Object.values(seed.variables)) {
      expect(value).not.toBe("");
    }
    expect(seed.variables.existing_kind_context).toContain(
      "kind-definition-id",
    );
    expect(seed.variables.existing_component_context).toContain(
      "db_kind_component",
    );
    expect(seed.variables.existing_component_source).toContain("SalesSummary");
  });
});
