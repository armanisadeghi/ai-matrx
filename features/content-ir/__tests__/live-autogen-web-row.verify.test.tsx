/**
 * @jest-environment jsdom
 *
 * THROWAWAY live proof (2026-08-18) — the aidream kind-component autogen's
 * `platform='web'` target. Fixture `.live-web-row.json` is the REAL
 * `content_ir.kind_component` row the trigger wrote for `web_search_results`,
 * dumped from Matrx Main, plus that kind's canonical example. Renders it
 * through the production route (resolver → applyIrKindRoute →
 * DbKindComponentImpl → shared allowlist compiler) — the same path
 * KindInstanceRender drives.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { applyIrKindRoute, DB_KIND_COMPONENT_KEY, IR_ROUTE_KEY } from "../react/kind-route";
import { componentRegistry, resolveComponent } from "../registry/component-registry";
import { DbKindComponentImpl } from "../react/db-component/DbKindComponentImpl";
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";

import live from "./.live-web-row.json";

const { sampleData, ...row } = live as unknown as KindComponentProjection & {
  sampleData: Record<string, unknown>;
};

describe("autogen web row (live)", () => {
  beforeAll(() => {
    componentRegistry.replaceDbRows([row as KindComponentProjection]);
  });

  it("is a web/output db row the Next resolver picks up", () => {
    expect(row.platform).toBe("web");
    expect(row.role).toBe("output");
    expect(row.source).toBe("db");
    const resolution = resolveComponent(row.kind, "web", "output");
    expect(resolution?.resolvedBy).toBe("db");
    expect(resolution?.isActive).toBe(true);
    expect(resolution?.componentSource).toBeTruthy();
  });

  it("routes the kind block to db_kind_component", () => {
    const withKind = { __kind: row.kind, ...sampleData };
    const block = {
      type: "code",
      content: JSON.stringify(withKind),
      serverData: { language: "json" } as Record<string, unknown>,
      metadata: {
        [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(withKind, row.kind),
      } as Record<string, unknown>,
    };
    const routed = applyIrKindRoute(block as never) as unknown as {
      type: string;
      metadata: Record<string, unknown>;
    };
    expect(routed.metadata[IR_ROUTE_KEY]).toBeTruthy();
    expect(routed.type).toBe(DB_KIND_COMPONENT_KEY);
  });

  it("compiles and renders the real sample_data", async () => {
    const withKind = { __kind: row.kind, ...sampleData };
    const host = document.createElement("div");
    document.body.appendChild(host);
    let rootRef: Root | null = null;
    await act(async () => {
      rootRef = createRoot(host);
      rootRef.render(
        <DbKindComponentImpl
          content={JSON.stringify(withKind)}
          metadata={{ [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(withKind, row.kind) }}
        />,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const text = host.textContent ?? "";
    // Real values from the canonical example must appear in the rendered DOM —
    // not the raw JSON fallback.
    expect(text).toContain("12 Best Hikes in Colorado");
    expect(text).toContain("best hiking trails colorado");
    expect(text).not.toContain("__kind");
    await act(async () => {
      rootRef?.unmount();
    });
    host.remove();
  });
});
