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
import { Loader2, AlertCircle, FileText, Puzzle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import {
  ChevronLeftTapButton,
  ExternalLinkTapButton,
  PlusTapButton,
} from "@/components/icons/tap-buttons";
import { CmsSiteSwitcher } from "@/features/cms/components/CmsSiteSwitcher";
import { clientSiteRootUrl } from "@/features/cms/utils/pageUrls";

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
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSiteContext() {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSiteContext must be used within SiteLayout");
  return ctx;
}

/** Header shown while the site is loading/errored — back affordance only, so
 *  the shell row is never dead. */
function SiteHeaderFallback() {
  return (
    <RouteHeader
      left={
        <ChevronLeftTapButton
          href="/cms"
          variant="transparent"
          ariaLabel="All sites"
        />
      }
    />
  );
}

export default function SiteLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const siteId = params.siteId as string;
  const [site, setSite] = useState<ClientSite | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      }}
    >
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/cms"
              variant="transparent"
              ariaLabel="All sites"
            />
            <CmsSiteSwitcher siteId={siteId} siteName={site.name} />
          </>
        }
        center={
          <RouteModeNav
            items={[
              { name: "Pages", href: `/cms/${siteId}`, icon: FileText },
              {
                name: "Components",
                href: `/cms/${siteId}/components`,
                icon: Puzzle,
              },
              {
                name: "Settings",
                href: `/cms/${siteId}/settings`,
                icon: Settings,
              },
            ]}
          />
        }
        right={
          <>
            <ExternalLinkTapButton
              variant="transparent"
              ariaLabel="Open live site"
              href={clientSiteRootUrl(site.slug)}
              className="hidden sm:inline-flex"
            />
            <PlusTapButton
              variant="transparent"
              ariaLabel="New page"
              href={`/cms/${siteId}/pages/new`}
            />
          </>
        }
      />
      <div className="h-full flex flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </SiteContext.Provider>
  );
}
