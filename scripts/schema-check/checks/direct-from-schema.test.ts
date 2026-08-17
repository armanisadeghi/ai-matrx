import { checkDirectFromSchema } from "./direct-from-schema";
import type { CodeFile, Context, Snapshot } from "../types";

function snapshot(): Snapshot {
  const tables = new Map([["platform", new Set(["rulebook"])]]);
  return {
    generatedAt: "2026-08-17T16:20:57Z",
    source: "test snapshot",
    provenance: "rpc",
    tables,
    views: new Map(),
    exposedSchemas: new Set(["platform"]),
    relationSchemas: new Map([["rulebook", new Set(["platform"])]]),
  };
}

function context(source: string): Context {
  const codeFile: CodeFile = {
    path: "features/masterwork/service.ts",
    ext: ".ts",
    lines: source.split("\n"),
    generated: null,
  };
  return {
    root: "/test",
    snapshot: snapshot(),
    codeFiles: [codeFile],
    dbTypesSchemas: new Set(["platform"]),
    deadRelations: [],
    deadOldNames: new Set(),
    warn: false,
    schemaBinders: new Map(),
  };
}

describe("direct-from-schema", () => {
  it("accepts a canonical relation that exists in the selected schema", () => {
    const findings = checkDirectFromSchema(
      context('supabase.schema("platform").from("rulebook").select("*")'),
    );

    expect(findings).toEqual([]);
  });

  it("FIRES on a removed relation even when it exists in no other schema", () => {
    const findings = checkDirectFromSchema(
      context('supabase.schema("platform").from("expertise_pack").select("*")'),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        check: "direct-from-schema",
        severity: "error",
        location: "features/masterwork/service.ts:1",
        message: expect.stringContaining("PGRST205"),
      }),
    ]);
  });
});
