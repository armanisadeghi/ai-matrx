"use client";

/**
 * features/marketing/content-plan/components/PlanWebsiteBar.tsx
 *
 * The SITE-level answer to the same question the node panel answers per page:
 * is there a real website behind this plan, how is it connected, and how much
 * of the plan actually exists on it?
 *
 * The plan workspace used to say nothing about this anywhere. A user could
 * study a 26-page plan for an hour without learning that it had no website at
 * all — the CMS pairing lived three views away in Setup, and the page overlay
 * silently rendered "no badge" for both "not built" and "no website".
 *
 * Counts are honest: the denominator is every planned page, and "built" means a
 * CMS page exists for that node. Whether a built page has CONTENT is not
 * knowable from the plan-wide summary (it carries no content), so this bar
 * never claims it — the node panel, which reads the full row, does.
 */
import { ExternalLink, Globe, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { CmsPageMapEntry } from "../setup/bridge";
import type { CmsLink } from "../setup/readiness";

export function PlanWebsiteBar({
    cmsLink,
    cmsSiteId,
    pagesByNodeId,
    allPages,
    plannedCount,
    siteDomain,
    onOpenSetup,
}: {
    cmsLink: CmsLink | null;
    cmsSiteId: string | null;
    pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
    allPages: CmsPageMapEntry[];
    plannedCount: number;
    siteDomain: string | null;
    onOpenSetup: () => void;
}) {
    // Still resolving — say nothing rather than flash "no website".
    if (!cmsLink) return null;

    if (!cmsLink.linked || !cmsSiteId) {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-foreground">
                    This plan has no website yet — nothing here can become a real
                    page until it does.
                </span>
                {/* The reason the resolver gave, in its own words. */}
                {cmsLink.reason ? (
                    <span className="text-muted-foreground">{cmsLink.reason}</span>
                ) : null}
                <Button
                    size="sm"
                    className="ml-auto h-6 text-xs"
                    onClick={onOpenSetup}
                >
                    Set up the website
                </Button>
            </div>
        );
    }

    const built = pagesByNodeId.size;
    const publishedLinked = [...pagesByNodeId.values()].filter(
        (page) => page.isPublished,
    ).length;
    // Live pages the plan does not describe — the other half of the truth.
    const unplanned = allPages.filter((page) => !page.planNodeId).length;
    const liveUrl =
        [...pagesByNodeId.values()].find((page) => page.liveUrl)?.liveUrl ?? null;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-foreground">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {siteDomain ?? cmsLink.cmsSlug ?? "Website"}
            </span>
            <span className="text-muted-foreground">
                <span className="font-medium text-foreground">
                    {built} of {plannedCount}
                </span>{" "}
                planned pages built ·{" "}
                <span className="font-medium text-foreground">
                    {publishedLinked}
                </span>{" "}
                live
                {unplanned > 0 ? (
                    <>
                        {" "}
                        · {unplanned} page{unplanned === 1 ? "" : "s"} on the site
                        the plan does not describe
                    </>
                ) : null}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => window.open(`/cms/${cmsSiteId}`, "_blank")}
                >
                    <PenLine className="h-3 w-3" />
                    Open the website
                </Button>
                {liveUrl ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 text-xs"
                        onClick={() => window.open(liveUrl, "_blank")}
                    >
                        <ExternalLink className="h-3 w-3" />
                        View live
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
