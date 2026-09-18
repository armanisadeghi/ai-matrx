/**
 * DD-215b — A REFUSED READ IS NOT AN ANSWER, AND A WRONG RENDER IS NEVER SILENT.
 *
 * WHAT WENT WRONG ON PRODUCTION. `content_ir.kind_component` and
 * `content_ir.kind_definition` are signed-in doors: `anon` holds no grant on
 * either, so a registry read issued before the Supabase session attaches comes
 * back `42501 permission denied`. Recorded on production 2026-09-14
 * (`ops.system_error`, `source_app='matrx-frontend'`, `user_id IS NULL`):
 *
 *   permission denied for table kind_component
 *   component-resolver refresh failed …: readAllRows(content_ir.kind_component
 *     metadata): query failed — permission denied for table kind_component
 *
 * When that happened the resolver was left holding only the compiled floor,
 * NOTHING retried the refused read, and the reader was silently handed the
 * platform's component instead of their organization's — eighteen of
 * twenty-one cold production reads of the same three Castellano instances
 * (V-99). The resolver, the route and the repaint chain were all innocent:
 * with the rows in hand a mounted block re-routes correctly in every arrival
 * order. The defect was that the rows never arrived and nobody said so.
 *
 * These cases pin both halves, with the REAL registry, the REAL route and the
 * REAL kind (`keyword_relationship_research`, whose compiled floor is the
 * `keyword_research` block); only the two Supabase loaders and the RPC are
 * stubbed. The boot race itself is DD-237 and belongs to the session layer.
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
  KindComponentTablesError,
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
import { routeBlockAtRegistryVersion } from "../route-at-version";
import { useContentIrKindVersion } from "../use-registry-repaint";
import { useEnsureKindRenderable } from "../ensure-kind-renderable";
import { readEnvelope } from "../../redux/render-block-envelope";

const KIND = "keyword_relationship_research";
const COMPILED_FLOOR_BLOCK_TYPE = "keyword_research";
const ORG_BOARD = "keyword_relationship_board";

const listMock = listKindComponentsFromTables as jest.MockedFunction<
  typeof listKindComponentsFromTables
>;
const bySlugMock = getKindComponentBySlug as jest.MockedFunction<
  typeof getKindComponentBySlug
>;

/** Exactly what PostgREST hands back when the door refuses an anon read. */
function refusal(): KindComponentTablesError {
  return new KindComponentTablesError(
    `Failed to fetch kind_component for "${KIND}": permission denied for table kind_component`,
    "42501",
  );
}

/** The same refusal as it survives `readAllRows`, which drops the code. */
function warmRefusal(): KindComponentTablesError {
  return new KindComponentTablesError(
    "Failed to list kind_component: readAllRows(content_ir.kind_component metadata): " +
      "query failed — permission denied for table kind_component",
  );
}

function coldRow(): KindComponentProjection {
  return {
    kind: KIND,
    platform: "web",
    role: "output",
    componentKey: ORG_BOARD,
    source: "db",
    isActive: true,
    config: {},
    componentSource: "export default function B(){return null}",
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
  } as const;
}

/**
 * The essential BlockRenderer chain: repaint key → demand → route.
 *
 * 🚨 This used to be `useMemo(() => { void version; return applyIrKindRoute(…) },
 * [block, version])` — the shape BlockRenderer shipped, and the shape the React
 * Compiler erases (DD-215c). Jest does not run the compiler, so this harness
 * passed on semantics production did not have and the suite vouched for a
 * surface that was broken. It now calls the SAME seam the render path calls.
 */
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

function incidentCalls(): Array<Record<string, unknown>> {
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
  resetKindComponentIncidentDedupe();
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

describe("DD-215b — a 42501 is a refusal, not a verdict", () => {
  test("a refused component read is retried when the session attaches, and the mounted block re-routes", async () => {
    bySlugMock.mockRejectedValue(refusal());

    await act(async () => {
      root.render(<RoutedType block={instanceBlock("sauna")} />);
    });
    await act(async () => {
      await flush();
    });

    // The reader is on the platform's compiled block — correct while nothing
    // better has arrived, and exactly what production showed.
    expect(routedType()).toBe(COMPILED_FLOOR_BLOCK_TYPE);
    expect(bySlugMock).toHaveBeenCalledWith(KIND, "web");
    expect(componentRegistry.wasRefused(KIND)).toBe(true);

    // 🚨 THE MISS SET MUST NOT HAVE CLOSED THIS KIND. A miss is only ever
    // recorded from an answer; it is cleared only by a wholesale refresh, so
    // recording one here would end the kind for the whole session.
    expect(componentRegistry.hasProvisionalMiss(KIND, "web", "output")).toBe(
      false,
    );

    // The session attaches. RED before the fix: nothing retries a refused
    // read, so the block stays on the platform component forever.
    bySlugMock.mockResolvedValue([coldRow()]);
    await act(async () => {
      announceSessionForTests(true);
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(routedType()).toBe("db_kind_component");
    expect(componentRegistry.wasRefused(KIND)).toBe(false);
  });

  test("a refused WARM list re-opens the whole db tier once the session attaches", async () => {
    listMock.mockRejectedValue(warmRefusal());

    // `refresh` swallows its own failure and never retries; the re-arm has to
    // live in the loader both it and `ensureWarm` share.
    await act(async () => {
      await componentRegistry.refresh(0);
    });
    expect(componentRegistry.wasRefused(KIND)).toBe(true);

    listMock.mockResolvedValue([{ ...coldRow(), componentSource: null }]);
    bySlugMock.mockResolvedValue([coldRow()]);
    await act(async () => {
      announceSessionForTests(true);
      await flush();
    });
    await act(async () => {
      await flush();
    });

    expect(componentRegistry.resolve(KIND, "web", "output")?.resolvedBy).toBe(
      "db",
    );
  });

  test("a refusal files an incident, and it is NOT dropped for want of the session that failed", async () => {
    bySlugMock.mockRejectedValue(refusal());

    await act(async () => {
      root.render(<RoutedType block={instanceBlock("cold-plunge")} />);
    });
    await act(async () => {
      await flush();
    });

    // The door `log_kind_component_incident` is signed-in only (anon's EXECUTE
    // was revoked by DD-169), so filing NOW would be refused by the very
    // session whose absence caused the incident — and the loudest failures
    // would be the least recorded.
    expect(incidentCalls()).toHaveLength(0);

    await act(async () => {
      announceSessionForTests(true);
      await flush();
    });
    await act(async () => {
      await flush();
    });

    const filed = incidentCalls();
    expect(filed.length).toBeGreaterThan(0);
    expect(filed[0].p_error_type).toBe("component_read_refused");
    expect(filed[0].p_kind).toBe(KIND);
    expect(String(filed[0].p_error_message)).toMatch(/could not be READ|refus/i);
  });

  test("an active db row bound with no body files an incident instead of rendering the platform block in silence", async () => {
    // The other silent freeze: the route refuses a `source='db'` row that
    // declares no body, and `needsColdFetch` is false for exactly that row, so
    // nothing ever fetches the body again.
    resetSessionReadyForTests(true);
    componentRegistry.ingestDbRows([
      { ...coldRow(), componentSource: null, hasComponentSource: false },
    ]);

    await act(async () => {
      root.render(<RoutedType block={instanceBlock("creatine")} />);
    });
    await act(async () => {
      await flush();
    });

    expect(routedType()).toBe(COMPILED_FLOOR_BLOCK_TYPE);
    const filed = incidentCalls();
    expect(filed.length).toBeGreaterThan(0);
    expect(filed[0].p_error_type).toBe("component_read_refused");
    expect(filed[0].p_component_key).toBe(ORG_BOARD);
    expect(String(filed[0].p_error_message)).toMatch(/no body|holds no body/i);
  });
});
