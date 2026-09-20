/**
 * 🚨 F-106 — QUICK VIEW HAS EXACTLY ONE DOOR: THE `siteQuickViewWindow` OVERLAY.
 *
 * Round 8 (F-93) ruled that a site opens in ONE overlay-owned panel from
 * loading to loaded. Before this fix, the Sites portfolio's row menu opened a
 * SECOND, page-local `WindowPanel` (`SitePeekWindow`/`peeking` state) that
 * wrapped the same `SitePeekBody` but carried no `overlayId` and no address —
 * the U-C4 class (two doors to one body).
 *
 * This asserts pressing "Quick view" on a row calls the ONE addressed opener
 * (`useOpenSiteQuickViewWindow`) with the site's id, and that the portfolio
 * itself never mounts a `WindowPanel` — the page-local panel is gone for
 * good, not just unreachable.
 *
 * RED before the fix: `onQuickView` was wired to `setPeeking`, so
 * `openSiteQuickView` was never called, and clicking Quick view rendered a
 * `WindowPanel` from `SitePeekWindow` instead.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const openSiteQuickView = jest.fn();
const windowPanelMounts = jest.fn();

const SITE_ROW = {
  id: "38eff4c9-b021-451a-b995-7d9b3d17db5e",
  brand_id: "brand-1",
  name: "Titanium Success",
  domain: "titaniumsuccess.com",
  root_url: "https://titaniumsuccess.com",
  status: "active",
  visibility: "public",
  page_count: 12,
  pages_in_gsc: 10,
  gsc_clicks_28d: 100,
  gsc_impressions_28d: 1000,
  gsc_position_28d: 4.2,
  health_score: 90,
  scored_pages: 10,
  initialized_at: "2026-01-01T00:00:00Z",
  description: "desc",
  updated_at: "2026-01-01T00:00:00Z",
  gsc_latest_date: "2026-09-01",
} as unknown as import("@/features/marketing/types").SiteListRow;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/features/overlays/openers/siteQuickViewWindow", () => ({
  useOpenSiteQuickViewWindow: () => openSiteQuickView,
}));

// The one panel primitive — if the portfolio ever mounts one again, this
// records it so the test can fail the assertion instead of silently passing.
jest.mock("@/features/window-panels/WindowPanel", () => ({
  __esModule: true,
  WindowPanel: (props: { children?: React.ReactNode }) => {
    windowPanelMounts();
    return <div data-testid="window-panel">{props.children}</div>;
  },
  default: (props: { children?: React.ReactNode }) => {
    windowPanelMounts();
    return <div data-testid="window-panel">{props.children}</div>;
  },
}));

jest.mock("@/features/marketing/components/sites/SiteEditorDialog", () => ({
  SiteEditorDialog: () => null,
}));

jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

jest.mock("@/features/access-gate/components/GovernedActionDialog", () => ({
  GovernedActionDialog: () => null,
}));

jest.mock("@/features/marketing/data/hooks", () => ({
  useDeleteSite: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSiteCount: () => ({ data: 1 }),
}));

jest.mock("@/features/marketing/data/site-list-service", () => ({
  siteListService: () => ({}),
  toSiteTableQueryState: () => ({}),
}));

jest.mock("@/features/marketing/components/sites/site-list-presentation", () => ({
  SITE_LIST_COLUMNS: [],
  renderSiteListMobileCard: () => null,
}));

jest.mock("@/features/marketing/components/shared/MarketingWorkspaceNav", () => ({
  MarketingWorkspaceNav: () => null,
}));

jest.mock(
  "@/features/marketing/search-console/components/ambassador/GscPortfolioClassBar",
  () => ({ GscPortfolioClassBar: () => null }),
);

jest.mock("@/features/surfaces/manifests/marketing.manifest", () => ({
  createMarketingScope: (scope: unknown) => scope,
}));

jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));

jest.mock("@ai-matrx/tap-target/buttons", () => ({
  RefreshCwTapButton: () => null,
}));

// The list shell itself belongs to lib/entity-list and is not under test —
// this captures the config it was given and exposes a real "Quick view"
// button wired through the SAME `useRowActions`/`buildSiteMenu` path the live
// portfolio uses, so the assertion exercises the real menu wiring.
jest.mock("@/lib/entity-list/components/EntityListPage", () => ({
  EntityListPage: (props: {
    config: {
      useRowActions: (list: unknown) => {
        actions: { menuFor: (site: unknown) => () => { sections: Array<{ items: Array<{ id: string; onSelect: () => void }> }> } };
      };
    };
  }) => {
    const { actions } = props.config.useRowActions({ rows: [], total: 0 });
    const menu = actions.menuFor(SITE_ROW)();
    const quickViewItem = menu.sections
      .flatMap((section) => section.items)
      .find((item) => item.id === "quick-view");
    return (
      <button type="button" onClick={() => quickViewItem?.onSelect()}>
        Quick view
      </button>
    );
  },
}));

import { SitesPortfolio } from "../SitesPortfolio";

describe("Sites portfolio Quick view", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    openSiteQuickView.mockClear();
    windowPanelMounts.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("calls the one addressed overlay opener with the site id, and mounts no page-local WindowPanel", () => {
    act(() => {
      root.render(<SitesPortfolio />);
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(openSiteQuickView).toHaveBeenCalledTimes(1);
    expect(openSiteQuickView).toHaveBeenCalledWith({
      siteId: SITE_ROW.id,
      siteLabel: SITE_ROW.name,
    });

    // No page-local WindowPanel ever mounted inside the portfolio. (F-106
    // also deleted the `SitePeekWindow`/`SitePeekWindowImpl` front door that
    // used to provide one — see the census test beside this one.)
    expect(windowPanelMounts).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="window-panel"]')).toBeNull();
  });
});
