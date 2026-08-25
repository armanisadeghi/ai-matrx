import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("organization list failure contract", () => {
  it("waits for a browser token and renders fetch failures instead of an empty list", () => {
    const hooksSource = readFileSync(
      join(process.cwd(), "features/organizations/hooks.ts"),
      "utf8",
    );
    const serviceSource = readFileSync(
      join(process.cwd(), "features/organizations/service.ts"),
      "utf8",
    );
    const launcherSource = readFileSync(
      join(process.cwd(), "app/(core)/organizations/page.tsx"),
      "utf8",
    );

    expect(hooksSource).toContain(
      "authReady && Boolean(userId) && Boolean(accessToken)",
    );
    expect(serviceSource).toContain(
      "throw new Error(membersResult.error.message)",
    );
    expect(serviceSource).not.toContain(
      "Silently handle if organizations table doesn't exist yet",
    );
    expect(launcherSource).toContain(
      "const { organizations, loading, error, refresh }",
    );
    expect(launcherSource).toContain(
      "We couldn&apos;t load your organizations",
    );
  });
});
