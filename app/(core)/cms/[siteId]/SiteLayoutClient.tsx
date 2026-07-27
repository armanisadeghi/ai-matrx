"use client";

import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
} from "react";
import { extractErrorMessage } from "@/utils/errors";
import { useParams, useRouter } from "next/navigation";
import {
  CmsSiteService,
  CmsPageService,
  CmsComponentService,
} from "@/features/cms/services/cmsService";
import type {
  ClientSite,
  ClientPageSummary,
  ClientComponent,
} from "@/features/cms/types";
import {
  buildSiteStructureXml,
  type SiteStructureCurrent,
} from "@/features/cms/utils/buildSiteStructureXml";
import {
  Loader2,
  AlertCircle,
  FileText,
  Puzzle,
  Database,
  Settings,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { clientSiteRootUrl } from "@/features/cms/utils/pageUrls";
import { usePathname } from "next/navigation";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useCmsSiteSurfaceScope } from "@/features/cms/hooks/useCmsSiteSurfaceScope";
import { CMS_SITE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsSiteContextMenuProps";
import type { CmsSiteMode } from "@/features/cms/agent-context/buildCmsSiteContextData";

interface SiteContextValue {
  site: ClientSite;
  refreshSite: () => Promise<void>;
  /**
   * Page/component summaries cached at the layout level so every child
   * surface (dashboard, page editor, component editor) can rebuild
   * `site_structure` without a fresh fetch on every keystroke. Refreshed on
   * site enter — call `refreshPages`/`refreshComponents` after any
   * create/update/delete/publish/discard/rollback so the cache (and the
   * framing XML built from it) never drifts from what was just saved.
   */
  pages: ClientPageSummary[];
  pagesLoading: boolean;
  refreshPages: () => Promise<void>;
  components: ClientComponent[];
  componentsLoading: boolean;
  refreshComponents: () => Promise<void>;
  /** Builds the shared `site_structure` framing XML from the cached pages/components. */
  buildStructureXml: (current?: SiteStructureCurrent) => string;
  /**
   * Every site the user owns — loaded for the switcher dropdown and emitted as
   * the `matrx-user/cms` inventory values this surface INHERITS. Empty array
   * while the list request is in flight (never null, so the inherited
   * always-available promise stays honest).
   */
  allSites: ClientSite[];
  /** Which tab of the workspace is showing, derived from the pathname. */
  currentMode: CmsSiteMode;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSiteContext() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteContext must be used within SiteLayout");
  return ctx;
}

/** Sub-view suffix (mode) so switching sites in the entity dropdown keeps
 *  the current sub-view (pages / components / settings). */
function subViewSuffix(pathname: string, siteId: string): string {
  const rest = pathname.slice(`/cms/${siteId}`.length);
  if (rest.startsWith("/components")) return "/components";
  if (rest.startsWith("/collections")) return "/collections";
  if (rest.startsWith("/settings")) return "/settings";
  return "";
}

/**
 * Which tab the user is on, for the `current_mode` surface value. Kept beside
 * `subViewSuffix` so the two pathname readers can never disagree about what
 * counts as a sub-view.
 */
function currentModeFromPath(pathname: string, siteId: string): CmsSiteMode {
  const rest = pathname.slice(`/cms/${siteId}`.length);
  if (rest.startsWith("/components")) return "components";
  if (rest.startsWith("/collections/")) return "collection-items";
  if (rest.startsWith("/collections")) return "collections";
  if (rest.startsWith("/settings")) return "settings";
  if (rest.startsWith("/pages/new")) return "new-page";
  if (rest.startsWith("/pages/")) return "page-editor";
  return "pages";
}

/** Header shown while the site is loading/errored — back affordance only, so
 *  the shell row is never dead. */
function SiteHeaderFallback() {
  return (
    <RouteHeader
      left={<ChevronLeftTapButton href="/cms" ariaLabel="All sites" />}
    />
  );
}

/**
 * Mounts the live `matrx-user/cms-site` scope for the header Agents chrome.
 *
 * Its own component because the scope builder needs a LOADED site, which only
 * exists past the layout's loading/error early returns — calling the hook up
 * top would either break the rules of hooks or force the builder to lie about
 * a site it doesn't have. Tabs holding extra state (Collections, Settings)
 * nest their own provider inside this one; deepest wins.
 */
function SiteSurfaceRuntime({
  site,
  pages,
  components,
  allSites,
  currentMode,
  children,
}: {
  site: ClientSite;
  pages: ClientPageSummary[];
  components: ClientComponent[];
  allSites: ClientSite[];
  currentMode: CmsSiteMode;
  children: React.ReactNode;
}) {
  const getScope = useCmsSiteSurfaceScope({
    site,
    pages,
    components,
    allSites,
    currentMode,
  });
  return (
    <SurfaceRuntimeProvider
      surfaceName={CMS_SITE_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getScope}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

export default function SiteLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const siteId = params.siteId as string;
  const [site, setSite] = useState<ClientSite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allSites, setAllSites] = useState<ClientSite[]>([]);

  const [pages, setPages] = useState<ClientPageSummary[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [components, setComponents] = useState<ClientComponent[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(true);

  const fetchSite = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await CmsSiteService.getSite(siteId);
      setSite(data);
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  const refreshPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const data = await CmsPageService.listPages(siteId);
      setPages(data);
    } catch (err: unknown) {
      // Non-fatal: the framing XML degrades to a smaller page list rather than blocking the route.
      console.error(
        "[cms] failed to refresh site_structure page cache:",
        extractErrorMessage(err),
      );
    } finally {
      setPagesLoading(false);
    }
  }, [siteId]);

  const refreshComponents = useCallback(async () => {
    setComponentsLoading(true);
    try {
      const data = await CmsComponentService.listComponents(siteId);
      setComponents(data);
    } catch (err: unknown) {
      console.error(
        "[cms] failed to refresh site_structure component cache:",
        extractErrorMessage(err),
      );
    } finally {
      setComponentsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSite();
    refreshPages();
    refreshComponents();
  }, [fetchSite, refreshPages, refreshComponents]);

  useEffect(() => {
    CmsSiteService.listSites()
      .then(setAllSites)
      .catch((err: unknown) => {
        console.error(
          "[cms] site switcher list failed:",
          extractErrorMessage(err),
        );
        setAllSites([]);
      });
  }, []);

  const buildStructureXml = useCallback(
    (current?: SiteStructureCurrent) => {
      if (!site) return "";
      return buildSiteStructureXml({ site, pages, components, current });
    },
    [site, pages, components],
  );

  if (isLoading) {
    return (
      <>
        <SiteHeaderFallback />
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading site…</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !site) {
    return (
      <>
        <SiteHeaderFallback />
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-medium">
              {error?.includes("403")
                ? "You don't have access to this site"
                : "Failed to load site"}
            </p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/cms")}
              >
                All Sites
              </Button>
              <Button variant="outline" size="sm" onClick={fetchSite}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <SiteContext.Provider
      value={{
        site,
        refreshSite: fetchSite,
        pages,
        pagesLoading,
        refreshPages,
        components,
        componentsLoading,
        refreshComponents,
        buildStructureXml,
        allSites,
        currentMode: currentModeFromPath(pathname, siteId),
      }}
    >
      <EntityModeHeader
        backHref="/cms"
        entityLabel={site.name}
        entityOptions={allSites.map((s) => ({
          label: s.name,
          href: `/cms/${s.id}${subViewSuffix(pathname, siteId)}`,
          active: s.id === siteId,
        }))}
        modes={[
          { name: "Pages", href: `/cms/${siteId}`, icon: FileText },
          {
            name: "Components",
            href: `/cms/${siteId}/components`,
            icon: Puzzle,
          },
          {
            name: "Collections",
            href: `/cms/${siteId}/collections`,
            icon: Database,
          },
          {
            name: "Settings",
            href: `/cms/${siteId}/settings`,
            icon: Settings,
          },
        ]}
        actions={[
          {
            label: "Open live site",
            icon: ExternalLink,
            href: clientSiteRootUrl(site.slug),
          },
          {
            label: "New page",
            icon: Plus,
            href: `/cms/${siteId}/pages/new`,
          },
        ]}
      />
      <SiteSurfaceRuntime
        site={site}
        pages={pages}
        components={components}
        allSites={allSites}
        currentMode={currentModeFromPath(pathname, siteId)}
      >
        <div className="h-full flex flex-col overflow-hidden pt-[var(--shell-header-h)]">
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
        </div>
      </SiteSurfaceRuntime>
    </SiteContext.Provider>
  );
}
