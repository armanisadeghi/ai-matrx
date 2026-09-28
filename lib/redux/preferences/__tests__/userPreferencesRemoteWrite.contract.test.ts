import fs from "node:fs";
import path from "node:path";

describe("user preferences remote-write ownership", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "lib/redux/preferences/userPreferencesSlice.ts"),
    "utf8",
  );
  const start = source.indexOf("write: async ({ identity, signal, body, base })");
  const writeBoundary = source.slice(start, source.indexOf("\n    },", start));
  const patchSource = fs.readFileSync(
    path.join(process.cwd(), "lib/redux/preferences/preferencePatch.ts"),
    "utf8",
  );

  test("updates the user-global singleton in place and never chooses an organization for it", () => {
    expect(start).toBeGreaterThan(-1);
    expect(writeBoundary).toContain("savePreferencePatch(");
    expect(writeBoundary).not.toContain("organization_id");
    expect(writeBoundary).not.toContain("ensureOrgId(");
    expect(writeBoundary).not.toContain(".upsert(");
    expect(patchSource).not.toContain(".upsert(");
    expect(patchSource).not.toContain("organization_id");
  });

  test("never writes the whole cached record — only the changed keys, merged under CAS", () => {
    expect(writeBoundary).not.toContain(".update({ preferences: body })");
    expect(patchSource).toContain("mergeJsonColumn<PreferencesRow>(");
    expect(patchSource).toContain('.eq("version", expectedVersion)');
  });

  test("propagates PostgREST failures and a missing row instead of silently accepting them", () => {
    expect(patchSource).toContain('case "not_found":');
    expect(patchSource).toContain('case "error":');
    expect(patchSource).toContain('case "conflict":');
  });
});
