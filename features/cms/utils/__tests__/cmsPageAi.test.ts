import { buildCmsPageMenu } from "../../actions/buildCmsPageMenu";
import type { ClientPageSummary } from "../../types";
import { cmsPageHasContent } from "../cmsPageAi";

function page(overrides: Partial<ClientPageSummary> = {}): ClientPageSummary {
  return {
    id: "page-id",
    slug: "about",
    route: "/about",
    title: "About",
    category: "general",
    page_type: "standard",
    is_published: false,
    has_draft: false,
    is_home_page: false,
    show_in_nav: false,
    sort_order: 1,
    excerpt: null,
    featured_image: null,
    author: null,
    tags: null,
    meta_title: null,
    meta_description: null,
    publish_date: null,
    last_published_at: null,
    updated_at: "2026-08-14T00:00:00Z",
    created_at: "2026-08-14T00:00:00Z",
    content_stats: {
      html_len: 0,
      text_len: 0,
      draft_html_len: 0,
      draft_text_len: 0,
    },
    plan_node_id: "plan-node-id",
    web_page_id: null,
    research_topic_ids: [],
    research_tag_ids: [],
    ...overrides,
  };
}

const noop = () => undefined;

function menuFor(record: ClientPageSummary) {
  return buildCmsPageMenu({
    page: record,
    editorHref: "/editor",
    previewHref: "/preview",
    liveHref: null,
    planHref: "/plan",
    measureHref: null,
    onAi: noop,
    onReview: noop,
    onPublish: noop,
    onDelete: noop,
  });
}

describe("CMS page AI actions", () => {
  it("recognizes an empty summary without transferring HTML", () => {
    expect(cmsPageHasContent(page())).toBe(false);
    expect(
      cmsPageHasContent(
        page({
          content_stats: {
            html_len: 0,
            text_len: 0,
            draft_html_len: 1200,
            draft_text_len: 320,
          },
        }),
      ),
    ).toBe(true);
  });

  it("offers Build with AI for an empty page and Edit with AI for content", () => {
    expect(menuFor(page()).sections[0]?.items[0]?.label).toBe("Build with AI");
    expect(
      menuFor(
        page({
          content_stats: {
            html_len: 500,
            text_len: 100,
            draft_html_len: 0,
            draft_text_len: 0,
          },
        }),
      ).sections[0]?.items[0]?.label,
    ).toBe("Edit with AI");
  });

  it("keeps the complete row-action inventory in one menu", () => {
    const labels = menuFor(page()).sections.flatMap((section) =>
      section.items.filter((item) => !item.hidden).map((item) => item.label),
    );
    expect(labels).toEqual([
      "Build with AI",
      "Review before publish",
      "Open editor",
      "Open editor in new tab",
      "Preview page",
      "Open content plan",
      "Publish pending draft",
      "Delete",
    ]);
  });
});
