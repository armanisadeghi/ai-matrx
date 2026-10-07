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

// G2: the DOM judge first — its mocks must register before BlockRenderer loads.
import { domFrameVerdict, everyKindFrame } from "./dom-frame-judge";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { kindSchemaFromJsonSchema } from "@ai-matrx/content-ir";
import { SYSTEM_KIND_DEFINITIONS } from "@/features/content-ir/registry/system-kinds";
import { REFUSAL_KIND } from "@/features/content-ir/kinds/refusal";
import { resolveBlockDispatch } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch";
import { RENDER_PATHS, type RenderPathId } from "../paths";
import { canvasTypeForKind, MATERIALIZED_PREVIEW_ID, routeBlock, runRenderPath } from "../run-path";

// 🚨 A PARTIAL MOCK OF A REAL MODULE IS A SUITE THAT DIES ON THE NEXT EXPORT
// (DD-239). This used to replace the whole capture store with `{ captureError }`.
// When the session barrier started calling `setSessionStateProbe` from the same
// module at client-construction time, the mock no longer satisfied it and THIS
// SUITE DIED AT IMPORT — no test ran, for days, while the file still looked
// green in a list. Spread the real module: only the export this suite needs to
// observe is replaced, and a new export can never silently take the suite down.
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

/**
 * K5 (round 7): the canvas row source the by-id artifact path reads
 * (`ArtifactRefBlock` → `useCanvasItem`), set per test: loading, loaded or
 * missing. Every other path never calls it.
 */
type MockCanvasItem = { row: Record<string, unknown> | null; loading: boolean; error: string | null };
let mockCanvasItem: MockCanvasItem = { row: null, loading: false, error: "not in this store" };
/** Ids the by-id renderer asked for — proof a cell went through ArtifactRefBlock. */
const mockCanvasReads: string[] = [];
jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: (id: string | null) => {
    if (!id) return { row: null, loading: false, error: null };
    mockCanvasReads.push(id);
    return mockCanvasItem;
  },
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
    p.id !== "chat_artifact" &&
    p.id !== "chat_artifact_materialized",
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
      // Draws something: the DOM judge fails an EMPTY frame (H3a), so the
      // stand-in component must put its kind on screen like a real one.
      componentSource: 'export default function V() { return <div data-matrix-kind="drawn">Drawn as its kind</div>; }',
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

      // THE NEVER-RAW LAW, per frame (2026-09-30). The cell above only judges
      // the SETTLED block; the one-line ```json defect settled perfectly and
      // was raw for the entire stream. Every streaming frame is judged here
      // by the renderer's own decision.
      for (const pathId of COMPONENT_PATHS.filter(
        (id) => RENDER_PATHS.find((p) => p.id === id)?.streams,
      )) {
        it(`never draws the kind as raw JSON mid-stream on "${pathId}"`, () => {
          const kind = register(archetype);
          const run = runRenderPath(pathId, kind, archetype.value);
          if (!run) throw new Error(`${pathId} produced no run`);
          const raw = run.records.filter((r) => r.drawsKindAsRawJson);
          expect(raw.map((r) => `chunk ${r.chunk} (${r.type})`)).toEqual([]);
        });

        // G2: the same frames DRAWN through the real BlockRenderer in jsdom —
        // a `__kind` key on screen outside a source container fails.
        it(`never puts a __kind key on screen mid-stream on "${pathId}" (DOM)`, async () => {
          const kind = register(archetype);
          const run = runRenderPath(pathId, kind, archetype.value);
          if (!run?.frames) throw new Error(`${pathId} produced no frames`);
          const leaks: string[] = [];
          // H3c: EVERY kind frame is drawn — a sampled stride could step over
          // a short mid-block raw state (the matrix's frames are few enough).
          for (const frame of everyKindFrame(run.frames)) {
            const verdict = await domFrameVerdict(frame.block, { isStreamActive: frame.isStreamActive });
            if (verdict.failed) leaks.push(`${frame.block.type}${verdict.empty ? ` (EMPTY ${verdict.html.slice(0, 120)})` : ""}: ${verdict.text.replace(/\s+/g, " ").slice(0, 100)}`);
          }
          expect(leaks).toEqual([]);
        }, 120_000);
      }

      // G2 on the artifact path: the artifact keeps its own renderer, but no
      // frame of it may put the kind on screen raw (2026-10-05 — the live
      // block handed ArtifactBlock its tag lines and the kind drew raw
      // mid-stream while a reload drew the component).
      it(`never puts a __kind key on screen mid-stream on "chat_artifact" (DOM)`, async () => {
        const kind = register(archetype);
        const run = runRenderPath("chat_artifact", kind, archetype.value);
        if (!run?.frames) throw new Error("chat_artifact produced no frames");
        const leaks: string[] = [];
        for (const frame of everyKindFrame(run.frames)) {
          const verdict = await domFrameVerdict(frame.block, { isStreamActive: frame.isStreamActive });
          if (verdict.failed) leaks.push(`${frame.block.type}${verdict.empty ? ` (EMPTY ${verdict.html.slice(0, 120)})` : ""}: ${verdict.text.replace(/\s+/g, " ").slice(0, 100)}`);
        }
        expect(leaks).toEqual([]);
      }, 120_000);

      // K5: the REAL materialized form — `<artifact type="<canvas type>"
      // id="<uuid>" version="1">` after prose — goes through the by-id
      // renderer (ArtifactRefBlock). Every frame is judged with the saved row
      // loading, loaded and missing.
      it.each([
        ["row loading", () => ({ row: null, loading: true, error: null })],
        [
          "row loaded",
          (kind: string, value: Record<string, unknown>) => ({
            row: {
              id: MATERIALIZED_PREVIEW_ID,
              type: canvasTypeForKind(kind),
              version: 1,
              title: kind,
              content: { data: { ...value, __kind: kind }, type: canvasTypeForKind(kind) },
            },
            loading: false,
            error: null,
          }),
        ],
        ["row missing", () => ({ row: null, loading: false, error: "not found" })],
      ] as Array<[string, (kind: string, value: Record<string, unknown>) => MockCanvasItem]>)(
        `never puts a __kind key on screen on "chat_artifact_materialized" (%s, DOM)`,
        async (_state, rowFor) => {
          const kind = register(archetype);
          mockCanvasItem = rowFor(kind, archetype.value);
          mockCanvasReads.length = 0;
          const run = runRenderPath("chat_artifact_materialized", kind, archetype.value);
          if (!run?.frames) throw new Error("chat_artifact_materialized produced no frames");
          expect(run.frames.some((f) => f.block.type === "artifact")).toBe(true);
          const leaks: string[] = [];
          for (const frame of everyKindFrame(run.frames)) {
            const verdict = await domFrameVerdict(frame.block, { isStreamActive: frame.isStreamActive });
            if (verdict.failed) leaks.push(`${frame.block.type}${verdict.empty ? ` (EMPTY ${verdict.html.slice(0, 120)})` : ""}: ${verdict.text.replace(/\s+/g, " ").slice(0, 100)}`);
          }
          // The prose before the tag stays prose — never a code card.
          for (const frame of run.frames) {
            if ((frame.block.content ?? "").startsWith("Here is what")) expect(frame.block.type).toBe("text");
          }
          expect(leaks).toEqual([]);
          // Drawn through the by-id path, for the made-up saved id.
          expect(mockCanvasReads).toContain(MATERIALIZED_PREVIEW_ID);
        },
        120_000,
      );

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

/**
 * THE SYSTEM-KIND CELL — a kind this repo REGISTERS must have a component.
 *
 * The matrix above proves the plumbing carries a payload to whatever component
 * a kind has. It cannot prove a kind HAS one: every archetype registers its own
 * component row before it runs. That gap is exactly where a system kind can be
 * shipped — schema, bridge, markdown, registry entry, all green — and reach a
 * reader as the generic floor, or as a `reportUnregisteredBlockType` nobody
 * reads. `refusal` was written that way on purpose (trial 12) and this block
 * was proven RED before its component existed.
 *
 * `legacyBlockType` is the contract: a definition that declares one is saying
 * "route me to this block type", and a block type with no dispatch entry is a
 * route to nothing.
 */
describe("SYSTEM KINDS — a registered kind with no component is the outage", () => {
  it("every registered system kind's block type has a component", () => {
    const missing = SYSTEM_KIND_DEFINITIONS.filter(
      (definition) =>
        definition.legacyBlockType &&
        resolveBlockDispatch(definition.legacyBlockType) === null,
    ).map((definition) => `${definition.kind} → ${definition.legacyBlockType}`);

    if (missing.length > 0) {
      throw new Error(
        [
          "These kinds are REGISTERED and route to a block type nobody renders:",
          ...missing.map((line) => `  - ${line}`),
          "",
          "A registered kind with no component reaches the reader as the generic",
          "floor at best and as an unregistered-block report at worst. Register",
          "the component in BlockComponentRegistry + block-dispatch, or do not",
          "register the kind.",
        ].join("\n"),
      );
    }
    expect(missing).toEqual([]);
  });

  /**
   * THE REFUSAL, end to end. Not an error, not a toast, not an empty screen —
   * an honest result that reaches its own component on every path a reader can
   * receive it on, carrying the facts that make it actionable.
   */
  describe("refusal", () => {
    const REFUSAL_VALUE: Record<string, unknown> = {
      headline:
        "I am not picking a keyword for this page yet — I do not know what the site already ranks for.",
      missing: [
        {
          fact: "The site's existing keyword plan",
          why_it_matters:
            "Picking a term the site already targets splits its own pages against each other.",
          how_to_get_it: "Export the current ranking terms.",
        },
      ],
      what_i_can_say_now:
        "Whatever the answer is, the term sits under the parent term the hub page holds.",
      protocol_frame: "site-wide keyword plan",
      provenance: ["entry-order-site-before-page"],
    };

    it("has a component registered for its block type", () => {
      expect(resolveBlockDispatch(REFUSAL_KIND)).not.toBeNull();
    });

    for (const pathId of COMPONENT_PATHS) {
      it(`reaches its component on "${pathId}"`, () => {
        const run = runRenderPath(pathId, REFUSAL_KIND, REFUSAL_VALUE);
        if (!run) throw new Error(`${pathId} produced no run`);
        expect(run.verdict.reachedRealComponent).toBe(true);
      });
    }

    it("carries the facts that make the refusal actionable", () => {
      // A refusal whose `how_to_get_it` is lost on the way is a wall, not a
      // refusal — the bridge is what a reader's component actually receives.
      const run = runRenderPath("reload", REFUSAL_KIND, REFUSAL_VALUE)!;
      const routed = routeBlock(run.blocks[0]!);
      const data = routed.serverData as
        | { missing?: Array<{ howToGetIt?: string | null }> }
        | undefined;
      expect(data?.missing?.[0]?.howToGetIt).toBe(
        "Export the current ranking terms.",
      );
    });
  });
});
