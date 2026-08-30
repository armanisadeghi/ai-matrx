import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "../../../..");

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("retired Mandate producer contract", () => {
  it("keeps runtime reads and writes on the canonical Mandate tables and API", () => {
    const runtimeSource = [
      // The tables are NAMED in one place now — the Phase 1W storage router —
      // and the services reach them through it. Both of the router's branches
      // are real compiled code, so this guard keeps holding across the cutover.
      "lib/supabase/mandateStorage.ts",
      "features/mandates/admin/service.ts",
      "features/mandates/service.ts",
      "features/mandates/service.server.ts",
      "features/mandates/overrides.ts",
    ]
      .map(source)
      .join("\n");

    // Post-1W canonical tables: mandate.definition / mandate.binding.
    expect(runtimeSource).toContain('schema("mandate").from("definition")');
    expect(runtimeSource).toContain('schema("mandate").from("binding")');
    expect(runtimeSource).toContain('path: "/mandates/');
    expect(runtimeSource).not.toMatch(/agent\.slot_(?:definition|binding)/);
    expect(runtimeSource).not.toMatch(/\.from\("slot_(?:definition|binding)"\)/);
    expect(runtimeSource).not.toContain('path: "/agent-slots/');
  });

  it("permanently redirects both retired slot URLs to Mandates", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nextConfig = require(join(REPO_ROOT, "next.config.js"));
    const redirects: Array<{
      source: string;
      destination: string;
      permanent: boolean;
    }> = await nextConfig.redirects();

    expect(redirects).toContainEqual({
      source: "/agents/slots",
      destination: "/mandates",
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: "/administration/agents/slots",
      destination: "/administration/mandates",
      permanent: true,
    });
  });

  it("permanently redirects the pre-detach /agents/mandates URLs", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nextConfig = require(join(REPO_ROOT, "next.config.js"));
    const redirects: Array<{
      source: string;
      destination: string;
      permanent: boolean;
    }> = await nextConfig.redirects();

    for (const [source, destination] of [
      ["/agents/mandates", "/mandates"],
      ["/agents/mandates/new", "/administration/mandates/new"],
      ["/agents/mandates/:mandateKey", "/mandates/:mandateKey"],
      ["/administration/agents/mandates", "/administration/mandates"],
      ["/administration/agents/mandates/:path*", "/administration/mandates/:path*"],
    ]) {
      expect(redirects).toContainEqual({ source, destination, permanent: true });
    }

    // `/new` must be matched before the `[mandateKey]` catch-all, or creating a
    // mandate lands on a workspace for a mandate named "new".
    const index = (source: string) =>
      redirects.findIndex((r) => r.source === source);
    expect(index("/agents/mandates/new")).toBeLessThan(
      index("/agents/mandates/:mandateKey"),
    );
  });
});
