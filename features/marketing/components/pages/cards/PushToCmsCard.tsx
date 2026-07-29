"use client";

/**
 * PushToCmsCard — push this page's authored plan (draft content + desired
 * meta) into the CMS as a DRAFT.
 *
 * Contract (CMS owner agent, 2026-07-29):
 *  - Site mapping via `resolveCmsLink` (settings.cms.site_id → settings.cms.slug
 *    → domain); an unlinked site deep-links to the content-plan Setup view
 *    ("Make it real") — linking is NOT reimplemented here.
 *  - Page mapping by ROUTE (`web.page.path` vs `client_pages.route`); found →
 *    `saveDraft`, missing → `createPage` as a draft. Route moves NEVER happen
 *    from this push (THE 301 LAW).
 *  - Never auto-publishes. Loud errors. `plan_node_id` surfaced read-only.
 *
 * Push mechanics live in `features/marketing/lib/push-to-cms.ts`.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Link2,
  Link2Off,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CmsPageService, CmsSiteService } from "@/features/cms/services/cmsService";
import type { ClientPage } from "@/features/cms/types";
import { resolveCmsLink } from "@/features/marketing/content-plan/setup/readiness";
import { usePageContent } from "@/features/marketing/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  buildPushPayload,
  executeCmsPush,
  normalizeRoutePath,
  resolvePushTarget,
  type PushResult,
} from "@/features/marketing/lib/push-to-cms";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import type { MarketingPage, MarketingSite } from "@/features/marketing/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

const pushKeys = {
  cms: (siteId: string) => ["marketing", "push-to-cms", siteId] as const,
};

interface CmsPushFacts {
  link: ReturnType<typeof resolveCmsLink>;
  /** Summaries of every page on the linked CMS site (empty when unlinked). */
  pages: Awaited<ReturnType<typeof CmsPageService.listPages>>;
  /** Full row of the route-matched page (carries `plan_node_id`), if any. */
  matched: ClientPage | null;
}

function useCmsPushFacts(site: MarketingSite, page: MarketingPage) {
  const route = normalizeRoutePath(page.path);
  return useQuery<CmsPushFacts>({
    queryKey: [...pushKeys.cms(site.id), route],
    retry: false,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const cmsSites = await CmsSiteService.listSites();
      const link = resolveCmsLink(site, cmsSites);
      if (!link.linked || !link.cmsSiteId) {
        return { link, pages: [], matched: null };
      }
      const pages = await CmsPageService.listPages(link.cmsSiteId);
      const target = resolvePushTarget(page, pages);
      const matched =
        target.kind === "existing"
          ? await CmsPageService.getPage(target.page.id)
          : null;
      return { link, pages, matched };
    },
  });
}

function PayloadRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
      )}
      <span className="font-medium text-foreground">{label}</span>
      <span className="truncate text-muted-foreground">{detail}</span>
    </div>
  );
}

export function PushToCmsCard({
  page,
  site,
}: {
  page: MarketingPage;
  site: MarketingSite;
}) {
  const queryClient = useQueryClient();
  const facts = useCmsPushFacts(site, page);
  const contentQuery = usePageContent(page.site_id, page.id);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const route = normalizeRoutePath(page.path);
  const link = facts.data?.link ?? null;
  const target = facts.data
    ? resolvePushTarget(page, facts.data.pages)
    : null;
  const matched = facts.data?.matched ?? null;
  const payload = buildPushPayload(page, contentQuery.data?.content ?? null);
  const hasAnything =
    payload.contentMarkdown.length > 0 ||
    payload.metaTitle !== null ||
    payload.metaDescription !== null;

  const cmsSiteId = link?.linked ? link.cmsSiteId : null;
  const cmsEditorHref = (cmsPageId: string) =>
    cmsSiteId ? `/cms/${cmsSiteId}/pages/${cmsPageId}` : null;

  const loading = facts.isLoading || contentQuery.isLoading;
  const canPush = Boolean(
    cmsSiteId && target && target.kind !== "blocked" && hasAnything && !pushing,
  );

  const push = async () => {
    if (!cmsSiteId || !target) return;
    setPushing(true);
    setPushError(null);
    try {
      const outcome = await executeCmsPush({ cmsSiteId, target, page, payload });
      setResult(outcome);
      setConfirmOpen(false);
      toast.success(
        outcome.created
          ? `Created CMS draft page at ${normalizeRoutePath(outcome.page.route)}`
          : `Updated CMS draft at ${normalizeRoutePath(outcome.page.route)}`,
      );
      for (const warning of outcome.warnings) {
        toast.warning(warning);
      }
      await queryClient.invalidateQueries({ queryKey: pushKeys.cms(site.id) });
    } catch (error) {
      const message = extractErrorMessage(error);
      setPushError(message);
      setConfirmOpen(false);
      toast.error("Push to CMS failed", { description: message });
    } finally {
      setPushing(false);
    }
  };

  const copy = webCopy({
    kind: "web-page-push-to-cms",
    label: "Push to CMS",
    description:
      "The Plan → CMS bridge status for this page: which CMS site/page the route resolves to and what authored content would be pushed as a draft.",
    surface: `Push to CMS — ${page.url}`,
    data: {
      url: page.url,
      route,
      cms_link: link,
      target:
        target?.kind === "existing"
          ? { kind: "existing", cms_page_id: target.page.id, route: target.page.route }
          : target,
      plan_node_id: matched?.plan_node_id ?? null,
      payload: {
        draft_content_chars: payload.contentMarkdown.length,
        meta_title: payload.metaTitle,
        meta_description: payload.metaDescription,
      },
    },
    lines: [
      ["Route", route],
      ["CMS site", link?.linked ? (link.cmsSlug ?? link.cmsSiteId ?? "linked") : "not linked"],
      ["Target", target ? target.kind : "unknown"],
      ["Draft content", `${payload.contentMarkdown.length} chars`],
    ],
    attributes: { page_id: page.id, site_id: site.id },
  });

  return (
    <SectionCard title="Push to CMS" copy={copy} collapsible anchor="push_to_cms">
      <div className="grid gap-3 p-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : facts.isError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Could not read the CMS: {extractErrorMessage(facts.error)}</span>
          </div>
        ) : !link?.linked ? (
          <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link2Off className="h-3.5 w-3.5 shrink-0" />
              <span>
                {link?.reason ??
                  "This site is not linked to a CMS site, so there is nowhere to push."}
              </span>
            </div>
            <div>
              <Button asChild size="sm" variant="outline" className="h-7">
                <Link href={marketingRoutes.contentPlanSite(site.id, "setup")}>
                  Link it in Site Setup
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Where it lands ─────────────────────────────────────── */}
            <div className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-muted-foreground">
                  Linked to CMS site
                  <span className="mx-1 font-medium text-foreground">
                    {link.cmsSlug ?? link.cmsSiteId}
                  </span>
                  via {link.matchedBy}
                </span>
              </div>
              {target?.kind === "existing" ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Updates the draft of
                    <span className="mx-1 font-medium text-foreground">
                      {normalizeRoutePath(target.page.route)}
                    </span>
                    ({target.page.is_published ? "published" : "unpublished"}
                    {target.page.has_draft ? ", has a pending draft that will be overwritten" : ""})
                  </span>
                  {cmsEditorHref(target.page.id) ? (
                    <Link
                      href={cmsEditorHref(target.page.id) as string}
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      Open in CMS
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              ) : target?.kind === "create" ? (
                <div className="text-xs text-muted-foreground">
                  No CMS page exists at
                  <span className="mx-1 font-medium text-foreground">{route}</span>
                  — the push creates one there as an unpublished draft.
                </div>
              ) : target?.kind === "blocked" ? (
                <div className="flex items-start gap-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{target.reason}</span>
                </div>
              ) : null}
              {matched?.plan_node_id ? (
                <div className="text-[11px] text-muted-foreground">
                  Linked plan node:
                  <span className="ml-1 font-mono">{matched.plan_node_id}</span>
                </div>
              ) : null}
            </div>

            {/* ── What gets pushed ───────────────────────────────────── */}
            <div className="grid gap-1.5">
              <PayloadRow
                ok={payload.contentMarkdown.length > 0}
                label="Draft content"
                detail={
                  payload.contentMarkdown.length > 0
                    ? `${payload.contentMarkdown.length} chars of markdown, converted to HTML`
                    : "none authored — the CMS draft body will not be touched"
                }
              />
              <PayloadRow
                ok={payload.metaTitle !== null}
                label="Meta title"
                detail={payload.metaTitle ?? "no desired title set — not pushed"}
              />
              <PayloadRow
                ok={payload.metaDescription !== null}
                label="Meta description"
                detail={
                  payload.metaDescription ?? "no desired description set — not pushed"
                }
              />
            </div>

            {/* ── Outcome / error ────────────────────────────────────── */}
            {result ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-foreground">
                  {result.created ? "Created" : "Updated"} CMS draft at
                  <span className="mx-1 font-medium">
                    {normalizeRoutePath(result.page.route)}
                  </span>
                  — not published.
                </span>
                {cmsEditorHref(result.page.id) ? (
                  <Link
                    href={cmsEditorHref(result.page.id) as string}
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    Review in CMS
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                ) : null}
                {result.warnings.map((warning) => (
                  <span key={warning} className="basis-full text-warning">
                    {warning}
                  </span>
                ))}
              </div>
            ) : null}
            {pushError ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{pushError}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <Button
                size="sm"
                className="h-8"
                disabled={!canPush}
                onClick={() => setConfirmOpen(true)}
              >
                {pushing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                )}
                Push draft to CMS
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          target?.kind === "create"
            ? `Create a CMS draft page at ${route}?`
            : `Overwrite the CMS draft at ${route}?`
        }
        description={
          target?.kind === "create"
            ? "This creates a new unpublished page on the live CMS site and saves your authored content and desired meta into its draft. Nothing is published."
            : "This writes your authored content and desired meta into the live CMS page's draft, replacing any pending draft. The published page is untouched until someone explicitly publishes."
        }
        confirmLabel={pushing ? "Pushing…" : "Push draft"}
        busy={pushing}
        onConfirm={() => void push()}
      />
    </SectionCard>
  );
}
