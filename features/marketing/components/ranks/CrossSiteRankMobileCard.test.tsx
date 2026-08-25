import { renderToStaticMarkup } from "react-dom/server";
import type { MatrxDataTableMobileCardControls } from "@/components/official/matrx-data-table/types";
import type { CrossSiteRankRow } from "./cross-site-data";
import { CrossSiteRankMobileCard } from "./CrossSiteRankMobileCard";

const row: CrossSiteRankRow = {
  access_level: "admin",
  best_position: 2,
  brand_id: "brand-1",
  created_at: "2026-08-01T00:00:00Z",
  created_by: "user-1",
  device: "desktop",
  engine: "google",
  history: [],
  is_active: true,
  is_owner: true,
  keyword:
    "What is the best no-code AI agent platform for a subject matter expert?",
  keyword_id: "keyword-1",
  last_checked_at: "2026-08-20T18:09:00Z",
  latest_position: 6,
  movement: -1,
  organization_id: "org-1",
  organization_name: "Example org",
  owner_email: "owner@example.com",
  previous_position: 5,
  search_type: "organic",
  site_domain: "example.com",
  site_id: "site-1",
  site_name: "Example Site",
  target_id: "target-1",
  total_count: 1,
  tracking_label: "Google",
  traffic_class: "educational",
  updated_at: "2026-08-20T18:09:00Z",
  value_band: "gold",
  value_score: 150,
};

const controls: MatrxDataTableMobileCardControls = {
  selected: false,
  selectable: false,
  onSelectedChange: jest.fn(),
  actions: <button type="button">Copy and actions</button>,
};

describe("CrossSiteRankMobileCard", () => {
  it("keeps the rank decision context and full-keyword disclosure on phone", () => {
    const html = renderToStaticMarkup(
      <CrossSiteRankMobileCard row={row} controls={controls} />,
    );

    expect(html).toContain("Show full keyword");
    expect(html).toContain(row.keyword);
    expect(html).toContain("Example Site");
    expect(html).toContain("example.com");
    expect(html).toContain("Position");
    expect(html).toContain("#6");
    expect(html).toContain("Change");
    expect(html).toContain("-1");
    expect(html).toContain("Best");
    expect(html).toContain("#2");
    expect(html).toContain("Last checked");
    expect(html).toContain("Google");
    expect(html).toContain("desktop");
    expect(html).toContain("Copy and actions");
    expect(html).toContain("Open ranks");
    expect(html).toContain("min-h-11");
  });
});
