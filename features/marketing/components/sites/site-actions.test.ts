import { toast } from "@/lib/toast";

import type { ItemMenuEntry } from "@/components/official/item/types";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { buildSiteMenu } from "./site-actions";

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn() },
}));

const site: SiteListRow = {
  brand_id: "brand-1",
  created_at: "2026-08-01T00:00:00.000Z",
  created_by: "user-1",
  deleted_at: null,
  description: "The example site",
  domain: "example.com",
  favicon_url: null,
  gsc_sync: {},
  gsc_synced_at: "2026-08-29T00:00:00.000Z",
  homepage_screenshot_id: null,
  id: "site-1",
  initialization: {},
  initialized_at: "2026-08-01T00:00:00.000Z",
  integrations: {},
  logo_url: null,
  metadata: {},
  name: "Example",
  og_image_url: null,
  organization_id: "organization-1",
  plan_profile_id: null,
  root_url: "https://example.com",
  settings: {},
  slug: "example",
  previous_slugs: [],
  status: "active",
  updated_at: "2026-08-29T00:00:00.000Z",
  updated_by: "user-1",
  version: 1,
  visibility: "internal",
  health_score: 92.5,
  scored_pages: 17,
  page_count: 20,
  resource_count: 3,
  pages_in_gsc: 18,
  gsc_clicks_28d: 100,
  gsc_impressions_28d: 2_000,
  gsc_position_28d: 4.25,
  gsc_clicks_prev_28d: 80,
  gsc_impressions_prev_28d: 1_600,
  gsc_prev_days: 28,
  gsc_latest_date: "2026-08-28",
};

function entry(config: ReturnType<typeof buildSiteMenu>, id: string) {
  const found = config.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === id);
  if (!found) throw new Error(`Missing menu entry: ${id}`);
  return found;
}

function select(item: ItemMenuEntry) {
  if (
    item.kind === "link" ||
    item.kind === "checkbox" ||
    item.kind === "submenu"
  ) {
    throw new Error(`${item.id} is not a command`);
  }
  return item.onSelect();
}

describe("buildSiteMenu", () => {
  const onOpenWorkspace = jest.fn();
  const onQuickView = jest.fn();
  const onEditSite = jest.fn();
  const onDeleteSite = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exposes the canonical seven actions with the existing grouping", () => {
    const config = buildSiteMenu({
      site,
      onOpenWorkspace,
      onQuickView,
      onEditSite,
      onDeleteSite,
    });

    expect(config.header).toEqual({
      title: "Example",
      description: "example.com",
    });
    expect(
      config.sections.map((section) => ({
        id: section.id,
        actions: section.items.map((item) => [item.id, item.label]),
      })),
    ).toEqual([
      {
        id: "open",
        actions: [
          ["workspace", "Open workspace"],
          ["quick-view", "Quick view"],
          ["live-site", "Open live site"],
        ],
      },
      {
        id: "copy",
        actions: [
          ["copy-summary", "Copy summary"],
          ["copy-ai", "Copy for AI"],
        ],
      },
      {
        id: "manage",
        actions: [
          ["edit", "Edit site"],
          ["delete", "Delete site"],
        ],
      },
    ]);

    const liveSite = entry(config, "live-site");
    if (liveSite.kind !== "link") throw new Error("Live site must be a link");
    expect(liveSite.href).toBe("https://example.com");
    expect(liveSite.target).toBe("_blank");
  });

  it("routes workspace and record actions through typed host callbacks", () => {
    const config = buildSiteMenu({
      site,
      onOpenWorkspace,
      onQuickView,
      onEditSite,
      onDeleteSite,
    });

    select(entry(config, "workspace"));
    select(entry(config, "quick-view"));
    select(entry(config, "edit"));
    select(entry(config, "delete"));

    expect(onOpenWorkspace).toHaveBeenCalledWith(
      "/marketing/brand-1/websites/site-1",
    );
    expect(onQuickView).toHaveBeenCalledWith(site);
    expect(onEditSite).toHaveBeenCalledWith(site);
    expect(onDeleteSite).toHaveBeenCalledWith(site);
  });

  it("preserves the human and AI copy payloads and toast wording", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const config = buildSiteMenu({
      site,
      onOpenWorkspace,
      onQuickView,
      onEditSite,
      onDeleteSite,
    });

    select(entry(config, "copy-summary"));
    await Promise.resolve();
    expect(writeText).toHaveBeenLastCalledWith(
      [
        "Site: Example",
        "Domain: example.com",
        "Root URL: https://example.com",
        "Status: active",
        "Pages: 20",
        "Pages in Google: 18",
        "Clicks (28d): 100",
        "Impressions (28d): 2000",
        "Avg position (28d): 4.3",
        "Health score: 92.5",
        "GSC data through: 2026-08-28",
      ].join("\n"),
    );
    expect(toast.success).toHaveBeenLastCalledWith(
      "example.com copied to clipboard",
    );

    select(entry(config, "copy-ai"));
    await Promise.resolve();
    const copiedForAi = writeText.mock.calls.at(-1)?.[0];
    expect(copiedForAi).toContain("web-site");
    expect(copiedForAi).toContain("site-1");
    expect(copiedForAi).toContain("Sites list — example.com");
    expect(toast.success).toHaveBeenLastCalledWith(
      "example.com copied for AI agent",
    );
  });

  it("lets a base-site host surround the canonical actions and own its copy payload", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const planSite: MarketingSite = site;
    const openPlan = jest.fn();
    const openCms = jest.fn();
    const config = buildSiteMenu({
      site: planSite,
      copy: webCopy({
        kind: "web-content-plan-site",
        label: `Content plan ${planSite.domain}`,
        description: "One site from the brand content plan.",
        surface: `Content plan — ${planSite.domain}`,
        data: { site: planSite, pages_planned: 12 },
        lines: [
          ["Site", planSite.name],
          ["Pages planned", 12],
        ],
      }),
      beforeSections: [
        {
          id: "plan",
          items: [
            {
              id: "open-plan",
              label: "Open content plan",
              onSelect: openPlan,
            },
          ],
        },
      ],
      afterSections: [
        {
          id: "cms",
          items: [
            {
              id: "open-cms",
              label: "Open in CMS",
              onSelect: openCms,
            },
          ],
        },
      ],
      onOpenWorkspace,
      onQuickView,
      onEditSite,
      onDeleteSite,
    });

    expect(config.sections.map((section) => section.id)).toEqual([
      "plan",
      "open",
      "copy",
      "manage",
      "cms",
    ]);
    expect(config.sections.slice(1, 4).map((section) => section.id)).toEqual([
      "open",
      "copy",
      "manage",
    ]);

    select(entry(config, "open-plan"));
    select(entry(config, "open-cms"));
    expect(openPlan).toHaveBeenCalledTimes(1);
    expect(openCms).toHaveBeenCalledTimes(1);

    select(entry(config, "copy-summary"));
    await Promise.resolve();
    expect(writeText).toHaveBeenLastCalledWith(
      ["Site: Example", "Pages planned: 12"].join("\n"),
    );

    select(entry(config, "copy-ai"));
    await Promise.resolve();
    const copiedForAi = writeText.mock.calls.at(-1)?.[0];
    expect(copiedForAi).toContain("web-content-plan-site");
    expect(copiedForAi).toContain("Content plan — example.com");
  });
});
