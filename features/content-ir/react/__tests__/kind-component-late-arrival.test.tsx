/**
 * DD-215 — THE GATE PLACES A BODY, IT NEVER PICKS ONE.
 *
 * The live divergence (B-95, reproduced by B-105 on production 2026-09-13):
 * three instances of `keyword_relationship_research` in Castellano & Reyes —
 * identical rows, identical kind_version, one active organization-authored
 * component, no pin — rendered as DIFFERENT components. One framed the
 * organization's `keyword_relationship_board`; the others kept the platform's
 * compiled `keyword_research` block, permanently, with no error and no
 * incident row. Delaying the warm `kind_component` list on the wire reproduces
 * it every time: the block routes while the component resolver is cold and
 * never routes again.
 *
 * The cause is NOT the sandbox gate. The gate is read at exactly one place
 * (`DbKindComponentImpl`) and only chooses between the frame and the in-page
 * compile — it never reaches the resolver. What the gate did was make an
 * already-unstable choice VISIBLE: for every kind that ships a compiled floor
 * (a `legacyBlockType`), `resolve()` always answers, so
 *
 *   - `ensureKindRenderable`'s guard `if (!componentRegistry.resolve(...))`
 *     never fires, and
 *   - `ComponentResolver.needsColdFetch()` returns false,
 *
 * and the organization's component body is therefore never demanded. Which
 * component the reader sees is left to a network race.
 *
 * These are the forcing tests for that class. They use the REAL registry, the
 * REAL route and the REAL kind (`keyword_relationship_research`, whose
 * compiled floor is the `keyword_research` block) with only the two Supabase
 * loaders stubbed, so a green run means the real code demands the real row.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { envelopeFromCompleteValue } from "@ai-matrx/content-ir";

import type { KindComponentProjection } from "../../registry/schema-source-kind-components";

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
import { applyIrKindRoute, type IrRoutableBlock } from "../kind-route";
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

/** The organization's live row, as the WARM list projects it (no body). */
function warmRow(): KindComponentProjection {
  return {
    kind: KIND,
    platform: "web",
    role: "output",
    componentKey: ORG_BOARD,
    source: "db",
    isActive: true,
    config: {},
    componentSource: null,
    hasComponentSource: true,
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-09-12T16:34:32.966Z",
    createdAt: "2026-07-23T02:08:41.966Z",
    id: "3778cf1a-dd20-44d4-9fae-dc416e028f85",
    createdBy: null,
  };
}

/** The same row as the COLD single-kind fetch projects it (body included). */
function coldRow(): KindComponentProjection {
  return { ...warmRow(), componentSource: "export default function B(){return null}" };
}

/** The block a kind instance renders through (KindInstanceRender's shape). */
function instanceBlock(instanceId: string) {
  const value = { __kind: KIND, primary_keyword: instanceId, lists: [] };
  return {
    type: "code",
    content: JSON.stringify(value),
    language: "json",
    metadata: { __ir: envelopeFromCompleteValue(value, KIND) },
  } as const;
}

/** The essential BlockRenderer chain: repaint key → demand → route. */
function RoutedType({ block }: { block: ReturnType<typeof instanceBlock> }) {
  const kind = readEnvelope(block.metadata)?.root.kind ?? null;
  const version = useContentIrKindVersion(kind);
  useEnsureKindRenderable(kind);
  const routed = React.useMemo(() => {
    void version;
    return applyIrKindRoute({ ...block } as IrRoutableBlock);
  }, [block, version]);
  return <div data-routed-type={routed.type} />;
}

// react-dom asks for this flag before it will believe an `act()` scope.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

function routedType(): string | null {
  return (
    container.querySelector("[data-routed-type]")?.getAttribute(
      "data-routed-type",
    ) ?? null
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue([]);
  bySlugMock.mockResolvedValue([]);
  // NOT `replaceDbRows([])`: that marks the db tier SETTLED, and a settled
  // tier is exactly the state in which a compiled answer is authoritative —
  // it would erase the window this suite exists to test. Only the per-session
  // demand dedupe is re-armed.
  componentRegistry.resetProvisionalDemand();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DD-215 — an organization-authored component is demanded, not raced for", () => {
  // FIRST in the file on purpose: the window this guards is "the warm list has
  // not come back yet", and any earlier test that warms the registry closes it
  // for the session.
  test("one kind's answer does not close the window for the next kind on the page", async () => {
    const A = "quiz_set";
    const B = "flashcard_set";
    // Both must be compiled-floor kinds or this proves nothing.
    expect(componentRegistry.resolve(A, "web", "output")?.resolvedBy).toBe("compiled");
    expect(componentRegistry.resolve(B, "web", "output")?.resolvedBy).toBe("compiled");

    bySlugMock.mockResolvedValue([{ ...coldRow(), kind: A, componentKey: "quiz_board" }]);
    componentRegistry.requestComponent(A, "web", "output");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(bySlugMock).toHaveBeenCalledWith(A, "web");
    expect(componentRegistry.resolve(A, "web", "output")?.resolvedBy).toBe("db");

    // The package's own `hasSettled()` is now true (the map holds a row), which
    // would have silenced every remaining kind on the page. It must not.
    bySlugMock.mockClear();
    bySlugMock.mockResolvedValue([]);
    componentRegistry.requestComponent(B, "web", "output");
    await act(async () => {
      await Promise.resolve();
    });
    expect(bySlugMock).toHaveBeenCalledWith(B, "web");
  });

  test("the render path DEMANDS the kind's own component rows even when a compiled floor answers", async () => {
    await act(async () => {
      root.render(<RoutedType block={instanceBlock("creatine")} />);
    });

    // Today's answer is the platform's compiled block — that part is correct
    // while nothing better has arrived.
    expect(routedType()).toBe(COMPILED_FLOOR_BLOCK_TYPE);

    // RED before the fix: `ensureKindRenderable`'s guard is
    // `if (!componentRegistry.resolve(...))`, and the compiled floor always
    // answers, so the organization's row is never asked for at all.
    expect(bySlugMock).toHaveBeenCalledWith(KIND, "web");
  });

  test("a LATE component list re-routes an already-mounted block to the organization's component", async () => {
    await act(async () => {
      root.render(<RoutedType block={instanceBlock("sauna")} />);
    });
    expect(routedType()).toBe(COMPILED_FLOOR_BLOCK_TYPE);

    // The warm list lands after the block is on screen — exactly what a slow
    // connection does, and what B-105 forced on production by delaying the
    // response 12 seconds.
    listMock.mockResolvedValue([warmRow()]);
    bySlugMock.mockResolvedValue([coldRow()]);
    await act(async () => {
      await componentRegistry.ensureWarm();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(routedType()).toBe("db_kind_component");
  });

  test("arrival ORDER never changes which component an instance resolves to", async () => {
    // Warm first, then mount. `refresh(0)` rather than `ensureWarm()`: the
    // warm load is one-shot per session, so a second test would silently get
    // the first test's memoized promise and prove nothing.
    listMock.mockResolvedValue([warmRow()]);
    bySlugMock.mockResolvedValue([coldRow()]);
    await act(async () => {
      await componentRegistry.refresh(0);
    });
    await act(async () => {
      root.render(<RoutedType block={instanceBlock("cold-plunge")} />);
    });
    const warmFirst = routedType();

    // Mount first, then warm.
    await act(async () => {
      componentRegistry.replaceDbRows([]);
    });
    await act(async () => {
      root.render(<RoutedType block={instanceBlock("cold-plunge")} />);
    });
    await act(async () => {
      await componentRegistry.refresh(0);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const mountFirst = routedType();

    expect(mountFirst).toBe(warmFirst);
    expect(warmFirst).toBe("db_kind_component");
  });

});
