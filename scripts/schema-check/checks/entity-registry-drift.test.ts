import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";
import { checkEntityRegistryDrift } from "./entity-registry-drift";
import type { Context, Snapshot } from "../types";

// Break this guards: the check reading anything other than the metadata it is
// handed (e.g. a re-export shim with zero rows — DC-009), which would pass a
// token whose schema.table is not live.

function snapshot(): Snapshot {
  return {
    generatedAt: "2026-09-10T00:00:00Z",
    source: "test snapshot",
    provenance: "rpc",
    tables: new Map([
      ["mandate", new Set(["definition"])],
      ["graveyard", new Set(["old_thing"])],
      ["rag", new Set(["library_docs"])],
    ]),
    views: new Map([["platform", new Set(["some_view"])]]),
    exposedSchemas: new Set(["mandate", "rag", "platform"]),
    relationSchemas: new Map([
      ["definition", new Set(["mandate"])],
      ["old_thing", new Set(["graveyard"])],
      ["library_docs", new Set(["rag"])],
      ["some_view", new Set(["platform"])],
    ]),
  };
}

function context(): Context {
  return {
    root: "/test",
    snapshot: snapshot(),
    codeFiles: [],
    dbTypesSchemas: new Set(),
    deadRelations: [],
    deadOldNames: new Set(),
    warn: false,
    schemaBinders: new Map(),
  };
}

describe("entity-registry-drift", () => {
  it("passes tokens whose table or view is live", () => {
    const findings = checkEntityRegistryDrift(context(), {
      mandate: { token: "mandate", schema: "mandate", table: "definition" },
      v: { token: "v", schema: "platform", table: "some_view" },
    });
    expect(findings).toEqual([]);
  });

  it("flags a planted token whose schema.table exists nowhere", () => {
    const findings = checkEntityRegistryDrift(context(), {
      planted: { token: "planted_bad", schema: "nope", table: "does_not_exist" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain('"planted_bad" points at "nope.does_not_exist"');
    expect(findings[0].message).toContain("no relation named");
  });

  it("names the schema a moved table lives in now", () => {
    const findings = checkEntityRegistryDrift(context(), {
      library_doc: { token: "library_doc", schema: "reg", table: "library_docs" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toContain("schema_name='rag'");
  });

  it("flags a token buried in graveyard", () => {
    const findings = checkEntityRegistryDrift(context(), {
      old: { token: "old", schema: "platform", table: "old_thing" },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("moved to graveyard");
  });

  it("reads the installed package vocabulary by default (non-empty)", () => {
    // Against an empty snapshot every installed token is not live, so the
    // default path must produce one finding per package token — zero would mean
    // the check is reading an empty source again.
    const empty: Context = {
      ...context(),
      snapshot: { ...snapshot(), tables: new Map(), views: new Map(), relationSchemas: new Map() },
    };
    const findings = checkEntityRegistryDrift(empty);
    expect(Object.keys(ENTITY_TYPE_METADATA).length).toBeGreaterThan(100);
    expect(findings).toHaveLength(Object.keys(ENTITY_TYPE_METADATA).length);
  });
});
