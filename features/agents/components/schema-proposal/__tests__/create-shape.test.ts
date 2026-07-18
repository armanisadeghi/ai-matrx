/**
 * create-shape tests — slug derivation, the availability gate, ajv
 * pre-validation via the production structural leg, the definition → edge →
 * example write sequence (mock supabase), and failed-verdict surfacing.
 */

import {
  MAX_PLANNED_KINDS_PER_PROPOSAL,
  buildShapePlan,
  createShapeButtonLabel,
  createShapeFromPlan,
  deriveKindSlug,
  discardShape,
  draftSampleFromJsonSchema,
  findTakenSlugs,
  isShapePlanFailure,
  isValidKindSlug,
  updateShapeExampleSample,
  validateSampleAgainstPlan,
  type ShapePlan,
  type ShapeWriteClient,
} from "../create-shape";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const PROPOSAL = {
  name: "Customer Report",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      score: { type: "number" },
      status: { type: "string", enum: ["open", "closed"] },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            summary: { type: "string" },
            severity: { type: "number" },
          },
          required: ["summary"],
        },
      },
    },
    required: ["title", "findings"],
  } as Record<string, unknown>,
  strict: true,
};

function planOrThrow(slug = "customer_report"): ShapePlan {
  const plan = buildShapePlan(PROPOSAL, slug);
  if (isShapePlanFailure(plan)) {
    throw new Error(`plan failed: ${plan.errors.join("; ")}`);
  }
  return plan;
}

const VALID_SAMPLE = {
  title: "Q3 report",
  score: 4,
  status: "open",
  findings: [{ summary: "Slow onboarding", severity: 2 }],
};

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

describe("deriveKindSlug", () => {
  it("kebabs/space/camel names into snake_case kind slugs", () => {
    expect(deriveKindSlug("Customer Report")).toBe("customer_report");
    expect(deriveKindSlug("customer-report")).toBe("customer_report");
    expect(deriveKindSlug("customerReport")).toBe("customer_report");
    expect(deriveKindSlug("  Weird  ***  Name!! ")).toBe("weird_name");
  });

  it("never yields a digit-leading or invalid slug", () => {
    expect(deriveKindSlug("2024 Plan")).toBe("k2024_plan");
    expect(isValidKindSlug(deriveKindSlug("2024 Plan"))).toBe(true);
    expect(isValidKindSlug("Bad-Slug")).toBe(false);
    expect(isValidKindSlug("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

describe("buildShapePlan", () => {
  it("plans root + nested child kinds with emitted schemas, root first", () => {
    const plan = planOrThrow();
    expect(plan.rootSlug).toBe("customer_report");
    expect(plan.planned[0]).toBe(plan.rootPlan);
    expect(plan.planned.length).toBeGreaterThan(1); // findings item child kind
    expect(plan.rootPlan.emittedJsonSchema).toBeTruthy();
    expect(plan.rootPlan.emittedBlockSchema).toBeTruthy();
    expect(plan.rootPlan.emittedFingerprint).toMatch(/./);
    // The nested array of objects becomes a kind_edge on the root plan.
    const edgeChildren = plan.rootPlan.edges.map((e) => e.childKind);
    expect(edgeChildren.length).toBeGreaterThan(0);
    for (const child of edgeChildren) {
      expect(plan.planned.some((k) => k.kind === child)).toBe(true);
    }
  });

  it("rejects an invalid slug loudly", () => {
    const plan = buildShapePlan(PROPOSAL, "Not A Slug");
    expect(isShapePlanFailure(plan)).toBe(true);
    if (isShapePlanFailure(plan)) {
      expect(plan.errors[0]).toContain("not a valid Shape slug");
    }
  });

  it("surfaces dropped CONSTRAINT keywords as lossy-conversion warnings", () => {
    const plan = buildShapePlan(
      {
        name: "Constrained",
        schema: {
          type: "object",
          properties: {
            code: { type: "string", pattern: "^[A-Z]{3}$", minLength: 3 },
            note: { type: "string", description: "kept annotation" },
          },
          required: ["code"],
        },
      },
      "constrained_thing",
    );
    expect(isShapePlanFailure(plan)).toBe(false);
    if (!isShapePlanFailure(plan)) {
      const joined = plan.warnings.join(" | ");
      expect(joined).toContain("pattern");
      expect(joined).toContain("DROPPED");
      // Pure annotations never cry wolf.
      expect(joined).not.toContain("description");
    }
  });

  it("a clean schema produces zero warnings (no crying wolf)", () => {
    const plan = planOrThrow();
    expect(plan.warnings).toEqual([]);
  });

  it("refuses plans above the nested-kind cap with a simplify message", () => {
    const properties: Record<string, unknown> = {};
    for (let i = 0; i < MAX_PLANNED_KINDS_PER_PROPOSAL + 2; i++) {
      properties[`section_${i}`] = {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" } },
        },
      };
    }
    const plan = buildShapePlan(
      { name: "Huge", schema: { type: "object", properties } },
      "huge_schema",
    );
    expect(isShapePlanFailure(plan)).toBe(true);
    if (isShapePlanFailure(plan)) {
      expect(plan.errors[0]).toContain("Simplify the schema");
      expect(plan.errors[0]).toContain(String(MAX_PLANNED_KINDS_PER_PROPOSAL));
    }
  });
});

describe("createShapeButtonLabel (lossy acknowledgment)", () => {
  it("is a plain create with no warnings and an explicit acknowledgment with them", () => {
    expect(createShapeButtonLabel(0)).toBe("Create Shape");
    expect(createShapeButtonLabel(1)).toBe("Create anyway (1 warning)");
    expect(createShapeButtonLabel(3)).toBe("Create anyway (3 warnings)");
  });
});

// ---------------------------------------------------------------------------
// ajv pre-validation (the production structural leg)
// ---------------------------------------------------------------------------

describe("validateSampleAgainstPlan", () => {
  it("passes a conforming sample", () => {
    const result = validateSampleAgainstPlan(planOrThrow(), VALID_SAMPLE);
    expect(result.ok).toBe(true);
  });

  it("fails a broken sample with attributed errors", () => {
    const result = validateSampleAgainstPlan(planOrThrow(), {
      score: "not-a-number",
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toBeTruthy();
  });

  it("pre-drafted samples come from the schema (draft generator)", () => {
    const draft = draftSampleFromJsonSchema(PROPOSAL.schema) as Record<
      string,
      unknown
    >;
    expect(typeof draft.title).toBe("string");
    expect(draft.status).toBe("open"); // first enum member
    expect(Array.isArray(draft.findings)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mock supabase client
// ---------------------------------------------------------------------------

interface TableCall {
  table: string;
  op: "insert" | "update";
  payload: unknown;
}

function makeMockClient(options?: {
  exampleStatus?: string;
  takenSlugs?: string[];
  failExampleInsert?: boolean;
  failEdgeInsert?: boolean;
}) {
  const calls: TableCall[] = [];
  let defCounter = 0;

  const client = {
    schema: (schemaName: string) => {
      expect(schemaName).toBe("content_ir");
      return {
        from: (table: string) => ({
          select: (_cols: string) => ({
            in: (_col: string, values: string[]) => ({
              is: () =>
                Promise.resolve({
                  data: (options?.takenSlugs ?? [])
                    .filter((s) => values.includes(s))
                    .map((kind) => ({ kind })),
                  error: null,
                }),
            }),
          }),
          insert: (payload: unknown) => {
            calls.push({ table, op: "insert", payload });
            if (table === "kind_definition") {
              const rows = payload as Array<{ kind: string }>;
              return {
                select: () =>
                  Promise.resolve({
                    data: rows.map((r) => ({
                      id: `def-${defCounter++}-${r.kind}`,
                      kind: r.kind,
                      version: 1,
                    })),
                    error: null,
                  }),
              };
            }
            if (table === "kind_example") {
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve(
                      options?.failExampleInsert
                        ? { data: null, error: { message: "boom" } }
                        : {
                            data: {
                              id: "example-1",
                              validation_status:
                                options?.exampleStatus ?? "passed",
                            },
                            error: null,
                          },
                    ),
                }),
              };
            }
            // kind_edge
            return Promise.resolve(
              options?.failEdgeInsert
                ? { data: null, error: { message: "edge boom" } }
                : { data: null, error: null },
            );
          },
          update: (payload: unknown) => {
            calls.push({ table, op: "update", payload });
            return {
              // soft-delete compensation path (discardShape)
              in: () => Promise.resolve({ data: null, error: null }),
              // kind_example fix-and-retry path
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        validation_status: options?.exampleStatus ?? "passed",
                      },
                      error: null,
                    }),
                }),
              }),
            };
          },
        }),
      };
    },
  };
  return { client: client as unknown as ShapeWriteClient, calls };
}

// ---------------------------------------------------------------------------
// Availability gate
// ---------------------------------------------------------------------------

describe("findTakenSlugs", () => {
  it("reports registry-compiled AND visible-DB collisions", async () => {
    const { client } = makeMockClient({ takenSlugs: ["db_kind"] });
    const taken = await findTakenSlugs(
      client,
      ["compiled_kind", "db_kind", "free_kind"],
      (slug) => slug === "compiled_kind",
    );
    expect(taken.sort()).toEqual(["compiled_kind", "db_kind"]);
  });
});

// ---------------------------------------------------------------------------
// The write sequence
// ---------------------------------------------------------------------------

describe("createShapeFromPlan", () => {
  it("writes definitions, then edges, then the canonical example", async () => {
    const { client, calls } = makeMockClient();
    const plan = planOrThrow();

    const result = await createShapeFromPlan({
      client,
      organizationId: ORG_ID,
      plan,
      sample: VALID_SAMPLE,
    });

    expect(calls.map((c) => c.table)).toEqual([
      "kind_definition",
      "kind_edge",
      "kind_example",
    ]);

    const defRows = calls[0].payload as Array<Record<string, unknown>>;
    expect(defRows[0].kind).toBe("customer_report");
    for (const row of defRows) {
      expect(row.authoring_owner).toBe("ts");
      expect(row.is_active).toBe(false);
      expect(row.organization_id).toBe(ORG_ID);
      expect(row.metadata).toEqual({
        source: "schema_proposal",
        user_authored: true,
      });
      expect(row.emitted_json_schema).toBeTruthy();
    }

    const edgeRows = calls[1].payload as Array<Record<string, unknown>>;
    expect(edgeRows.length).toBeGreaterThan(0);
    for (const edge of edgeRows) {
      expect(String(edge.parent_definition_id)).toMatch(/^def-/);
      expect(String(edge.child_definition_id)).toMatch(/^def-/);
      expect(edge.organization_id).toBe(ORG_ID);
    }

    const example = calls[2].payload as Record<string, unknown>;
    expect(String(example.kind_definition_id)).toContain("customer_report");
    expect(example.is_canonical).toBe(true);
    expect(example.source).toBe("authored");
    expect(example.kind_version).toBe(1);
    expect(example.data).toEqual(VALID_SAMPLE);

    expect(result.validationStatus).toBe("passed");
    expect(result.exampleId).toBe("example-1");
    expect(result.createdKinds).toContain("customer_report");
  });

  it("returns the trigger's verdict verbatim so callers can surface a failure", async () => {
    const { client } = makeMockClient({ exampleStatus: "failed" });
    const result = await createShapeFromPlan({
      client,
      organizationId: ORG_ID,
      plan: planOrThrow(),
      sample: VALID_SAMPLE,
    });
    expect(result.validationStatus).toBe("failed");
  });

  it("throws loudly AND compensates (soft-deletes the defs) when the example write fails", async () => {
    const { client, calls } = makeMockClient({ failExampleInsert: true });
    await expect(
      createShapeFromPlan({
        client,
        organizationId: ORG_ID,
        plan: planOrThrow(),
        sample: VALID_SAMPLE,
      }),
    ).rejects.toThrow(/canonical example failed to write.*rolled back/s);
    // Compensation: soft-delete updates on kind_edge + kind_definition.
    const updates = calls.filter((c) => c.op === "update");
    expect(updates.map((c) => c.table).sort()).toEqual([
      "kind_definition",
      "kind_edge",
    ]);
    for (const u of updates) {
      expect(
        (u.payload as Record<string, unknown>).deleted_at,
      ).toBeTruthy();
    }
  });

  it("compensates when the edge insert fails — no orphaned definitions", async () => {
    const { client, calls } = makeMockClient({ failEdgeInsert: true });
    await expect(
      createShapeFromPlan({
        client,
        organizationId: ORG_ID,
        plan: planOrThrow(),
        sample: VALID_SAMPLE,
      }),
    ).rejects.toThrow(/Failed to link nested Shape kinds.*rolled back/s);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates.map((c) => c.table)).toContain("kind_definition");
    // The example insert never ran.
    expect(
      calls.some((c) => c.table === "kind_example" && c.op === "insert"),
    ).toBe(false);
  });

  it("honors rootLabel for the root row only", async () => {
    const { client, calls } = makeMockClient();
    await createShapeFromPlan({
      client,
      organizationId: ORG_ID,
      plan: planOrThrow(),
      sample: VALID_SAMPLE,
      rootLabel: "My Custom Label",
    });
    const defRows = calls[0].payload as Array<Record<string, unknown>>;
    expect(defRows[0].label).toBe("My Custom Label");
    expect(defRows[1].label).not.toBe("My Custom Label");
  });
});

describe("discardShape", () => {
  it("soft-deletes edges and definitions and reports success", async () => {
    const { client, calls } = makeMockClient();
    const ok = await discardShape(client, ["def-1", "def-2"]);
    expect(ok).toBe(true);
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual([
      "kind_edge:update",
      "kind_definition:update",
    ]);
  });

  it("is a no-op success on an empty id list", async () => {
    const { client, calls } = makeMockClient();
    expect(await discardShape(client, [])).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("updateShapeExampleSample", () => {
  it("updates the example data and returns the recomputed verdict", async () => {
    const { client, calls } = makeMockClient({ exampleStatus: "passed" });
    const status = await updateShapeExampleSample(
      client,
      "example-1",
      VALID_SAMPLE,
    );
    expect(status).toBe("passed");
    expect(calls[0]).toMatchObject({ table: "kind_example", op: "update" });
  });
});
