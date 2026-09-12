/**
 * THE FOUR RUNTIME-RESULT FAMILY ROUTES (GAP 6, 2026-08-23) — 61 registered
 * workflow / tool / filesystem kinds that reached the reader ONLY through the
 * `generic_structured` floor now resolve to one of four purpose-built
 * components, on exactly the `web_analysis_item` model: a `kind_component` row
 * per kind, one component per family.
 *
 * Unlike `web_analysis_item` (83 kinds, ONE literal shape), these four
 * families are bound by a shared READER QUESTION rather than a shared property
 * set — measured live on 2026-08-23, the 226 floor-only kinds share almost no
 * properties (the most common, `site_id`, appears in 38; `count` in 23). So
 * each component keys on the family's discriminating fields where they exist
 * and degrades honestly where they do not. That is what these fixtures prove:
 * the route lands, the headline appears, and NOTHING is swallowed.
 *
 * 🚨 FIXTURES ARE SCHEMA-DERIVED, NOT CANONICAL EXAMPLES — built from each
 * kind's LIVE registered `emitted_json_schema` (project brsgrqvjdzwihsvnfqkf,
 * 2026-08-23), which is enough to prove the ROUTE and the COMPONENT. It is NOT
 * enough to award `verified` maturity, and this suite does not claim it.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import FlowStepResultBlock from "@/components/mardown-display/blocks/result-kinds/FlowStepResultBlock";
import CollectionResultBlock from "@/components/mardown-display/blocks/result-kinds/CollectionResultBlock";
import FileOperationResultBlock from "@/components/mardown-display/blocks/result-kinds/FileOperationResultBlock";
import ValueResultBlock from "@/components/mardown-display/blocks/result-kinds/ValueResultBlock";

type BlockComponent = React.FC<{
  content: string;
  metadata?: Record<string, unknown>;
}>;

interface Fixture {
  kind: string;
  componentKey: string;
  Component: BlockComponent;
  data: Record<string, unknown>;
  /** Strings a reader must actually see rendered. */
  visible: string[];
}

const FIXTURES: Fixture[] = [
  // ── flow_step_result ────────────────────────────────────────────────────
  {
    kind: "branch_result",
    componentKey: "flow_step_result",
    Component: FlowStepResultBlock,
    data: { direction: "needs_review", value: { score: 0.42 } },
    visible: ["needs_review", "Value carried forward"],
  },
  {
    kind: "work_queue_wave_result",
    componentKey: "flow_step_result",
    Component: FlowStepResultBlock,
    data: {
      wave: 3,
      discovered: 120,
      dispatched: 40,
      succeeded: 37,
      failed: 3,
      done: false,
    },
    visible: ["Wave 3", "succeeded", "failed", "more to come"],
  },
  // ── collection_result ───────────────────────────────────────────────────
  {
    kind: "filter_result",
    componentKey: "collection_result",
    Component: CollectionResultBlock,
    data: { kept: 8, dropped: 4, items: ["a", "b"] },
    visible: ["dropped", "kept", "Items"],
  },
  {
    kind: "gather_result",
    componentKey: "collection_result",
    Component: CollectionResultBlock,
    // The declared count and the arrived count disagree — the reader has to
    // be told, not left to count rows.
    data: {
      count: 5,
      expected: 6,
      values: ["one", "two"],
      holes: [3, 4],
      skipped_indexes: [],
    },
    visible: ["2 shown", "6 expected", "holes"],
  },
  // ── file_operation_result ───────────────────────────────────────────────
  {
    kind: "file_read_result",
    componentKey: "file_operation_result",
    Component: FileOperationResultBlock,
    data: {
      path: "/srv/app/config/settings.yaml",
      content: "debug: true\nregion: us-east-1\n",
      size: 2048,
      offset: 0,
      next_offset: 4096,
      truncated: true,
    },
    visible: ["settings.yaml", "region: us-east-1", "truncated", "resume at 4,096"],
  },
  {
    kind: "file_edit_failure",
    componentKey: "file_operation_result",
    Component: FileOperationResultBlock,
    data: {
      edit_index: 2,
      reason: "old_text not found",
      old_text_preview: "const oldName = 1;",
    },
    visible: ["old_text not found", "const oldName = 1;"],
  },
  // ── value_result ────────────────────────────────────────────────────────
  {
    kind: "hash_result",
    componentKey: "value_result",
    Component: ValueResultBlock,
    data: { algorithm: "sha256", digest: "9f86d081884c7d659a2feaa0c55ad015", truncated_to: null },
    visible: ["9f86d081884c7d659a2feaa0c55ad015", "sha256"],
  },
  {
    kind: "field_lookup_result",
    componentKey: "value_result",
    Component: ValueResultBlock,
    // An absent value is a RESULT. The floor renders `found: false` as one
    // grey row; here it is the headline.
    data: { found: false, value: null },
    visible: ["not found"],
  },
  {
    kind: "template_render_result",
    componentKey: "value_result",
    Component: ValueResultBlock,
    data: {
      text: "Hello {{name}}, your order ships on {{date}}.",
      missing_keys: ["name", "date"],
    },
    visible: ["2 unfilled", "name, date"],
  },
];

/** The registered family row, as the warm loader projects it. */
function registeredRow(kind: string, componentKey: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey,
    source: "bundled",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-08-23T00:00:00Z",
    createdAt: "2026-08-23T00:00:00Z",
    createdBy: null,
    id: "00000000-0000-0000-0000-000000000000",
  };
}

function kindBlock(kind: string, value: Record<string, unknown>) {
  const complete = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    // The raw region's annotation — never kind data; must not survive routing.
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) },
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("the four runtime-result families route to their registered component", () => {
  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] an unregistered runtime kind reaches the reader only by silent fallback", () => {
    kindRegistry.upsertDefinition({
      kind: "runtime_probe_unregistered",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(
      kindBlock("runtime_probe_unregistered", { count: 1 }),
    );
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  it.each(FIXTURES.map((f) => [f.kind, f] as const))(
    "%s resolves to its family component and renders its headline",
    (kind, fixture) => {
      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(kind, fixture.componentKey)]);

      const routed = applyIrKindRoute(kindBlock(kind, fixture.data));

      // The resolver answered — no silent fallback, no `unverified` flag.
      expect(routed.type).toBe(fixture.componentKey);
      expect(markerOf(routed)?.key).toBe(fixture.componentKey);
      expect(markerOf(routed)?.unverified).toBeUndefined();
      // The raw region annotation is poison, not data.
      expect(routed.serverData).toBeUndefined();

      const { Component } = fixture;
      const markup = renderToStaticMarkup(
        <Component content={routed.content} metadata={routed.metadata} />,
      );

      for (const text of fixture.visible) {
        expect(markup).toContain(text);
      }
      // A real renderer IS registered, so the floor's honesty line must NOT
      // appear — that line belongs to kinds that only got the basic route.
      expect(markup).not.toContain("no custom view yet");
      expect(markup).not.toContain("Unverified shape");
    },
  );

  it.each([
    ["flow_step_result", FlowStepResultBlock],
    ["collection_result", CollectionResultBlock],
    ["file_operation_result", FileOperationResultBlock],
    ["value_result", ValueResultBlock],
  ] as const)(
    "%s never swallows a payload it cannot read",
    (_key, Component) => {
      const markup = renderToStaticMarkup(
        <Component content="not json at all" metadata={undefined} />,
      );
      expect(markup).toContain("not json at all");
    },
  );

  it("value_result renders a BARE scalar payload (`json` / `number` / `boolean`)", () => {
    // These three kinds register no properties at all — the value IS the
    // scalar, so a component that assumes an object would render nothing.
    const markup = renderToStaticMarkup(
      <ValueResultBlock content="42" metadata={undefined} />,
    );
    expect(markup).toContain("42");
  });

  it("carries a field no family promoted through to the reader", () => {
    // HIDE NOTHING: an unmodelled scalar lands in the meta strip rather than
    // disappearing between the headline and the payload.
    const markup = renderToStaticMarkup(
      <FlowStepResultBlock
        content={JSON.stringify({ __kind: "dispatch_result", dispatched: 3, batch_label: "nightly" })}
        metadata={undefined}
      />,
    );
    expect(markup).toContain("nightly");
  });
});
