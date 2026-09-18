import { checkDeadRelations } from "./dead-relations";
import type { CodeFile, Context, Snapshot } from "../types";

function snapshot(): Snapshot {
  return {
    generatedAt: "2026-09-13T00:00:00Z",
    source: "test snapshot",
    provenance: "rpc",
    tables: new Map(),
    views: new Map(),
    exposedSchemas: new Set(),
    relationSchemas: new Map(),
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
    dbTypesSchemas: new Set(),
    deadRelations: [
      {
        relation: "notes",
        old: "public.notes",
        newSchema: "workbench",
        new: "workbench.notes",
        since: "2026-09-01",
        reason: "moved for the test",
      },
    ],
    deadOldNames: new Set(["notes"]),
    warn: false,
    schemaBinders: new Map(),
  };
}

describe("dead-relations", () => {
  it("finds bare, typed, and qualified old references while accepting an explicit new schema", () => {
    const findings = checkDeadRelations(
      context(
        [
          'supabase.from("notes").select("*")',
          'type Note = Database["public"]["Tables"]["notes"]',
          "const source = public.notes",
          'supabase.schema("workbench").from("notes").select("*")',
        ].join("\n"),
      ),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        check: "dead-relations",
        location: "features/masterwork/service.ts:1",
        message: expect.stringContaining(
          "[bare .from/.table (resolves to old schema)]",
        ),
      }),
      expect.objectContaining({
        location: "features/masterwork/service.ts:2",
        message: expect.stringContaining('[Database["public"] type ref]'),
      }),
      expect.objectContaining({
        location: "features/masterwork/service.ts:3",
        message: expect.stringContaining("[qualified public.notes]"),
      }),
    ]);
  });

  it("keeps the former registry ordering when source references occur out of order", () => {
    const ctx = context(
      [
        'supabase.from("widgets").select("*")',
        'supabase.from("notes").select("*")',
      ].join("\n"),
    );
    ctx.deadRelations.push({
      relation: "widgets",
      old: "public.widgets",
      newSchema: "workbench",
      new: "workbench.widgets",
      since: "2026-09-01",
      reason: "moved for the test",
    });

    expect(checkDeadRelations(ctx).map((finding) => finding.location)).toEqual([
      "features/masterwork/service.ts:2",
      "features/masterwork/service.ts:1",
    ]);
  });

  it("preserves the original regex boundaries, overlapping dotted references, and escaped registry names", () => {
    const ctx = context(
      [
        "const overlap = x.public.notes",
        "const prefix = notpublic.notes",
        "const suffix = public.notes_more",
        'type OddName = Database["legacy-schema"]["Tables"]["note$"]',
      ].join("\n"),
    );
    ctx.deadRelations.push({
      relation: "note$",
      old: "legacy-schema.note$",
      newSchema: "workbench",
      new: "workbench.note$",
      since: "2026-09-01",
      reason: "moved for the test",
    });

    expect(checkDeadRelations(ctx)).toEqual([
      expect.objectContaining({
        location: "features/masterwork/service.ts:1",
        message: expect.stringContaining("[qualified public.notes]"),
      }),
      expect.objectContaining({
        location: "features/masterwork/service.ts:4",
        message: expect.stringContaining(
          '[Database["legacy-schema"] type ref]',
        ),
      }),
    ]);
  });
});
