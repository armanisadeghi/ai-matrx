"use client";

import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
} from "react";
import { extractErrorMessage } from "@/utils/errors";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
import { Loader2, AlertCircle, ChevronRight, PanelTop } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function Breadcrumb({
  siteName,
  siteId,
}: {
  siteName: string;
  siteId: string;
}) {
  const pathname = usePathname();

  const crumbs: { label: string; href: string }[] = [
    { label: "Content", href: "/cms" },
    { label: siteName, href: `/cms/${siteId}` },
  ];

  if (pathname.includes("/pages/new")) {
    crumbs.push({ label: "New Page", href: pathname });
  } else if (pathname.match(/\/pages\/[^/]+$/)) {
    crumbs.push({ label: "Edit Page", href: pathname });
  } else if (pathname.endsWith("/settings")) {
    crumbs.push({ label: "Settings", href: pathname });
  } else if (pathname.endsWith("/components")) {
    crumbs.push({ label: "Components", href: pathname });
  }

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.href}>
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
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
      <div className="flex items-center justify-center h-[calc(100dvh-var(--shell-header-h,56px))]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading site…</p>
        </div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--shell-header-h,56px))]">
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
              ← All Sites
            </Button>
            <Button variant="outline" size="sm" onClick={fetchSite}>
              Retry
            </Button>
          </div>
        </div>
      </div>
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
      <div className="h-[calc(100dvh-var(--shell-header-h,56px))] flex flex-col overflow-hidden">
        <div className="flex-none border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <PanelTop className="h-5 w-5 text-primary flex-shrink-0" />
              <Breadcrumb siteName={site.name} siteId={siteId} />
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </div>
    </SiteContext.Provider>
  );
}
