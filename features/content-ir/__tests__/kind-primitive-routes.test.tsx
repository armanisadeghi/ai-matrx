/**
 * Army: FE kind component routes — the PRIMITIVE kinds
 * (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`;
 * migrations/content_ir_primitive_kind_routes.sql).
 *
 * Eight workflow I/O primitives emitted by the Python engine — `boolean`,
 * `number`, `text`, `string_list`, `json`, `items`, `value`, `table_rows` —
 * used to reach the generic viewer by SILENT FALLBACK (marker
 * `by:'generic', unverified:true`). Each now carries an EXPLICIT
 * `(kind, 'web', 'output') -> generic_structured` row, so the RESOLVER
 * answers (`by:'db'`) — a decision on the record, not a fallback nobody chose.
 *
 * What these tests pin, using each kind's LIVE canonical `kind_example.data`
 * (read from content_ir on 2026-08-20, reproduced verbatim in PRIMITIVES):
 *
 *  1. the OBJECT primitives route through the resolver, not the fallback;
 *  2. every example renders its real content through the same component the
 *     production seam reaches (`GenericStructuredBlock` → StructuredValueView);
 *  3. the honest "no custom view yet" footer SURVIVES the explicit route —
 *     naming the generic viewer is not the same as having a renderer;
 *  4. the SCALAR primitives are recorded for what they are: a bare boolean /
 *     number cannot carry `__kind`, so no block-level route can ever claim one
 *     (`text`/`string_list` left this bucket with the 2026-08-21 object
 *     re-seed — v4 `{"text": str}` / `{"items": [str]}` — and now take the
 *     block path like every other object primitive). Their registered row is
 *     what makes
 *     `KindInstanceRender` treat them as routable; the value still renders on
 *     the platform floor. This is the honest ceiling of a basic route, and it
 *     is asserted rather than papered over.
 *
 * Maturity is deliberately NOT touched by any of this (§7.8): registering a
 * basic FE route does not promote a kind, and `verified` stays the
 * verification pass's to award.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The raw-data escape (`JsonInspector`) mounts through next/dynamic and only
// once a reader opens it, so static markup never contains it. Same stub the
// generic-fallback suite uses, so these tests stay about the VALUE on screen.
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
import {
  componentRegistry,
  resolveComponent,
} from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";

interface TestBlock {
  type: string;
  content: string;
  serverData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * The LIVE canonical examples (content_ir.kind_example.data, all
 * validation_status='passed'), split by what the render seam can actually do
 * with them. Anything not an object has no block path — by construction, not
 * by omission.
 */
const OBJECT_PRIMITIVES: ReadonlyArray<{
  kind: string;
  example: Record<string, unknown>;
  /** Substrings the reader must actually SEE. */
  expected: readonly string[];
}> = [
  {
    kind: "items",
    example: { count: 3, items: ["alpha", "beta", "gamma"], archetype: "items" },
    expected: ["alpha", "beta", "gamma"],
  },
  {
    kind: "value",
    example: { value: 42, archetype: "value" },
    expected: ["42"],
  },
  {
    kind: "table_rows",
    example: {
      row: {
        data: { name: "Acme", score: 42 },
        row_id: "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69",
      },
      rows: [
        {
          data: { name: "Acme", score: 42 },
          row_id: "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69",
        },
      ],
      count: 1,
      found: true,
      table_id: "b7e6a5d4-3c2b-4a19-8f7e-6d5c4b3a2919",
    },
    expected: ["Acme", "3f9b2a10-6c4e-4d2b-9a8f-1e2d3c4b5a69"],
  },
  {
    // `json`'s schema is `{}` — anything at all. Its canonical example is an
    // object, so it DOES take the block path.
    kind: "json",
    example: { nested: [1, "two"], anything: true },
    expected: ["two"],
  },
  {
    // Object since the 2026-08-21 re-seed (v4, `{"text": str}` mirroring
    // `markdown`) — the scalar `{"type":"string"}` registration was why no
    // node could ever declare it (audit break #4, closed).
    kind: "text",
    example: { text: "hello world" },
    expected: ["hello world"],
  },
  {
    // Object since the 2026-08-21 re-seed (v4, `{"items": [str]}`).
    kind: "string_list",
    example: { items: ["alpha", "beta"] },
    expected: ["alpha", "beta"],
  },
];

/** The bare scalars: no `__kind` carrier, therefore no block path.
 * (`text`/`string_list` graduated to OBJECT_PRIMITIVES with the 2026-08-21
 * object re-seed — only the true scalars remain at this ceiling.) */
const SCALAR_PRIMITIVES: ReadonlyArray<{ kind: string; example: unknown }> = [
  { kind: "boolean", example: true },
  { kind: "number", example: 42.5 },
];

function registerWarmDefinition(kind: string): void {
  kindRegistry.upsertDefinition({
    kind,
    schema: null,
    schemaSource: "content_ir",
    tier: "warm",
  });
}

/** The row migrations/content_ir_primitive_kind_routes.sql creates. */
function primitiveRouteRow(kind: string): KindComponentProjection {
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
    createdBy: null,
    createdAt: "2026-08-20T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
  };
}

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

function markerOf(block: { metadata?: Record<string, unknown> }) {
  return block.metadata?.[IR_ROUTE_KEY] as IrRouteMarker | undefined;
}

describe("primitive kinds: the explicit route replaces the silent fallback", () => {
  it.each(OBJECT_PRIMITIVES.map((p) => [p.kind] as const))(
    "[before] `%s` with no registered row falls back SILENTLY (by:'generic', unverified)",
    (kind) => {
      // ORDER-SENSITIVE, like the other registry suites: both registries are
      // module singletons and first-row-per-key wins, so this pre-ingest
      // assertion must run before the ingest below. It is the defect the
      // migration closes — pinned here so a regression is visible, not
      // inferred.
      registerWarmDefinition(kind);
      const routed = applyIrKindRoute(kindBlock(kind, { probe: 1 }));

      expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      expect(markerOf(routed)).toEqual({
        by: "generic",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
        unverified: true,
        reason: "no-component",
      });
    },
  );

  it("[after] every object primitive routes through the RESOLVER, stamping by:'db'", () => {
    componentRegistry.ingestDbRows(
      OBJECT_PRIMITIVES.map((p) => primitiveRouteRow(p.kind)),
    );

    for (const { kind, example } of OBJECT_PRIMITIVES) {
      const routed = applyIrKindRoute(kindBlock(kind, example));

      expect(routed.type).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      // The raw region's `{ language: "json" }` annotation is not kind data.
      expect(routed.serverData).toBeUndefined();
      expect(markerOf(routed)).toEqual({
        by: "db",
        key: GENERIC_STRUCTURED_COMPONENT_KEY,
      });
      // No fallback flag survives — the platform CHOSE this renderer.
      expect(markerOf(routed)?.unverified).toBeUndefined();
    }
  });
});

describe("primitive kinds render their canonical example for real", () => {
  function routedMarkup(kind: string, example: Record<string, unknown>) {
    registerWarmDefinition(kind);
    componentRegistry.ingestDbRows([primitiveRouteRow(kind)]);
    const routed = applyIrKindRoute(kindBlock(kind, example));
    return renderToStaticMarkup(
      <GenericStructuredBlock
        content={routed.content}
        metadata={routed.metadata}
      />,
    );
  }

  it.each(OBJECT_PRIMITIVES.map((p) => [p.kind, p] as const))(
    "`%s` shows the reader its actual content",
    (_kind, primitive) => {
      const markup = routedMarkup(primitive.kind, primitive.example);

      for (const needle of primitive.expected) {
        expect(markup).toContain(needle);
      }
      // Never the trap this replaces: a raw code block or hidden content.
      expect(markup).not.toContain("Unverified shape");
    },
  );

  it("keeps the honest footer — naming the generic viewer is not having a renderer", () => {
    const markup = routedMarkup("value", { value: 42, archetype: "value" });

    expect(markup).toContain("no custom view yet");
    expect(markup).toContain("Show the raw data");
  });
});

describe("scalar primitives: the honest ceiling of a basic route", () => {
  it.each(SCALAR_PRIMITIVES.map((p) => [p.kind, p.example] as const))(
    "`%s` cannot carry `__kind`, so no block-level route can claim it",
    (kind, example) => {
      // A bare boolean/number/string/array has nowhere to put a discriminator,
      // so `envelopeFromCompleteValue` cannot produce a kind-carrying object
      // region and `applyIrKindRoute` never runs on one. The registered row
      // still matters: it is what makes `kindIsRoutable(kind)` true in
      // KindInstanceRender, which is what stops the workflow readout from
      // showing the amber "no custom component" note for a value the platform
      // has, in fact, chosen a renderer for. The value itself renders on the
      // platform floor (StructuredValueView) — the same pixels either way.
      expect(typeof example === "object" && example !== null && !Array.isArray(example)).toBe(false);

      registerWarmDefinition(kind);
      componentRegistry.ingestDbRows([primitiveRouteRow(kind)]);

      const resolved = resolveComponent(kind, "web", "output");
      expect(resolved).not.toBeNull();
      expect(resolved?.componentKey).toBe(GENERIC_STRUCTURED_COMPONENT_KEY);
      expect(resolved?.isActive).toBe(true);
      expect(resolved?.resolvedBy).toBe("db");
    },
  );
});
