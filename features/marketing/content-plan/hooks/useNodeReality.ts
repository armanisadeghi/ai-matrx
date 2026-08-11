"use client";

/**
 * features/marketing/content-plan/hooks/useNodeReality.ts
 *
 * ONE planned page, measured against the real website — and the three actions
 * that move it forward: create it, write it, publish it.
 *
 * THE INVENTORY LAW, applied: every capability here already existed on the
 * server and was simply unreachable from the page the user was looking at.
 *   - create  → `bridgeRealize`, which has ALWAYS taken a node-id array; the UI
 *               only ever called it with "every ghost node on the site".
 *   - write   → `bridgeFillPreview`, which has ALWAYS taken a single `node_id`
 *               plus `write: true`; the UI only used it as a bulk-run preview.
 *   - publish → `cms-publish`, which has ALWAYS taken `page_ids`. (Deliberately
 *               NOT the CMS editor's `publishDraft`: only the bridge advances
 *               the plan node to `published`.)
 * Nothing new was opened. The defect was a surface that ignored what it had.
 *
 * The page facts come from the FULL CMS row (`CmsPageService.getPage`), not the
 * summary the plan-wide overlay carries: the verdict needs content LENGTH to
 * tell a realized-but-empty shell from an authored draft, and the summary has
 * no content at all. One page, fetched only while its panel is open.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
    CmsPageService,
    CmsSiteService,
} from "@/features/cms/services/cmsService";
import { extractErrorMessage } from "@/utils/errors";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { planKeys } from "../data/hooks";
import {
    bridgeFillPreview,
    bridgePublish,
    bridgeRealize,
    type CmsPageMapEntry,
} from "../setup/bridge";
import {
    judgePageReality,
    type RealityVerdict,
} from "../lib/page-reality";

export const nodeRealityKeys = {
    page: (pageId: string) => ["content-plan", "cms-page-detail", pageId] as const,
};

/**
 * Stage narration for the authoring run. The endpoint emits ONE event when it
 * finishes, so there are no real milestones to relay — these are declared
 * approximations (the platform's sanctioned fallback when true stages are not
 * available), never a bare spinner. Each entry is "show this from N seconds in".
 */
const WRITE_STAGES: { after: number; label: string }[] = [
    { after: 0, label: "Reading the brief and keyword targeting" },
    { after: 12, label: "Researching and outlining the page" },
    { after: 40, label: "Writing the page content" },
    { after: 110, label: "Saving it into the website" },
];

export function writeStageLabel(elapsedSeconds: number): string {
    let label = WRITE_STAGES[0].label;
    for (const stage of WRITE_STAGES) {
        if (elapsedSeconds >= stage.after) label = stage.label;
    }
    return label;
}

export interface UseNodeRealityArgs {
    siteId: string;
    nodeId: string;
    nodeUpdatedAt: string | null;
    /** Resolved CMS site id, or null when the plan has no website yet. */
    cmsSiteId: string | null;
    /** The overlay's summary row for this node, or null when none exists. */
    cmsPage: CmsPageMapEntry | null;
}

export function useNodeReality(args: UseNodeRealityArgs) {
    const dispatch = useAppDispatch();
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState<
        null | "create" | "write" | "publish" | "policy"
    >(null);
    const [startedAt, setStartedAt] = useState<number | null>(null);
    // A toast is a passing glance; the card keeps the reason on screen.
    const [failure, setFailure] = useState<string | null>(null);

    const pageId = args.cmsPage?.pageId ?? null;

    // The full row — content length is the only way to tell an empty shell from
    // an authored draft, and the plan-wide summary carries no content.
    const detail = useQuery({
        queryKey: nodeRealityKeys.page(pageId ?? "none"),
        enabled: Boolean(pageId),
        staleTime: 30_000,
        retry: false,
        queryFn: () => {
            if (!pageId) throw new Error("A CMS page id is required.");
            return CmsPageService.getPage(pageId);
        },
    });

    const verdict: RealityVerdict = useMemo(() => {
        const row = detail.data;
        return judgePageReality({
            cmsLinked: Boolean(args.cmsSiteId),
            page: args.cmsPage
                ? {
                      isPublished: row?.is_published ?? args.cmsPage.isPublished,
                      hasDraft: row?.has_draft ?? args.cmsPage.hasDraft,
                      contentChars: (row?.html_content ?? "").trim().length,
                      draftChars: (row?.html_content_draft ?? "").trim().length,
                      updatedAt: row?.updated_at ?? null,
                      lastPublishedAt: row?.last_published_at ?? null,
                  }
                : null,
            nodeUpdatedAt: args.nodeUpdatedAt,
        });
    }, [args.cmsSiteId, args.cmsPage, args.nodeUpdatedAt, detail.data]);

    const invalidate = useCallback(async () => {
        await queryClient.invalidateQueries({
            queryKey: planKeys.cmsPages(args.siteId),
        });
        if (pageId) {
            await queryClient.invalidateQueries({
                queryKey: nodeRealityKeys.page(pageId),
            });
        }
    }, [queryClient, args.siteId, pageId]);

    /**
     * The three actions, as ONE imperative runner.
     *
     * Deliberately NOT `useMutation`: the observer's `onError` / `onSettled`
     * never fired here (measured — a 403 from the server left the button
     * spinning forever with the failure invisible), and a one-shot imperative
     * call has no need of mutation-cache semantics in the first place. A plain
     * async function with try/catch/finally cannot lose an error.
     */
    const run = useCallback(
        async (action: "create" | "write" | "publish") => {
            if (!args.cmsSiteId) {
                toast.error("This plan has no website linked yet.");
                return;
            }
            setBusy(action);
            setFailure(null);
            if (action === "write") setStartedAt(Date.now());
            try {
                if (action === "create") {
                    const result = await bridgeRealize(
                        dispatch,
                        args.siteId,
                        [args.nodeId],
                        { dryRun: false, cmsSite: args.cmsSiteId },
                    );
                    const item = result.items[0];
                    if (result.failed > 0 || (item && !item.ok)) {
                        // The server's own words — never a laundered summary.
                        throw new Error(
                            item?.error ||
                                result.errors[0] ||
                                "The website refused to create this page.",
                        );
                    }
                    toast.success(
                        item?.detail || "The page was created on the website.",
                    );
                } else if (action === "write") {
                    const preview = await bridgeFillPreview(dispatch, args.siteId, {
                        cmsSite: args.cmsSiteId,
                        nodeId: args.nodeId,
                        write: true,
                    });
                    toast.success(
                        preview.wrote
                            ? `"${preview.title}" was written into the website as a draft.`
                            : `"${preview.title}" was written but not saved.`,
                    );
                } else {
                    if (!pageId) throw new Error("This page does not exist yet.");
                    const result = await bridgePublish(dispatch, args.siteId, {
                        dryRun: false,
                        cmsSite: args.cmsSiteId,
                        pageIds: [pageId],
                    });
                    const item = result.items[0];
                    if (result.failed > 0 || item?.error) {
                        throw new Error(
                            item?.error || "The website refused to publish this page.",
                        );
                    }
                    if (result.published === 0 && result.skippedNoChanges > 0) {
                        toast.info(
                            "Nothing to publish — the live page already matches the draft.",
                        );
                    } else {
                        toast.success("The page is live.");
                    }
                }
                await invalidate();
            } catch (error) {
                setFailure(extractErrorMessage(error));
                toast.error(extractErrorMessage(error));
            } finally {
                setBusy(null);
                setStartedAt(null);
            }
        },
        [dispatch, args.cmsSiteId, args.siteId, args.nodeId, pageId, invalidate],
    );

    /**
     * Turn on writes for the linked website, then retry what just failed.
     *
     * `agent_write_policy` defaults to `blocked`, and only sites created
     * through Setup's rung 1 are seeded `full` — so every site linked before
     * that seed existed refuses every build action with a 403 the user could
     * not see, let alone fix. Read-modify-write so no other setting is lost.
     */
    const allowWrites = useCallback(
        async (retry: "create" | "write" | "publish" | null) => {
            if (!args.cmsSiteId) return;
            setBusy("policy");
            setFailure(null);
            try {
                const site = await CmsSiteService.getSite(args.cmsSiteId);
                const settings = {
                    ...((site.settings ?? {}) as Record<string, unknown>),
                    agent_write_policy: "full",
                };
                await CmsSiteService.updateSite(args.cmsSiteId, { settings });
                toast.success("The website now accepts changes from the plan.");
            } catch (error) {
                setFailure(extractErrorMessage(error));
                toast.error(extractErrorMessage(error));
                setBusy(null);
                return;
            }
            setBusy(null);
            if (retry) await run(retry);
        },
        [args.cmsSiteId, run],
    );

    return {
        verdict,
        allowWrites,
        page: detail.data ?? null,
        isLoadingPage: detail.isLoading,
        pageError: detail.error as Error | null,
        /** The last action failure, kept on screen until the next attempt. */
        failure,
        busy,
        startedAt,
        create: () => void run("create"),
        write: () => void run("write"),
        publish: () => void run("publish"),
        refresh: invalidate,
    };
}
