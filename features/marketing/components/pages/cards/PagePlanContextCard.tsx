"use client";

/**
 * PagePlanContextCard — the measured page's BEFORE
 * (docs/handoffs/cms-page-hub.md item 6).
 *
 * "Before, during, and after are all captured. Just because we're in the
 * *during* period doesn't mean we should forget where we came from."
 * The page workspace is where a live page is MEASURED — but a page realized
 * from a content plan is being measured against something: the brief, the
 * target keyword, and the keyword strategy it was written to satisfy. Without
 * them the workspace silently pretends the planning step never happened.
 *
 * THE JOIN (no second data path): `web.page` → the CMS page that serves it
 * (`client_pages.web_page_id`, resolved by `resolvePushTarget` through the
 * push lane's react-query entry — the same cache `useCmsEditorHref` reads) →
 * `client_pages.plan_node_id` → `plan.node`. The CMS half lives in the
 * separate HTML CMS Supabase project, which is exactly why the durable id
 * column, not a route string, decides identity.
 *
 * THE PANEL: the canonical `PlanContextPanel` — byte-identical to what the CMS
 * editor's Plan tab shows, because it IS that component.
 */

import Link from "next/link";
import type { QueryClient } from "@tanstack/react-query";
import { ExternalLink, FileCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import {
  PlanContextPanel,
  planNodeHref,
} from "@/features/marketing/content-plan/components/PlanContextPanel";
import { planKeys } from "@/features/marketing/content-plan/data/hooks";
import { readNodeKeywordStrategy } from "@/features/marketing/content-plan/setup/keyword-strategy";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { useCmsPushFacts } from "@/features/marketing/components/pages/cards/PushToCmsCard";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import type { MarketingPage, MarketingSite } from "@/features/marketing/types";

/**
 * THE COMPLETENESS LAW: what this card renders, agents launched from this
 * surface also receive — the `plan_context` surface value. Pure trigger-time
 * cache read (the card owns the fetch); returns null when nothing planned this
 * page, so an agent is never told a brief exists that doesn't.
 */
export function readPlanContextFromCache(
  queryClient: QueryClient,
  planNodeId: string | null,
): Record<string, unknown> | null {
  if (!planNodeId) return null;
  const node = queryClient.getQueryData<PlanNodeRow>(
    planKeys.node(planNodeId),
  );
  if (!node) return null;
  const keywordRows = node.primary_keyword_id
    ? queryClient.getQueryData<Array<{ id: string; phrase: string }>>(
        planKeys.keywordLabels([node.primary_keyword_id]),
      )
    : null;
  return {
    plan_node_id: node.id,
    plan_site_id: node.site_id,
    label: node.label,
    planned_route: node.route,
    node_type: node.node_type,
    brief: node.brief ?? [],
    planned_meta_title: node.meta_title,
    planned_meta_description: node.meta_description,
    primary_keyword:
      keywordRows?.find((row) => row.id === node.primary_keyword_id)?.phrase ??
      null,
    keyword_strategy: readNodeKeywordStrategy(node),
  };
}

/** An honest empty state is a sentence plus the door that fills it. */
function NoPlan({
  headline,
  detail,
  actions,
}: {
  headline: string;
  detail: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-medium text-foreground">{headline}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export function PagePlanContextCard({
  page,
  site,
}: {
  page: MarketingPage;
  site: MarketingSite;
}) {
  // Same query key as the Push to CMS card and the header's "Edit in CMS"
  // door — one fetch for all three.
  const facts = useCmsPushFacts(site, page);
  const link = facts.data?.link ?? null;
  const cmsSiteId = link?.linked ? link.cmsSiteId : null;
  const cmsPage = facts.data?.matched ?? null;
  const planNodeId = cmsPage?.plan_node_id ?? null;
  const planWorkspaceHref = planNodeHref(site.id);

  const planWorkspaceDoor = (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
      <Link
        href={planWorkspaceHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open the content plan
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );

  const body = () => {
    if (facts.isLoading) {
      return (
        <p className="p-3 text-xs text-muted-foreground">
          Resolving the plan behind this page…
        </p>
      );
    }
    if (facts.isError) {
      return (
        <NoPlan
          headline="The plan behind this page could not be resolved."
          detail={
            facts.error instanceof Error
              ? facts.error.message
              : "The CMS site list could not be read, so the page's plan entry is unknown."
          }
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => void facts.refetch()}
              >
                Retry
              </Button>
              {planWorkspaceDoor}
            </>
          }
        />
      );
    }
    if (planNodeId) {
      return (
        <div className="p-3">
          <PlanContextPanel
            planNodeId={planNodeId}
            fallbackSiteId={site.id}
            intro="This page was planned before it was built. Everything below is what it was SUPPOSED to be — measure the observed page against it, and edit it in the plan workspace."
          />
        </div>
      );
    }
    if (!cmsSiteId) {
      return (
        <NoPlan
          headline="No plan is behind this page."
          detail="This site isn't linked to a CMS site, so no CMS page — and no plan entry — resolves to this URL. Pages that were planned first carry their brief, target keyword, and keyword strategy here."
          actions={planWorkspaceDoor}
        />
      );
    }
    if (!cmsPage) {
      return (
        <NoPlan
          headline="No CMS page serves this URL yet."
          detail="The plan travels with the CMS page that serves a URL. Nothing on the linked CMS site matches this one, so there is no plan entry to show — the Publication row's Push to CMS card is where this page becomes a CMS draft."
          actions={planWorkspaceDoor}
        />
      );
    }
    return (
      <NoPlan
        headline="This page wasn't built from a plan."
        detail="It was authored directly in the CMS, so there is no brief, target keyword, or keyword strategy behind it. Adopting it into the content plan gives it one — the page itself is untouched — and every future improvement is measured against it."
        actions={
          <>
            <Button size="sm" className="gap-1.5 text-xs" asChild>
              <Link
                href={cmsPageEditorHref(cmsSiteId, cmsPage.id, "plan")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileCode className="h-3.5 w-3.5" />
                Create a plan entry
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {planWorkspaceDoor}
          </>
        }
      />
    );
  };

  return (
    <SectionCard
      title="The plan this page was built from"
      collapsible
      anchor="plan_context"
      copy={webCopy({
        kind: "web-page-plan-context",
        label: "Plan behind this page",
        description:
          "The planning step that produced this measured page: the CMS page serving the URL and the plan node carrying its brief, target keyword, and keyword strategy.",
        surface: `Plan context — ${page.url}`,
        data: {
          url: page.url,
          cms_page_id: cmsPage?.id ?? null,
          plan_node_id: planNodeId,
          plan_workspace_href: planNodeId
            ? planNodeHref(site.id, planNodeId)
            : planWorkspaceHref,
        },
        lines: [
          ["URL", page.url],
          ["CMS page", cmsPage?.id ?? "none"],
          ["Plan node", planNodeId ?? "none — this page was not planned"],
        ],
        attributes: { page_id: page.id, site_id: site.id },
      })}
    >
      {body()}
    </SectionCard>
  );
}
