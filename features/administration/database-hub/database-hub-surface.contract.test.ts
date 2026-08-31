import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("database admin surface contract", () => {
  it("mounts one canonical read-only context menu over the hub", () => {
    const hub = source(
      "features/administration/database-hub/DatabaseHubLanding.tsx",
    );

    expect(hub.match(/<NonEditableContextMenu/g)).toHaveLength(1);
    expect(hub).toContain('sourceFeature="admin"');
    expect(hub).toContain("surfaceName={ADMIN_DATABASE_SURFACE_NAME}");
    expect(hub).toContain("getApplicationScope={getSurfaceScope}");
    expect(hub).toContain('contentSource={{ type: "raw" }}');
    expect(hub).toContain("content: databaseToolCatalogueText");
  });

  it("keeps database navigation controls at the shared touch floor", () => {
    const layout = source(
      "app/(admin)/administration/database/DatabaseAdminLayoutClient.tsx",
    );

    expect(layout.match(/inline-flex min-h-11/g)).toHaveLength(3);
    expect(layout).not.toContain("inline-flex min-h-10");
  });

  it("does not repeat the shell-owned route title in a body hero", () => {
    const hub = source(
      "features/administration/database-hub/DatabaseHubLanding.tsx",
    );

    expect(hub).not.toContain("<h1");
    expect(hub).not.toContain("Database Tools Hub");
    expect(hub).not.toContain("overflow-auto");
  });

  it("keeps every tool promised by the surface intro in the hub catalogue", () => {
    const tools = source(
      "features/administration/database-hub/database-tools.ts",
    );

    expect(tools).toContain('path: "/administration/database/data-integrity"');
    expect(tools).toContain('path: "/administration/database/relationships"');
  });

  it("keeps every SQL-running client on the canonical terminal Server Action", () => {
    const action = source("actions/admin/database.ts");
    const hook = source(
      "features/administration/hooks/use-database-admin.ts",
    );
    const enhancedClient = source(
      "app/(admin)/administration/database/components/database-client.tsx",
    );
    const legacyDashboard = source(
      "features/administration/database-admin/DatabaseAdminDashboard.tsx",
    );
    const notebook = source(
      "features/administration/database-admin/workbench/hooks/useQueryWorkbench.ts",
    );
    const clientSources = [hook, enhancedClient, legacyDashboard, notebook];

    expect(action.match(/rpc\("execute_admin_query"/g)).toHaveLength(1);
    expect(hook).toContain("await executeSqlQuery(query)");
    expect(enhancedClient).toContain("onExecuteQuery={executeQuery}");
    expect(legacyDashboard).toContain("await executeQuery(query)");
    expect(notebook).toContain("await executeSqlQuery(resolved)");
    for (const clientSource of clientSources) {
      expect(clientSource).not.toContain('rpc("execute_admin_query"');
      expect(clientSource).not.toContain("Promise.race");
      expect(clientSource).not.toContain("cancelQuery");
      expect(clientSource).not.toContain("isTimeout");
    }
  });

  it("does not advertise the retired client-only cancellation contract", () => {
    const tools = source(
      "features/administration/database-hub/database-tools.ts",
    );

    expect(tools).not.toContain("with cache + cancel + timeout");
    expect(tools).not.toContain(
      "with query cache, cancel, and timeout handling",
    );
    expect(tools).toContain("terminal-result locking");
  });
});
