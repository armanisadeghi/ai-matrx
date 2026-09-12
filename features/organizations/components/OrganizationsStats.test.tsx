import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationsStats } from "./OrganizationsStats";

describe("OrganizationsStats", () => {
  it("does not announce an empty workspace or team count while memberships are loading", () => {
    const loadingMarkup = renderToStaticMarkup(
      <OrganizationsStats loading organizationCount={0} teamCount={0} />,
    );
    const resolvedMarkup = renderToStaticMarkup(
      <OrganizationsStats loading={false} organizationCount={13} teamCount={12} />,
    );

    const loadingText = loadingMarkup.replace(/<[^>]+>/g, "");
    const resolvedText = resolvedMarkup.replace(/<[^>]+>/g, "");

    expect(loadingMarkup).toContain('role="status"');
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(loadingText).toContain("Loading workspace statistics");
    expect(loadingText).not.toMatch(/0\s*workspaces/);
    expect(loadingText).not.toMatch(/0\s*teams/);
    expect(resolvedText).toMatch(/13\s*workspaces/);
    expect(resolvedText).toMatch(/12\s*teams/);
  });
});
