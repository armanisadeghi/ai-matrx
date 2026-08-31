/**
 * THE FRESH-TAB REPORT (Arman, 2026-08-31).
 *
 * `/chat/869f8ae9-2f2b-4b5f-bb7b-5bdc427abc68` rendered
 * `agent_mandate_specification` as a key/value dump captioned "this shape
 * isn't registered on this platform" — while the SAME conversation, open in a
 * window panel a moment earlier, rendered its real
 * `agent_mandate_specification_workbench` component.
 *
 * The kind was registered, active, and had an active `source='db'` component
 * the entire time. The difference was the panel's registries were already
 * warm; the fresh tab routed on its first paint against a resolver that had
 * fetched nothing, and the route wrote that resolver's silence into the block
 * as a durable "unregistered" claim.
 *
 * This pins the host side of THE COLD-VERDICT RULE
 * (@ai-matrx/content-ir-react >= 0.9.0).
 */

import { componentRegistry } from "../registry/component-registry";
import { applyIrKindRoute, readIrRouteMarker } from "../react/kind-route";
import { normalizeJsonRegion } from "@ai-matrx/content-ir";
import { kindRegistry } from "../registry/kind-registry";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

const KIND = "agent_mandate_specification";

/** The live row, as it exists in content_ir.kind_component. */
const liveRow: KindComponentProjection = {
  kind: KIND,
  platform: "web",
  role: "output",
  componentKey: "agent_mandate_specification_workbench",
  source: "db",
  isActive: true,
  config: {},
  componentSource: "export default function C(){return null}",
  hasComponentSource: true,
  propsTransform: null,
  pinnedKindVersion: null,
  updatedAt: "2026-08-31T01:54:26.610Z",
  createdAt: "2026-08-31T01:54:26.610Z",
  createdBy: null,
  id: "c-2",
};

/** The real assistant payload's shape (bare JSON, no schema registered). */
const PAYLOAD = JSON.stringify({
  __kind: KIND,
  goal: { __kind: "agent_goal", role: "Mandate architect awaiting task definition." },
  charge: "OK",
});

function blockFromPayload() {
  const envelope = normalizeJsonRegion(PAYLOAD, { schemas: kindRegistry.resolver() });
  return { type: "code", content: PAYLOAD, metadata: { __ir: envelope } };
}

describe("a fresh tab never publishes a verdict from an unloaded registry", () => {
  it("the payload is identified and UNVERIFIED — no schema exists for this kind", () => {
    const block = blockFromPayload();
    const env = (block.metadata as { __ir: { root: { kind: string; kindState: string } } }).__ir;
    expect(env.root.kind).toBe(KIND);
    expect(env.root.kindState).toBe("unverified");
  });

  it("holds the block while the component list is still loading", () => {
    // A resolver mid-load has nothing to say. Before the rule, this produced
    // `reason: "unregistered"` — a durable claim, written into the block, that
    // the reader saw as "this shape isn't registered on this platform".
    const block = blockFromPayload();
    const routed = applyIrKindRoute(block);
    expect(routed).toBe(block);
    expect(readIrRouteMarker(routed.metadata)).toBeNull();
  });

  it("routes to the author's component once the list lands", () => {
    componentRegistry.replaceDbRows([liveRow]);
    const routed = applyIrKindRoute(blockFromPayload());

    expect(routed.type).toBe("db_kind_component");
    expect(readIrRouteMarker(routed.metadata)).toMatchObject({
      by: "db",
      key: "agent_mandate_specification_workbench",
    });
  });

  it("still tells the truth about a kind that genuinely has no component", () => {
    componentRegistry.replaceDbRows([]);
    const block = {
      type: "code",
      content: '{"__kind":"nothing_registered_here"}',
      metadata: {
        __ir: normalizeJsonRegion('{"__kind":"nothing_registered_here"}', {
          schemas: kindRegistry.resolver(),
        }),
      },
    };
    const routed = applyIrKindRoute(block);
    expect(routed.type).toBe("generic_structured");
    expect(readIrRouteMarker(routed.metadata)?.reason).toBe("unregistered");
  });
});
