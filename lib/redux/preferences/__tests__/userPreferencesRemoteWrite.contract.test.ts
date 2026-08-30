import fs from "node:fs";
import path from "node:path";

describe("user preferences remote-write ownership", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "lib/redux/preferences/userPreferencesSlice.ts"),
    "utf8",
  );

  test("uses the personal organization for the user-global singleton", () => {
    const writeBoundary = source.slice(
      source.indexOf("write: async ({ identity, signal, body })"),
      source.indexOf("void signal", source.indexOf("write: async ({ identity, signal, body })")),
    );

    expect(writeBoundary).toContain("organization_id: await resolvePersonalOrgId()");
    expect(writeBoundary).not.toContain("ensureOrgId(undefined)");
  });

  test("propagates PostgREST failures instead of silently accepting them", () => {
    const writeBoundary = source.slice(
      source.indexOf("write: async ({ identity, signal, body })"),
      source.indexOf("void signal", source.indexOf("write: async ({ identity, signal, body })")),
    );

    expect(writeBoundary).toContain("const { error } = await supabase");
    expect(writeBoundary).toContain("if (error) throw error");
  });
});
