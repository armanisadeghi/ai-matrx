/**
 * Army: FE kind component routes — the SEO ANALYSIS cluster
 * (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`, batch 3;
 * migrations/content_ir_seo_analysis_kind_routes.sql).
 *
 * Eight kinds had no `(kind,'web','output')` row. Reuse was checked for each
 * and the answer split two ways, which is exactly what these tests pin:
 *
 *  · `keyword_classification_batch_v1` ALREADY had a real component
 *    (features/content-ir/kinds/keyword-research.ts declares
 *    `legacyBlockType: "keyword_classification_batch"`), so it was never a
 *    silent fallback — the missing row was a REGISTRY LIE. Its row now names
 *    the component the platform actually uses, and the compiled bridge still
 *    wins the route. Nothing about its rendering changed; the registry stopped
 *    being wrong.
 *
 *  · The other seven have no component anywhere, so they get the generic
 *    structured renderer as an EXPLICIT route: the resolver answers
 *    (`by:'db'`) instead of the seam falling back
 *    (`by:'generic', unverified:true`).
 *
 * Every assertion runs against each kind's LIVE canonical `kind_example.data`,
 * copied verbatim from content_ir into
 * `fixtures/seo-analysis-kind-examples.json` (all validation_status='passed').
 * Nested child kinds (`keyword_ref_v1`, `content_gap_v1`, `page_plan_v1`,
 * `topic_proposal_v1`, …) render by RECURSION through the registry — no
 * per-child renderer was minted, and the content assertions below reach into
 * those children, so recursion is proven rather than assumed.
 *
 * Maturity is deliberately untouched (KINDS_EVERYWHERE_PLAN.md §7.8).
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
import EXAMPLES from "./fixtures/seo-analysis-kind-examples.json";

const CANONICAL = EXAMPLES as Record<string, Record<string, unknown>>;

/**
 * The seven with no component anywhere. `needles` are distinctive strings the
 * reader must actually SEE — deliberately drawn from NESTED children as well
 * as the root, so a regression in registry recursion fails a test instead of
 * quietly flattening the document.
 */
const GENERIC_ROUTED: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  {
    kind: "competitor_opportunity_autopsy_v1",
    needles: [
      "Upgrade the existing guide before creating new content.",
      "rival.example", // nested: competitors[].domain
      "Upgrade the practical guide", // nested: opportunities[].title
    ],
  },
  {
    kind: "competitor_page_autopsy_v1",
    needles: [
      "The competitor wins on demonstrably broader topic coverage.",
      "https://rival.example/guide",
      "No setup guidance", // nested: content_gaps[].gap
    ],
  },
  {
    kind: "digital_pr_reputation_brief_v1",
    needles: [
      "Accurate editorial coverage worth protecting", // nested: cases[].headline
      "example-news.com",
      "Example News", // doubly nested: cases[].evidence_refs[].title
    ],
  },
  {
    kind: "page_keyword_analysis_v1",
    needles: [
      "https://example.com/lip-fillers",
      "lip filler aftercare", // nested: discovered_keywords[].phrase
      "No before/after gallery", // nested: gaps[].gap
    ],
  },
  {
    kind: "page_keyword_map_v1",
    needles: [
      "lip filler newport beach", // nested: page_plans[].primary_keyword
      "Day-by-day aftercare timeline", // nested: page_plans[].brief
      "cheap lip filler", // nested: skipped[].phrase
    ],
  },
  {
    kind: "seo_authority_route_analysis",
    needles: [
      "A high-authority educational guide",
      "certified data destruction services", // nested: priorities[].anchor_text
    ],
  },
  {
    kind: "topic_assignment_batch_v1",
    needles: [
      "Hard Drive Shredding", // nested: new_topics[].name
      "hard-drive-shredding", // nested: assignments[].primary_topic
      "Generic navigational query", // nested: unassignable[].reason
    ],
  },
];

/** The one that already had a real component. */
const BRIDGED_KIND = "keyword_classification_batch_v1";
const BRIDGED_COMPONENT_KEY = "keyword_classification_batch";

function registerWarmDefinition(kind: string): void {
  kindRegistry.upsertDefinition({
    kind,
    schema: null,
    schemaSource: "content_ir",
    tier: "warm",
  });
}

function routeRow(kind: string, componentKey: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey,
    source: "bundled",
    isActive: true,
    config:
      componentKey === GENERIC_STRUCTURED_COMPONENT_KEY
        ? {}
        : { legacyBlockType: componentKey },
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-08-21T00:00:00Z",
    createdBy: null,
    createdAt: "2026-08-21T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
  };
}

function kindBlock(kind: string, value: Record<string, unknown>) {
  const complete = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(complete),
    // The raw region's annotation — NOT kind data. Must never survive routing.
    serverData: { language: "json" } as Record<string, unknown> | undefined,
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) } as
      | Record<string, unknown>
      | undefined,
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("SEO analysis kinds: the fixtures ARE the live canonical examples", () => {
  it("carries one canonical example per claimed kind", () => {
    const kinds = [...GENERIC_ROUTED.map((g) => g.kind), BRIDGED_KIND].sort();
    expect(Object.keys(CANONICAL).sort()).toEqual(kinds);
  });
});

describe("the seven with no component route EXPLICITLY, not by fallback", () => {
  it.each(GENERIC_ROUTED.map((g) => [g.kind] as const))(
    "[before] `%s` with no registered row falls back SILENTLY",
    (kind) => {
      // ORDER-SENSITIVE (both registries are module singletons, first row per
      // key wins): this pre-ingest assertion pins the defect the migration
      // closes, so a regression is visible instead of inferred.
      registerWarmDefinition(kind);
      const routed = applyIrKindRoute(kindBlock(kind, CANONICAL[kind]));

      expect(markerOf(routed)).toEqual({
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason: "no-component",
      });
    },
  );

  it("[after] every one routes through the RESOLVER, stamping by:'db'", () => {
    componentRegistry.ingestDbRows(
      GENERIC_ROUTED.map((g) =>
        routeRow(g.kind, GENERIC_STRUCTURED_COMPONENT_KEY),
      ),
    );

    for (const { kind } of GENERIC_ROUTED) {
      const routed = applyIrKindRoute(kindBlock(kind, CANONICAL[kind]));

      expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      expect(routed.serverData).toBeUndefined();
      expect(markerOf(routed)).toEqual({
        by: "db",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
      });
      expect(markerOf(routed)?.unverified).toBeUndefined();
    }
  });
});

describe("every claimed kind renders its canonical example for real", () => {
  it.each(GENERIC_ROUTED.map((g) => [g.kind, g] as const))(
    "`%s` shows the reader its content, nested children included",
    (kind, spec) => {
      registerWarmDefinition(kind);
      componentRegistry.ingestDbRows([
        routeRow(kind, GENERIC_STRUCTURED_COMPONENT_KEY),
      ]);
      const routed = applyIrKindRoute(kindBlock(kind, CANONICAL[kind]));
      const markup = renderToStaticMarkup(
        <GenericStructuredBlock
          content={routed.content}
          metadata={routed.metadata}
        />,
      );

      for (const needle of spec.needles) {
        expect(markup).toContain(needle);
      }
      // Never the trap this replaces: a developer artifact or hidden content.
      expect(markup).not.toContain("Unverified shape");
    },
  );
});

describe("what the generic renderer does NOT show — recorded, not hidden", () => {
  it("collapses an object nested inside a TABLE cell behind an Expand control", () => {
    // Found while verifying `page_keyword_map_v1`: its `page_plans[]` render as
    // a real table (uniform object array), and the `page` object inside each
    // row becomes a `{2 fields}` Expand button rather than inline content. So
    // `page_plans[].page.proposed.title` — the proposed page's NAME — is one
    // click away, not on screen.
    //
    // This is StructuredValueView's deliberate table affordance, not a defect
    // in the route, and it is exactly the honest ceiling of a basic route: the
    // data is reachable and nothing is lost, but a reader scanning the document
    // does not see it. Pinned here so the DISTILLATION pass (which is what
    // decides whether this kind deserves a real component) inherits the finding
    // instead of rediscovering it.
    registerWarmDefinition("page_keyword_map_v1");
    componentRegistry.ingestDbRows([
      routeRow("page_keyword_map_v1", GENERIC_STRUCTURED_COMPONENT_KEY),
    ]);
    const routed = applyIrKindRoute(
      kindBlock("page_keyword_map_v1", CANONICAL.page_keyword_map_v1),
    );
    const markup = renderToStaticMarkup(
      <GenericStructuredBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );

    expect(markup).toContain("{2 fields}"); // the Expand control
    expect(markup).not.toContain("Lip Filler Aftercare Guide"); // behind it
  });
});

describe("keyword_classification_batch_v1 already HAD a component", () => {
  it("routes to its real component through the compiled bridge, and the row records it", () => {
    registerWarmDefinition(BRIDGED_KIND);
    componentRegistry.ingestDbRows([
      routeRow(BRIDGED_KIND, BRIDGED_COMPONENT_KEY),
    ]);

    const routed = applyIrKindRoute(
      kindBlock(BRIDGED_KIND, CANONICAL[BRIDGED_KIND]),
    );

    // The compiled bridge — not the generic viewer, and never a fallback.
    expect(routed.type).toBe(BRIDGED_COMPONENT_KEY);
    expect(routed.type).not.toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
    expect(markerOf(routed)?.unverified).toBeUndefined();
    // The registry now names the component the platform actually renders.
    expect(markerOf(routed)?.key).toBe(BRIDGED_COMPONENT_KEY);
    // The bridge supplies the component's data; the raw region's
    // `{ language: "json" }` annotation never survives.
    expect(routed.serverData).not.toEqual({ language: "json" });
  });
});
