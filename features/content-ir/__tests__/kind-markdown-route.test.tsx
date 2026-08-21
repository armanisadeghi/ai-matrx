/**
 * THE `markdown` KIND ROUTE — the streaming markdown renderer, registered.
 *
 * `markdown` (`{ text: string }`) is the shape the agent output contract folds
 * prose into: 99% of every agent result is `content = [one markdown instance]`
 * (KINDS_EVERYWHERE_PLAN.md §6). It carried NO `(kind,'web','output')` row, so
 * it reached the reader by SILENT FALLBACK (`by:'generic', unverified:true`)
 * and the generic viewer printed the field label "Text" above the reader's own
 * document, markdown source unrendered.
 *
 * Arman's two-path render law — "official declared kind component, or streaming
 * markdown — that's it" (WORKFLOW_KINDS_DESIGN.md §4) — collapses into ONE path
 * by making the second path a kind whose component IS MarkdownStream. This
 * suite pins that: the route resolves `by:'db'` to `markdown_stream`, and the
 * component hands the instance's `text` to the streaming renderer VERBATIM.
 *
 * The payload below is the LIVE canonical `content_ir.kind_example` (row
 * 319e024c-a9e8-4197-85a6-e59c233ce914, `validation_status='passed'`, read from
 * project brsgrqvjdzwihsvnfqkf on 2026-08-21), and it is re-validated here
 * against the LIVE `emitted_json_schema` through the dual gate's own structural
 * leg — with a negative control, so the assertion is proven to bite.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// MarkdownStream is a client-only dynamic import (`ssr:false`), so under
// `renderToStaticMarkup` the real engine emits nothing. Stub it to its content
// — this suite's job is to prove the ROUTE hands the markdown to that engine,
// not to re-test the engine. The rendered prose was confirmed in the browser
// (see the ledger's live-verification note).
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => {
    const react = require("react") as typeof React;
    return react.createElement(
      "div",
      { "data-testid": "markdown-stream" },
      content,
    );
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
import { validateStructuralLeg } from "../registry/kind-dual-gate";
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import MarkdownKindBlock from "@/components/mardown-display/blocks/markdown/MarkdownKindBlock";

const MARKDOWN_COMPONENT_KEY = "markdown_stream";

/** The kind's LIVE `emitted_json_schema` (read from the registry, not sketched). */
const LIVE_SCHEMA = {
  type: "object",
  title: "Markdown",
  required: ["text"],
  properties: {
    text: { type: "string", title: "Text" },
    __kind: {
      type: "string",
      const: "markdown",
      title: "Kind",
      default: "markdown",
      description: "The registered kind this payload is an instance of.",
    },
  },
  description: "A block of markdown prose. Rendered by the streaming markdown renderer.",
  additionalProperties: false,
} as const;

/** The LIVE canonical `kind_example.data`, verbatim. */
const CANONICAL_EXAMPLE = {
  __kind: "markdown",
  text: "## Findings\n\nThe run completed with **3 warnings**.",
};

/** The registered row, as the warm loader projects it. */
const registeredRow: KindComponentProjection = {
  kind: "markdown",
  platform: "web",
  role: "output",
  componentKey: MARKDOWN_COMPONENT_KEY,
  source: "bundled",
  isActive: true,
  config: {},
  componentSource: null,
  propsTransform: null,
  pinnedKindVersion: null,
  updatedAt: "2026-08-21T00:00:00Z",
  createdAt: "2026-08-21T00:00:00Z",
  createdBy: null,
  id: "00000000-0000-0000-0000-000000000000",
};

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

describe("the markdown kind routes to the streaming markdown renderer", () => {
  it("the canonical example really validates against the live schema", () => {
    expect(validateStructuralLeg(CANONICAL_EXAMPLE, LIVE_SCHEMA)).toEqual({
      ok: true,
    });
  });

  it("[negative control] a non-conforming payload is REJECTED by that same leg", () => {
    // `text` is required and must be a string; `additionalProperties: false`.
    expect(
      validateStructuralLeg({ __kind: "markdown", text: 42 }, LIVE_SCHEMA).ok,
    ).toBe(false);
    expect(
      validateStructuralLeg({ __kind: "markdown", body: "hi" }, LIVE_SCHEMA).ok,
    ).toBe(false);
  });

  // ORDER-SENSITIVE, like the sibling suites: both registries are module
  // singletons, so the pre-registration assertion runs before any ingest.
  it("[before] without the row, markdown reached the reader by SILENT fallback", () => {
    kindRegistry.upsertDefinition({
      kind: "markdown",
      schema: null,
      schemaSource: "content_ir",
      tier: "warm",
    });
    const routed = applyIrKindRoute(kindBlock("markdown", CANONICAL_EXAMPLE));
    expect(markerOf(routed)).toEqual({
      by: "generic",
      key: GENERIC_STRUCTURED_COMPONENT_KEY,
      unverified: true,
      reason: "no-component",
    });
  });

  it("[after] resolves by:'db' to markdown_stream and renders the prose", () => {
    componentRegistry.ingestDbRows([registeredRow]);

    const routed = applyIrKindRoute(kindBlock("markdown", CANONICAL_EXAMPLE));

    expect(routed.type).toBe(MARKDOWN_COMPONENT_KEY);
    expect(markerOf(routed)).toEqual({
      by: "db",
      key: MARKDOWN_COMPONENT_KEY,
    });
    expect(markerOf(routed)?.unverified).toBeUndefined();
    // The raw region annotation is poison, not data.
    expect(routed.serverData).toBeUndefined();

    const markup = renderToStaticMarkup(
      <MarkdownKindBlock content={routed.content} metadata={routed.metadata} />,
    );

    // The text reaches MarkdownStream VERBATIM — markdown syntax intact, so
    // the engine renders a heading and bold, not escaped source.
    expect(markup).toContain("## Findings");
    expect(markup).toContain("**3 warnings**");
    // …and the JSON wrapper NEVER reaches the reader.
    expect(markup).not.toContain("__kind");
    expect(markup).not.toContain('"text"');
    // A real renderer IS registered, so the floor's honesty line must not show.
    expect(markup).not.toContain("no custom view yet");
    expect(markup).not.toContain("Unverified shape");
  });

  it("never swallows a payload that is not the markdown shape", () => {
    const markup = renderToStaticMarkup(
      <MarkdownKindBlock content="not json at all" metadata={undefined} />,
    );
    expect(markup).toContain("not json at all");
  });

  it("renders a partial instance's text as it arrives, and nothing when empty", () => {
    const partial = renderToStaticMarkup(
      <MarkdownKindBlock
        content={JSON.stringify({ __kind: "markdown", text: "# Half a doc" })}
        metadata={undefined}
        isStreamActive
      />,
    );
    expect(partial).toContain("# Half a doc");

    // An instance with no text yet is "nothing to show", not an error box.
    expect(
      renderToStaticMarkup(
        <MarkdownKindBlock content="" metadata={undefined} isStreamActive />,
      ),
    ).toBe("");
  });
});
