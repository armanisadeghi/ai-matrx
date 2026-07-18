/**
 * @jest-environment jsdom
 *
 * DB-sourced kind components (K1 — the `source='db'` render path):
 *
 *  1. Loader projection — the warm projection carries `componentSource` /
 *     `propsTransform` / `pinnedKindVersion` and the resolver returns them
 *     for db rows (compiled entries answer null — byte-unchanged floor).
 *  2. Route flip — an ACTIVE `source='db'` row WITH a component body routes
 *     to `db_kind_component` (db overrides bundled, R6); an inactive row
 *     does not; an active db-source row WITHOUT a body screams and falls
 *     through to today's behavior (never un-renders).
 *  3. Compile + render — `component_source` compiles via the SHARED
 *     allowlist compiler and renders with `{ data, kind, config }`;
 *     `props_transform` is applied first.
 *  4. Error boundary — a throwing component falls back to the generic
 *     structured viewer (never a blank hole).
 *  5. Allowlist scope — the 2026-07-17 expansion entries resolve, and
 *     unknown identifiers keep the safe-proxy fallback.
 *  6. html flavor — `config.flavor='html'` renders the sandboxed iframe
 *     (allow-scripts, NO allow-same-origin) with the kind-data JSON slot.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyIrKindRoute,
  DB_KIND_COMPONENT_KEY,
  IR_ROUTE_KEY,
} from "../react/kind-route";
import {
  ComponentRegistry,
  componentRegistry,
  resolveComponent,
} from "../registry/component-registry";
import { getSystemComponentEntries } from "../registry/system-components";
import type { KindComponentProjection } from "../registry/schema-source-kind-components";
import { envelopeFromCompleteValue } from "../core/normalize";
import { IR_ENVELOPE_KEY } from "../core/ir-types";
import { DbKindComponentImpl } from "../react/db-component/DbKindComponentImpl";
import {
  buildComponentScope,
  getAllowedImportsList,
  getDefaultImportsForKindComponents,
} from "@/features/agent-apps/utils/allowed-imports";

function dbRow(
  overrides: Partial<KindComponentProjection> &
    Pick<KindComponentProjection, "kind" | "componentKey" | "isActive">,
): KindComponentProjection {
  return {
    platform: "web",
    role: "output",
    source: "db",
    config: {},
    componentSource: null,
    propsTransform: null,
    pinnedKindVersion: null,
    ...overrides,
  };
}

function kindBlock(kind: string, value: Record<string, unknown>) {
  const withKind = { __kind: kind, ...value };
  return {
    type: "code",
    content: JSON.stringify(withKind),
    serverData: { language: "json" } as Record<string, unknown>,
    metadata: {
      [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(withKind, kind),
    } as Record<string, unknown>,
  };
}

const REACT_SOURCE = `
export default function DemoView({ data, kind, config }) {
  return (
    <div data-testid="db-kind-demo">
      <span>{kind}:{data.title}</span>
      <Badge>{String(config.tone ?? "none")}</Badge>
    </div>
  );
}
`;

const THROWING_SOURCE = `
export default function Boom() {
  throw new Error("authoring bug");
}
`;

describe("loader projection + resolver fields", () => {
  it("resolver returns componentSource/propsTransform/pinnedKindVersion for db rows and nulls for compiled entries", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    registry.ingestDbRows([
      dbRow({
        kind: "k1_proj",
        componentKey: "k1_proj_view",
        isActive: true,
        componentSource: "export default () => null;",
        propsTransform: "export default (d) => d;",
        pinnedKindVersion: 3,
      }),
    ]);

    const db = registry.resolve("k1_proj", "web", "output");
    expect(db).toMatchObject({
      resolvedBy: "db",
      source: "db",
      componentSource: "export default () => null;",
      propsTransform: "export default (d) => d;",
      pinnedKindVersion: 3,
    });

    const compiled = registry.resolve("flashcard_set", "web", "output");
    expect(compiled).toMatchObject({
      resolvedBy: "compiled",
      componentSource: null,
      propsTransform: null,
      pinnedKindVersion: null,
    });
  });
});

describe("applyIrKindRoute — the db-override flip", () => {
  it("an ACTIVE source='db' row WITH a body routes to db_kind_component (poison serverData cleared, marker by:'db')", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_flip",
        componentKey: "k1_flip_view",
        isActive: true,
        componentSource: REACT_SOURCE,
      }),
    ]);

    const block = kindBlock("k1_flip", { title: "Hello" });
    const routed = applyIrKindRoute(block);

    expect(routed.type).toBe(DB_KIND_COMPONENT_KEY);
    expect(routed.serverData).toBeUndefined();
    expect(routed.metadata?.[IR_ROUTE_KEY]).toEqual({
      by: "db",
      key: "k1_flip_view",
    });
  });

  it("db overrides bundled: a compiled-bridge kind with an active db-source row renders the DB component, not the bridge", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "flashcard_set",
        componentKey: "flashcards_custom",
        isActive: true,
        componentSource: REACT_SOURCE,
      }),
    ]);

    const block = kindBlock("flashcard_set", {
      title: "Deck",
      cards: [{ __kind: "flashcard", front: "Q", back: "A" }],
    });
    const routed = applyIrKindRoute(block);
    expect(routed.type).toBe(DB_KIND_COMPONENT_KEY);
  });

  it("an INACTIVE db-source row does NOT flip (R6 gate holds)", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_held",
        componentKey: "k1_held_view",
        isActive: false,
        componentSource: REACT_SOURCE,
      }),
    ]);

    const block = kindBlock("k1_held", { title: "Held" });
    const routed = applyIrKindRoute(block);
    expect(routed.type).not.toBe(DB_KIND_COMPONENT_KEY);
  });

  it("an active db-source row WITHOUT a body screams and falls through (never un-renders)", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_sourceless",
        componentKey: "k1_sourceless_view",
        isActive: true,
        componentSource: null,
      }),
    ]);

    const block = kindBlock("k1_sourceless", { title: "Defect" });
    const routed = applyIrKindRoute(block);

    // Falls through to the resolver-only path: routes to its componentKey
    // exactly as before K1 (behavior preserved), with a loud report.
    expect(routed.type).toBe("k1_sourceless_view");
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("NO component_source"),
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });
});

describe("DbKindComponentImpl — compile + render + error boundary", () => {
  it("compiles component_source via the shared compiler and renders {data, kind, config}; props_transform applies first", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_render",
        componentKey: "k1_render_view",
        isActive: true,
        componentSource: REACT_SOURCE,
        propsTransform:
          "export default (d) => ({ ...d, title: d.title.toUpperCase() });",
        config: { tone: "bold" },
      }),
    ]);

    const block = kindBlock("k1_render", { title: "hello" });
    const html = renderToStaticMarkup(
      <DbKindComponentImpl content={block.content} metadata={block.metadata} />,
    );

    expect(html).toContain('data-testid="db-kind-demo"');
    // Transform ran first (title uppercased); config reached the component.
    expect(html).toContain("k1_render:HELLO");
    expect(html).toContain("bold");
  });

  it("a throwing component falls back to the generic structured viewer, loudly — never a blank hole", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_boom",
        componentKey: "k1_boom_view",
        isActive: true,
        componentSource: THROWING_SOURCE,
      }),
    ]);

    const block = kindBlock("k1_boom", { title: "Crash" });
    // Error boundaries need a real client render (they do not exist in
    // renderToStaticMarkup) — createRoot + act in jsdom.
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = null;
    act(() => {
      root = createRoot(host);
      root.render(
        <DbKindComponentImpl
          content={block.content}
          metadata={block.metadata}
        />,
      );
    });

    // The generic structured viewer renders (never a blank hole), and the
    // boundary screamed.
    expect(host.textContent).toBeTruthy();
    expect(host.textContent).not.toContain("authoring bug");
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("DbKindComponentErrorBoundary"),
      ),
    ).toBe(true);
    act(() => root?.unmount());
    host.remove();
    consoleError.mockRestore();
  });

  it("config.flavor='html' renders the sandboxed iframe with the kind-data slot and NO allow-same-origin", () => {
    componentRegistry.ingestDbRows([
      dbRow({
        kind: "k1_html",
        componentKey: "k1_html_view",
        isActive: true,
        componentSource: "<!doctype html><html><body><h1>Hi</h1></body></html>",
        config: { flavor: "html" },
      }),
    ]);

    const block = kindBlock("k1_html", { title: "Frame" });
    const html = renderToStaticMarkup(
      <DbKindComponentImpl content={block.content} metadata={block.metadata} />,
    );

    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts allow-forms"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain("matrx-kind-data");
    expect(html).toContain("k1_html");
  });
});

describe("allowlist expansion (2026-07-17)", () => {
  it("registers the expanded shadcn/util/chart entries by exact path", () => {
    const paths = getAllowedImportsList();
    for (const expected of [
      "@/lib/utils",
      "@/components/ui/badge",
      "@/components/ui/tooltip",
      "@/components/ui/accordion",
      "@/components/ui/collapsible",
      "@/components/ui/progress",
      "@/components/ui/separator",
      "@/components/ui/scroll-area",
      "@/components/ui/dialog",
      "@/components/ui/sheet",
      "@/components/ui/dropdown-menu",
      "@/components/ui/table",
      "@/components/ui/checkbox",
      "@/components/ui/radio-group",
      "@/components/ui/popover",
      "@/components/ui/avatar",
      "@/components/ui/alert",
      "@/components/ui/skeleton",
      "recharts",
    ]) {
      expect(paths).toContain(expected);
    }
    // Kind components default to the FULL registered scope.
    expect(getDefaultImportsForKindComponents()).toEqual(paths);
  });

  it("builds a scope carrying cn + expanded primitives + full hook set; unknown identifiers keep the safe proxy", () => {
    const scope = buildComponentScope(getDefaultImportsForKindComponents());
    expect(typeof scope.cn).toBe("function");
    expect(scope.Badge).toBeTruthy();
    expect(scope.Table).toBeTruthy();
    expect(scope.ResponsiveContainer).toBeTruthy();
    expect(typeof scope.useReducer).toBe("function");
    expect(typeof scope.useId).toBe("function");
    // lucide safe proxy: a missing PascalCase name resolves to a fallback,
    // never undefined (the crash class the proxy exists to kill).
    const proxies = scope.__safeProxies as Record<
      string,
      Record<string, unknown>
    >;
    expect(proxies["lucide-react"].DefinitelyNotAnIcon).toBeTruthy();
  });
});
