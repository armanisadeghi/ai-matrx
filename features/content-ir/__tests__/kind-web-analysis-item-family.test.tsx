/**
 * THE `web_analysis_item` FAMILY ROUTE — the 83 registered `web_*_v1`
 * site-audit check kinds (`metadata.family = 'web_analysis_item'`) now resolve
 * to ONE registered component instead of reaching the reader by silent
 * fallback (`by:'generic', unverified:true, reason:'no-component'`).
 *
 * Unlike the sibling `kind-explicit-basic-routes` suite — eight different
 * plumbing shapes that honestly get the platform floor — this family is ONE
 * shape. Verified against the live `emitted_json_schema` of every member on
 * 2026-08-20 (project brsgrqvjdzwihsvnfqkf): identical core properties
 * `{ checked, summary, issues_found, evidence[], recommendations[] }`, with
 * only the `evidence[]` item properties differing per check. One shape ⇒ ONE
 * component (THE CANONICAL COMPONENT LAW), never 83 near-identical renderers.
 *
 * 🚨 FIXTURES ARE SCHEMA-DERIVED, NOT CANONICAL EXAMPLES. None of the 83 kinds
 * carries a `content_ir.kind_example` row or `sample_data` — the gap is logged
 * in docs/KIND_COMPONENT_LEDGER.md for the distillation/verification passes.
 * These payloads are built from each kind's LIVE registered schema (the plan's
 * standing rule: read the registry, never a sketch), which is enough to prove
 * the ROUTE and the COMPONENT. It is NOT enough to award `verified` maturity,
 * and this suite does not claim it.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The canonical markdown renderer resolves its content through a client-only
// pipeline, so `renderToStaticMarkup` yields its wrapper but not its prose.
// That is a HARNESS limit, not a product one — the summary renders in the
// browser (verified on /shapes/web_broken_images_v1/test, 2026-08-20). Stub it
// to its text so this suite can assert the thing it is actually responsible
// for: that the component hands the summary to the renderer at all.
jest.mock(
  "@/components/mardown-display/chat-markdown/BasicMarkdownContent",
  () => ({
    __esModule: true,
    BasicMarkdownContent: ({ content }: { content: string }) => {
      const react = require("react") as typeof React;
      return react.createElement("div", { "data-testid": "markdown" }, content);
    },
  }),
);

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
import WebAnalysisItemBlock from "@/components/mardown-display/blocks/web-analysis/WebAnalysisItemBlock";

const FAMILY_COMPONENT_KEY = "web_analysis_item";

interface Fixture {
  kind: string;
  data: Record<string, unknown>;
  /** Strings a reader must actually see rendered. */
  visible: string[];
}

const FIXTURES: Fixture[] = [
  {
    // Failing check with a UNIFORM evidence array — renders as a real table.
    kind: "web_broken_images_v1",
    data: {
      checked: 1420,
      issues_found: 3,
      summary:
        "Three images return a 404 across the crawled pages, so readers see a broken-image placeholder where the illustration should be.",
      evidence: [
        {
          src: "https://example.com/img/hero-old.png",
          http_status: 404,
          context: "Home page hero",
        },
        {
          src: "https://example.com/img/team-2019.jpg",
          http_status: 404,
          context: "About page",
        },
        {
          src: "https://example.com/img/logo-alt.svg",
          http_status: 410,
          context: "Footer",
        },
      ],
      recommendations: [
        "Re-upload the three missing files at their existing paths.",
        "Add a build check that fails when an <img> src 404s.",
      ],
    },
    visible: [
      "Broken images",
      "3 issues found",
      "1,420 checked",
      "broken-image placeholder",
      "hero-old.png",
      "Re-upload the three missing files",
    ],
  },
  {
    // PASSING check — the verdict must read as a pass, not an empty panel.
    kind: "web_https_enforcement_v1",
    data: {
      checked: 1420,
      issues_found: 0,
      summary: "Every HTTP URL redirects to its HTTPS equivalent in one hop.",
      evidence: [],
      recommendations: [],
    },
    visible: ["Https enforcement", "No issues found", "one hop"],
  },
  {
    // RAGGED evidence rows (no shared key set) — must still render, as titled
    // sections rather than a table. Singular issue wording.
    kind: "web_cwv_lcp_v1",
    data: {
      checked: 12,
      issues_found: 1,
      summary: "One template renders its largest element well past the budget.",
      evidence: [
        { url: "https://example.com/pricing", lcp_ms: 4180 },
        { note: "Lab run only; field data was not available for this origin." },
      ],
      recommendations: ["Preload the pricing hero image."],
    },
    visible: ["Cwv lcp", "1 issue found", "past the budget", "Preload the pricing hero image"],
  },
];

/** The registered family row, as the warm loader projects it. */
function registeredRow(kind: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey: FAMILY_COMPONENT_KEY,
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

describe("the web_analysis_item family routes to ONE registered component", () => {
  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] an unregistered check kind reaches the reader only by silent fallback", () => {
    kindRegistry.upsertDefinition({
      kind: "web_unregistered_probe_v1",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(
      kindBlock("web_unregistered_probe_v1", { summary: "x", issues_found: 0 }),
    );
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  it.each(FIXTURES.map((f) => [f.kind, f] as const))(
    "%s resolves by:'db' to the family component and renders its payload",
    (kind, fixture) => {
      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(kind)]);

      const routed = applyIrKindRoute(kindBlock(kind, fixture.data));

      // The resolver answered — no silent fallback, no `unverified` flag.
      expect(routed.type).toBe(FAMILY_COMPONENT_KEY);
      expect(markerOf(routed)).toEqual({
        by: "db",
        key: FAMILY_COMPONENT_KEY,
      });
      expect(markerOf(routed)?.unverified).toBeUndefined();
      // The raw region annotation is poison, not data.
      expect(routed.serverData).toBeUndefined();

      const markup = renderToStaticMarkup(
        <WebAnalysisItemBlock
          content={routed.content}
          metadata={routed.metadata}
        />,
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

  it("never swallows a payload that is not the family shape", () => {
    const markup = renderToStaticMarkup(
      <WebAnalysisItemBlock content="not json at all" metadata={undefined} />,
    );
    expect(markup).toContain("not json at all");
  });
});
