/**
 * The fourteen keyword RULING SESSION kinds (`aidream/kinds/seo_ruling_session.py`)
 * and the render leg they were missing.
 *
 * Live registry, 2026-09-30 (project brsgrqvjdzwihsvnfqkf): all fourteen were
 * published with a schema and a passing example and held `is_active = false`,
 * `content_ir.evaluate_kind_activation` naming ONE missing leg each —
 * `render: no active role='output' kind_component row`. The rows are aidream
 * migration `20260930030000_seo_ruling_session_kinds_get_their_components.sql`
 * (component_key = the slug, source='bundled'); this suite proves each key
 * resolves in this repo's dispatch and renders a real component, never the
 * `generic_structured` floor.
 *
 * The fixtures are NOT hand-written payloads: every collection is produced by
 * the real builder the Ruling Session sends to the agents
 * (`features/marketing/seo/value-system/workbench/session/trial.ts`), so the
 * shape tested is the shape that travels.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";

import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
  IR_ROUTE_KEY,
  type IrRouteMarker,
} from "../react/kind-route";
import { componentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import { resolveBlockDispatch } from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";
import {
  envelopeFromCompleteValue,
  IR_ENVELOPE_KEY,
} from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import type { ResultKindBlockProps } from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import {
  SeoRulingConfirmationBlock,
  SeoRulingCorrectionBlock,
  SeoRulingDimensionBlock,
  SeoRulingExampleBlock,
  SeoRulingKeywordBlock,
  SeoRulingMatcherBlock,
  SeoRulingMatcherHitBlock,
} from "@/components/mardown-display/blocks/seo-ruling-kinds/SeoRulingItemBlocks";
import {
  SEO_RULING_COLLECTIONS,
  SEO_RULING_VISIBLE_ROWS,
  SeoRulingConfirmationSetBlock,
  SeoRulingCorrectionSetBlock,
  SeoRulingDimensionCatalogBlock,
  SeoRulingExampleSetBlock,
  SeoRulingKeywordSetBlock,
  SeoRulingMatcherHitSetBlock,
  SeoRulingMatcherSetBlock,
} from "@/components/mardown-display/blocks/seo-ruling-kinds/SeoRulingSetBlocks";
import {
  confirmationsPayload,
  correctionsPayload,
  dimensionCatalogPayload,
  existingMatchersPayload,
  humanExamplesPayload,
  keywordsPayload,
  matcherHitsPayload,
  type SessionRuling,
  type TrialProposal,
  type TrialVerdict,
} from "@/features/marketing/seo/value-system/workbench/session/trial";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

function mount(node: React.ReactNode): string {
  const store = configureStore({ reducer: { userAuth: userAuthReducer } });
  return renderToStaticMarkup(<Provider store={store}>{node}</Provider>);
}

function registeredRow(kind: string): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey: kind,
    source: "bundled",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-09-30T00:00:00Z",
    createdAt: "2026-09-30T00:00:00Z",
    createdBy: null,
    id: "00000000-0000-0000-0000-000000000000",
  };
}

function kindBlock(kind: string, value: Record<string, unknown>) {
  const complete = { ...value, __kind: kind };
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

/* ---------------------------------------- real inputs, through the real builders */

const RULINGS: SessionRuling[] = [
  {
    keywordId: "kw-1",
    phrase: "crt tv recycling near me",
    dimensionSlug: "intent",
    dimensionLabel: "Intent",
    valueId: "v-local",
    valueSlug: "local",
    valueLabel: "Local",
    reason: "near me means they want a drop-off close by.",
  },
];

const DIMENSIONS = [
  {
    slug: "intent",
    label: "Intent",
    description: "What the searcher is trying to do.",
    values: [
      {
        key: "local",
        label: "Local",
        description: "Wants a place nearby.",
        abstain: false,
      },
      { key: "research", label: "Research", description: null, abstain: false },
      { key: "unsure", label: "Unsure", description: null, abstain: true },
    ],
  },
] as unknown as FacetDimension[];

const RULE_PROPOSAL: TrialProposal = {
  keywordId: "kw-2",
  keyword: "crt tv recycling los angeles",
  clicks: 3,
  impressions: 140,
  source: "rule",
  valueId: "v-local",
  valueSlug: "local",
  valueLabel: "Local",
  reason: "Your own rule.",
  matcherKind: "contains",
  matcherPattern: "los angeles",
};

const AI_PROPOSAL: TrialProposal = {
  ...RULE_PROPOSAL,
  keywordId: "kw-3",
  keyword: "how are crt tvs recycled",
  source: "ai",
  matcherKind: null,
  matcherPattern: null,
};

const VERDICTS: TrialVerdict[] = [
  { proposal: RULE_PROPOSAL, status: "right" },
  {
    proposal: AI_PROPOSAL,
    status: "wrong",
    correctedValueId: "v-research",
    correctedValueSlug: "research",
    correctedValueLabel: "Research",
    correctionReason: "They want to learn the process, not find a drop-off.",
  },
];

interface Case {
  kind: string;
  Component: React.FC<ResultKindBlockProps>;
  data: Record<string, unknown>;
  visible: string[];
}

const COLLECTION_CASES: Case[] = [
  {
    kind: "seo_ruling_keyword_set",
    Component: SeoRulingKeywordSetBlock,
    data: keywordsPayload([
      {
        keywordId: "kw-1",
        keyword: "crt tv recycling near me",
        clicks: 14,
        impressions: 820,
      },
    ]) as unknown as Record<string, unknown>,
    visible: [
      "Keywords to rule",
      "crt tv recycling near me",
      "14",
      "820",
      "clicks",
    ],
  },
  {
    kind: "seo_ruling_example_set",
    Component: SeoRulingExampleSetBlock,
    data: humanExamplesPayload(RULINGS) as unknown as Record<string, unknown>,
    visible: [
      "Your rulings",
      "crt tv recycling near me",
      "Intent",
      "Local",
      "drop-off close by",
    ],
  },
  {
    kind: "seo_ruling_dimension_catalog",
    Component: SeoRulingDimensionCatalogBlock,
    data: dimensionCatalogPayload(DIMENSIONS) as unknown as Record<
      string,
      unknown
    >,
    visible: [
      "Allowed values",
      "Intent",
      "What the searcher is trying to do.",
      "Local",
      "Wants a place nearby.",
      "Research",
      "2 values allowed",
    ],
  },
  {
    kind: "seo_ruling_matcher_hit_set",
    Component: SeoRulingMatcherHitSetBlock,
    data: matcherHitsPayload([RULE_PROPOSAL, AI_PROPOSAL]) as unknown as Record<
      string,
      unknown
    >,
    visible: [
      "Already explained by your rules",
      "crt tv recycling los angeles",
      "contains",
      "los angeles",
      "local",
    ],
  },
  {
    kind: "seo_ruling_correction_set",
    Component: SeoRulingCorrectionSetBlock,
    data: correctionsPayload(VERDICTS) as unknown as Record<string, unknown>,
    visible: [
      "Corrections",
      "how are crt tvs recycled",
      "Local",
      "Research",
      "learn the process",
    ],
  },
  {
    kind: "seo_ruling_confirmation_set",
    Component: SeoRulingConfirmationSetBlock,
    data: confirmationsPayload(VERDICTS) as unknown as Record<string, unknown>,
    visible: ["Confirmed right", "crt tv recycling los angeles", "Local"],
  },
  {
    kind: "seo_ruling_matcher_set",
    Component: SeoRulingMatcherSetBlock,
    data: existingMatchersPayload(VERDICTS) as unknown as Record<
      string,
      unknown
    >,
    visible: ["Rules in play", "contains", "los angeles", "local"],
  },
];

const ITEM_CASES: Case[] = [
  {
    kind: "seo_ruling_keyword",
    Component: SeoRulingKeywordBlock,
    data: {
      keyword_id: "kw-1",
      phrase: "crt tv recycling near me",
      clicks: 14,
      impressions: 820,
    },
    visible: ["crt tv recycling near me", "14", "820"],
  },
  {
    kind: "seo_ruling_example",
    Component: SeoRulingExampleBlock,
    data: (humanExamplesPayload(RULINGS).examples ??
      [])[0] as unknown as Record<string, unknown>,
    visible: ["crt tv recycling near me", "Intent", "Local"],
  },
  {
    kind: "seo_ruling_dimension",
    Component: SeoRulingDimensionBlock,
    data: (dimensionCatalogPayload(DIMENSIONS).dimensions ??
      [])[0] as unknown as Record<string, unknown>,
    visible: ["Intent", "Local", "Research"],
  },
  {
    kind: "seo_ruling_matcher_hit",
    Component: SeoRulingMatcherHitBlock,
    data: {
      phrase: "crt tv recycling los angeles",
      value_slug: "local",
      matcher_kind: "contains",
      pattern: "los angeles",
    },
    visible: ["crt tv recycling los angeles", "local", "los angeles"],
  },
  {
    kind: "seo_ruling_correction",
    Component: SeoRulingCorrectionBlock,
    data: (correctionsPayload(VERDICTS).corrections ??
      [])[0] as unknown as Record<string, unknown>,
    visible: [
      "how are crt tvs recycled",
      "Local",
      "Research",
      "learn the process",
    ],
  },
  {
    kind: "seo_ruling_confirmation",
    Component: SeoRulingConfirmationBlock,
    data: {
      phrase: "crt tv recycling near me",
      value_slug: "local",
      value_label: "Local",
    },
    visible: ["crt tv recycling near me", "Local"],
  },
  {
    kind: "seo_ruling_matcher",
    Component: SeoRulingMatcherBlock,
    data: { value_slug: "local", matcher_kind: "word", pattern: "near" },
    visible: ["contains the word", "near", "local"],
  },
];

const ALL_CASES = [...COLLECTION_CASES, ...ITEM_CASES];

describe("the keyword Ruling Session kinds route to their own components", () => {
  it("covers all fourteen kinds", () => {
    expect(new Set(ALL_CASES.map((c) => c.kind)).size).toBe(14);
  });

  it("[before] a kind with no component row reaches the reader only by silent fallback", () => {
    kindRegistry.upsertDefinition({
      kind: "seo_ruling_keyword_set",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(
      kindBlock("seo_ruling_keyword_set", { keywords: [] }),
    );
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  it.each(ALL_CASES.map((c) => [c.kind, c] as const))(
    "%s: its component key resolves in the dispatch, routes, and renders",
    (kind, c) => {
      expect(resolveBlockDispatch(kind)).not.toBeNull();

      kindRegistry.upsertDefinition({
        kind,
        schema: null,
        schemaSource: "content_ir",
        tier: "warm",
      });
      componentRegistry.ingestDbRows([registeredRow(kind)]);
      const routed = applyIrKindRoute(kindBlock(kind, c.data));
      expect(routed.type).toBe(kind);
      expect(markerOf(routed)?.key).toBe(kind);
      expect(markerOf(routed)?.unverified).toBeUndefined();

      const markup = mount(
        <c.Component content={routed.content} metadata={routed.metadata} />,
      );
      for (const text of c.visible) expect(markup).toContain(text);
      expect(markup).not.toContain("no custom view yet");
      expect(markup).not.toContain("Unverified shape");
    },
  );

  it.each(Object.entries(SEO_RULING_COLLECTIONS))(
    "%s: an empty list says what the absence means instead of rendering blank",
    (kind, spec) => {
      const found = COLLECTION_CASES.find((c) => c.kind === kind);
      if (!found) throw new Error(`no case for ${kind}`);
      const Component = found.Component;
      const markup = mount(
        <Component
          content={JSON.stringify({ __kind: kind, [spec.field]: [] })}
        />,
      );
      expect(markup).toContain(spec.empty.replace(/'/g, "&#x27;"));
    },
  );

  it("a long list shows the first rows and names how many more there are", () => {
    const rows = Array.from(
      { length: SEO_RULING_VISIBLE_ROWS + 5 },
      (_, i) => ({
        keywordId: `kw-${i}`,
        keyword: `keyword number ${i}`,
        clicks: i,
        impressions: i * 10,
      }),
    );
    const markup = mount(
      <SeoRulingKeywordSetBlock
        content={JSON.stringify(keywordsPayload(rows))}
      />,
    );
    expect(markup).toContain(`keyword number ${SEO_RULING_VISIBLE_ROWS - 1}`);
    expect(markup).not.toContain(`keyword number ${SEO_RULING_VISIBLE_ROWS}<`);
    expect(markup).toContain("5 more");
  });

  it("an unparseable region is shown verbatim, never swallowed", () => {
    const markup = mount(
      <SeoRulingKeywordSetBlock content="not json at all" />,
    );
    expect(markup).toContain("not json at all");
  });
});
