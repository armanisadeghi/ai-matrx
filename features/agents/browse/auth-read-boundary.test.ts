import fs from "node:fs";
import path from "node:path";

describe("agent browse authenticated read boundary", () => {
  const agentsRoot = path.resolve(__dirname, "..");

  it("verifies a browser session before every browse RPC", () => {
    const source = fs.readFileSync(path.join(__dirname, "service.ts"), "utf8");

    expect(
      source.match(/requireAuthenticatedSupabaseSession\(supabase\)/g),
    ).toHaveLength(3);
    for (const rpc of [
      "agx_list_scoped",
      "agx_list_scope_counts",
      "agx_list_facets",
    ]) {
      expect(
        source.indexOf("requireAuthenticatedSupabaseSession(supabase)"),
      ).toBeLessThan(source.indexOf(`supabase.rpc(\"${rpc}\"`));
    }
  });

  it("does not dispatch the drift-alert read before auth is usable", () => {
    const source = fs.readFileSync(
      path.join(agentsRoot, "hooks/useDriftAlerts.ts"),
      "utf8",
    );

    expect(source).toContain("selectAuthReady");
    expect(source).toContain("selectUserId");
    expect(source).toContain("selectAccessToken");
    expect(source).toMatch(
      /if \(authReady && userId && accessToken\) \{[\s\S]*dispatch\(fetchDriftAlerts\(\)\)/,
    );
  });

  it("keeps the shortcut admin directory behind the same browser auth boundary", () => {
    const thunkSource = fs.readFileSync(
      path.join(agentsRoot, "redux/agent-shortcuts/thunks.ts"),
      "utf8",
    );
    const directorySource = fs.readFileSync(
      path.join(agentsRoot, "../agent-shortcuts/hooks/useShortcutDirectory.ts"),
      "utf8",
    );

    const guardIndex = thunkSource.indexOf(
      "await requireAuthenticatedSupabaseSession(supabase)",
    );
    const rpcIndex = thunkSource.indexOf(
      "supabase.rpc(SHORTCUT_RPCS.listNonGlobalForAdmin",
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(rpcIndex);

    expect(directorySource).toContain("selectAuthReady");
    expect(directorySource).toContain("selectUserId");
    expect(directorySource).toContain("selectAccessToken");
    expect(directorySource).toMatch(
      /if \(!authReady \|\| !userId \|\| !accessToken\) return;[\s\S]*listNonGlobalShortcutsForAdmin\(\)/,
    );
  });
});
