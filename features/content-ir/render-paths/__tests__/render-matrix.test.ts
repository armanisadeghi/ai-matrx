/**
 * THE RENDER MATRIX — every recognition path × every shape archetype.
 *
 * 🚨 WHY THIS FILE EXISTS. On 2026-08-28 one gate in one package changed, and
 * ~221 live kinds lost their component. Nothing failed. Every unit test passed,
 * every readiness check stayed green, and the only surface that could have
 * shown it was on a tab nobody opens. The defect was not subtle — it was
 * unwitnessed.
 *
 * This is the witness. It asserts the single invariant the whole system exists
 * to provide:
 *
 *   A VALID PAYLOAD OF A REGISTERED KIND THAT HAS A COMPONENT REACHES THAT
 *   COMPONENT — on every path, for every shape of data.
 *
 * The archetypes are drawn from what actually broke, not from what is easy to
 * test: nesting, arrays of child kinds, the pydantic-`Any` field that used to
 * narrow to `string` and then reject its own value, and the untyped list that
 * used to be dropped from the schema entirely.
 *
 * If a future change makes any cell fail, it fails HERE, in seconds, instead of
 * in front of a user a day later.
 */

import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { kindSchemaFromJsonSchema } from "@ai-matrx/content-ir";
import { RENDER_PATHS, type RenderPathId } from "../paths";
import { runRenderPath } from "../run-path";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: jest.fn(),
}));

/**
 * Paths whose success means "the kind's component rendered".
 *
 * `chat_artifact` is deliberately NOT one of them: an artifact block has an
 * identity, a version and a Canvas to open in, so the route refuses to re-type
 * it and the artifact renderer keeps the block BY DESIGN. Its invariant is
 * different and asserted separately — the envelope must still attach, because
 * every selector downstream reads it.
 */
const COMPONENT_PATHS: RenderPathId[] = RENDER_PATHS.filter(
  (p) =>
    (p.streams || p.id === "reload" || p.id === "server_partial") &&
    p.id !== "chat_artifact",
).map((p) => p.id);

interface Archetype {
  name: string;
  /** What broke, historically — so a failure here names its own history. */
  why: string;
  schema: Record<string, unknown> | null;
  childSchemas?: Array<{
    kind: string;
    schema: Record<string, unknown>;
  }>;
  value: Record<string, unknown>;
}

const ARCHETYPES: Archetype[] = [
  {
    name: "flat scalars",
    why: "The only shape the old all-or-nothing flattener could express.",
    schema: {
      type: "object",
      required: ["__kind", "label"],
      properties: {
        __kind: { const: "mx_flat" },
        label: { type: "string" },
        count: { type: "integer" },
      },
      additionalProperties: false,
    },
    value: { label: "hello", count: 3 },
  },
  {
    name: "nested child kind",
    why: "An object-valued field. The stored field list never held these.",
    schema: {
      type: "object",
      required: ["__kind"],
      properties: {
        __kind: { const: "mx_nested" },
        child: {
          type: "object",
          required: ["__kind"],
          properties: {
            __kind: { const: "mx_child" },
            note: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    childSchemas: [
      {
        kind: "mx_child",
        schema: {
          type: "object",
          required: ["__kind"],
          properties: {
            __kind: { const: "mx_child" },
            note: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    ],
    value: { child: { __kind: "mx_child", note: "inner" } },
  },
  {
    name: "array of child kinds",
    why: "36 of 62 kinds lost exactly this field before $ref resolution landed.",
    schema: {
      type: "object",
      required: ["__kind", "items"],
      properties: {
        __kind: { const: "mx_list" },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["__kind"],
            properties: {
              __kind: { const: "mx_item" },
              n: { type: "integer" },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    childSchemas: [
      {
        kind: "mx_item",
        schema: {
          type: "object",
          required: ["__kind"],
          properties: {
            __kind: { const: "mx_item" },
            n: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
    ],
    value: {
      items: [
        { __kind: "mx_item", n: 1 },
        { __kind: "mx_item", n: 2 },
      ],
    },
  },
  {
    name: "pydantic-Any field holding a number",
    why: "This union narrowed to `string`, so the value below FAILED validation and the kind lost its component.",
    schema: {
      type: "object",
      required: ["__kind"],
      properties: {
        __kind: { const: "mx_any" },
        estimated_count: {
          type: ["string", "number", "boolean", "object", "array", "null"],
        },
      },
      additionalProperties: false,
    },
    value: { estimated_count: 1 },
  },
  {
    name: "untyped list",
    why: "`items: {}` was dropped from the field map entirely, sending the payload to residue.",
    schema: {
      type: "object",
      required: ["__kind"],
      properties: {
        __kind: { const: "mx_untyped" },
        flags: { type: "array", items: {} },
      },
      additionalProperties: false,
    },
    value: { flags: ["a", 2, { c: true }] },
  },
  {
    name: "NO schema at all",
    why: "The state 440 of 502 live kinds were in. Unverified is not invalid — the component still renders.",
    schema: null,
    value: { anything: "goes", nested: { deep: [1, 2, 3] } },
  },
];

function slugFor(a: Archetype): string {
  return `mx_${a.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
}

function register(a: Archetype): string {
  const kind = slugFor(a);
  if (a.schema) {
    const { schema, children } = kindSchemaFromJsonSchema(kind, a.schema);
    if (schema) {
      kindRegistry.upsertDefinition({
        kind,
        schema,
        schemaSource: "content_ir",
        tier: "cold",
      });
    }
    for (const [childKind, childSchema] of Object.entries(children)) {
      kindRegistry.upsertDefinition({
        kind: childKind,
        schema: childSchema,
        schemaSource: "content_ir",
        tier: "cold",
      });
    }
    for (const child of a.childSchemas ?? []) {
      const converted = kindSchemaFromJsonSchema(child.kind, child.schema);
      if (!converted.schema) {
        throw new Error(`Could not register child schema ${child.kind}`);
      }
      kindRegistry.upsertDefinition({
        kind: child.kind,
        schema: converted.schema,
        schemaSource: "content_ir",
        tier: "cold",
      });
    }
  }
  componentRegistry.ingestDbRows([
    {
      kind,
      platform: "web",
      role: "output",
      componentKey: `${kind}_view`,
      source: "db",
      config: {},
      isActive: true,
      componentSource: "export default function V() { return null; }",
      propsTransform: null,
      pinnedKindVersion: null,
      updatedAt: "2026-08-29T00:00:00.000Z",
      createdBy: null,
    },
  ]);
  return kind;
}

describe("THE RENDER MATRIX — a valid payload always reaches its component", () => {
  for (const archetype of ARCHETYPES) {
    describe(archetype.name, () => {
      for (const pathId of COMPONENT_PATHS) {
        it(`reaches the component on "${pathId}"`, () => {
          const kind = register(archetype);
          const run = runRenderPath(pathId, kind, archetype.value);
          if (!run) throw new Error(`${pathId} produced no run`);

          if (!run.verdict.reachedRealComponent) {
            throw new Error(
              [
                `"${kind}" did NOT reach its component on path "${pathId}".`,
                `  archetype: ${archetype.name}`,
                `  history:   ${archetype.why}`,
                `  resolvedAs: ${run.verdict.resolvedAs}`,
                `  kindState:  ${run.verdict.kindState ?? "(none)"}`,
                `  reason:     ${run.verdict.fallbackReason ?? "(none)"}`,
                "",
                "This is the invariant the kind system exists to provide. A cell",
                "failing here is the 2026-08-28 outage happening again.",
              ].join("\n"),
            );
          }
          expect(run.verdict.reachedRealComponent).toBe(true);
        });
      }

      it("keeps the payload intact end to end (zero loss)", () => {
        const kind = register(archetype);
        const run = runRenderPath("chat_bare", kind, archetype.value)!;
        const block = run.blocks.find((b) =>
          (b.content ?? "").includes("__kind"),
        );
        if (!block) throw new Error("no block carried the payload");
        const parsed = JSON.parse(block.content as string);
        for (const [key, value] of Object.entries(archetype.value)) {
          expect(parsed[key]).toEqual(value);
        }
      });

      it("attaches the envelope on the artifact path (its own invariant)", () => {
        // The artifact keeps its own renderer — the Canvas door must survive.
        // What must NOT be lost is the envelope, which is what the live
        // preview, the run page and every other selector read. It went missing
        // once (the wrapped-payload class) and every one of them spun.
        const kind = register(archetype);
        const run = runRenderPath("chat_artifact", kind, archetype.value)!;
        expect(run.verdict.resolvedAs).toBe("artifact");
        expect(run.verdict.kindState).not.toBeNull();
        expect(run.records.some((r) => r.envelope?.kind === kind)).toBe(true);
      });
    });
  }

  it("a payload that genuinely FAILS its schema is still refused the component", () => {
    // The protection the 2026-08-28 change was written to add. If this ever
    // goes green-by-accident, the split has collapsed in the other direction.
    const kind = "mx_strict";
    const { schema } = kindSchemaFromJsonSchema(kind, {
      type: "object",
      required: ["__kind", "count"],
      properties: { __kind: { const: kind }, count: { type: "integer" } },
      additionalProperties: false,
    });
    kindRegistry.upsertDefinition({
      kind,
      schema: schema!,
      schemaSource: "content_ir",
      tier: "cold",
    });
    componentRegistry.ingestDbRows([
      {
        kind,
        platform: "web",
        role: "output",
        componentKey: `${kind}_view`,
        source: "db",
        config: {},
        isActive: true,
        componentSource: "export default function V() { return null; }",
        propsTransform: null,
        pinnedKindVersion: null,
        updatedAt: "2026-08-29T00:00:00.000Z",
        createdBy: null,
      },
    ]);

    const run = runRenderPath("chat_bare", kind, { count: "not a number" })!;
    expect(run.verdict.reachedRealComponent).toBe(false);
    expect(run.verdict.fallbackReason).toBe("broken-instance");
  });
});
