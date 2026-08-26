/**
 * EXPLICIT BASIC ROUTES — the workflow runtime RESULT kinds and the
 * research/evidence cluster now have a REGISTERED web/output
 * route (migrations/content_ir_workflow_result_output_routes.sql). Before it,
 * every one of them reached the reader only by SILENT fallback —
 * `by:'generic', unverified:true, reason:'no-component'` — which is exactly
 * what the "no dead ends / explicit route" mission exists to end.
 *
 * These are eight DIFFERENT plumbing shapes (`metadata.family='workflow_io'`),
 * not one family, so the honest route is the platform floor REGISTERED on
 * purpose. The shared route stamps `by:'generic', reason:'generic-row',
 * unverified:true` because an explicit generic row is still not purpose-built
 * component coverage; `GenericStructuredBlock` says "no custom view yet".
 *
 * FIXTURES ARE THE LIVE CANONICAL EXAMPLES — `content_ir.kind_example`,
 * `is_canonical`, `validation_status='passed'`, pinned to each kind's current
 * `kind_definition.version`, copied verbatim from project brsgrqvjdzwihsvnfqkf
 * on 2026-08-20. Per the plan's standing rule, examples follow the REGISTRY,
 * never a sketch.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";

// GenericStructuredBlock's raw-data escape mounts through next/dynamic; stub
// it so static markup stays about the VALUE on screen (same stub the sibling
// generic-structured-fallback test uses).
jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const react = require("react") as typeof React;
    return function MockDynamic({ data }: { data?: unknown }) {
      return react.createElement(
        "pre",
        { "data-testid": "json-tree" },
        JSON.stringify(data ?? null),
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
import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
import { makeStore } from "@/lib/redux/store";

/**
 * The floor gives a `file_id` a real door (`useFileActions`), which reads the
 * store — so every render here goes through a Provider, exactly as the app
 * does. Rendering these kinds WITHOUT one throws, which is the affordance
 * working, not a defect.
 */
function renderRouted(block: {
  content: string;
  metadata?: Record<string, unknown>;
}): string {
  return renderToStaticMarkup(
    <Provider store={makeStore()}>
      <GenericStructuredBlock
        content={block.content}
        metadata={block.metadata}
      />
    </Provider>,
  );
}

interface Fixture {
  kind: string;
  /** The live canonical `kind_example.data`, verbatim. */
  data: Record<string, unknown>;
  /** Strings a reader must actually see rendered from that example. */
  visible: string[];
}

const FIXTURES: Fixture[] = [
  {
    kind: "branch_result",
    data: { value: { score: 0.9 }, direction: "true" },
    visible: ["Direction"],
  },
  {
    kind: "bulk_result",
    data: {
      items: [
        { index: 0, value: "ok", status: "succeeded", item_error: null },
        {
          index: 1,
          value: null,
          status: "failed",
          item_error: { code: "not_found", details: null, message: "Row missing." },
        },
      ],
      failed: 1,
      archetype: "bulk_result",
      succeeded: 1,
    },
    // The nested `item_error` object sits in a table cell, where the floor
    // collapses it behind an Expand affordance ("{3 fields}") rather than
    // dumping it — so the reader-visible proof is the per-item receipt row.
    visible: ["succeeded", "failed", "Item error", "{3 fields}"],
  },
  {
    kind: "criteria_gate_result",
    data: {
      verdict: "passed",
      criteria: [
        {
          label: "Evidence preserved",
          verdict: "met",
          required: true,
          rationale: "Acquisition record is complete.",
          confidence: 0.98,
          criterion_id: "evidence_preserved",
          evaluator_id: "evidence-lane",
          evidence_refs: ["ev-001"],
        },
      ],
      assessed_count: 1,
      required_count: 1,
      contradiction_count: 0,
      evidence_reference_count: 1,
    },
    visible: ["Evidence preserved", "Acquisition record is complete."],
  },
  {
    kind: "gather_result",
    data: { count: 3, values: [1, 2, 3] },
    visible: ["Count"],
  },
  {
    kind: "map_result",
    data: { dispatched: 3 },
    visible: ["Dispatched"],
  },
  {
    kind: "operation_result",
    data: {
      id: "rec_123",
      action: "created",
      message: "Task created.",
      archetype: "operation_result",
    },
    visible: ["Task created."],
  },
  {
    kind: "saved_row",
    data: {
      data: { name: "Acme", score: 42 },
      row_id: "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69",
      created: true,
      updated: false,
      table_id: "b7e6a5d4-3c2b-4a19-8f7e-6d5c4b3a2919",
    },
    visible: ["Acme"],
  },
  {
    kind: "workflow_run_result",
    data: {
      run_id: "d2f8a1c4-0000-4000-8000-000000000000",
      last_outputs: { final_node: { result: "done" } },
      channel_values: {},
    },
    visible: ["d2f8a1c4-0000-4000-8000-000000000000"],
  },
  // ── the research/evidence cluster (batch 2) ──────────────────────────────
  {
    kind: "evidence_source",
    data: {
      summary:
        "A 2024 systematic review found no consistent link between the two, across 31 trials.",
      sourceTitle: "Systematic review of 31 randomized trials (2024)",
      sourceUrl: "https://example.org/reviews/2024-systematic-review",
    },
    visible: ["Systematic review of 31 randomized trials (2024)"],
  },
  {
    kind: "entity_mention",
    data: {
      name: "World Health Organization",
      entityType: "organization",
      role: "Cited as the source of the 2023 guideline the speaker relies on.",
      mentions: ["the WHO", "World Health Organization", "the agency"],
    },
    visible: ["World Health Organization", "the agency"],
  },
  {
    kind: "notable_timestamp",
    data: {
      timecode: "00:12:45",
      seconds: 765,
      label: "Speaker states the central claim for the first time",
      type: "key_claim",
    },
    visible: ["00:12:45", "Speaker states the central claim for the first time"],
  },
  {
    kind: "topic_relevance",
    data: {
      topic: "Regulatory approval process",
      relevanceScore: 0.82,
      rationale:
        "Roughly a third of the transcript walks through the approval timeline in detail.",
    },
    visible: ["Regulatory approval process"],
  },
  {
    kind: "transcript_usage",
    data: {
      model: "gemini-2.5-pro",
      videoDuration: "00:41:18",
      timestampPrecision: "second",
      inputTokens: 184320,
      outputTokens: 6144,
      totalTokens: 190464,
      notes:
        "Timestamps taken from the provider transcript; no re-alignment was needed.",
    },
    visible: ["gemini-2.5-pro", "00:41:18"],
  },
  {
    kind: "research_cross_cutting_tags",
    data: {
      suggested_tags: [
        {
          name: "regulation",
          reason: "Regulatory constraints appear under both keywords.",
          confidence: 0.8,
          keywords_spanned: ["botox market size", "dermal filler safety"],
        },
      ],
    },
    visible: ["regulation"],
  },
  {
    kind: "research_tag_suggestions",
    data: {
      suggested_tags: [
        { name: "pricing", reason: "Page lists procedure costs.", confidence: 0.9 },
      ],
    },
    visible: ["pricing"],
  },
  // ── the I/O + research analysis kinds (batch 3) ──────────────────────────
  {
    kind: "http_response",
    data: {
      url: "https://example.com/api",
      body: { message: "hello" },
      text: '{"message": "hello"}',
      status: 200,
      headers: { "content-type": "application/json" },
      elapsed_ms: 123,
      content_type: "application/json",
    },
    visible: ["https://example.com/api", "200"],
  },
  {
    kind: "office_extraction_result",
    data: {
      file_id: "0f1e2d3c-4b5a-6789-abcd-ef0123456789",
      markdown: "# Kickoff\n\n- Goals\n- Timeline",
      portions: [
        {
          kind: "slide",
          index: 0,
          title: "Kickoff",
          number: 1,
          markdown: "- Goals\n- Timeline",
        },
      ],
      warnings: [],
      file_name: "kickoff-deck.pptx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      office_kind: "pptx",
    },
    visible: ["kickoff-deck.pptx", "pptx"],
  },
  {
    kind: "office_file_result",
    data: {
      url: "https://files.example.com/f/0f1e2d3c",
      cdn_url: null,
      file_id: "0f1e2d3c-4b5a-6789-abcd-ef0123456789",
      byte_size: 24576,
      file_name: "q3-report.docx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      signed_url: null,
      visibility: "personal",
      office_kind: "docx",
      download_url: "https://files.example.com/f/0f1e2d3c?download=1",
    },
    visible: ["q3-report.docx", "docx"],
  },
  {
    kind: "page",
    data: {
      page: 1,
      items: ["alpha", "beta"],
      limit: 2,
      total: 12,
      has_more: true,
      archetype: "page",
    },
    visible: ["alpha", "beta"],
  },
  {
    kind: "regex_extract_result",
    data: { count: 2, first: "alpha", matches: ["alpha", "beta"] },
    visible: ["alpha", "beta"],
  },
  {
    kind: "research_page_analysis",
    data: {
      id: "",
      url: "https://example.com/report",
      dates: {
        updated_date: "Not stated",
        published_date: "Not stated",
        content_timeframe: "",
      },
      key_facts: ["The market grew 12% year over year."],
      page_type: "news",
      should_use: true,
      analysis_status: "valid",
      recommended_use: "use_as_background",
      summary_markdown:
        "## Summary\nA concise, well-sourced report on the topic.",
      content_quality_score: 75,
      topic_relevance_score: 82,
    },
    visible: ["The market grew 12% year over year.", "use_as_background"],
  },
  {
    kind: "research_setup_suggestion",
    data: {
      title: "Cosmetic Injectables Market",
      description:
        "Landscape, providers, and safety guidance for cosmetic injectables.",
      initial_insights: "Demand is shifting toward non-surgical procedures.",
      suggested_keywords: ["botox market size", "dermal filler safety"],
    },
    visible: ["Cosmetic Injectables Market", "botox market size"],
  },
];

/** The row the migration created, as the warm loader projects it. */
function registeredRow(kind: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey: GENERIC_STRUCTURED_COMPONENT_KEY,
    source: "bundled",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-08-20T00:00:00Z",
    createdAt: "2026-08-20T00:00:00Z",
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

describe("explicit basic routes remain honest generic-floor routes", () => {
  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] an unregistered result kind reaches the reader only by silent fallback", () => {
    kindRegistry.upsertDefinition({
      kind: "unregistered_result_probe",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(
      kindBlock("unregistered_result_probe", { dispatched: 1 }),
    );
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  it.each(FIXTURES.map((f) => [f.kind, f] as const))(
    "%s resolves as an explicit generic row and renders its live canonical example",
    (kind, fixture) => {
      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(kind)]);

      const routed = applyIrKindRoute(kindBlock(kind, fixture.data));

      // A DB row naming the generic floor is still not custom component proof.
      expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      expect(markerOf(routed)).toEqual({
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason: "generic-row",
      });
      // The raw region annotation is poison, not data.
      expect(routed.serverData).toBeUndefined();

      const markup = renderRouted(routed);

      // The example is really on screen, as a document.
      for (const text of fixture.visible) {
        expect(markup).toContain(text);
      }
      // And the floor still tells the truth: a registered basic route is NOT
      // a claim that a bespoke renderer exists.
      expect(markup).toContain("no custom view yet");
      expect(markup).not.toContain("Unverified shape");
    },
  );
});

/**
 * `claim_evidence` gets its ROUTE but no canonical example: its live
 * `emitted_json_schema` references `#/$defs/EvidenceSource` while carrying no
 * `$defs`, so the schema cannot compile and nothing can be validated against
 * it (FOUND_DEFECTS.md — four `plan_page_*` kinds share the defect). The route
 * still has to work, because a broken SCHEMA must never mean a broken SCREEN.
 */
describe("claim_evidence routes even though its schema cannot compile", () => {
  it("uses the explicit generic floor and renders its nested evidence_source children", () => {
    kindRegistry.upsertDefinition({
      kind: "claim_evidence",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    componentRegistry.ingestDbRows([registeredRow("claim_evidence")]);

    const routed = applyIrKindRoute(
      kindBlock("claim_evidence", {
        claim: "Approval times for this device class have roughly doubled since 2019.",
        speakerPosition:
          "Argues the slowdown is caused by a 2019 change in review policy.",
        timecode: "00:12:45",
        seconds: 765,
        supportingEvidence: [
          {
            __kind: "evidence_source",
            summary:
              "Agency data shows median review time rising from 148 to 291 days.",
            sourceTitle: "Annual device review performance report (2024)",
            sourceUrl: "https://example.org/agency/2024-performance",
          },
        ],
      }),
    );

    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "generic-row",
    });

    const markup = renderRouted(routed);
    expect(markup).toContain(
      "Approval times for this device class have roughly doubled since 2019.",
    );
    // The nested evidence_source instance is on screen, not swallowed.
    expect(markup).toContain("Annual device review performance report (2024)");
  });
});
