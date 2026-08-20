/**
 * emitRenderer.test.tsx — fixture-driven sanity for the workflow-emit renderer.
 *
 * Covers the two load-bearing, mock-light pieces:
 *
 *   1. compileEmitRenderer — the REUSED Babel sandbox (`compileSlotComponent` +
 *      the fixed allow-list) actually compiles a representative agent-authored
 *      emit component and renders it with the canonical `EmitRendererProps`.
 *      This is the security spine — if the reuse ever broke, this fails.
 *   2. emitRendererCache — fetch+compile dedup, positive caching, and
 *      negative caching on a missing row, with `fetchEmitRendererRow` mocked
 *      (so no Supabase client is needed).
 *   3. The D115 invalidation consumer — an agent editing a `tool_ui` row fires
 *      `INVALIDATION_KEYS.dbToolRenderers`, and THIS cache must drop the ref
 *      and bump its version so a mounted emission re-resolves in session.

 *
 * The heavy generic-body component (ResultValue / MarkdownStream tree) is
 * intentionally NOT rendered here — that's UI, not the sandbox/cache contract.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileEmitRenderer } from "../compileEmitRenderer";
import type { EmitRendererProps, NodeEmittedEvent } from "../types";

/**
 * ONE shared row-fetch mock for the whole file. `jest.mock` is hoisted to
 * module scope, so a second `jest.mock` for the same path inside a describe
 * would replace this factory and detach the first block's spy — the failure
 * that made this a module-level constant.
 */
const mockFetch = jest.fn();
jest.mock("../fetchEmitRendererRow", () => ({
  fetchEmitRendererRow: (ref: string) => mockFetch(ref),
}));

// A frozen fixture matching the backend `node_emitted` contract exactly.
const FIXTURE_EVENT: NodeEmittedEvent = {
  event: "node_emitted",
  run_id: "run-123",
  step: 4,
  node_id: "node-summarize",
  attempt: 1,
  mode: "summary",
  payload: { headline: "All systems go", count: 3 },
  component_ref: "workflow_status_card",
  surface: "matrx-user/workflow",
  title: "Status",
};

function propsFromEvent(event: NodeEmittedEvent, seq: number): EmitRendererProps {
  return {
    mode: event.mode,
    payload: event.payload,
    title: event.title,
    nodeId: event.node_id,
    runId: event.run_id,
    seq,
    isPersisted: false,
  };
}

describe("compileEmitRenderer (reused Babel sandbox)", () => {
  it("compiles an agent-authored emit component using only the allow-list", () => {
    // Representative author code: TSX, an `export default`, a lucide icon and a
    // bare `import` line (stripped by the sandbox), reading EmitRendererProps.
    const code = `
      import { CheckCircle2 } from "lucide-react";
      export default function StatusCard({ payload, title }) {
        const headline = (payload && payload.headline) || "n/a";
        return (
          <div data-testid="custom-emit">
            <span>{title}</span>
            <strong>{headline}</strong>
            <CheckCircle2 />
          </div>
        );
      }
    `;

    const { Component, error } = compileEmitRenderer(code, [
      "react",
      "lucide-react",
    ]);

    expect(error).toBeNull();
    expect(Component).toBeTruthy();

    const html = renderToStaticMarkup(
      React.createElement(Component!, propsFromEvent(FIXTURE_EVENT, 0)),
    );
    expect(html).toContain("data-testid=\"custom-emit\"");
    expect(html).toContain("Status");
    expect(html).toContain("All systems go");
  });

  it("returns {Component:null,error:null} for empty code (no row authored)", () => {
    const { Component, error } = compileEmitRenderer("", []);
    expect(Component).toBeNull();
    expect(error).toBeNull();
  });
});

describe("emitRendererCache", () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
  });

  it("dedups concurrent loads and positive-caches the compiled component", async () => {
    mockFetch.mockResolvedValue({
      inline_code:
        "export default function C({ title }) { return <div>{title}</div>; }",
      allowed_imports: ["react"],
    });

    const cache = await import("../emitRendererCache");

    const [a, b] = await Promise.all([
      cache.loadEmitRenderer("ref_a"),
      cache.loadEmitRenderer("ref_a"),
    ]);

    expect(a).toBeTruthy();
    expect(a).toBe(b); // same compiled component reference (deduped + cached)
    expect(mockFetch).toHaveBeenCalledTimes(1); // one fetch despite two callers
    expect(cache.getCachedEmitRenderer("ref_a")).toBe(a);
    expect(cache.isKnownNoEmitRenderer("ref_a")).toBe(false);
  });

  it("negative-caches a missing row so future loads skip the fetch", async () => {
    mockFetch.mockResolvedValue(null);

    const cache = await import("../emitRendererCache");

    const first = await cache.loadEmitRenderer("ref_missing");
    expect(first).toBeNull();
    expect(cache.isKnownNoEmitRenderer("ref_missing")).toBe(true);

    const second = await cache.loadEmitRenderer("ref_missing");
    expect(second).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1); // negative cache short-circuits
  });
});

describe("emitRendererCache invalidation (D115 — the sibling gap)", () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
  });

  it("registers on dbToolRenderers, so firing the NAME drops the ref and bumps its version", async () => {
    mockFetch.mockResolvedValue({
      inline_code:
        "export default function C({ title }) { return <div>{title}</div>; }",
      allowed_imports: ["react"],
    });

    // Importing the cache is what registers the callback (module init — the
    // D115 inversion). It must therefore come BEFORE the fire.
    const cache = await import("../emitRendererCache");
    const registry = await import("@/lib/invalidation/invalidation-registry");

    const first = await cache.loadEmitRenderer("ref_edit");
    expect(first).toBeTruthy();
    const before = cache.getEmitRendererVersion("ref_edit");

    const fired = registry.fireInvalidation(
      registry.INVALIDATION_KEYS.dbToolRenderers,
      { toolName: "ref_edit" },
    );

    expect(fired).toBe(true);
    expect(cache.getCachedEmitRenderer("ref_edit")).toBeNull();
    expect(cache.getEmitRendererVersion("ref_edit")).toBeGreaterThan(before);

    // The re-resolve a mounted emission performs on the version bump refetches.
    await cache.loadEmitRenderer("ref_edit");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("invalidates EVERY ref when the edit names no tool (component_id-only)", async () => {
    mockFetch.mockResolvedValue(null);

    const cache = await import("../emitRendererCache");
    const registry = await import("@/lib/invalidation/invalidation-registry");

    await cache.loadEmitRenderer("ref_x");
    expect(cache.isKnownNoEmitRenderer("ref_x")).toBe(true);

    registry.fireInvalidation(registry.INVALIDATION_KEYS.dbToolRenderers);

    expect(cache.isKnownNoEmitRenderer("ref_x")).toBe(false);
  });
});
