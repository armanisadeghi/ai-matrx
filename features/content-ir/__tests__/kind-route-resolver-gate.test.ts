/**
 * The resolver GATE at the render seam (ruling R6) + the runtime routing
 * marker — Stage 1 of the Shape System resolver.
 *
 * The exact production rules under test:
 * - kind in the COMPILED bootstrap → ALWAYS routes (trusted at bootstrap;
 *   a DB row — even an inactive one — can refine the marker but can never
 *   un-render a production kind);
 * - kind resolvable ONLY via a `content_ir.kind_component` row with
 *   `is_active === false` → does NOT route (today's un-routed rendering —
 *   never an error, never hidden content);
 * - DB-only row with `is_active === true` → routes to its componentKey
 *   (serverData CLEARED — no compiled bridge, the component parses content);
 * - unknown kind → untouched, by reference (the strangler seam);
 * - every resolver-decided route stamps `metadata.__ir_route =
 *   { by: "compiled" | "db", key: componentKey }` (the live verification
 *   hook: registry-resolution vs hard-coded fallback).
 *
 * Tests in this file are ORDER-SENSITIVE where noted: the module-singleton
 * registry is warmed by ingestDbRows and first-row-per-key wins, so the
 * pre-warm assertions run before any ingest for the same key.
 */

import {
  applyIrKindRoute,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import {
  envelopeFromCompleteValue,
  normalizeJsonRegion,
} from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";

const FLASHCARDS = JSON.stringify({
  __kind: "flashcard_set",
  title: "Gate",
  cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
});

function flashcardBlock() {
  const envelope = normalizeJsonRegion(FLASHCARDS, {
    schemas: kindRegistry.snapshotSchemas(),
  });
  return {
    type: "code",
    content: FLASHCARDS,
    serverData: { language: "json" } as Record<string, unknown>,
    metadata: { [IR_ENVELOPE_KEY]: envelope },
  };
}

/** A block whose kind exists ONLY in the resolver's DB tier (no schema, no bridge). */
function dbOnlyBlock(kind: string) {
  const value = { __kind: kind, title: "DB-only" };
  return {
    type: "code",
    content: JSON.stringify(value),
    serverData: { language: "json" } as Record<string, unknown>,
    metadata: {
      [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(value, kind),
    },
  };
}

function dbRow(
  overrides: Partial<KindComponentProjection> &
    Pick<KindComponentProjection, "kind" | "componentKey" | "isActive">,
): KindComponentProjection {
  return {
    platform: "web",
    role: "output",
    source: "db",
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

function markerOf(block: {
  metadata?: Record<string, unknown>;
}): IrRouteMarker | undefined {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("resolver gate at applyIrKindRoute (R6) + __ir_route marker", () => {
  it("[pre-warm] a compiled-bootstrap kind routes with marker by:'compiled'", () => {
    const block = flashcardBlock();
    const routed = applyIrKindRoute(block);

    expect(routed.type).toBe("flashcards");
    expect(markerOf(routed)).toEqual({ by: "compiled", key: "flashcards" });
    // The envelope survives the marker stamp; the input block is not mutated.
    expect(routed.metadata?.[IR_ENVELOPE_KEY]).toBe(
      block.metadata[IR_ENVELOPE_KEY],
    );
    expect(markerOf(block)).toBeUndefined();
  });

  it("[post-warm] a DB row — even INACTIVE — cannot un-route a compiled kind; marker flips to by:'db'", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "flashcard_set",
        componentKey: "flashcards",
        isActive: false,
        source: "bundled",
      }),
    ]);

    const routed = applyIrKindRoute(flashcardBlock());
    expect(routed.type).toBe("flashcards"); // trusted at bootstrap — still renders
    expect(markerOf(routed)).toEqual({ by: "db", key: "flashcards" });
  });

  it("a DB-only kind with is_active=false does NOT route — block untouched, by reference", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "incident_report",
        componentKey: "incident_report_view",
        isActive: false,
      }),
    ]);

    const block = dbOnlyBlock("incident_report");
    const routed = applyIrKindRoute(block);
    expect(routed).toBe(block); // never an error, never hidden content
    expect(routed.type).toBe("code");
    expect(markerOf(routed)).toBeUndefined();
  });

  it("a DB-only kind with is_active=true routes to its componentKey, clears poison serverData, stamps by:'db'", () => {
    componentRegistry.ingestDbRows([
      dbRow({ kind: "gantt_chart", componentKey: "gantt", isActive: true }),
    ]);

    const block = dbOnlyBlock("gantt_chart");
    const routed = applyIrKindRoute(block);

    expect(routed.type).toBe("gantt");
    // No compiled bridge — the raw region's annotation must never reach the
    // component as truthy serverData (the 2026-07-04 poison bug class).
    expect(routed.serverData).toBeUndefined();
    expect(markerOf(routed)).toEqual({ by: "db", key: "gantt" });
    expect(routed.content).toBe(block.content);
  });

  it("a DB-only routed kind already typed as its target passes through by reference", () => {
    // gantt_chart is active in the registry from the previous test's ingest.
    const block = { ...dbOnlyBlock("gantt_chart"), type: "gantt" };
    delete (block as { serverData?: Record<string, unknown> }).serverData;
    expect(applyIrKindRoute(block)).toBe(block);
  });

  it("an unknown kind (no compiled entry, no DB row) is untouched, by reference", () => {
    const block = dbOnlyBlock("kind_nobody_registered");
    expect(applyIrKindRoute(block)).toBe(block);
  });
});
