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
import {
  sortKindComponentRows,
  type KindComponentProjection,
} from "../registry/schema-source-kind-components";
import { getOrCompileDbKindComponent } from "../react/db-component/dbKindComponentCache";
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
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000000",
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
      updatedAt: null,
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

  it("un-latches the error boundary when a NEW component version arrives (broke-then-fixed heals on re-render, not only on unmount)", () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // v1: a throwing component. updatedAt is the version signal.
    componentRegistry.replaceDbRows([
      dbRow({
        kind: "k1_heal",
        componentKey: "k1_heal_view",
        isActive: true,
        componentSource: THROWING_SOURCE,
        updatedAt: "2026-01-01T00:00:00Z",
      }),
    ]);

    const block = kindBlock("k1_heal", { title: "Heal" });
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
    // Latched: fallback rendered, no working component marker.
    expect(host.textContent).not.toContain("db-kind-demo");

    // v2: the author fixes it — a working component under a NEW updatedAt.
    componentRegistry.replaceDbRows([
      dbRow({
        kind: "k1_heal",
        componentKey: "k1_heal_view",
        isActive: true,
        componentSource: REACT_SOURCE,
        updatedAt: "2026-01-01T00:05:00Z",
      }),
    ]);
    act(() => {
      root?.render(
        <DbKindComponentImpl
          content={block.content}
          metadata={block.metadata}
        />,
      );
    });

    // Healed on re-render alone — the boundary un-latched on the version change.
    expect(host.querySelector('[data-testid="db-kind-demo"]')).not.toBeNull();

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

describe("staleness — refresh re-keys the compile cache", () => {
  it("an updated_at bump on the winning row produces a NEW compile (edited source renders)", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    const v1 = dbRow({
      kind: "k1_stale",
      componentKey: "k1_stale_view",
      isActive: true,
      componentSource:
        'export default function V1({ data }) { return <div>v1:{data.title}</div>; }',
      updatedAt: "2026-07-17T00:00:00Z",
    });
    registry.ingestDbRows([v1]);
    const r1 = registry.resolve("k1_stale", "web", "output");
    expect(r1).not.toBeNull();
    const c1 = getOrCompileDbKindComponent("k1_stale", r1!);
    expect(c1.ok).toBe(true);

    // The edit: same key, new body, bumped updated_at — delivered by a
    // refresh (replaceDbRows is refreshKindComponents' landing point).
    registry.replaceDbRows([
      {
        ...v1,
        componentSource:
          'export default function V2({ data }) { return <div>v2:{data.title}</div>; }',
        updatedAt: "2026-07-18T00:00:00Z",
      },
    ]);
    const r2 = registry.resolve("k1_stale", "web", "output");
    expect(r2?.updatedAt).toBe("2026-07-18T00:00:00Z");
    const c2 = getOrCompileDbKindComponent("k1_stale", r2!);
    expect(c2.ok).toBe(true);
    // Different cache entries — the bump re-keyed; the stale compile is not served.
    expect(c2.ok && c1.ok && c2.compiled.Component).not.toBe(
      c1.ok ? c1.compiled.Component : null,
    );
    if (!c2.ok) throw new Error("expected c2.ok");
    const html = renderToStaticMarkup(
      React.createElement(c2.compiled.Component, {
        data: { title: "X" },
        kind: "k1_stale",
        config: {},
      }),
    );
    expect(html).toContain("v2:X");
  });

  it("replaceDbRows notifies subscribers and drops rows that disappeared", () => {
    const registry = new ComponentRegistry(getSystemComponentEntries);
    registry.ingestDbRows([
      dbRow({ kind: "k1_gone", componentKey: "k1_gone_view", isActive: true }),
    ]);
    expect(registry.resolve("k1_gone", "web", "output")).not.toBeNull();

    let notified = 0;
    const unsubscribe = registry.subscribe(() => {
      notified += 1;
    });
    registry.replaceDbRows([]);
    expect(notified).toBe(1);
    expect(registry.resolve("k1_gone", "web", "output")).toBeNull();
    unsubscribe();
  });
});

describe("deterministic db-row ordering", () => {
  it("orders is_default DESC, sort_order ASC, created_at ASC, id ASC — equal-priority rows tie-break on created_at then id, never physical order", () => {
    const base = {
      is_default: false,
      sort_order: 0,
      created_at: "2026-07-17T00:00:00Z",
    };
    const rows = [
      { ...base, id: "bbbbbbbb-0000-0000-0000-000000000000" },
      { ...base, id: "aaaaaaaa-0000-0000-0000-000000000000" },
      {
        ...base,
        created_at: "2026-07-16T00:00:00Z",
        id: "cccccccc-0000-0000-0000-000000000000",
      },
      {
        ...base,
        sort_order: -1,
        id: "dddddddd-0000-0000-0000-000000000000",
      },
      { ...base, is_default: true, id: "eeeeeeee-0000-0000-0000-000000000000" },
    ];
    expect(sortKindComponentRows(rows).map((r) => r.id[0])).toEqual([
      "e", // is_default wins
      "d", // lowest sort_order
      "c", // earliest created_at
      "a", // id tiebreak
      "b",
    ]);
    // Input order irrelevant: reversed input, same verdict.
    expect(sortKindComponentRows([...rows].reverse()).map((r) => r.id[0])).toEqual(
      ["e", "d", "c", "a", "b"],
    );
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
