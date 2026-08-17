"use client";

/**
 * The SEO PLAN half of the CMS editor's SEO tab — mounted ABOVE the served
 * meta fields it plans for.
 *
 * Two records, deliberately distinct and both on screen: the PLAN (what this
 * page SHOULD target — one row, on `web.page`, shared with the marketing page
 * workspace and the content plan) and the SERVED values (what this CMS page
 * actually renders into its `<head>`). This section renders THE canonical
 * `SeoPlanEditor` — the same component, directly editable, never a read-only
 * summary that bounces the user to another surface.
 */

import Link from "next/link";
import { AlertCircle, Loader2, PlusCircle, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClientPage, ClientSite } from "@/features/cms/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { SeoPlanEditor } from "@/features/marketing/seo/plan/SeoPlanEditor";
import { useCmsPageSeoPlan } from "@/features/marketing/seo/plan/useCmsPageSeoPlan";

function Frame({
  children,
  workspaceHref,
}: {
  children: React.ReactNode;
  workspaceHref?: string | null;
}) {
  return (
    <section className="rounded-lg border border-border">
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" />
          SEO plan
        </h2>
        {workspaceHref ? (
          <Link
            href={workspaceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Open the page workspace
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PageSeoPlanSection({
  page,
  site,
  onPageChanged,
}: {
  page: ClientPage | null;
  site: ClientSite;
  /** Refetch the CMS row after the plan record is linked. */
  onPageChanged?: () => Promise<void> | void;
}) {
  const plan = useCmsPageSeoPlan({ page, site, onLinked: onPageChanged });

  if (plan.state === "ready" && plan.page && plan.siteId) {
    return (
      <Frame
        workspaceHref={marketingRoutes.sitePage(
          plan.brandId,
          plan.siteId,
          plan.page.id,
        )}
      >
        <SeoPlanEditor
          variant="bare"
          page={plan.page}
          brandId={plan.brandId}
          className="p-3"
          // The Link plan card lives on the page workspace, not in the CMS.
          linkPlanHref={`${marketingRoutes.sitePage(plan.brandId, plan.siteId, plan.page.id)}#link_plan`}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="space-y-2.5 p-3 text-xs text-muted-foreground">
        {plan.state === "loading" ? (
          <p className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading this page&apos;s SEO plan…
          </p>
        ) : null}

        {plan.state === "unsaved" ? (
          <p>
            Save this page first — its SEO plan is stored against the page
            record and needs one to exist.
          </p>
        ) : null}

        {plan.state === "site-unlinked" ? (
          <p>
            This site isn&apos;t paired with a website in Marketing yet, so
            there is nowhere to store an SEO plan. Pair it from the
            content-plan setup for this site, and the plan appears here.
          </p>
        ) : null}

        {plan.state === "creatable" ? (
          <>
            <p>
              This page has no SEO plan yet. Creating one registers the page in
              the website&apos;s page registry, so its target keyword, role and
              desired search appearance live in the same one place the content
              plan and the page workspace read.
            </p>
            <Button
              size="sm"
              className="h-8"
              disabled={plan.creating}
              onClick={() => void plan.create()}
            >
              {plan.creating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create plan
            </Button>
          </>
        ) : null}

        {plan.error ? (
          <p className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {plan.error.message}
          </p>
        ) : null}
      </div>
    </Frame>
  );
}
