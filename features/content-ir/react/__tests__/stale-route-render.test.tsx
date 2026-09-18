/**
 * DD-215c — THE ROUTE FOLLOWS THE REGISTRY, AND A STALE ROUTE IS NEVER SILENT.
 *
 * WHAT WAS OBSERVED ON PRODUCTION (2026-09-14, `www.aimatrx.com`, signed in as
 * admin@admin.com, Castellano & Reyes, `/shapes/keyword_relationship_research/
 * instances?i=…`, build `93a0fd67a7`). The organization's component row was
 * READ FINE — `HTTP 200`, 23,310 bytes, `component_key
 * keyword_relationship_board`, `source db`, `is_active true`, a 21,562-byte
 * body — and the resolver held it: `resolve(kind,"web","output")` answered
 * `resolvedBy: "db"` from ~320 ms onward. The reader was shown the platform's
 * compiled `keyword_research` block anyway, for the whole life of the mount,
 * and nothing anywhere said so.
 *
 * THE EVENT ORDER, which these cases drive exactly:
 *   1. the block mounts and routes while only the compiled floor answers
 *   2. the cold fetch lands and the row is ingested — the kind's version bumps
 *   3. the block re-renders (the subscription fired; the production trace shows
 *      the re-render happening)
 *   4. ...and the route does not recompute, because it was memoized on the
 *      block alone. The version was a `void`-ed memo dependency, and the React
 *      Compiler — ON in this repo — drops what data flow does not reach.
 *
 * Step 4 is why a jest suite could not catch this: jest does not run the
 * compiler, so the old source re-routed here and froze in production. The
 * compiler-level guard is `pnpm check:registry-repaint`; what THESE cases pin
 * is the contract that makes the guard checkable — the route takes the version
 * as an argument — and the alarm that fires if a stale route ever renders again.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";

import type { KindComponentProjection } from "../../registry/schema-source-kind-components";

const rpcMock = jest.fn(
  async (..._args: unknown[]) => ({ data: null, error: null }) as { data: null; error: null },
);

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...(args as [])),
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

jest.mock("../../registry/schema-source-kind-components", () => {
  const actual = jest.requireActual(
    "../../registry/schema-source-kind-components",
  );
  return {
    ...actual,
    listKindComponentsFromTables: jest.fn(async () => []),
    getKindComponentBySlug: jest.fn(async () => []),
  };
});

import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
} from "../../registry/schema-source-kind-components";
import { componentRegistry } from "../../registry/component-registry";
import {
  announceSessionForTests,
  resetSessionReadyForTests,
} from "../../registry/session-ready";
import {
  resetKindComponentIncidentDedupe,
  setKindComponentIncidentsEnabledForTests,
} from "../db-component/kindComponentIncident";
import { useContentIrKindVersion } from "../use-registry-repaint";
import { useEnsureKindRenderable } from "../ensure-kind-renderable";
import { readEnvelope } from "../../redux/render-block-envelope";
import {
  resetStaleRouteReports,
  routeBlockAtRegistryVersion,
} from "../route-at-version";

const KIND = "keyword_relationship_research";
const COMPILED_FLOOR_BLOCK_TYPE = "keyword_research";
const ORG_BOARD = "keyword_relationship_board";
const DB_BLOCK_TYPE = "db_kind_component";

const listMock = listKindComponentsFromTables as jest.MockedFunction<
  typeof listKindComponentsFromTables
>;
const bySlugMock = getKindComponentBySlug as jest.MockedFunction<
  typeof getKindComponentBySlug
>;

/** The row production actually returned, to the field. */
function orgRow(): KindComponentProjection {
  return {
    kind: KIND,
    platform: "web",
    role: "output",
    componentKey: ORG_BOARD,
    source: "db",
    isActive: true,
    config: {},
    componentSource: "export default function Board(){return null}",
    hasComponentSource: true,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-09-12T16:34:32.966Z",
    createdAt: "2026-07-23T02:08:41.966Z",
    id: "3778cf1a-dd20-44d4-9fae-dc416e028f85",
    createdBy: null,
  };
}

function instanceBlock(instanceId: string) {
  const value = { __kind: KIND, primary_keyword: instanceId, lists: [] };
  return {
    type: "code",
    content: JSON.stringify(value),
    language: "json",
    metadata: { __ir: envelopeFromCompleteValue(value, KIND) },
  };
}

/** The BlockRenderer chain as it ships: repaint key → demand → versioned route. */
function RoutedType({ block }: { block: ReturnType<typeof instanceBlock> }) {
  const kind = readEnvelope(block.metadata)?.root.kind ?? null;
  const version = useContentIrKindVersion(kind);
  useEnsureKindRenderable(kind);
  const routed = routeBlockAtRegistryVersion({ ...block }, version);
  return <div data-routed-type={routed.type} />;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function routedType(): string | null {
  return (
    container
      .querySelector("[data-routed-type]")
      ?.getAttribute("data-routed-type") ?? null
  );
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function incidents(): Array<Record<string, unknown>> {
  return rpcMock.mock.calls
    .filter((call) => call[0] === "log_kind_component_incident")
    .map((call) => call[1] as Record<string, unknown>);
}

beforeEach(() => {
  jest.clearAllMocks();
  rpcMock.mockResolvedValue({ data: null, error: null });
  listMock.mockResolvedValue([]);
  bySlugMock.mockResolvedValue([]);
  componentRegistry.resetForTests();
  resetSessionReadyForTests(null);
  announceSessionForTests(true);
  resetKindComponentIncidentDedupe();
  resetStaleRouteReports();
  setKindComponentIncidentsEnabledForTests(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setKindComponentIncidentsEnabledForTests(false);
});

describe("DD-215c — a mounted block follows the registry", () => {
  test("the production order: mount on the compiled floor, the row lands, the block routes to the organization's component", async () => {
    bySlugMock.mockResolvedValue([]);

    await act(async () => {
      root.render(<RoutedType block={instanceBlock("sauna")} />);
    });
    await act(async () => {
      await flush();
    });
    expect(routedType()).toBe(COMPILED_FLOOR_BLOCK_TYPE);

    // The cold fetch lands — exactly step 2 of the observed order.
    await act(async () => {
      componentRegistry.ingestDbRows([orgRow()]);
      await flush();
    });

    expect(routedType()).toBe(DB_BLOCK_TYPE);
  });

  test("the version is what re-runs the route: the same block at the same version is not recomputed, at a new version it is", () => {
    const block = instanceBlock("creatine");
    const first = routeBlockAtRegistryVersion(block, 0);
    expect(first.type).toBe(COMPILED_FLOOR_BLOCK_TYPE);
    expect(routeBlockAtRegistryVersion(block, 0)).toBe(first);

    componentRegistry.ingestDbRows([orgRow()]);
    const after = routeBlockAtRegistryVersion(
      block,
      componentRegistry.getKindVersion(KIND),
    );
    expect(after.type).toBe(DB_BLOCK_TYPE);
    expect(after).not.toBe(first);
  });
});

describe("DD-215c — a stale route is never silent", () => {
  test("a route held at a stale version files an incident naming what the reader sees and what the resolver holds", async () => {
    const block = instanceBlock("coldplunge");
    // Mount-time route, compiled floor. No incident: the marker and the
    // resolver agree.
    expect(routeBlockAtRegistryVersion(block, 0).type).toBe(
      COMPILED_FLOOR_BLOCK_TYPE,
    );
    await flush();
    expect(incidents()).toHaveLength(0);

    // The row lands…
    componentRegistry.ingestDbRows([orgRow()]);
    // …and the render seam asks for the route AT THE OLD VERSION — precisely
    // what the frozen compiler memo did on production.
    expect(routeBlockAtRegistryVersion(block, 0).type).toBe(
      COMPILED_FLOOR_BLOCK_TYPE,
    );
    await flush();

    const filed = incidents();
    expect(filed).toHaveLength(1);
    expect(filed[0]?.p_error_type).toBe("stale_route_render");
    expect(filed[0]?.p_kind).toBe(KIND);
    expect(filed[0]?.p_component_key).toBe(ORG_BOARD);
    expect(String(filed[0]?.p_error_message)).toContain(ORG_BOARD);
    expect(String(filed[0]?.p_error_message)).toContain("STALE route decision");
  });

  test("the alarm files once per disagreement, not once per render", async () => {
    const block = instanceBlock("sauna-2");
    routeBlockAtRegistryVersion(block, 0);
    componentRegistry.ingestDbRows([orgRow()]);
    for (let i = 0; i < 5; i++) routeBlockAtRegistryVersion(block, 0);
    await flush();
    expect(incidents()).toHaveLength(1);
  });

  test("a route that agrees with the resolver says nothing at all", async () => {
    const block = instanceBlock("quiet");
    componentRegistry.ingestDbRows([orgRow()]);
    const routed = routeBlockAtRegistryVersion(
      block,
      componentRegistry.getKindVersion(KIND),
    );
    expect(routed.type).toBe(DB_BLOCK_TYPE);
    await flush();
    expect(incidents()).toHaveLength(0);
  });
});
