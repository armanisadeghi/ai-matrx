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
      "features/admin/mandates/service.ts",
      "features/agents/mandates/service.ts",
      "features/agents/mandates/service.server.ts",
      "features/agents/mandates/overrides.ts",
    ]
      .map(source)
      .join("\n");

    expect(runtimeSource).toContain('.from("mandate")');
    expect(runtimeSource).toContain('.from("mandate_binding")');
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
      destination: "/agents/mandates",
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: "/administration/agents/slots",
      destination: "/administration/agents/mandates",
      permanent: true,
    });
  });
});
