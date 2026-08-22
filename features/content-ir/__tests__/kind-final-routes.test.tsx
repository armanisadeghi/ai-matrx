/**
 * Army: FE kind component routes — THE FINAL FOUR
 * (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`;
 * migrations/content_ir_final_kind_routes.sql).
 *
 * `gsc_site_intake_bundle` · `gsc_site_intake_proposal` ·
 * `seo_finding_fix_context` · `seo_finding_fix_proposal` were the last active,
 * non-contract-artifact kinds reaching the generic viewer by SILENT fallback.
 * Each now carries an explicit `(kind,'web','output') → generic_structured`
 * row, which took the mission's missing-route count to ZERO.
 *
 * Every assertion runs against the kind's LIVE canonical `kind_example.data`
 * (fixtures/final-kind-examples.json, copied verbatim from content_ir).
 *
 * On `seo_finding_fix_proposal` specifically: FindingFixCard
 * (features/marketing/components/analysis/) already consumes this shape, but it
 * is an interactive APPLY surface (before/after, confirm dialog, CMS-draft
 * writeback) that cannot render from a kind envelope alone — not a second
 * renderer competing with this route, and deliberately untouched. Whether a
 * STREAMED proposal should render as a read-only twin of that card is a
 * product-semantics question left to the distillation pass; the migration
 * header and the ledger both carry it.
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
import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
import EXAMPLES from "./fixtures/final-kind-examples.json";

const CANONICAL = EXAMPLES as Record<string, Record<string, unknown>>;

const FINAL_FOUR: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  {
    kind: "gsc_site_intake_bundle",
    needles: [
      "allgreenrecycling.com",
      "All Green Electronics Recycling",
      "All Green Recycling",
      // NOTE: this kind's `rows`/`columns` matrices do NOT surface here — see
      // the pinned finding below.
    ],
  },
  {
    kind: "gsc_site_intake_proposal",
    needles: [
      "IT asset disposition (ITAD)", // nested: business_inference.what_they_sell
      "Equipment-purchase intent on a services business", // nested: term_groups[].label
      "Year-ago period missing", // nested: gaps[]
    ],
  },
  {
    kind: "seo_finding_fix_context",
    needles: [
      "https://example.com/services/crowns", // nested: page.url
      "Example Dental", // nested: site.site_name
      "The page has no title tag.", // nested: finding.item_description
    ],
  },
  {
    kind: "seo_finding_fix_proposal",
    needles: [
      "Dental Crowns in Portland | Example Dental",
      "The city name is now in the title", // nested: risks[]
    ],
  },
];

function registerWarmDefinition(kind: string): void {
  kindRegistry.upsertDefinition({
    kind,
    schema: null,
    schemaSource: "content_ir",
    tier: "warm",
  });
}

function routeRow(kind: string): KindComponentProjection {
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
    serverData: { language: "json" } as Record<string, unknown> | undefined,
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, kind) } as
      | Record<string, unknown>
      | undefined,
  };
}

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("the final four: fixtures ARE the live canonical examples", () => {
  it("carries one canonical example per claimed kind", () => {
    expect(Object.keys(CANONICAL).sort()).toEqual(
      FINAL_FOUR.map((f) => f.kind).sort(),
    );
  });
});

describe("the final four route EXPLICITLY, not by fallback", () => {
  it.each(FINAL_FOUR.map((f) => [f.kind] as const))(
    "[before] `%s` with no registered row falls back SILENTLY",
    (kind) => {
      // ORDER-SENSITIVE (module-singleton registries, first row per key wins):
      // this pre-ingest assertion pins the defect the migration closes.
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
    componentRegistry.ingestDbRows(FINAL_FOUR.map((f) => routeRow(f.kind)));

    for (const { kind } of FINAL_FOUR) {
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

describe("the final four render their canonical example for real", () => {
  it.each(FINAL_FOUR.map((f) => [f.kind, f] as const))(
    "`%s` shows the reader its content, nested children included",
    (kind, spec) => {
      registerWarmDefinition(kind);
      componentRegistry.ingestDbRows([routeRow(kind)]);
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
      expect(markup).not.toContain("Unverified shape");
    },
  );
});

describe("what the generic renderer does NOT show — recorded, not hidden", () => {
  it("does not table `gsc_site_intake_bundle`'s rows/columns matrices", () => {
    // Found while verifying this kind. It is a TABULAR payload expressed as
    // `{columns: string[], rows: unknown[][]}` blocks (top_pages, top_queries,
    // class_summary, juice_pages, cannibalization, opportunity_queries) — the
    // exact shape a reader most wants as a grid. StructuredValueView tables
    // uniform arrays of OBJECTS, not arrays of ARRAYS, so `columns` renders as
    // a bullet list and the cell values (e.g. "/services/data-destruction")
    // never reach the document at all.
    //
    // Nothing is lost — the raw data is one click away — but this is the
    // clearest case in copy-D's whole claim of a kind that has EARNED a real
    // component. It is written down here, and in the ledger, so the
    // distillation pass inherits the finding instead of rediscovering it.
    // Deliberately NOT fixed here: a basic route does not get to invent a
    // renderer, and maturity is not promoted by this work (plan §7.8).
    registerWarmDefinition("gsc_site_intake_bundle");
    componentRegistry.ingestDbRows([routeRow("gsc_site_intake_bundle")]);
    const routed = applyIrKindRoute(
      kindBlock("gsc_site_intake_bundle", CANONICAL.gsc_site_intake_bundle),
    );
    const markup = renderToStaticMarkup(
      <GenericStructuredBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );

    // The top-level scalars DO render — the reader is never shown nothing.
    expect(markup).toContain("allgreenrecycling.com");
    // But no cell of any matrix does.
    expect(markup).not.toContain("/services/data-destruction");
    expect(markup).not.toContain("crt tv recycling near me");
  });
});
