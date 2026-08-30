import { renderToStaticMarkup } from "react-dom/server";
import type { MatrxDataTableMobileCardControls } from "@/components/official/matrx-data-table/types";
import type { SiteListRow } from "@/features/marketing/types";
import {
  renderSiteListMobileCard,
  SITE_LIST_COLUMNS,
} from "./site-list-presentation";

const row: SiteListRow = {
  brand_id: "brand-1",
  created_at: "2026-08-01T00:00:00Z",
  created_by: "user-1",
  deleted_at: null,
  description: "A managed site",
  domain: "example.com",
  favicon_url: null,
  gsc_clicks_28d: 1200,
  gsc_clicks_prev_28d: 1000,
  gsc_impressions_28d: 45000,
  gsc_impressions_prev_28d: 40000,
  gsc_latest_date: "2026-08-29",
  gsc_position_28d: 4.2,
  gsc_prev_days: 28,
  gsc_sync: {},
  gsc_synced_at: "2026-08-29T00:00:00Z",
  health_score: 91.5,
  homepage_screenshot_id: null,
  id: "site-1",
  initialization: {},
  initialized_at: "2026-08-01T00:00:00Z",
  integrations: {},
  logo_url: null,
  metadata: {},
  name: "Example Site",
  og_image_url: null,
  organization_id: "org-1",
  page_count: 320,
  pages_in_gsc: 280,
  plan_profile_id: null,
  resource_count: 14,
  root_url: "https://example.com",
  scored_pages: 300,
  settings: {},
  slug: "example-site",
  previous_slugs: [],
  status: "active",
  updated_at: "2026-08-29T00:00:00Z",
  updated_by: "user-1",
  version: 3,
  visibility: "internal",
};

const controls: MatrxDataTableMobileCardControls = {
  selected: false,
  selectable: false,
  onSelectedChange: jest.fn(),
  actions: <button type="button">Canonical site actions</button>,
};

describe("site list presentation", () => {
  it("declares the eight current columns without advertising unsupported filters", () => {
    expect(SITE_LIST_COLUMNS.map((spec) => spec.id)).toEqual([
      "name",
      "page_count",
      "gsc_clicks_28d",
      "gsc_impressions_28d",
      "gsc_position_28d",
      "health_score",
      "connections",
      "status",
    ]);
    expect(SITE_LIST_COLUMNS.map((spec) => spec.column.filter)).toEqual([
      "text",
      false,
      false,
      false,
      false,
      false,
      false,
      "select",
    ]);
    expect(
      SITE_LIST_COLUMNS.find((spec) => spec.id === "connections")?.column
        .sortable,
    ).toBe(false);
    expect(
      SITE_LIST_COLUMNS.find((spec) => spec.id === "name")?.column.href?.(row),
    ).toBe("/marketing/brand-1/websites/site-1");
  });

  it("keeps the phone summary, touch targets, and table-owned actions", () => {
    const html = renderToStaticMarkup(
      renderSiteListMobileCard(row, 0, controls),
    );

    expect(html).toContain("Example Site");
    expect(html).toContain("example.com");
    expect(html).toContain("320");
    expect(html).toContain("280 in Google");
    expect(html).toContain("+14 resources");
    expect(html).toContain("1,200");
    expect(html).toContain("45,000");
    expect(html).toContain("4.2");
    expect(html).toContain("91.5");
    expect(html).toContain("active");
    expect(html).toContain("Canonical site actions");
    expect(html).toContain("min-h-11");
    expect(html).toContain("/marketing/brand-1/websites/site-1");
  });
});
