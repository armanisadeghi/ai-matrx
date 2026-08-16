/**
 * Pure parse/validate contract for the Run Surface config document:
 * tolerant reads (parseSurfaceConfig never throws, drops malformed readouts
 * with a warning, clamps positions, ignores unknown keys, round-trip stable)
 * and strict writes (validateSurfaceConfig names each specific problem).
 */

import {
  GRID_COLUMNS,
  parseSurfaceConfig,
  SURFACE_SCHEMA_VERSION,
  validateSurfaceConfig,
  type RunSurfaceConfig,
} from "../config";

function validConfig(): RunSurfaceConfig {
  return {
    schemaVersion: SURFACE_SCHEMA_VERSION,
    pages: [{ id: "main", title: "Main" }],
    readouts: [
      {
        id: "rail",
        source: { kind: "progressRail" },
        pos: { x: 0, y: 0, w: GRID_COLUMNS, h: 6 },
      },
      {
        id: "out",
        source: { kind: "node", nodeId: "n1" },
        pos: { x: 0, y: 6, w: 12, h: 8 },
        pageId: "main",
        multiRun: "latest",
        prefer: "persisted",
        visibility: { appearOn: "node:n1:started", empty: "hidden" },
      },
    ],
  };
}

describe("parseSurfaceConfig — tolerance", () => {
  it("returns an empty config for non-object input, never throwing", () => {
    for (const raw of [null, undefined, 42, "x", [], true]) {
      const { config, warnings } = parseSurfaceConfig(raw);
      expect(config.readouts).toEqual([]);
      expect(config.pages).toEqual([]);
      expect(config.schemaVersion).toBe(SURFACE_SCHEMA_VERSION);
      expect(Array.isArray(warnings)).toBe(true);
    }
  });

  it("drops a malformed readout with a warning and keeps the rest", () => {
    const { config, warnings } = parseSurfaceConfig({
      schemaVersion: SURFACE_SCHEMA_VERSION,
      pages: [],
      readouts: [
        { id: "good", source: { kind: "node", nodeId: "a" }, pos: { x: 0, y: 0, w: 6, h: 4 } },
        { id: "no-source", pos: { x: 0, y: 0, w: 6, h: 4 } },
        { source: { kind: "node", nodeId: "b" }, pos: { x: 0, y: 0, w: 6, h: 4 } }, // no id
        "not-an-object",
      ],
    });
    expect(config.readouts.map((r) => r.id)).toEqual(["good"]);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("drops duplicate readout ids with a warning", () => {
    const readout = {
      id: "dup",
      source: { kind: "node", nodeId: "a" },
      pos: { x: 0, y: 0, w: 6, h: 4 },
    };
    const { config, warnings } = parseSurfaceConfig({
      readouts: [readout, readout],
    });
    expect(config.readouts).toHaveLength(1);
    expect(warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("clamps out-of-grid positions instead of dropping the readout", () => {
    const { config } = parseSurfaceConfig({
      readouts: [
        {
          id: "wild",
          source: { kind: "node", nodeId: "a" },
          pos: { x: 99, y: -5, w: 999, h: 0 },
        },
      ],
    });
    const pos = config.readouts[0].pos;
    expect(pos.w).toBeLessThanOrEqual(GRID_COLUMNS);
    expect(pos.x + pos.w).toBeLessThanOrEqual(GRID_COLUMNS);
    expect(pos.x).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.h).toBeGreaterThanOrEqual(1);
    // The clamped result is valid on the strict write path too.
    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("ignores unknown keys (forward compatibility)", () => {
    const { config } = parseSurfaceConfig({
      schemaVersion: SURFACE_SCHEMA_VERSION,
      futureTopLevel: { anything: true },
      pages: [{ id: "p1", title: "P1", futurePageKey: 1 }],
      readouts: [
        {
          id: "r1",
          source: { kind: "node", nodeId: "a" },
          pos: { x: 0, y: 0, w: 6, h: 4 },
          futureReadoutKey: "x",
        },
      ],
    });
    expect(config.pages).toEqual([{ id: "p1", title: "P1" }]);
    expect(config.readouts[0]).toEqual({
      id: "r1",
      source: { kind: "node", nodeId: "a" },
      pos: { x: 0, y: 0, w: 6, h: 4 },
    });
    expect("futureTopLevel" in config).toBe(false);
  });

  it("is round-trip stable: parse(parse(x).config).config equals parse(x).config", () => {
    const messy = {
      schemaVersion: SURFACE_SCHEMA_VERSION,
      deliverableNodeId: "n1",
      junk: true,
      pages: [{ id: "main", title: "" }, { notAPage: 1 }],
      readouts: [
        ...validConfig().readouts,
        { id: "broken", source: { kind: "mystery" }, pos: {} },
        {
          id: "clamped",
          source: { kind: "group", label: "G", nodeIds: ["a", 2, "b"] },
          pos: { x: 30, y: 1.4, w: 50, h: -2 },
        },
      ],
    };
    const first = parseSurfaceConfig(messy);
    const second = parseSurfaceConfig(first.config);
    expect(second.config).toEqual(first.config);
    // A clean re-parse of an already-parsed document raises no warnings.
    expect(second.warnings).toEqual([]);
  });

  it("keeps every authored field of a fully-valid document", () => {
    const original = validConfig();
    const { config, warnings } = parseSurfaceConfig(original);
    expect(config).toEqual(original);
    expect(warnings).toEqual([]);
  });
});

describe("validateSurfaceConfig — strict, specific problems", () => {
  it("accepts a valid config", () => {
    expect(validateSurfaceConfig(validConfig())).toEqual([]);
  });

  it("names a wrong schemaVersion", () => {
    const config = { ...validConfig(), schemaVersion: 999 };
    const problems = validateSurfaceConfig(config);
    expect(problems.some((p) => p.includes("schemaVersion"))).toBe(true);
    expect(problems.some((p) => p.includes("999"))).toBe(true);
  });

  it("names an off-grid readout by id", () => {
    const config = validConfig();
    config.readouts[1] = {
      ...config.readouts[1],
      pos: { x: 20, y: 0, w: 10, h: 4 },
    };
    const problems = validateSurfaceConfig(config);
    expect(problems.some((p) => p.includes('"out"') && p.includes("off the grid"))).toBe(
      true,
    );
  });

  it("names duplicate readout ids", () => {
    const config = validConfig();
    config.readouts.push({ ...config.readouts[0] });
    const problems = validateSurfaceConfig(config);
    expect(problems.some((p) => p.includes(`Duplicate readout id "rail"`))).toBe(true);
  });

  it("names a readout pointing at a page that does not exist", () => {
    const config = validConfig();
    config.readouts[1] = { ...config.readouts[1], pageId: "ghost" };
    const problems = validateSurfaceConfig(config);
    expect(
      problems.some((p) => p.includes('"out"') && p.includes('"ghost"')),
    ).toBe(true);
  });

  it("names a zero-size box", () => {
    const config = validConfig();
    config.readouts[1] = {
      ...config.readouts[1],
      pos: { x: 0, y: 6, w: 12, h: 0 },
    };
    const problems = validateSurfaceConfig(config);
    expect(problems.some((p) => p.includes("zero-size"))).toBe(true);
  });

  it("names duplicate page ids", () => {
    const config = validConfig();
    config.pages.push({ id: "main", title: "Again" });
    const problems = validateSurfaceConfig(config);
    expect(problems.some((p) => p.includes("Page ids must be unique"))).toBe(true);
  });
});
