import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SiteLayoutClient from "./SiteLayoutClient";
import {
  CmsComponentService,
  CmsPageService,
  CmsSiteService,
} from "@/features/cms/services/cmsService";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const siteId = "site-123";

jest.mock("next/navigation", () => ({
  useParams: () => ({ siteId }),
  usePathname: () => `/cms/${siteId}`,
}));

jest.mock("@/features/cms/services/cmsService", () => ({
  CmsSiteService: {
    getSite: jest.fn(),
    listSites: jest.fn(),
  },
  CmsPageService: { listPages: jest.fn() },
  CmsComponentService: { listComponents: jest.fn() },
}));

jest.mock("@/features/access-gate/components/AccessGate", () => ({
  AccessGate: () => <div data-testid="access-gate" />,
}));

jest.mock("@/features/shell/components/header/RouteHeader", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/features/shell/components/header/templates/EntityModeHeader", () => ({
  EntityModeHeader: () => null,
}));

jest.mock("@/components/icons/tap-buttons", () => ({
  ChevronLeftTapButton: () => null,
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/features/cms/hooks/useCmsSiteSurfaceScope", () => ({
  useCmsSiteSurfaceScope: () => jest.fn(),
}));

jest.mock("@/features/cms/agent-context/cmsSiteContextMenuProps", () => ({
  CMS_SITE_CONTEXT_MENU_PROPS: { surfaceName: "matrx-user/cms-site" },
}));

const getSite = jest.mocked(CmsSiteService.getSite);
const listSites = jest.mocked(CmsSiteService.listSites);
const listPages = jest.mocked(CmsPageService.listPages);
const listComponents = jest.mocked(CmsComponentService.listComponents);

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SiteLayoutClient cache lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    listSites.mockResolvedValue([]);
    listPages.mockResolvedValue([]);
    listComponents.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("does not request dependent caches when the site cannot be loaded", async () => {
    getSite.mockRejectedValue(new Error("Site not found or access denied"));

    await act(async () => {
      root.render(<SiteLayoutClient>page</SiteLayoutClient>);
    });
    await settleEffects();

    expect(getSite).toHaveBeenCalledWith(siteId);
    expect(listPages).not.toHaveBeenCalled();
    expect(listComponents).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="access-gate"]')).not.toBeNull();
  });

  it("loads both caches after the site has been established", async () => {
    getSite.mockResolvedValue({
      id: siteId,
      name: "Test Site",
      slug: "test-site",
      domain: null,
      theme_config: {},
      navigation: [],
      footer_config: {},
      meta_defaults: {},
      contact_info: {},
      social_links: {},
      settings: {},
      is_active: true,
      owner_user_id: "user-123",
      organization_id: "org-123",
      visibility: "internal",
      created_by: "user-123",
      global_css: null,
      favicon: null,
      data_api_key: null,
      web_site_id: null,
      research_topic_ids: [],
      research_tag_ids: [],
      created_at: "2026-08-18T00:00:00Z",
      updated_at: "2026-08-18T00:00:00Z",
    });

    await act(async () => {
      root.render(<SiteLayoutClient>page</SiteLayoutClient>);
    });
    await settleEffects();

    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith(siteId);
    expect(listComponents).toHaveBeenCalledTimes(1);
    expect(listComponents).toHaveBeenCalledWith(siteId);
  });
});
