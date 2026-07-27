"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CmsPageService } from "@/features/cms/services/cmsService";
import { useSiteContext } from "./SiteLayoutClient";
import PageListView from "@/features/cms/components/PageListView";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CMS_SITE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsSiteContextMenuProps";
import { createCmsSiteExtraSections } from "@/features/cms/agent-context/cmsSiteExtraSections";
import { useCmsSiteSurfaceScope } from "@/features/cms/hooks/useCmsSiteSurfaceScope";
import { clientSiteRootUrl } from "@/features/cms/utils/pageUrls";

export default function SiteDashboardPage() {
  const { siteId } = useParams() as { siteId: string };
  const router = useRouter();
  const {
    site,
    pages,
    pagesLoading,
    components,
    refreshPages,
    allSites,
    currentMode,
  } = useSiteContext();
  const [error, setError] = useState<string | null>(null);

  const buildSurfaceScope = useCmsSiteSurfaceScope({
    site,
    pages,
    components,
    allSites,
    currentMode,
  });
  const siteExtraSections = createCmsSiteExtraSections({
    liveUrl: clientSiteRootUrl(site.slug),
    onNewPage: () => router.push(`/cms/${siteId}/pages/new`),
    onOpenSettings: () => router.push(`/cms/${siteId}/settings`),
    onOpenComponents: () => router.push(`/cms/${siteId}/components`),
    onOpenLive: () =>
      window.open(
        clientSiteRootUrl(site.slug),
        "_blank",
        "noopener,noreferrer",
      ),
  });

  const handleDeletePage = async (pageId: string) => {
    try {
      await CmsPageService.deletePage(pageId);
      await refreshPages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete page");
    }
  };

  return (
    <NonEditableContextMenu
      {...CMS_SITE_CONTEXT_MENU_PROPS}
      extraSections={siteExtraSections}
      contextData={buildSurfaceScope() as Record<string, unknown>}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <PageListView
            pages={pages}
            isLoading={pagesLoading}
            error={error}
            onOpenPage={(pageId) =>
              router.push(`/cms/${siteId}/pages/${pageId}`)
            }
            onDeletePage={handleDeletePage}
            onRefresh={refreshPages}
          />
        </div>
      </div>
    </NonEditableContextMenu>
  );
}
