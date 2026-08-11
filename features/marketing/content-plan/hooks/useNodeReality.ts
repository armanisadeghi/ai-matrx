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

import { planKeys, usePlanNodes } from "../data/hooks";
import {
    bridgeFillPreview,
    bridgePublish,
    bridgeRealize,
    type CmsPageMapEntry,
} from "../setup/bridge";
import {
    buildChainToRealize,
    judgePageReality,
    type RealityVerdict,
} from "../lib/page-reality";

export const nodeRealityKeys = {
    page: (pageId: string) => ["content-plan", "cms-page-detail", pageId] as const,
};

// Stage narration for the authoring run lives in `hooks/useRunStage.ts` —
// ONE table (WRITE_STAGES) shared with Setup's "Preview one page" rung, which
// calls this very endpoint. Never re-declare it beside a component.

export interface UseNodeRealityArgs {
    siteId: string;
    nodeId: string;
    nodeUpdatedAt: string | null;
    /** Resolved CMS site id, or null when the plan has no website yet. */
    cmsSiteId: string | null;
    /** The overlay's summary row for this node, or null when none exists. */
    cmsPage: CmsPageMapEntry | null;
    /** Every node's CMS page, so ancestors can be told built from unbuilt. */
    cmsPagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
}

export type NodeReality = ReturnType<typeof useNodeReality>;

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

    // The already-loaded plan tree (same cache the tree/table/map read — this
    // never issues a fetch of its own), used to walk this node's ancestors.
    const nodes = usePlanNodes(args.siteId);
    const nodesById = useMemo(() => {
        const map = new Map<string, { id: string; parent_id: string | null }>();
        for (const node of nodes.data ?? []) {
            map.set(node.id, { id: node.id, parent_id: node.parent_id });
        }
        return map;
    }, [nodes.data]);

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
                      // Only the FULL row carries a body. Until it lands, the
                      // verdict must not guess "empty" — see contentKnown.
                      contentKnown: Boolean(row),
                      contentChars: (row?.html_content ?? "").trim().length,
                      draftChars: (row?.html_content_draft ?? "").trim().length,
                      updatedAt: row?.updated_at ?? null,
                      lastPublishedAt: row?.last_published_at ?? null,
                      excludedAt: args.cmsPage.planExcludedAt,
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
     *
     * Resolves to `null` on success or the failure MESSAGE on refusal — the
     * card renders it, and the agent write handlers re-throw it, so an agent
     * cannot be told "done" when the website refused.
     */
    const run = useCallback(
        async (
            action: "create" | "write" | "publish",
        ): Promise<string | null> => {
            if (!args.cmsSiteId) {
                const message = "This plan has no website linked yet.";
                toast.error(message);
                return message;
            }
            setBusy(action);
            setFailure(null);
            if (action === "write") setStartedAt(Date.now());
            try {
                if (action === "create") {
                    // Ancestors first: a deep URL is a real page tree, and the
                    // server refuses a child whose parent page does not exist.
                    // An unloaded tree yields no chain — build THIS page alone
                    // and let the server refuse it, rather than claiming the
                    // page already exists when we simply have not looked.
                    const chain = nodesById.size
                        ? buildChainToRealize(args.nodeId, nodesById, (id) =>
                              args.cmsPagesByNodeId.has(id),
                          )
                        : [args.nodeId];
                    if (chain.length === 0) {
                        throw new Error("This page already exists on the website.");
                    }
                    const result = await bridgeRealize(
                        dispatch,
                        args.siteId,
                        chain,
                        { dryRun: false, cmsSite: args.cmsSiteId },
                    );
                    const failedItem = result.items.find((row) => !row.ok);
                    if (result.failed > 0 || failedItem) {
                        // The server's own words — never a laundered summary.
                        throw new Error(
                            failedItem?.error ||
                                result.errors[0] ||
                                "The website refused to create this page.",
                        );
                    }
                    // Count what the server actually CHANGED — an ancestor that
                    // already existed comes back ok-but-unchanged, and claiming
                    // to have created it is a lie about a write.
                    const created = result.items.filter((row) => row.changed).length;
                    toast.success(
                        created > 1
                            ? `Created ${created} pages, including the parent pages this one needed.`
                            : created === 1
                              ? "The page was created on the website."
                              : "Everything this page needed already existed.",
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
            } catch (error) {
                const message = extractErrorMessage(error);
                setFailure(message);
                toast.error(message);
                return message;
            } finally {
                // ALWAYS refresh, including after a failure: these calls are
                // per-item isolated server-side, so a 3-page chain can create
                // two and fail the third. Skipping the refresh on error left
                // real new pages invisible for a full cache lifetime.
                await invalidate();
                setBusy(null);
                setStartedAt(null);
            }
            return null;
        },
        [
            dispatch,
            args.cmsSiteId,
            args.siteId,
            args.nodeId,
            args.cmsPagesByNodeId,
            nodesById,
            pageId,
            invalidate,
        ],
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
        // Return the PROMISE, not void: an agent applying a write target
        // awaits these, and a void return would report success the instant the
        // request was sent — before the page was built, written or published.
        create: () => run("create"),
        write: () => run("write"),
        publish: () => run("publish"),
        refresh: invalidate,
    };
}
