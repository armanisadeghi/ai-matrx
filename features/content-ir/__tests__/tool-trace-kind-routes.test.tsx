/**
 * THE 11 TRACE-DEBUGGING KIND ROUTES — claim `tools-reconcile-01`
 * (docs/KIND_COMPONENT_LEDGER.md; migrations/content_ir_tool_trace_kind_routes.sql).
 *
 * The kinds the aidream TOOLS FAMILY SWEEP batch 3 minted for the trace-debugging
 * tools — the tool system observing itself (aidream/docs/workflow/KIND_TOOL_LEDGER.md,
 * agent `claude-tools-02`). Registered inactive, failing the dual gate's RENDER
 * leg only; each now carries an explicit `(kind,'web','output') ->
 * generic_structured` row and all 11 activated.
 *
 * WHY generic_structured: nothing in this repo renders `cx_tool_trace` rows as a
 * kind — the admin trace surfaces read the REST routes and draw their own tables,
 * so they are not kind components and repointing them is a larger, separate
 * change. A bespoke timeline view for `tool_trace_event_page` is a good future
 * UPGRADE of `component_key` on this same row, not a second registration
 * (ledger rule 4 + rule 9 — maturity stays `placeholder`).
 *
 * Every assertion runs against the kind's LIVE canonical `kind_example.data`
 * (fixtures/tool-trace-kind-examples.json, pulled verbatim from content_ir).
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
import EXAMPLES from "./fixtures/tool-trace-kind-examples.json";

const CANONICAL = EXAMPLES as Record<string, Record<string, unknown>>;

/** `needles` are strings the reader must actually SEE, nested children included. */
const TOOL_RESULT_KINDS: ReadonlyArray<{ kind: string; needles: readonly string[] }> = [
  // nested: events[] -> tool_trace_event
  {
    kind: "tool_trace_event_page",
    needles: ["fs_read", "not_found", "no such file: notes/missing.md"],
  },
  { kind: "tool_trace_event", needles: ["fs_read", "not_found", "call_ah82ks"] },
  // nested: events[] -> tool_trace_event AND tool_call -> tool_call_record
  {
    kind: "tool_trace_call_detail",
    needles: ["call_ah82ks", "fs_read", "completed"],
  },
  { kind: "tool_call_record", needles: ["fs_read", "call_ah82ks", "completed"] },
  // nested: files[] -> tool_trace_file
  {
    kind: "tool_trace_file_listing",
    needles: ["tool-trace-2026-08-23_18-04-11.log", "/srv/app/.matrx-debug"],
  },
  { kind: "tool_trace_file", needles: ["tool-trace-2026-08-23_18-04-11.log"] },
  {
    kind: "tool_trace_file_window",
    needles: ["tool-trace-2026-08-23_18-04-11.log"],
  },
  {
    kind: "tool_trace_incident_report",
    needles: ["fs_read|not_found|no such file", "tool-trace-incident"],
  },
  // nested: incidents[] -> tool_trace_incident AND filter -> tool_trace_incident_filter
  {
    kind: "tool_trace_incident_list",
    needles: ["tool:fs_read", "pending", "fs_"],
  },
  { kind: "tool_trace_incident", needles: ["tool:fs_read", "pending"] },
  { kind: "tool_trace_incident_filter", needles: ["fs_"] },
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

describe("the 11 trace-debugging kinds route EXPLICITLY, not by fallback", () => {
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

describe("the 11 trace-debugging kinds render their canonical example for real", () => {
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
