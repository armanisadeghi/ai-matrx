import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function productionSourcesUnder(relativeRoots: string[]): Array<{
  path: string;
  content: string;
}> {
  const files: string[] = [];
  const visit = (relativePath: string) => {
    for (const entry of readdirSync(join(process.cwd(), relativePath), {
      withFileTypes: true,
    })) {
      const child = join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (
        /\.(?:ts|tsx)$/.test(entry.name) &&
        !/\.test\./.test(entry.name)
      ) {
        files.push(child);
      }
    }
  };
  relativeRoots.forEach(visit);
  return files.map((path) => ({ path, content: source(path) }));
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

  it("mounts one canonical editable context menu over the SQL workbench", () => {
    const editor = source(
      "app/(admin)/administration/database/components/enhanced-sql-editor.tsx",
    );

    expect(editor.match(/<EditableContextMenu/g)).toHaveLength(1);
    expect(editor).toContain('sourceFeature="admin"');
    expect(editor).toContain("surfaceName={ADMIN_DATABASE_SURFACE_NAME}");
    expect(editor).toContain("getApplicationScope={getSurfaceScope}");
    expect(editor).toContain("getTextarea={() => sqlTextareaRef.current}");
  });

  it("keeps database navigation controls at the shared touch floor", () => {
    const layout = source(
      "app/(admin)/administration/database/DatabaseAdminLayoutClient.tsx",
    );

    expect(layout.match(/inline-flex min-h-11/g)).toHaveLength(3);
    expect(layout).not.toContain("inline-flex min-h-10");
  });

  it("reserves room to scroll the final database tab clear of its fade", () => {
    const layout = source(
      "app/(admin)/administration/database/DatabaseAdminLayoutClient.tsx",
    );

    expect(layout.match(/overflow-x-auto[^"`]*pr-12/g)).toHaveLength(2);
  });

  it("does not repeat the shell-owned route title in a body hero", () => {
    const hub = source(
      "features/administration/database-hub/DatabaseHubLanding.tsx",
    );

    expect(hub).not.toContain("<h1");
    expect(hub).not.toContain("Database Tools Hub");
    expect(hub).not.toContain("overflow-auto");
  });

  it("gives the database body one terminal route scroll owner", () => {
    const adminFrame = source(
      "app/(admin)/administration/ClientAdminLayout.tsx",
    );
    const databaseFrame = source(
      "app/(admin)/administration/database/DatabaseAdminLayoutClient.tsx",
    );

    // The database frame owns the scrollable content under its tool rows.
    // Its terminal content must reserve the shared page-end clearance; putting
    // that space on an outer wrapper would leave the final result obscured.
    // The surrounding admin frame must clip that route instead of adding a
    // second competing vertical scroll region.
    expect(databaseFrame).toContain(
      'className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto overflow-x-hidden"',
    );
    expect(databaseFrame.match(/scroll-page-end-space/g)).toHaveLength(1);
    expect(adminFrame).toContain(
      'pathname.startsWith("/administration/database")',
    );
    expect(adminFrame).toContain(
      'databaseRoute ? "overflow-hidden" : "overflow-y-auto"',
    );
  });

  it("keeps every tool promised by the surface intro in the hub catalogue", () => {
    const tools = source(
      "features/administration/database-hub/database-tools.ts",
    );

    expect(tools).toContain('path: "/administration/database/data-integrity"');
    expect(tools).toContain('path: "/administration/database/relationships"');
  });

  it("keeps every SQL-running client on the canonical terminal Server Action", () => {
    const schemaOverview = source("app/api/schema-overview/route.ts");
    const privilegedClient = source(
      "features/administration/database-hub/require-super-admin-database-client.ts",
    );
    const hook = source("features/administration/hooks/use-database-admin.ts");
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

    expect(privilegedClient).toContain("await requireSuperAdmin()");
    expect(privilegedClient).toContain("return createAdminClient()");
    const privilegedSurfaceSources = productionSourcesUnder([
      "actions/admin",
      "app/api/schema-overview",
      "features/administration/canonicalization",
      "lib/integrity",
    ]);
    const directSqlCallers = privilegedSurfaceSources.filter(({ content }) =>
      /\.rpc\(\s*["']execute_admin_query["']/.test(content),
    );

    expect(directSqlCallers.map(({ path }) => path).sort()).toEqual([
      "actions/admin/database.ts",
      "actions/admin/enum-functions.ts",
      "actions/admin/sql-functions.ts",
      "app/api/schema-overview/route.ts",
      "features/administration/canonicalization/service/canonicalizationService.ts",
      "lib/integrity/server.ts",
    ]);
    for (const { content } of directSqlCallers) {
      expect(content).not.toContain("createAdminClient");
      expect(content).toContain("await requireSuperAdminDatabaseClient()");
    }
    expect(schemaOverview).toContain('"Cache-Control": "private, no-store"');
    expect(schemaOverview).toContain("if (authResponse) return authResponse");
    expect(
      schemaOverview.indexOf("await requireSuperAdminDatabaseClient()"),
    ).toBeLessThan(schemaOverview.indexOf("if (cached &&"));
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

  it("distinguishes a cached query from a result actually served from cache", () => {
    const editor = source(
      "app/(admin)/administration/database/components/enhanced-sql-editor.tsx",
    );

    expect(editor).toContain("resultWasServedFromCache");
    expect(editor).toContain(
      "useCache && Object.prototype.hasOwnProperty.call(queryCache, sqlQuery)",
    );
    expect(editor).toContain(
      "setResultWasServedFromCache(willUseCachedResult && result != null)",
    );
    expect(editor).toContain("{resultWasServedFromCache && (");
  });

  it("leaves workbench memoization to the React Compiler", () => {
    const workbenchFiles = [
      "features/administration/database-admin/workbench/ResultPreview.tsx",
      "features/administration/database-admin/workbench/WorkbenchClient.tsx",
      "features/administration/database-admin/workbench/QueryBlock.tsx",
      "features/administration/database-admin/workbench/MergePanel.tsx",
      "features/administration/database-admin/workbench/hooks/useQueryWorkbench.ts",
    ];

    for (const file of workbenchFiles) {
      const content = source(file);
      expect(content).not.toMatch(/use(?:Memo|Callback)\s*[<(]/);
    }
  });
});
