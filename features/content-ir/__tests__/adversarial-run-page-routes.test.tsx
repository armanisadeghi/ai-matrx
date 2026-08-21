/**
 * ADVERSARIAL — the run page's kind routing, attacked at its seams.
 *
 * Written by an adversarial review of the 2026-08-21 workflow-run-page wave
 * (readout-parts / KindInstanceRender / applyIrKindRoute). Every test here
 * pins CURRENT behavior with the LIVE registry as the source of truth
 * (project brsgrqvjdzwihsvnfqkf, read 2026-08-21, per the plan's standing
 * rule: examples follow the REGISTRY, never a sketch).
 *
 * Two lanes:
 *
 *  1. GREEN tests that PROVE holes exist today, so the day someone closes
 *     them the assertion flips and forces an honest update — the hole is
 *     documented as executable truth, not a doc that can rot.
 *  2. `test.todo` markers for work that cannot be pinned yet (modules still
 *     uncommitted by an in-flight agent, or routes that do not exist).
 *
 * THE HOLES, named:
 *
 *  A. `hash_result` / `record_result` — the wire contract's own poster
 *     children (RUNTIME_WRAPPER_WIRE.md §3 stamps `output_kind:
 *     "hash_result"` on its proven live run) — have NO `(kind,'web','output')`
 *     `kind_component` row and an INACTIVE `kind_definition` (verified live
 *     2026-08-21). On the run page they reach the reader only through the
 *     unregistered floor: `applyIrKindRoute` answers generic-with-`unverified`
 *     at best, and the readout suppresses even that note
 *     (`showRoutingNote={false}`). The FE-route-army "45 done / 0 todo"
 *     completion record does not cover them: 231 of 456 live kinds carry no
 *     active web/output route.
 *
 *  B. Engine events still DECLARE evicted fingerprint slugs
 *     (`workflow_io_data_transform_2aa7e01c_output`: 607 node_completed
 *     events in the last 14 days). Those slugs were soft-deleted out of
 *     `kind_definition` by the contract-artifact eviction, so the FE registry
 *     can never know them — the strangler seam must hold (pass through, no
 *     crash, no false "known shape" claim).
 */

import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";

function kindBlock(kind: string, value: Record<string, unknown>) {
  const complete = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) },
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

/**
 * The LIVE canonical examples, verbatim (`content_ir.kind_example`,
 * `is_canonical`, `validation_status='passed'`, read 2026-08-21). Both carry
 * `__kind` in-band — wire IS block for new-world kinds.
 */
const HASH_RESULT_EXAMPLE = {
  digest: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  algorithm: "sha256",
};
const RECORD_RESULT_EXAMPLE = {
  result: { name: "example", score: 0.9 },
};

describe("HOLE A — the wire contract's workflow kinds reach the reader only by fallback", () => {
  // The wire contract's proven run stamped output_kind: "hash_result"
  // (RUNTIME_WRAPPER_WIRE.md §3, run ef50f30e). If either assertion below
  // starts FAILING, the route was registered — delete this block and move the
  // kind into kind-explicit-basic-routes.test.tsx with its canonical example.
  it.each([
    ["hash_result", HASH_RESULT_EXAMPLE],
    ["record_result", RECORD_RESULT_EXAMPLE],
  ] as const)(
    "%s: warm definition, NO component row → generic fallback flagged unverified",
    (kind, example) => {
      // What the warm catalog would deliver if the kind were activated. Today
      // the definition is INACTIVE and there is no kind_component row at all,
      // so even this seeding is generous.
      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });

      const routed = applyIrKindRoute(kindBlock(kind, example));

      // A known shape nobody render-trusts: the R6 generic fallback, with the
      // honest unverified flag. This is a SILENT fallback on the run page,
      // because the readout renders with showRoutingNote={false}.
      expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      expect(markerOf(routed)).toEqual({
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason: "no-component",
      });
    },
  );

  test.todo(
    "register (hash_result|record_result,'web','output') kind_component rows " +
      "(the registered-floor pattern of content_ir_workflow_result_output_routes.sql) " +
      "and activate the definitions — then these route by:'db' with no unverified flag",
  );
});

describe("HOLE B — evicted fingerprint slugs still arrive on the wire as output_kind", () => {
  it("an evicted contract slug is unknown to the registry and passes through untouched", () => {
    // 607 node_completed events declared this exact slug in the 14 days
    // before 2026-08-21; the eviction removed it from kind_definition, so no
    // FE registry tier can ever deliver it. The strangler seam must hold.
    const evictedSlug = "workflow_io_data_transform_2aa7e01c_output";
    expect(kindRegistry.getDefinition(evictedSlug)).toBeUndefined();

    const block = kindBlock(evictedSlug, { anything: true });
    const routed = applyIrKindRoute(block);

    // Unknown kind: untouched, by reference — never a false "known shape".
    expect(routed).toBe(block);
    expect(markerOf(routed)).toBeUndefined();
  });

  test.todo(
    "the engine should stop DECLARING evicted fingerprint slugs on node_completed " +
      "(aidream contract_kinds seam) — until it does, the run page shows readers a " +
      "machine slug as the step's declared shape",
  );
});

test.todo(
  "runtime wrapper elision (output_ref) — rehydrateNodeOutcome/rehydrateRunResult " +
    "(features/content-ir/core/runtime-wrapper.ts) have ZERO callers: the ingest gate " +
    "(workflow-runs.slice node_completed) never reads event.wrapper, despite the module " +
    "doc claiming rehydration happens there. Pin the reducer's wrapper ingestion the " +
    "moment the in-flight wrapper render half lands (module is untracked as of 2026-08-21).",
);

afterAll(() => {
  // Module-singleton registries: leave nothing behind for sibling suites.
  componentRegistry.ingestDbRows([]);
});
