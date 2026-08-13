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
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { slugifyTitle, SLUG_RE } from "@/features/html-pages/utils/promoteConvert";
import type { AgentWritePolicy } from "@/features/cms/types";

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
  const [focusedPageId, setFocusedPageId] = useState<string | undefined>(
    undefined,
  );

  const buildSurfaceScope = useCmsSiteSurfaceScope({
    site,
    pages,
    components,
    allSites,
    currentMode,
    selectedPageId: focusedPageId,
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

  // ── Agent write handlers (`matrx-user/cms-site`, Pages tab) ────────────
  // `add_page` is mode "entity": it lands through the SAME
  // `CmsPageService.createPage` the New Page route uses, then refreshes the
  // layout's page cache so `pages_summary` / `site_structure` tell the truth
  // on the next read. Created unpublished and out of the nav (the API's
  // defaults), so nothing the live site serves changes here. Validates and
  // THROWS on a bad shape — the writeback seam turns a throw into the error
  // envelope the agent reads. Registered only on this tab, the one mount
  // that owns `refreshPages`.
  const getSurfaceWriteHandlers = () => ({
    add_page: async (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(
          "add_page expects an object like { title, slug?, meta_description?, excerpt? } — send the object itself, not a JSON string and not a bare title.",
        );
      // Persistence is gated by the site's own governance setting — the same
      // value this surface emits as `agent_write_policy`.
      const policy: AgentWritePolicy =
        site.settings?.agent_write_policy ?? "blocked";
      if (policy === "blocked")
        throw new Error(
          'This site\'s agent_write_policy is "blocked", so agents may not create pages on it. A human can change that in the site\'s settings.',
        );

      const {
        title,
        slug,
        meta_description: metaDescription,
        excerpt,
      } = value as Record<string, unknown>;
      if (typeof title !== "string" || !title.trim())
        throw new Error(
          "add_page requires `title` — a non-empty plain text string.",
        );
      // An explicit slug must already be routable; an omitted one is derived
      // from the title through the canonical slugifier, the same way the New
      // Page form derives it while the user types.
      let pageSlug: string;
      if (slug === undefined || slug === null || slug === "") {
        pageSlug = slugifyTitle(title);
      } else if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
        throw new Error(
          "add_page `slug` must be lowercase letters, digits and single hyphens (e.g. about-our-team) — omit it to derive one from the title.",
        );
      } else {
        pageSlug = slug;
      }
      if (metaDescription !== undefined && typeof metaDescription !== "string")
        throw new Error("add_page `meta_description` must be a string.");
      if (excerpt !== undefined && typeof excerpt !== "string")
        throw new Error("add_page `excerpt` must be a string.");

      await CmsPageService.createPage({
        siteId,
        slug: pageSlug,
        title: title.trim(),
        metaDescription: (metaDescription as string) || undefined,
        excerpt: (excerpt as string) || undefined,
        provenance: { source: "surface-write", target: "add_page" },
      });
      await refreshPages();
    },
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
    // Nested `matrx-user/cms-site` runtime: only this tab knows which row the
    // user is pointing at, so it re-emits the site scope with selected_page_id.
    <SurfaceRuntimeProvider
      surfaceName={CMS_SITE_CONTEXT_MENU_PROPS.surfaceName}
      getScope={buildSurfaceScope}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
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
            onFocusPage={setFocusedPageId}
            onRefresh={refreshPages}
          />
        </div>
      </div>
    </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
