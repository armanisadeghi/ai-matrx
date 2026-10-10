/**
 * @jest-environment node
 *
 * A PERSON IN MANY ORGANIZATIONS STILL SEES THEIR SCOPES (lane FINISH-THE-SWITCH, 2026-10-05).
 *
 * test@test.com belongs to 970 organizations. The scopes boot read put every organization id in
 * ONE GET url (`?id=in.(…970 ids…)`, ~38 KB); the gateway answered "400 Bad Request" and /scopes
 * said "Couldn't load your scopes". An id list in a GET url is read in chunks, never whole.
 *
 * 1. `readInChunks` never sends more than `IN_CHUNK` ids in one call and returns every row.
 * 2. `scopesService` reads its organizations and projects only through it (a census of the source).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IN_CHUNK, readInChunks } from "@/features/scopes/service/inChunks";

describe("readInChunks", () => {
  it("never sends more than IN_CHUNK ids in one call, and returns every row in order", async () => {
    const ids = Array.from({ length: 970 }, (_, i) => `id-${i}`);
    const sizes: number[] = [];
    const res = await readInChunks(ids, async (chunk) => {
      sizes.push(chunk.length);
      return { data: chunk.map((id) => ({ id })), error: null };
    });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(970);
    expect(res.data?.[969]).toEqual({ id: "id-969" });
    expect(Math.max(...sizes)).toBeLessThanOrEqual(IN_CHUNK);
    expect(sizes.length).toBe(Math.ceil(970 / IN_CHUNK));
  });

  it("answers an empty list without a call", async () => {
    const run = jest.fn();
    const res = await readInChunks([], run);
    expect(run).not.toHaveBeenCalled();
    expect(res).toEqual({ data: [], error: null });
  });

  it("returns the first error and no rows", async () => {
    const res = await readInChunks(["a", ...Array.from({ length: 150 }, (_, i) => `x${i}`)], async (chunk) =>
      chunk.includes("a") ? { data: null, error: { message: "boom" } } : { data: [{ id: "ok" }], error: null },
    );
    expect(res.error).toEqual({ message: "boom" });
  });
});

describe("the scope tree's projects read (projects service)", () => {
  it("reads her organizations' projects through readInChunks, never one whole id list", () => {
    const src = readFileSync(join(__dirname, "..", "..", "projects", "service.ts"), "utf8");
    expect(src).toContain("readInChunks(");
    expect(src).not.toMatch(/\.in\(\s*"id",\s*orgIds\s*\)/);
    expect(src).not.toMatch(/\.in\(\s*"organization_id",\s*orgIds\s*\)/);
  });
});

describe("every read over ALL of a person's memberships goes in chunks", () => {
  // The same class as the scopes boot read: a membership list put whole into one GET url.
  const root = join(__dirname, "..", "..", "..");
  const sites = [
    "features/organizations/service.ts",
    "features/knowledge/hub/tags/tagApi.ts",
    "features/agents/decision-review/service.ts",
    "features/masterwork/encore/service.ts",
  ];
  it.each(sites)("%s never sends the whole org id list in one .in()", (rel) => {
    const src = readFileSync(join(root, rel), "utf8");
    expect(src).toMatch(/readInChunks\(|idChunks\(/);
    expect(src).not.toMatch(/\.in\(\s*"(id|organization_id)",\s*(orgIds|organizationIds)(\s*\?\?\s*\[\])?\s*\)/);
  });
});
