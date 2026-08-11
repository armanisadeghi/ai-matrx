"use client";

/**
 * features/marketing/content-plan/components/NodeRealityCard.tsx
 *
 * "What happened to this page in the real world" — and the one button that
 * moves it forward.
 *
 * 🚨 THIS SECTION ALWAYS RENDERS. Its predecessor was `{cmsPage ? … : null}`,
 * so the ONE case that matters most — the page has not been built yet — showed
 * the user absolutely nothing: no status, no explanation, no way to build it.
 * A user looking at a finished brief had no path to a real page anywhere in the
 * product except a bulk rung buried three views away in Setup. Every state now
 * carries its own next action (NO DEAD ENDS: a problem you can detect ships
 * with its one-click fix).
 *
 * The verdict is derived live on every read (`lib/page-reality.ts`), never
 * stamped on a column — see THE TRUE CURRENT STATUS LAW.
 */
import { useEffect, useState } from "react";
import {
    ExternalLink,
    Hammer,
    Loader2,
    PenLine,
    RefreshCw,
    Rocket,
    Sparkles,
    Unlock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { useNodeReality, writeStageLabel } from "../hooks/useNodeReality";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";
import {
    isWritePolicyBlocked,
    REALITY_BADGE,
    type RealityState,
} from "../lib/page-reality";
import type { CmsPageMapEntry } from "../setup/bridge";
import type { PlanNodeRow } from "../types";

const STATE_TONE: Record<RealityState, string> = {
    "no-cms-site":
        "bg-muted text-muted-foreground",
    "not-built":
        "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    empty: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    unpublished: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    "draft-pending": "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    stale: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

const ACTION_ICON = {
    "link-site": Hammer,
    "create-page": Hammer,
    "write-content": Sparkles,
    publish: Rocket,
    rewrite: RefreshCw,
} as const;

/** Ticking elapsed seconds for the authoring stage line. */
function useElapsedSeconds(startedAt: number | null): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (startedAt === null) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    if (startedAt === null) return 0;
    return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function NodeRealityCard({
    node,
    siteId,
    cmsPage,
    cmsSiteId,
}: {
    node: PlanNodeRow;
    siteId: string;
    cmsPage: CmsPageMapEntry | null;
    cmsSiteId: string | null;
}) {
    const { setView } = usePlanWorkspaceParams();
    const reality = useNodeReality({
        siteId,
        nodeId: node.id,
        nodeUpdatedAt: node.updated_at,
        cmsSiteId,
        cmsPage,
    });
    const { verdict, busy } = reality;
    const elapsed = useElapsedSeconds(reality.startedAt);

    const pageUrl = cmsPage
        ? cmsPage.isPublished
            ? cmsPage.liveUrl
            : cmsPage.previewUrl
        : null;

    // The writer is handed the primary keyword; without one it authors the page
    // against a guess. Surfaced ONLY when the next action spends money, so the
    // caution lands where it costs something rather than nagging on every node.
    const missingKeyword =
        !node.primary_keyword_id &&
        (verdict.action === "write-content" || verdict.action === "rewrite");

    async function runAction() {
        switch (verdict.action) {
            case "link-site":
                setView("setup");
                return;
            case "create-page":
                reality.create();
                return;
            case "write-content":
                reality.write();
                return;
            case "rewrite": {
                const ok = await confirm({
                    title: "Rewrite this page from the brief?",
                    description:
                        "The AI writes a fresh version into the website's draft. The live page keeps serving the current version until you publish.",
                    confirmLabel: "Rewrite it",
                });
                if (ok) reality.write();
                return;
            }
            case "publish": {
                const ok = await confirm({
                    title: "Publish this page?",
                    description: `${node.route ?? node.label} becomes visible to the public immediately.`,
                    confirmLabel: "Publish it",
                    variant: "destructive",
                });
                if (ok) reality.publish();
                return;
            }
            default:
                return;
        }
    }

    const ActionIcon = verdict.action ? ACTION_ICON[verdict.action] : null;
    // What to re-run once the website is unblocked — the very thing that failed.
    const retryAction =
        verdict.action === "create-page"
            ? ("create" as const)
            : verdict.action === "write-content" || verdict.action === "rewrite"
              ? ("write" as const)
              : verdict.action === "publish"
                ? ("publish" as const)
                : null;

    return (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
            <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-xs leading-snug text-foreground">
                    {verdict.headline}
                </p>
                <span
                    className={`shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${STATE_TONE[verdict.state]}`}
                >
                    {REALITY_BADGE[verdict.state]}
                </span>
            </div>

            {cmsPage ? (
                <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {cmsPage.route ?? cmsPage.title}
                </p>
            ) : null}

            {missingKeyword ? (
                <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                    No keyword is targeted yet — the writer will pick its own angle.
                    Set the primary keyword below first for a page that aims at
                    something.
                </p>
            ) : null}

            {reality.pageError ? (
                <p className="text-[11px] leading-snug text-destructive">
                    Could not read the live page: {reality.pageError.message}
                </p>
            ) : null}

            {/* The server's refusal, in its own words, kept on screen. A toast
              is gone in four seconds; the reason a page will not build is the
              single most useful thing this card can say. */}
            {reality.failure ? (
                <div className="space-y-1.5">
                    <p className="text-[11px] leading-snug text-destructive">
                        {reality.failure}
                    </p>
                    {/* A problem we can detect ships with its one-click fix. */}
                    {isWritePolicyBlocked(reality.failure) ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={busy !== null}
                            onClick={() =>
                                void reality.allowWrites(retryAction)
                            }
                        >
                            <Unlock className="h-3 w-3" />
                            Let the plan build this website
                        </Button>
                    ) : null}
                </div>
            ) : null}

            {/* A run that takes minutes narrates its stages — never a bare
              spinner. The line replaces the button row at the same height, so
              nothing the user is editing shifts underneath it. */}
            {busy === "write" ? (
                <div className="flex h-7 items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    <span className="min-w-0 truncate">
                        {writeStageLabel(elapsed)}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">{elapsed}s</span>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                    {verdict.action && ActionIcon ? (
                        <Button
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={busy !== null || reality.isLoadingPage}
                            onClick={() => void runAction()}
                        >
                            {busy !== null ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <ActionIcon className="h-3 w-3" />
                            )}
                            {verdict.actionLabel}
                        </Button>
                    ) : null}

                    {cmsPage && cmsSiteId ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() =>
                                window.open(
                                    `/cms/${cmsSiteId}/pages/${cmsPage.pageId}`,
                                    "_blank",
                                )
                            }
                        >
                            <PenLine className="h-3 w-3" />
                            Edit in CMS
                        </Button>
                    ) : null}

                    {pageUrl ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => window.open(pageUrl, "_blank")}
                        >
                            <ExternalLink className="h-3 w-3" />
                            {cmsPage?.isPublished ? "Open live" : "Preview"}
                        </Button>
                    ) : null}

                    {/* Written but not yet live: publishing is available even
                      though the headline already asked for it, and rewriting
                      stays reachable without waiting for a "stale" verdict. */}
                    {verdict.state === "unpublished" ||
                    verdict.state === "draft-pending" ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={busy !== null}
                            onClick={() => reality.write()}
                        >
                            <RefreshCw className="h-3 w-3" />
                            Rewrite
                        </Button>
                    ) : null}
                </div>
            )}
        </div>
    );
}
