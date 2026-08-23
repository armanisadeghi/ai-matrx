/**
 * THE 12 TOOL-RESULT KIND ROUTES — claim `tools-reconcile-01`
 * (docs/KIND_COMPONENT_LEDGER.md; migrations/content_ir_tool_result_kind_routes.sql).
 *
 * These are the kinds the aidream TOOLS FAMILY SWEEP minted
 * (aidream/docs/workflow/KIND_TOOL_LEDGER.md batches 1-2). All twelve were
 * registered, resolving, and verified through a real tool dispatch — and all
 * twelve were stuck at `is_active=false`, failing the dual gate's RENDER leg
 * only: "no active role='output' kind_component row". So a `fs_list` result
 * reached the reader through the platform floor by SILENT fallback
 * (`applyIrKindRoute` -> `routeToGeneric`, marker `by:'generic',
 * unverified:true`), which is exactly the state the mission forbids.
 *
 * Each now carries an explicit `(kind,'web','output') -> generic_structured`
 * row, and all twelve activated (`content_ir.set_kind_activation`, gate green).
 *
 * WHY generic_structured and not a bespoke file view: every one of these is
 * maturity='placeholder' — an honest capture of a tool result's OUTER
 * structure. The repo's existing file-tree components render cloud-file rows
 * keyed by file_id, not a tool's `{path, entries[]}` payload; pointing them
 * here would be a new integration wearing a reuse costume. A bespoke view is
 * the distillation pass's call and is an UPGRADE of `component_key` on these
 * same rows (ledger rule 4 + rule 9 — maturity is untouched).
 *
 * Every assertion runs against the kind's LIVE canonical `kind_example.data`
 * (fixtures/tool-result-kind-examples.json, copied verbatim from content_ir).
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
import { envelopeFromCompleteValue, IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
import EXAMPLES from "./fixtures/tool-result-kind-examples.json";

const CANONICAL = EXAMPLES as Record<string, Record<string, unknown>>;

/** `needles` are strings the reader must actually SEE, nested children included. */
const TOOL_RESULT_KINDS: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  { kind: "tool_bundle_listing", needles: ["supabase", "execute_sql", "list_tables"] },
  // PINNED FINDING (mock, not defect): this kind's `content` — the file BODY —
  // is the one field that does NOT surface in this suite. The structured floor
  // hands a long multiline string to a lazily-loaded viewer, and this file's
  // `next/dynamic` mock stubs that viewer out. Asserting the body here would be
  // asserting the mock, so it is named instead of quietly dropped.
  { kind: "file_read_result", needles: ["notes/todo.md"] },
  { kind: "file_write_result", needles: ["notes/todo.md", "write"] },
  // nested: entries[] is a child kind and must render THROUGH the registry
  { kind: "directory_listing", needles: ["notes", "todo.md", "notes/todo.md"] },
  { kind: "directory_entry", needles: ["todo.md", "notes/todo.md"] },
  // nested: results[] -> file_search_match -> matches[]
  { kind: "file_search_results", needles: ["notes/todo.md", "ship the tools sweep"] },
  { kind: "file_search_match", needles: ["notes/todo.md", "ship the tools sweep"] },
  { kind: "file_edit_result", needles: ["src/main.py"] },
  // nested: edits_applied[] -> file_edit_applied
  { kind: "file_patch_result", needles: ["src/main.py", "replace"] },
  { kind: "file_edit_applied", needles: ["replace"] },
  { kind: "file_edit_failure", needles: ["old_text not found", "def gone("] },
  { kind: "directory_create_result", needles: ["notes/2026"] },
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
    updatedAt: "2026-08-23T00:00:00Z",
    createdBy: null,
    createdAt: "2026-08-23T00:00:00Z",
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

describe("the fixtures ARE the live canonical examples", () => {
  it("carries one canonical example per claimed kind", () => {
    expect(Object.keys(CANONICAL).sort()).toEqual(
      TOOL_RESULT_KINDS.map((f) => f.kind).sort(),
    );
  });

  it("every example carries its own __kind — the marker is part of the data", () => {
    for (const { kind } of TOOL_RESULT_KINDS) {
      expect(CANONICAL[kind].__kind).toBe(kind);
    }
  });
});

describe("the 12 tool-result kinds route EXPLICITLY, not by fallback", () => {
  it.each(TOOL_RESULT_KINDS.map((f) => [f.kind] as const))(
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
    componentRegistry.ingestDbRows(TOOL_RESULT_KINDS.map((f) => routeRow(f.kind)));

    for (const { kind } of TOOL_RESULT_KINDS) {
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

describe("the 12 tool-result kinds render their canonical example for real", () => {
  it.each(TOOL_RESULT_KINDS.map((f) => [f.kind, f] as const))(
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
