import { normalizeJsonRegion } from "@ai-matrx/content-ir";
import { kindRegistry } from "../registry/kind-registry";

describe("plan_shape_recommendation compiled parser mirror", () => {
  it("resolves the production JSON shape when nested rows omit __kind", () => {
    const envelope = normalizeJsonRegion(
      JSON.stringify({
        __kind: "plan_shape_recommendation",
        archetype_key: "brochure-micro",
        family_counts: [
          {
            family_key: "core-pages",
            count: 7,
            reason: "The existing plan already covers the grounded scope.",
          },
        ],
        concept_names: [
          { concept_key: "primary-offer", name: "Factory Playground" },
        ],
        rationale: "Do not invent unsupported pages.",
      }),
      { schemas: kindRegistry.snapshotSchemas() },
    );

    expect(envelope.root.kind).toBe("plan_shape_recommendation");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.nodeIndex?.["family_counts.0"]?.kind).toBe(
      "plan_family_count",
    );
    expect(envelope.nodeIndex?.["concept_names.0"]?.kind).toBe(
      "plan_concept_name",
    );
    expect(
      envelope.root.residue?.notices?.some(
        (notice) => notice.code === "raw_fallback",
      ),
    ).not.toBe(true);
  });
});
