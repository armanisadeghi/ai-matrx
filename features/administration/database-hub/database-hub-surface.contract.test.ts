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
});
