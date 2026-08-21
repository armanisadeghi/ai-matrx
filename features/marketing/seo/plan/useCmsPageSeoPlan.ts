"use client";

/**
 * Resolve the ONE SEO plan record for a CMS page — and create it when the page
 * has none.
 *
 * The join is the durable id join (`client_pages.web_page_id`, CMS migration
 * 0037), the SAME one the editor's Measure tab and `resolvePushTarget` use. No
 * second resolver: from that id, `usePageLocation` + `usePageWorkspace` are the
 * canonical reads the marketing workspace itself renders from, so the plan the
 * CMS SEO tab edits and the plan the workspace edits are one row on one query
 * key.
 *
 * When the join is absent there is genuinely no plan record yet. Invariant 9
 * says a `web.page` row is creatable at PLANNING time, so this exposes the
 * honest empty state plus ONE action that creates it: `createManualPage` (the
 * canonical page insert, never a second one) followed by
 * `CmsPageService.setWebPageLink` (the ONE writer of that column on this side).
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientPage, ClientSite } from "@/features/cms/types";
import { activeSiteDomain, clientPageUrl } from "@/features/cms/utils/pageUrls";
import {
  usePageLocation,
  usePageWorkspace,
  useSite,
} from "@/features/marketing/data/hooks";
import { createManualPage } from "@/features/marketing/data/service";
import type { MarketingPage } from "@/features/marketing/types";

/** Why a CMS page has no editable SEO plan — every reason distinguishable. */
export type CmsSeoPlanState =
  | "unsaved" // the CMS page has not been created yet
  | "site-unlinked" // this CMS site is not paired with a web.site
  | "creatable" // paired, but no measured page row exists yet
  | "loading"
  | "error"
  | "ready";

export interface CmsPageSeoPlan {
  state: CmsSeoPlanState;
  /** THE plan record. Present only in state `ready`. */
  page: MarketingPage | null;
  siteId: string | null;
  brandId: string | null;
  error: Error | null;
  creating: boolean;
  /** One click: mint the `web.page` planning row and link it to this page. */
  create: () => Promise<void>;
}

export function useCmsPageSeoPlan(args: {
  page: ClientPage | null;
  site: ClientSite;
  /** Refetch the CMS row so the new `web_page_id` lands in the editor. */
  onLinked?: () => Promise<void> | void;
}): CmsPageSeoPlan {
  const { page, site, onLinked } = args;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);

  // The owning org comes from the paired `web.site` — the row that actually
  // owns the page registry — never from the CMS site's mirrored copy.
  // access-errors: ok — read only at create time, which throws a clear sentence when the paired site could not be read; plan errors surface via location/workspace state below
  const marketingSite = useSite(site.web_site_id ?? "");
  const webPageId = page?.web_page_id ?? null;
  const location = usePageLocation(webPageId);
  const marketingSiteId = location.data?.siteId ?? "";
  const workspace = usePageWorkspace(marketingSiteId, webPageId ?? "");

  const state: CmsSeoPlanState = !page
    ? "unsaved"
    : webPageId
      ? location.isError || workspace.isError
        ? "error"
        : workspace.data
          ? "ready"
          : "loading"
      : site.web_site_id
        ? "creatable"
        : "site-unlinked";

  const create = async () => {
    if (!page || !site.web_site_id || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const url = clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        domain: activeSiteDomain(site),
      });
      const organizationId = marketingSite.data?.organization_id;
      if (!organizationId) {
        throw new Error(
          "The paired website could not be read, so there is no organization to create the plan under.",
        );
      }
      const created = await createManualPage({
        siteId: site.web_site_id,
        organizationId,
        url,
      });
      await CmsPageService.setWebPageLink(page.id, created.id);
      await onLinked?.();
      await queryClient.invalidateQueries({ queryKey: ["marketing"] });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      setCreating(false);
    }
  };

  return {
    state,
    page: workspace.data?.page ?? null,
    siteId: marketingSiteId || null,
    brandId: location.data?.brandId ?? null,
    error:
      createError ??
      ((location.error ?? workspace.error) as Error | null) ??
      null,
    creating,
    create,
  };
}
