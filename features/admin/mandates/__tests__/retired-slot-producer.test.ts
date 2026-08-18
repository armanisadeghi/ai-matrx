import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "../../../..");

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("retired Mandate producer contract", () => {
  it("keeps runtime reads and writes on the canonical Mandate tables and API", () => {
    const runtimeSource = [
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

  it("permanently redirects both retired slot URLs to Mandates", () => {
    const nextConfig = source("next.config.js");

    expect(nextConfig).toContain(
      "{ source: '/agents/slots', destination: '/agents/mandates', permanent: true }",
    );
    expect(nextConfig).toContain(
      "{ source: '/administration/agents/slots', destination: '/administration/agents/mandates', permanent: true }",
    );
  });
});
