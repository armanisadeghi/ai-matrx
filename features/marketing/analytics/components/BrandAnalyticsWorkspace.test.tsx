/**
 * FORCING TEST — a site that was disconnected from Google Analytics still
 * shows the Analytics it already has (Bugbot MEDIUM #4, 2026-09-17).
 *
 * The brand list used to skip the window read whenever the binding was off and
 * print "no property is bound yet", so a site with months of
 * `seo.web_analytics_daily` rows read as a site with no Analytics history at
 * all. The plan's rule (common-docs `projects/google-native/PLAN.md` §4.9 and
 * §5.6) is the opposite: last-synced data stays visible with an honest health
 * line and a door back to the binding.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MarketingSite } from "@/features/marketing/types";

const mockReadWindow = jest.fn();
let mockSites: MarketingSite[] = [];

jest.mock("@/features/marketing/data/hooks", () => ({
  useBrandSites: () => ({
    isLoading: false,
    isError: false,
    error: null,
    data: mockSites,
    refetch: jest.fn(),
  }),
  marketingKeys: { site: (id: string) => ["marketing", "site", id] },
}));
jest.mock("@/features/marketing/analytics/window", () => ({
  DEFAULT_ANALYTICS_RANGE: 28,
  readSiteAnalyticsWindow: (...args: unknown[]) =>
    mockReadWindow(...(args as [])),
}));
jest.mock("@/features/marketing/analytics/components/SiteAnalyticsPanel", () => ({
  SiteAnalyticsPanel: () => <div>panel</div>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name }: { name: string }) => <span>{name}</span>,
}));
jest.mock("@/features/overlays/openers/siteAnalyticsWindow", () => ({
  useOpenSiteAnalyticsWindow: () => () => undefined,
}));
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  InlineQueryError: () => <div>read failed</div>,
  LoadingSurface: () => <div>loading</div>,
}));
jest.mock("@/features/marketing/components/shared/DataFreshnessLine", () => ({
  DataFreshnessLine: ({ dataThrough }: { dataThrough: string | null }) => (
    <div>{`through ${dataThrough ?? "never"}`}</div>
  ),
}));
jest.mock("@/lib/coming-soon/registry", () => ({ getComingSoon: () => null }));
jest.mock("@/lib/coming-soon/announce", () => ({ STAGE_LINE: {} }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// eslint-disable-next-line import/first -- after the mocks above
import { BrandAnalyticsWorkspace } from "./BrandAnalyticsWorkspace";

function site(id: string, integrations: unknown): MarketingSite {
  return {
    id,
    brand_id: "b1",
    name: `Site ${id}`,
    domain: `${id}.example.com`,
    integrations,
  } as unknown as MarketingSite;
}

const BOUND = {
  marketing: {
    providers: {
      google_analytics_4: {
        enabled: true,
        credential_authority: "external_connection",
        credential_ref: "c1",
        resource_ref: "analytics_property:properties/1",
      },
    },
  },
};

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("BrandAnalyticsWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    mockReadWindow.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <BrandAnalyticsWorkspace brandId="b1" />
        </QueryClientProvider>,
      );
    });
    await flush();
  };

  it("keeps a disconnected site's last-synced Analytics on screen", async () => {
    mockSites = [site("one", {}), site("two", BOUND)];
    mockReadWindow.mockImplementation(async (siteId: string) => ({
      totals: {
        sessions: siteId === "one" ? 4321 : 10,
        users: 1,
        engagedSessions: 1,
        conversions: 1,
        keyEvents: 0,
        views: 0,
      },
      dataThrough: siteId === "one" ? "2026-08-31" : "2026-09-16",
      pulledAt: "2026-09-16T00:00:00Z",
      propertyTimezone: "UTC",
    }));

    await render();

    // The disconnected site's stored history is read and printed …
    expect(mockReadWindow).toHaveBeenCalledWith("one", 28, expect.anything());
    expect(container.textContent).toContain("4,321");
    expect(container.textContent).toContain("through 2026-08-31");
    // … with an honest health line and a door back to the binding …
    expect(container.textContent).toContain("last data we synced");
    expect(container.querySelector('a[href*="integrations"]')).not.toBeNull();
    // … and never the "nothing here yet" copy.
    expect(container.textContent).not.toContain("bound to this site yet");
  });

  it("still says so when a site genuinely has no Analytics history", async () => {
    mockSites = [site("one", {}), site("two", BOUND)];
    mockReadWindow.mockImplementation(async (siteId: string) => ({
      totals: {
        sessions: 0,
        users: 0,
        engagedSessions: 0,
        conversions: 0,
        keyEvents: 0,
        views: 0,
      },
      dataThrough: siteId === "one" ? null : "2026-09-16",
      pulledAt: null,
      propertyTimezone: null,
    }));

    await render();

    expect(container.textContent).toContain("bound to this site yet");
  });
});
