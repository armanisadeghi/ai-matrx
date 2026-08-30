/**
 * THE 2026-08-28 OUTAGE, PROVEN CLOSED IN THIS APP.
 *
 * The package carries its own end-to-end pin. This one runs the FRONTEND's
 * real pipeline — `StreamBlockAccumulator` (the class every chat surface
 * runs) ingesting the payload in wire-sized chunks, then this app's real
 * `applyIrKindRoute` against this app's real `componentRegistry`.
 *
 * The payload is the actual assistant message from conversation
 * 20fd67fb-1899-46b2-81b1-95da308c0ad2 (agent 6c4480e9), trimmed only of
 * prose that never affected routing. Its kind, `electronics_intake_analysis`,
 * has NO reconstructable schema — `kind_definition.data` is NULL because the
 * authoring flattener declines nested shapes — so the parser can never verify
 * it. Before the fix that made the render route treat "unverified" as
 * "broken", which sent this straight to the generic key/value dump while
 * `electronics_intake_analysis_board` sat unrendered.
 */

import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { applyIrKindRoute, readIrRouteMarker } from "@/features/content-ir/react/kind-route";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

/** The real message, as the model emitted it: bare pretty-printed JSON. */
const INTAKE_PAYLOAD = JSON.stringify(
  {
    __kind: "electronics_intake_analysis",
    status: "complete",
    products: [
      {
        __kind: "product_entry",
        quantity: {
          __kind: "quantity_assessment",
          unit_type: "single",
          quantity_notes: "Single peripheral unit.",
          estimated_count: 1,
        },
        condition: {
          __kind: "condition_assessment",
          damage_flags: [],
          overall_grade: "excellent",
          positive_flags: ["No structural cracks or casing damage"],
          condition_notes: "Minor cosmetic scuffs on the underside glide feet.",
        },
        analyst_notes: "No USB receiver or charging cable shown.",
        image_indices: [1, 2, 3, 4, 5],
        product_index: 1,
        identification: {
          __kind: "product_identification",
          brand: { value: "Logitech", confidence: "certain" },
          summary: "Logitech MX Master 4 wireless ergonomic mouse.",
          category: "Peripheral",
          model_name: { value: "MX Master 4", confidence: "certain" },
          serial_number: { value: "2538AP9S8U88", confidence: "certain" },
          other_identifiers: [
            { __kind: "identifier_entry", label: "FCC ID", value: "JNZMR0118", confidence: "certain" },
          ],
        },
        accessories_and_components: [],
      },
    ],
    status_notes: "",
    image_count_received: 5,
  },
  null,
  2,
);

/** The kind's real resolver row, as it exists in content_ir.kind_component. */
function seedTheAuthorsComponent() {
  componentRegistry.ingestDbRows([
    {
      kind: "electronics_intake_analysis",
      platform: "web",
      role: "output",
      componentKey: "electronics_intake_analysis_board",
      source: "db",
      config: {},
      isActive: true,
      componentSource: "export default function Board() { return null; }",
      propsTransform: null,
      pinnedKindVersion: null,
      updatedAt: "2026-08-28T20:33:35.927Z",
      createdBy: null,
    },
  ]);
}

/** Stream it the way the wire does and return the settled block. */
function streamIt(source: string): RenderBlockPayload {
  const blocks = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("intake-e2e", ((payload: {
    requestId: string;
    block: RenderBlockPayload;
  }) => ({ type: "test/upsert", payload })) as never);
  const dispatch = (action: unknown) => {
    const block = (action as { payload?: { block?: RenderBlockPayload } }).payload?.block;
    if (block) blocks.set(block.blockId, block);
    return action;
  };
  for (let i = 0; i < source.length; i += 23) {
    accumulator.ingest(source.slice(i, i + 23), dispatch);
  }
  accumulator.finalize(dispatch);

  const settled = [...blocks.values()].filter(
    (b) => b.status === "complete" && typeof b.content === "string" && b.content.trim().length > 0,
  );
  expect(settled).toHaveLength(1);
  return settled[0]!;
}

describe("a schema-less kind still reaches its author's component", () => {
  it("the accumulator identifies the kind and marks it unverified, losing nothing", () => {
    const block = streamIt(INTAKE_PAYLOAD);

    expect(block.metadata?.__ir).toMatchObject({
      root: {
        kind: "electronics_intake_analysis",
        kindState: "unverified",
        status: "complete",
      },
    });
    // Zero loss: the component gets the whole payload.
    expect(JSON.parse(block.content as string)).toEqual(JSON.parse(INTAKE_PAYLOAD));
  });

  it("the route hands it to electronics_intake_analysis_board, NOT the generic dump", () => {
    seedTheAuthorsComponent();
    const routed = applyIrKindRoute(streamIt(INTAKE_PAYLOAD) as never) as RenderBlockPayload;

    // THE ASSERTION THIS FILE EXISTS FOR.
    expect(routed.type).toBe("db_kind_component");
    expect(routed.type).not.toBe("generic_structured");
    expect(readIrRouteMarker(routed.metadata as Record<string, unknown>)).toMatchObject({
      by: "db",
      key: "electronics_intake_analysis_board",
    });
  });
});
