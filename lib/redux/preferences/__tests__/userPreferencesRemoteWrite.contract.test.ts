import fs from "node:fs";
import path from "node:path";

describe("user preferences remote-write ownership", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "lib/redux/preferences/userPreferencesSlice.ts"),
    "utf8",
  );
  const writeBoundary = source.slice(
    source.indexOf("write: async ({ identity, signal, body })"),
    source.indexOf("void signal", source.indexOf("write: async ({ identity, signal, body })")),
  );

  test("updates the user-global singleton in place and never chooses an organization for it", () => {
    expect(writeBoundary).toContain(".update({ preferences: body })");
    expect(writeBoundary).not.toContain("organization_id");
    expect(writeBoundary).not.toContain("ensureOrgId(");
    expect(writeBoundary).not.toContain(".upsert(");
  });

  test("propagates PostgREST failures and a missing row instead of silently accepting them", () => {
    expect(writeBoundary).toContain("if (error) throw error");
    expect(writeBoundary).toContain("written.length === 0");
  });
});
