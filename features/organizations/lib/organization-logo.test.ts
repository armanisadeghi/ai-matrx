import { readFileSync } from "node:fs";
import { join } from "node:path";
import { organizationLogoRef } from "./organization-logo";

describe("organizationLogoRef", () => {
  it("prefers durable file identity over a frozen uploaded URL", () => {
    expect(
      organizationLogoRef({
        logoFileId: "file-123",
        logoUrl: "https://stale.example/logo.png",
      }),
    ).toEqual({ file_id: "file-123" });
  });

  it("preserves legacy and external URL logos", () => {
    expect(
      organizationLogoRef({
        logoFileId: null,
        logoUrl: "https://example.com/logo.svg",
      }),
    ).toBe("https://example.com/logo.svg");
  });

  it("returns null when no logo exists", () => {
    expect(organizationLogoRef({ logoFileId: null, logoUrl: null })).toBeNull();
  });
});

describe("organization logo rendering boundary", () => {
  const consumers = [
    "app/(core)/organizations/page.tsx",
    "features/organizations/components/OrganizationCard.tsx",
    "features/organizations/components/OrgWorkspace.tsx",
    "features/organizations/components/OrgManage.tsx",
    "features/organizations/components/GeneralSettings.tsx",
  ];

  it.each(consumers)("routes %s through the durable identity resolver", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");
    expect(source).toContain("organizationLogoRef(");
    expect(source).not.toMatch(/ref=\{[^\n}]*\.logoUrl(?:\s*\?\?\s*null)?\}/);
  });
});
