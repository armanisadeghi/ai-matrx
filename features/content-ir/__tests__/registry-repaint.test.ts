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
    createdBy: null,
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

  it("miss cache is keyed by (kind, platform, role) — an output miss never suppresses input", async () => {
    const registry = new ComponentRegistry(() => []);
    // The platform fetch returns ONLY an input-role row: output records a
    // miss, but a later input request must resolve from the ingested row
    // (and never be suppressed by the output miss).
    mockBySlug.mockResolvedValue([
      dbRow({ kind: "k_roles", componentKey: "input_comp", role: "input" }),
    ]);

    registry.requestComponent("k_roles", "web", "output");
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.resolve("k_roles", "web", "output")).toBeNull();
    expect(registry.resolve("k_roles", "web", "input")).toMatchObject({
      componentKey: "input_comp",
    });

    // Output stays miss-cached (no second fetch)…
    registry.requestComponent("k_roles", "web", "output");
    expect(mockBySlug).toHaveBeenCalledTimes(1);
    // …while input resolves without needing any fetch at all.
    registry.requestComponent("k_roles", "web", "input");
    expect(mockBySlug).toHaveBeenCalledTimes(1);
  });

  it("a wholesale refresh clears recorded misses: miss → create row → refresh → eager fetch works", async () => {
    const registry = new ComponentRegistry(() => []);
    mockBySlug.mockResolvedValue([]);

    // 1. Miss recorded.
    registry.requestComponent("late_created", "web", "output");
    await Promise.resolve();
    await Promise.resolve();
    expect(mockBySlug).toHaveBeenCalledTimes(1);
    registry.requestComponent("late_created", "web", "output");
    expect(mockBySlug).toHaveBeenCalledTimes(1); // suppressed

    // 2. The component is created mid-session; a refresh lands (its list
    //    fetch may even race and not carry the row — the CLEAR is the point).
    mockList.mockResolvedValue([]);
    await registry.refreshKindComponents(0);

    // 3. The eager path fetches again — the miss is no longer sticky.
    mockBySlug.mockResolvedValue([
      dbRow({ kind: "late_created", componentKey: "late_comp" }),
    ]);
    registry.requestComponent("late_created", "web", "output");
    await Promise.resolve();
    await Promise.resolve();
    expect(mockBySlug).toHaveBeenCalledTimes(2);
    expect(registry.resolve("late_created", "web", "output")).toMatchObject({
      componentKey: "late_comp",
    });
  });
});

describe("granular per-kind repaint versions", () => {
  it("kindRegistry: a bump for kind X notifies ONLY kind-X subscribers", () => {
    const seenX = jest.fn();
    const seenY = jest.fn();
    const unsubX = kindRegistry.subscribeKind("gran_kind_x", seenX);
    const unsubY = kindRegistry.subscribeKind("gran_kind_y", seenY);
    const versionYBefore = kindRegistry.getKindVersion("gran_kind_y");

    kindRegistry.upsertDefinition({
      kind: "gran_kind_x",
      schema: { kind: "gran_kind_x", fields: {} },
      schemaSource: "content_ir",
      tier: "cold",
    });

    expect(seenX).toHaveBeenCalledTimes(1);
    expect(seenY).not.toHaveBeenCalled();
    expect(kindRegistry.getKindVersion("gran_kind_y")).toBe(versionYBefore);

    unsubX();
    unsubY();
  });

  it("componentRegistry: ingest bumps only the ingested kinds; replaceDbRows (epoch) reaches everyone", () => {
    const registry = new ComponentRegistry(() => []);
    const seenX = jest.fn();
    const seenY = jest.fn();
    registry.subscribeKind("gran_x", seenX);
    registry.subscribeKind("gran_y", seenY);

    registry.ingestDbRows([dbRow({ kind: "gran_x", componentKey: "cx" })]);
    expect(seenX).toHaveBeenCalledTimes(1);
    expect(seenY).not.toHaveBeenCalled();
    const versionYBefore = registry.getKindVersion("gran_y");

    // Wholesale replace = epoch bump: every per-kind snapshot changes.
    registry.replaceDbRows([]);
    expect(seenY).toHaveBeenCalledTimes(1);
    expect(registry.getKindVersion("gran_y")).toBeGreaterThan(versionYBefore);
  });
});
