/**
 * THE LEG-3 RENDER PROBE — the render half of the kinds VERIFICATION PASS.
 *
 * Plan of record: `common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md`
 * §7.8 (maturity tiers). A kind is `verified` only when four legs hold, and
 * leg 3 is RENDERED: a REAL payload (the kind's canonical example) renders
 * through its registered `(kind, 'web', 'output')` component via the CANONICAL
 * dispatch — `applyIrKindRoute` → `resolveBlockDispatch` → mount.
 *
 * This file is not a test of the repo; it is a HARNESS the Python driver
 * (`aidream/scripts/verify_kinds.py`) invokes. It runs under jest only because
 * jest is the one place in this repo where jsdom + the `@/` alias + the lazy
 * block-dispatch table all resolve — there is no standalone CLI that can mount
 * a Next-flavoured component. Driven by two env vars:
 *
 *   KIND_VERIFY_JOB=/abs/path/job.json   payloads + live kind_component rows
 *   KIND_VERIFY_OUT=/abs/path/out.json   per-kind leg-3 results
 *
 * With no job it self-skips, so a plain `pnpm test:content-ir` run is unaffected.
 *
 * WHAT COUNTS AS A PASS (all of them, or the kind fails leg 3):
 *   1. the route marker is `by: 'compiled' | 'db'` — NOT `by: 'generic'`, which
 *      is the silent floor and carries `unverified: true`;
 *   2. the resolved component key is not `generic_structured` (a kind whose
 *      ONLY route IS the floor is reported `floor_only`, never `verified`);
 *   3. `resolveBlockDispatch(routed.type)` finds a registered renderer — a route
 *      pointing at a component nobody registered is exactly the failure this
 *      probe exists to catch;
 *   4. mounting that renderer with the real payload produces non-empty markup
 *      and does not throw.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";

// The raw-data escape (`JsonInspector`) and other next/dynamic boundaries never
// mount in static markup; stub them so the probe measures the VALUE on screen,
// exactly as generic-structured-fallback.test.tsx does.
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
import {
  resolveBlockDispatch,
  type BlockDispatchContext,
} from "@/components/mardown-display/chat-markdown/block-registry/block-dispatch";

interface JobRow {
  kind: string;
  version: number;
  schema: Record<string, unknown> | null;
  payload: Record<string, unknown>;
  dbRows: Array<Partial<KindComponentProjection>>;
}

interface ProbeResult {
  kind: string;
  ok: boolean;
  /** verdict: pass | floor_only | no_route | unregistered_component | render_error | no_markup */
  verdict: string;
  routedType: string | null;
  marker: IrRouteMarker | null;
  markupChars: number;
  detail: string | null;
}

function projection(kind: string, row: Partial<KindComponentProjection>): KindComponentProjection {
  return {
    kind,
    platform: "web",
    role: "output",
    componentKey: "generic_structured",
    source: "bundled",
    isActive: true,
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
    ...row,
  } as KindComponentProjection;
}

/** The dispatch context a block renderer receives on the run page / in chat. */
function dispatchContext(block: { type: string; content: string; serverData?: unknown; metadata?: unknown }): BlockDispatchContext {
  return {
    block: block as never,
    index: 0,
    isStreamActive: false,
    hideReasoning: false,
    hideToolResults: false,
    replaceBlockContent: () => undefined,
    renderBasicMarkdown: (content: string) => React.createElement("div", null, content),
  } as BlockDispatchContext;
}

/**
 * Real app providers around the mount. Several registered kind components are
 * connected (`useAppSelector`), and "no <Provider>" is a HARNESS gap, not a
 * defect in the kind — without this they would all report `render_error` and
 * the pass would refuse kinds that render perfectly well in the app. Built
 * lazily and once; if the store module cannot load under jest the probe falls
 * back to a bare mount and the resulting error is reported honestly.
 */
let providerWrap: ((el: React.ReactElement) => React.ReactElement) | null = null;
function withProviders(el: React.ReactElement): React.ReactElement {
  if (providerWrap === null) {
    try {
      const { Provider } = require("react-redux") as typeof import("react-redux");
      const { makeStore } = require("@/lib/redux/store") as { makeStore: () => unknown };
      const store = makeStore();
      providerWrap = (child) =>
        React.createElement(Provider, { store: store as never }, child);
    } catch {
      providerWrap = (child) => child;
    }
  }
  return providerWrap(el);
}

function probeOne(row: JobRow): ProbeResult {
  const base: ProbeResult = {
    kind: row.kind,
    ok: false,
    verdict: "no_route",
    routedType: null,
    marker: null,
    markupChars: 0,
    detail: null,
  };

  kindRegistry.upsertDefinition({
    kind: row.kind,
    schema: (row.schema ?? null) as never,
    schemaSource: "content_ir",
    tier: "warm",
  });
  if (row.dbRows.length) {
    componentRegistry.ingestDbRows(row.dbRows.map((r) => projection(row.kind, r)));
  }

  const complete = { __kind: row.kind, ...row.payload };
  const content = JSON.stringify(complete);
  const block = {
    type: "code",
    content,
    serverData: { language: "json" },
    metadata: { [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(complete, row.kind) },
  };

  let routed: typeof block;
  try {
    routed = applyIrKindRoute(block) as typeof block;
  } catch (err) {
    return { ...base, verdict: "render_error", detail: `applyIrKindRoute threw: ${String(err)}` };
  }
  const marker = (routed.metadata as Record<string, unknown> | undefined)?.[IR_ROUTE_KEY] as
    | IrRouteMarker
    | undefined;
  base.routedType = routed.type;
  base.marker = marker ?? null;

  if (!marker || marker.by === "generic") {
    // Silent floor, or the route never fired at all.
    return {
      ...base,
      verdict: marker ? "no_route" : "no_route",
      detail: marker
        ? `fell to the generic floor (reason=${(marker as { reason?: string }).reason ?? "?"})`
        : "applyIrKindRoute left the block untouched — no envelope/kind resolution",
    };
  }
  if (marker.key === GENERIC_STRUCTURED_COMPONENT_KEY) {
    return { ...base, verdict: "floor_only", detail: "only registered route IS generic_structured" };
  }

  const renderFn = resolveBlockDispatch(routed.type);
  if (!renderFn) {
    return {
      ...base,
      verdict: "unregistered_component",
      detail: `route names component '${routed.type}' but resolveBlockDispatch has no entry for it`,
    };
  }

  let markup = "";
  try {
    const element = renderFn(dispatchContext(routed));
    markup = element ? renderToStaticMarkup(withProviders(element)) : "";
  } catch (err) {
    return { ...base, verdict: "render_error", detail: String(err).slice(0, 400) };
  }
  if (markup.trim().length === 0) {
    return { ...base, verdict: "no_markup", detail: "component mounted but produced empty markup" };
  }
  return { ...base, ok: true, verdict: "pass", markupChars: markup.length, detail: null };
}

const jobPath = process.env.KIND_VERIFY_JOB;
const outPath = process.env.KIND_VERIFY_OUT;

describe("kind render probe (leg 3)", () => {
  if (!jobPath || !outPath) {
    it("self-skips with no KIND_VERIFY_JOB / KIND_VERIFY_OUT", () => {
      expect(true).toBe(true);
    });
    return;
  }

  it("probes every kind in the job and writes the verdicts", () => {
    const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as { kinds: JobRow[] };
    const results = job.kinds.map((row) => {
      try {
        return probeOne(row);
      } catch (err) {
        return {
          kind: row.kind,
          ok: false,
          verdict: "render_error",
          routedType: null,
          marker: null,
          markupChars: 0,
          detail: `probe threw: ${String(err).slice(0, 400)}`,
        } as ProbeResult;
      }
    });
    fs.writeFileSync(outPath, JSON.stringify({ results }, null, 2));
    // The probe REPORTS; the Python driver decides. A failing kind is a
    // finding, not a broken test run.
    expect(results.length).toBe(job.kinds.length);
  });
});
