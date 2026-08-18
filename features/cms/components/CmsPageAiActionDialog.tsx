"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Hammer,
  KeyRound,
  Loader2,
  Pencil,
  Search,
  Unlock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SurfaceRoleAgentButton } from "@/features/surfaces/components/chrome/SurfaceRoleAgentButton";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CMS_PAGE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsPageContextMenuProps";
import { buildCmsPageContextData } from "@/features/cms/agent-context/buildCmsPageContextData";
import { CmsPageService } from "@/features/cms/services/cmsService";
import type {
  ClientComponent,
  ClientPage,
  ClientPageSummary,
  ClientSite,
} from "@/features/cms/types";
import { useCmsPagePlanContext } from "@/features/cms/hooks/useCmsPagePlanContext";
import { useCmsResearchLineage } from "@/features/cms/hooks/useCmsResearchLineage";
import {
  cmsPageHasContent,
  toCmsPageMapEntry,
  type CmsPageListRecord,
} from "@/features/cms/utils/cmsPageAi";
import { useNodeReality } from "@/features/marketing/content-plan/hooks/useNodeReality";
import { usePlanDeepen } from "@/features/marketing/content-plan/hooks/useContentPlanAi";
import { isWritePolicyBlocked } from "@/features/marketing/content-plan/lib/page-reality";
import { useFloatingLiveRun } from "@/features/overlays/openers/liveRunWindow";
import { cn } from "@/lib/utils";

export type CmsPageAiIntent = "build-edit" | "review";

interface CmsPageAiActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: CmsPageAiIntent;
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  page: CmsPageListRecord;
  onPageChanged?: () => void | Promise<void>;
  editorHref: string;
  keywordHref: string;
  planHref: string;
}

function isFullPage(page: CmsPageListRecord): page is ClientPage {
  return "html_content" in page;
}

function ReadinessRow({
  ready,
  label,
  detail,
  action,
}: {
  ready: boolean;
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  const Icon = ready ? CheckCircle2 : AlertCircle;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start",
        ready
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          ready ? "text-emerald-600" : "text-amber-600",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      </div>
      {!ready && action ? (
        <div className="w-full shrink-0 sm:w-auto">{action}</div>
      ) : null}
    </div>
  );
}

/**
 * One CMS page action gate, consumed from both the editor and every list row.
 * It reuses the content-plan writer (`useNodeReality.write`) for generation,
 * the node Deepen run for missing inputs, and the CMS surface roles for freeform
 * editing/review. Missing inputs are recommendations: the direct AI door stays
 * available unless the page has no plan at all, in which case the page agent is
 * the honest fallback.
 */
export function CmsPageAiActionDialog({
  open,
  onOpenChange,
  intent,
  site,
  pages,
  components,
  page,
  onPageChanged,
  editorHref,
  keywordHref,
  planHref,
}: CmsPageAiActionDialogProps) {
  const fullPageQuery = useQuery({
    queryKey: ["cms", "page-ai-action", page.id],
    queryFn: () => CmsPageService.getPage(page.id),
    enabled: open && !isFullPage(page),
    retry: false,
  });
  const fullPage = isFullPage(page) ? page : (fullPageQuery.data ?? null);
  const planContext = useCmsPagePlanContext(page.plan_node_id);
  const researchLineage = useCmsResearchLineage({
    scope: "page",
    cmsEntityId: page.id,
    webSiteId: site.web_site_id,
    planNodeId: page.plan_node_id,
    webPageId: page.web_page_id,
    researchTopicIds: page.research_topic_ids,
    researchTagIds: page.research_tag_ids,
    persistScratch: async (topicIds, tagIds) => {
      await CmsPageService.setResearchLineage(page.id, topicIds, tagIds);
      await fullPageQuery.refetch();
    },
  });

  const pagesByNodeId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof toCmsPageMapEntry>>();
    for (const candidate of pages) {
      if (candidate.plan_node_id) {
        map.set(candidate.plan_node_id, toCmsPageMapEntry(candidate, site));
      }
    }
    return map;
  }, [pages, site]);
  const currentMapEntry = toCmsPageMapEntry(page, site);
  const reality = useNodeReality({
    siteId: site.web_site_id ?? "",
    nodeId: page.plan_node_id ?? "",
    nodeUpdatedAt: planContext.node?.updated_at ?? null,
    cmsSiteId: site.web_site_id ? site.id : null,
    cmsPage: page.plan_node_id ? currentMapEntry : null,
    cmsPagesByNodeId: pagesByNodeId,
  });
  const deepen = usePlanDeepen(site.web_site_id);
  const deepeningThisPage =
    deepen.nodeId === page.plan_node_id && deepen.run.status === "running";
  useFloatingLiveRun({
    active: deepeningThisPage,
    instanceId: `cms-page-deepen:${page.id}`,
    requestId: deepen.run.requestId ?? null,
    label: deepen.run.stage
      ? `Preparing ${page.title} — ${deepen.run.stage}`
      : `Preparing ${page.title}`,
  });

  const buildScope = useCallback(() => {
    if (!fullPage) return {};
    return buildCmsPageContextData({
      site,
      pages,
      components,
      page: fullPage,
      activeTab: "html",
      title: fullPage.title,
      slug: fullPage.slug,
      category: fullPage.category ?? "general",
      pageType: fullPage.page_type ?? "standard",
      htmlContent: fullPage.html_content_draft ?? fullPage.html_content ?? "",
      cssContent: fullPage.css_content_draft ?? fullPage.css_content ?? "",
      jsContent: fullPage.js_content_draft ?? fullPage.js_content ?? "",
      metaTitle: fullPage.meta_title_draft ?? fullPage.meta_title ?? "",
      metaDescription:
        fullPage.meta_description_draft ?? fullPage.meta_description ?? "",
      metaKeywords:
        fullPage.meta_keywords_draft ?? fullPage.meta_keywords ?? "",
      ogImage: fullPage.og_image_draft ?? fullPage.og_image ?? "",
      canonicalUrl:
        fullPage.canonical_url_draft ?? fullPage.canonical_url ?? "",
      excerpt: fullPage.excerpt ?? "",
      showInNav: fullPage.show_in_nav,
      sortOrder: fullPage.sort_order,
      tags: (fullPage.tags ?? []).join(", "),
      versions: [],
      selectionStart: 0,
      selectionEnd: 0,
      researchLineage: researchLineage.entries,
      researchLineageStatus: researchLineage.adapter.status,
      researchLineageError: researchLineage.adapter.error,
      planContext,
      editorError:
        fullPageQuery.error instanceof Error
          ? fullPageQuery.error.message
          : null,
    });
  }, [
    fullPage,
    site,
    pages,
    components,
    researchLineage.entries,
    researchLineage.adapter.status,
    researchLineage.adapter.error,
    planContext,
    fullPageQuery.error,
  ]);

  const hasContent = fullPage
    ? cmsPageHasContent(fullPage)
    : cmsPageHasContent(page);
  const hasPlan = planContext.status === "ready" && Boolean(planContext.node);
  const hasKeyword = Boolean(planContext.node?.primary_keyword_id);
  const hasBrief = Boolean(planContext.node?.brief.length);
  const hasResearch = researchLineage.entries.length > 0;
  const busy = reality.busy !== null || deepeningThisPage;

  const runDeepen = async () => {
    if (!page.plan_node_id) return;
    await deepen.start(page.plan_node_id);
    await onPageChanged?.();
  };
  const runBuild = async () => {
    const failure = await reality.write();
    if (!failure) {
      await onPageChanged?.();
      onOpenChange(false);
    }
  };

  const aiButton =
    intent === "review" ? (
      <SurfaceRoleAgentButton
        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
        roleName="publish_reviewer"
        label="Review with AI"
      />
    ) : !hasContent && hasPlan ? (
      <Button
        onClick={() => void runBuild()}
        disabled={busy || reality.isLoadingPage}
      >
        {reality.busy === "write" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Hammer className="mr-2 h-4 w-4" />
        )}
        {hasBrief && hasKeyword ? "Build page with AI" : "Build with AI anyway"}
      </Button>
    ) : (
      <SurfaceRoleAgentButton
        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
        roleName="page_editor"
        label={hasContent ? "Edit with AI" : "Build directly with AI"}
      />
    );

  // The readiness gate deliberately remains mounted while its adopted AI run
  // streams. Non-modal is the platform contract for a dialog that can launch
  // a WindowPanel: the page stays available and the focused live-run window
  // renders above this surface without changing WindowPanel itself.
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <SurfaceRuntimeProvider
          surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
          getScope={buildScope}
          isEditable
        >
          <DialogHeader>
            <DialogTitle>
              {intent === "review"
                ? `Review ${page.title}`
                : hasContent
                  ? `Edit ${page.title} with AI`
                  : `Build ${page.title} with AI`}
            </DialogTitle>
            <DialogDescription>
              {intent === "review"
                ? "The reviewer receives the page, its plan, keyword, and research lineage before you publish."
                : "These checks improve the result, but they are recommendations—not blockers. You can start the AI at any time."}
            </DialogDescription>
          </DialogHeader>

          {fullPageQuery.isLoading || planContext.status === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking the page and its plan…
            </div>
          ) : (
            <div className="space-y-2">
              <ReadinessRow
                ready={hasPlan}
                label="Content plan"
                detail={
                  hasPlan
                    ? `${planContext.node?.label} is linked and its plan record is available to the CMS agent.`
                    : "No usable plan is linked. You can still use the page agent directly, or connect this page from the Plan tab."
                }
                action={
                  <Button asChild variant="outline" size="sm">
                    <a href={planHref}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open Plan
                    </a>
                  </Button>
                }
              />
              <ReadinessRow
                ready={hasKeyword}
                label="Target keyword"
                detail={
                  hasKeyword
                    ? `Targeting “${planContext.node?.primary_keyword ?? "the linked keyword"}”.`
                    : "A target keyword gives the writer a distinct search intent instead of making it guess."
                }
                action={
                  hasPlan ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <a href={keywordHref}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runDeepen()}
                        disabled={busy}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        Find + deepen
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              <ReadinessRow
                ready={hasBrief}
                label="Page brief"
                detail={
                  hasBrief
                    ? `${planContext.node?.brief.length} brief points tell the writer what this page must cover.`
                    : "A page brief gives the writer structure, boundaries, and the intended angle."
                }
                action={
                  hasPlan ? (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button asChild variant="outline" size="sm">
                        <a href={planHref}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runDeepen()}
                        disabled={busy}
                      >
                        <BookOpenCheck className="mr-1.5 h-3.5 w-3.5" />
                        Create with AI
                      </Button>
                    </div>
                  ) : undefined
                }
              />
              <ReadinessRow
                ready={hasResearch}
                label="Research evidence"
                detail={
                  hasResearch
                    ? `${researchLineage.entries.length} research item${researchLineage.entries.length === 1 ? " is" : "s are"} available to ground the page.`
                    : "No research topic or tag currently reaches this page. Add the evidence you want the writer to use."
                }
                action={
                  hasPlan ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={planHref}>
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        Add evidence
                      </a>
                    </Button>
                  ) : undefined
                }
              />
              {planContext.error ? (
                <p className="text-xs text-destructive">{planContext.error}</p>
              ) : null}
              {reality.failure ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">{reality.failure}</p>
                  {isWritePolicyBlocked(reality.failure) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void reality.allowWrites("write")}
                    >
                      <Unlock className="mr-1.5 h-3.5 w-3.5" />
                      Let the plan build this website
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {deepen.run.stage && deepeningThisPage ? (
                <p className="text-xs text-muted-foreground">
                  {deepen.run.stage}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button asChild variant="ghost">
              <a href={editorHref}>Open full editor</a>
            </Button>
            {fullPage ? (
              aiButton
            ) : (
              <Button disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading page…
              </Button>
            )}
          </DialogFooter>
        </SurfaceRuntimeProvider>
      </DialogContent>
    </Dialog>
  );
}
