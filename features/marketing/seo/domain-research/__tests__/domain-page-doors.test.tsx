/**
 * The domain page is a new place with doors in, never a replacement:
 *  - its address carries the domain and the person's site;
 *  - a referring-domain row's menu opens it for that domain and site, beside
 *    (not instead of) the existing items;
 *  - the route renders the page.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/features/marketing/seo/domain-research/DomainResearchPage", () => ({
  DomainResearchPage: () => <main>domain page</main>,
}));
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  LoadingSurface: () => null,
}));

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { buildReferringDomainMenuSection } from "@/features/marketing/components/backlinks/referring-domain-actions";
import DomainRoute from "@/app/(core)/marketing/tools/domain/page";

it("the address carries the domain and the site", () => {
  expect(marketingRoutes.domainResearch()).toBe("/marketing/tools/domain");
  expect(marketingRoutes.domainResearch("example.com", "site-1")).toBe("/marketing/tools/domain?d=example.com&site=site-1");
});

it("a referring-domain row opens the domain page, and keeps every existing item", () => {
  const section = buildReferringDomainMenuSection({
    siteId: "site-1",
    getRow: () => ({ domain: "news.example.org" }),
  });
  const ids = section.items.map((i) => ("id" in i ? i.id : null));
  expect(ids).toEqual(expect.arrayContaining(["rd-open", "rd-research", "rd-our-view", "rd-provider-view", "rd-start-outreach", "rd-press"]));
  const research = section.items.find((i) => "id" in i && i.id === "rd-research") as { href: string; disabled?: boolean };
  expect(research.href).toBe("/marketing/tools/domain?d=news.example.org&site=site-1");
  expect(research.disabled).toBe(false);
});

it("the route renders the domain page", () => {
  expect(renderToStaticMarkup(<DomainRoute />)).toContain("domain page");
});
