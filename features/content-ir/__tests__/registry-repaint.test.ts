/**
 * Late-arrival repaint plumbing — the registries' version/subscription seam
 * that `useContentIrRegistryVersion` (BlockRenderer) rides. A schema or
 * component landing AFTER a region finalized must produce an observable
 * version change + listener call, or the frozen envelope can never upgrade.
 */

import { ComponentRegistry } from "../registry/component-registry";
import { kindRegistry } from "../registry/kind-registry";
import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "../registry/schema-source-kind-components";

jest.mock("../registry/schema-source-kind-components", () => {
  const actual = jest.requireActual<
    typeof import("../registry/schema-source-kind-components")
  >("../registry/schema-source-kind-components");
  return {
    ...actual,
    listKindComponentsFromTables: jest.fn(),
    getKindComponentBySlug: jest.fn(),
  };
});

const mockList = listKindComponentsFromTables as jest.MockedFunction<
  typeof listKindComponentsFromTables
>;
const mockBySlug = getKindComponentBySlug as jest.MockedFunction<
  typeof getKindComponentBySlug
>;

function dbRow(
  overrides: Partial<KindComponentProjection> &
    Pick<KindComponentProjection, "kind" | "componentKey">,
): KindComponentProjection {
  return {
    platform: "web",
    role: "output",
    source: "db",
    isActive: true,
    config: {},
    componentSource: "export default function C(){return null}",
    propsTransform: null,
    pinnedKindVersion: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    id: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

describe("kindRegistry version tick", () => {
  it("bumps + notifies on upsertDefinition (cold schema arrival path)", () => {
    const before = kindRegistry.getVersion();
    const listener = jest.fn();
    const unsubscribe = kindRegistry.subscribeVersion(listener);

    kindRegistry.upsertDefinition({
      kind: "repaint_test_kind",
      schema: { kind: "repaint_test_kind", fields: {} },
      schemaSource: "content_ir",
      tier: "cold",
    });

    expect(kindRegistry.getVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    kindRegistry.upsertDefinition({
      kind: "repaint_test_kind",
      schema: { kind: "repaint_test_kind", fields: {} },
      schemaSource: "content_ir",
      tier: "cold",
    });
    expect(listener).toHaveBeenCalledTimes(1); // unsubscribed
  });
});

describe("componentRegistry version tick + cold single-kind fetch", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockBySlug.mockReset();
  });

  it("WARM ingest notifies subscribers (previously only refresh did)", () => {
    const registry = new ComponentRegistry(() => []);
    const listener = jest.fn();
    registry.subscribe(listener);
    const before = registry.getVersion();

    registry.ingestDbRows([dbRow({ kind: "k1", componentKey: "c1" })]);

    expect(registry.getVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalledTimes(1);

    // Ingesting a duplicate key changes nothing → no spurious notify.
    registry.ingestDbRows([dbRow({ kind: "k1", componentKey: "c1" })]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("requestComponent: fetches ONE kind, ingests, notifies; dedupes in-flight + misses", async () => {
    const registry = new ComponentRegistry(() => []);
    const listener = jest.fn();
    registry.subscribe(listener);
    mockBySlug.mockResolvedValue([
      dbRow({ kind: "wine_tasting", componentKey: "wine_tasting_card" }),
    ]);

    registry.requestComponent("wine_tasting", "web", "output");
    registry.requestComponent("wine_tasting", "web", "output"); // in-flight dedupe
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBySlug).toHaveBeenCalledTimes(1);
    expect(mockBySlug).toHaveBeenCalledWith("wine_tasting", "web");
    expect(registry.resolve("wine_tasting", "web", "output")).toMatchObject({
      componentKey: "wine_tasting_card",
      resolvedBy: "db",
      isActive: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    // Already resolvable → no second fetch.
    registry.requestComponent("wine_tasting", "web", "output");
    expect(mockBySlug).toHaveBeenCalledTimes(1);
  });

  it("requestComponent: a miss is remembered (no re-fetch storm for unknown kinds)", async () => {
    const registry = new ComponentRegistry(() => []);
    mockBySlug.mockResolvedValue([]);

    registry.requestComponent("no_such_kind", "web", "output");
    await Promise.resolve();
    await Promise.resolve();
    registry.requestComponent("no_such_kind", "web", "output");

    expect(mockBySlug).toHaveBeenCalledTimes(1);
  });
});
