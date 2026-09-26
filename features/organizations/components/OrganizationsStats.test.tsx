import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrganizationsStats } from "./OrganizationsStats";

describe("OrganizationsStats", () => {
  it("does not announce an empty organization count while memberships are loading", () => {
    const loadingMarkup = renderToStaticMarkup(
      <OrganizationsStats loading organizationCount={0} />,
    );
    const resolvedMarkup = renderToStaticMarkup(
      <OrganizationsStats loading={false} organizationCount={13} />,
    );

    const loadingText = loadingMarkup.replace(/<[^>]+>/g, "");
    const resolvedText = resolvedMarkup.replace(/<[^>]+>/g, "");

    expect(loadingMarkup).toContain('role="status"');
    expect(loadingMarkup).toContain('aria-busy="true"');
    expect(loadingText).toContain("Loading organization statistics");
    expect(loadingText).not.toMatch(/0\s*organizations/);
    expect(resolvedText).toMatch(/13\s*organizations/);
  });
});
