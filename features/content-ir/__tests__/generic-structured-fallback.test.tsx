/**
 * The R6 generic fallback: a resolved kind the platform KNOWS but nothing
 * render-trusted claims renders through GenericStructuredBlock — never a raw
 * code block, never an error, never hidden content.
 *
 * The three kinds this retires (`q_and_a_set`, `study_pack_set`,
 * `schema_showcase`) live ONLY in `content_ir.kind_definition` — they have a
 * schema but no compiled bridge and no component. Warm arrival is simulated
 * the way the real loader does it: `kindRegistry.upsertDefinition` for the
 * definition, `componentRegistry.ingestDbRows` for `kind_component`.
 *
 * ORDER-SENSITIVE, like kind-route-resolver-gate.test.ts: both registries are
 * module singletons and first-row-per-key wins, so pre-ingest assertions run
 * before any ingest for the same key.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The generic viewer's tree is `JsonInspector`, pulled through next/dynamic so
// its panes stay out of the chat chunk. Stub the loader: we assert the VALUE
// reaching the viewer, not the canonical inspector's internals.
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const react = require("react") as typeof React;
    return function MockJsonInspector({ data }: { data: unknown }) {
      return react.createElement(
        "pre",
        { "data-testid": "json-tree" },
        JSON.stringify(data),
      );
    };
  },
}));

import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import { envelopeFromCompleteValue, normalizeJsonRegion } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";

interface TestBlock {
  type: string;
  content: string;
  serverData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Exactly how the warm loader lands a content_ir kind with no TS facets. */
function registerWarmDefinition(kind: string): void {
  kindRegistry.upsertDefinition({
    kind,
    schema: null,
    schemaSource: "content_ir",
    tier: "warm",
  });
}

/** A region whose root carries `kind`, shaped like a real bare-JSON arrival. */
function kindBlock(kind: string, value: Record<string, unknown>): TestBlock {
  const complete = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    // The raw region's annotation — NOT kind data. Must never survive routing.
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) },
  };
}

function dbRow(
  overrides: Partial<KindComponentProjection> &
    Pick<KindComponentProjection, "kind" | "componentKey" | "isActive">,
): KindComponentProjection {
  return {
    platform: "web",
    role: "output",
    source: "bundled",
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("R6 generic fallback at the render seam", () => {
  it("[no-component] a KNOWN kind with no component routes to GenericStructuredBlock, not a code block", () => {
    registerWarmDefinition("q_and_a_set");

    const block = kindBlock("q_and_a_set", {
      title: "Photosynthesis",
      cards: [{ front: "What is chlorophyll?", back: "A green pigment." }],
    });
    const routed = applyIrKindRoute(block);

    expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    expect(routed.type).not.toBe("code"); // the trap this replaces
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: "generic_structured",
      unverified: true,
      reason: "no-component",
    });

    // The raw region's `{ language: "json" }` annotation is poison, not data.
    expect(routed.serverData).toBeUndefined();
    // Content + envelope survive; the input block is never mutated.
    expect(routed.content).toBe(block.content);
    expect(routed.metadata?.[IR_ENVELOPE_KEY]).toBe(
      block.metadata?.[IR_ENVELOPE_KEY],
    );
    expect(markerOf(block)).toBeUndefined();
  });

  it("[inactive] a KNOWN kind whose component row is held inactive routes to the generic viewer with reason 'inactive'", () => {
    registerWarmDefinition("study_pack_set");
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "study_pack_set",
        componentKey: GENERIC_STRUCTURED_COMPONENT_KEY,
        isActive: false,
      }),
    ]);

    const routed = applyIrKindRoute(
      kindBlock("study_pack_set", { title: "Biology 101", included_sets: [] }),
    );

    expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: "generic_structured",
      unverified: true,
      reason: "inactive",
    });
  });

  it("[idempotent] a block already typed generic_structured passes through by reference", () => {
    registerWarmDefinition("schema_showcase");
    const block = {
      ...kindBlock("schema_showcase", { label: "demo", count: 1 }),
      type: GENERIC_STRUCTURED_COMPONENT_KEY,
    };
    delete (block as { serverData?: Record<string, unknown> }).serverData;

    expect(applyIrKindRoute(block)).toBe(block);
  });

  it("[unaffected] a kind WITH a compiled component still routes to its real renderer", () => {
    const content = JSON.stringify({
      __kind: "flashcard_set",
      title: "Gate",
      cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
    });
    const routed = applyIrKindRoute({
      type: "code",
      content,
      serverData: { language: "json" },
      metadata: {
        [IR_ENVELOPE_KEY]: normalizeJsonRegion(content, {
          schemas: kindRegistry.snapshotSchemas(),
        }),
      },
    });

    expect(routed.type).toBe("flashcards");
    expect(markerOf(routed)).toEqual({ by: "compiled", key: "flashcards" });
    expect(markerOf(routed)?.unverified).toBeUndefined();
  });

  it("[unaffected] a KNOWN kind with an ACTIVE db component routes to that component, not the generic viewer", () => {
    registerWarmDefinition("gantt_chart");
    componentRegistry.ingestDbRows([
      dbRow({ kind: "gantt_chart", componentKey: "gantt", isActive: true }),
    ]);

    const routed = applyIrKindRoute(kindBlock("gantt_chart", { title: "Q3" }));

    expect(routed.type).toBe("gantt");
    expect(markerOf(routed)).toEqual({ by: "db", key: "gantt" });
  });

  it("[migration path] an ACTIVE generic_structured row routes the kind through the resolver, stamping by:'db'", () => {
    // Exactly what migrations/content_ir_generic_structured_roots.sql creates
    // for q_and_a_set. The resolver (not the fallback) answers, which is the
    // live proof of R1 registry-resolution; the block still lands on
    // GenericStructuredBlock, which supplies the honesty.
    registerWarmDefinition("q_and_a_set_live");
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "q_and_a_set_live",
        componentKey: GENERIC_STRUCTURED_COMPONENT_KEY,
        isActive: true,
      }),
    ]);

    const routed = applyIrKindRoute(
      kindBlock("q_and_a_set_live", { title: "Photosynthesis" }),
    );

    expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    expect(routed.serverData).toBeUndefined();
    expect(markerOf(routed)).toEqual({
      by: "db",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
    });
  });

  it("[strangler seam] a kind with NO definition at all stays untouched, by reference", () => {
    const block = kindBlock("kind_the_platform_never_heard_of", { a: 1 });
    expect(applyIrKindRoute(block)).toBe(block);
    expect(block.type).toBe("code");
  });

  it("[strangler seam] a pending region (no kind yet) stays untouched, by reference", () => {
    const block: TestBlock = {
      type: "code",
      content: '{"title": "still streami',
      metadata: {
        [IR_ENVELOPE_KEY]: normalizeJsonRegion('{"title": "still streami', {
          schemas: kindRegistry.snapshotSchemas(),
        }),
      },
    };
    expect(applyIrKindRoute(block)).toBe(block);
  });
});

describe("GenericStructuredBlock renders the shape honestly", () => {
  function routedMarkup(kind: string, value: Record<string, unknown>) {
    registerWarmDefinition(kind);
    const routed = applyIrKindRoute(kindBlock(kind, value));
    return renderToStaticMarkup(
      <GenericStructuredBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );
  }

  it("shows the unverified-shape affordance, the kind slug, and every field", () => {
    const markup = routedMarkup("schema_showcase", {
      label: "Widget",
      count: 3,
      status: "draft",
    });

    expect(markup).toContain("Unverified shape");
    expect(markup).toContain("no renderer is registered for this shape");
    expect(markup).toContain("schema_showcase");

    // Content is never hidden: the value reached the tree viewer intact.
    expect(markup).toContain("Widget");
    expect(markup).toContain("draft");
    expect(markup).toContain("json-tree");
  });

  it("names the inactive reason when a component is registered but held", () => {
    registerWarmDefinition("held_shape");
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "held_shape",
        componentKey: GENERIC_STRUCTURED_COMPONENT_KEY,
        isActive: false,
      }),
    ]);
    const routed = applyIrKindRoute(kindBlock("held_shape", { title: "T" }));
    const markup = renderToStaticMarkup(
      <GenericStructuredBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );

    expect(markup).toContain("Unverified shape");
    expect(markup).toContain("held inactive");
  });

  it("still tells the truth when an ACTIVE registry row named the generic viewer (by:'db')", () => {
    // The live shape of q_and_a_set / study_pack_set / schema_showcase after
    // the migration: `kind_component.component_key = 'generic_structured'`,
    // is_active = true. The resolver routes by:'db' — no fallback, no
    // `unverified` flag — and the banner MUST still appear, because naming the
    // generic viewer as the component is not the same as having a renderer.
    const markup = renderToStaticMarkup(
      <GenericStructuredBlock
        content='{"__kind":"q_and_a_set","title":"T"}'
        metadata={{
          [IR_ROUTE_KEY]: {
            by: "db",
            key: GENERIC_STRUCTURED_COMPONENT_KEY,
          } satisfies IrRouteMarker,
        }}
      />,
    );
    expect(markup).toContain("Unverified shape");
    expect(markup).toContain("no renderer is registered for this shape");
  });

  it("never errors and never hides content when the region does not parse", () => {
    const markup = renderToStaticMarkup(
      <GenericStructuredBlock content="{not json at all" />,
    );
    expect(markup).toContain("{not json at all");
  });
});
