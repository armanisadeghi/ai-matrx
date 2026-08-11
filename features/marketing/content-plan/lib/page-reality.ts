/**
 * features/marketing/content-plan/lib/page-reality.ts
 *
 * THE VERDICT: what has actually become of this planned page, and what is the
 * ONE next thing to do about it.
 *
 * Pure — no React, no network — so the same answer drives the node panel, the
 * table badge and any future agent read. Every state is DERIVED from live rows
 * on each read (THE TRUE CURRENT STATUS LAW); nothing here is ever stamped onto
 * a column and trusted later.
 *
 * Written because the node panel used to render the CMS card only when a page
 * already existed (`{cmsPage ? … : null}`) — so the single most important case,
 * "this page does not exist yet", showed the user NOTHING: no status, no
 * explanation, and no way to build it. A problem we can detect ships with its
 * one-click fix (NO DEAD ENDS).
 */

/** What the plan promised, measured against what the CMS actually holds. */
export type RealityState =
    /** The plan has no website yet — there is nowhere to build this page. */
    | "no-cms-site"
    /** The website exists; this page was never created on it. */
    | "not-built"
    /** The page exists but has no content — a shell waiting to be written. */
    | "empty"
    /** The page has content and has never been published. */
    | "unpublished"
    /** A human declared this page deliberately not part of the plan. */
    | "retired"
    /** Published, with newer unpublished edits waiting. */
    | "draft-pending"
    /** Published, but the plan changed after the page was written. */
    | "stale"
    /** Published, and nothing in the plan has changed since. */
    | "live";

/** The single next step. `null` = nothing to do; the page is current. */
export type RealityAction =
    | "link-site"
    | "create-page"
    | "write-content"
    | "publish"
    | "edit-in-cms"
    | null;

export interface RealityPageFacts {
    isPublished: boolean;
    hasDraft: boolean;
    /**
     * Have we actually READ the page body yet? The plan-wide overlay carries no
     * content, so `false` means "we do not know", NOT "empty". Treating unknown
     * as empty told the user a live 900-word page was blank whenever the detail
     * fetch was in flight or had failed — and offered to author over it.
     */
    contentKnown: boolean;
    /** Characters of published HTML. Meaningless unless `contentKnown`. */
    contentChars: number;
    /** Characters of draft HTML. Meaningless unless `contentKnown`. */
    draftChars: number;
    /** `client_pages.updated_at` — when the page last changed. */
    updatedAt: string | null;
    lastPublishedAt: string | null;
    /** `plan_excluded_at` — a human said this page is not part of the plan. */
    excludedAt: string | null;
}

export interface RealityInput {
    /** Does the plan site resolve to a CMS site at all? */
    cmsLinked: boolean;
    /** The CMS page realizing this node, or null when none exists. */
    page: RealityPageFacts | null;
    /** `plan.node.updated_at` — when the brief/targeting last changed. */
    nodeUpdatedAt: string | null;
}

export interface RealityVerdict {
    state: RealityState;
    /** One sentence, plain language, no jargon. */
    headline: string;
    /** What the user should do next, or null. */
    action: RealityAction;
    /** Verb for the action button. Empty when `action` is null. */
    actionLabel: string;
    /** True when the state is a normal, healthy end state. */
    settled: boolean;
}

function parseTime(value: string | null): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Did the plan change after the page was last written?
 *
 * Deliberately compares the node's whole `updated_at` rather than a brief-only
 * timestamp — the plan schema has no per-field stamp, and claiming precision we
 * do not have would be worse than the honest phrasing the headline uses. Unknown
 * timestamps are NOT treated as drift: a missing stamp means we cannot tell, and
 * inventing a "stale" verdict from absent data would nag the user forever.
 *
 * Publishing writes the PAGE and then advances the plan node's status, so the
 * node's `updated_at` always lands a moment AFTER the page's. Without a grace
 * window every publish immediately reported its own page as "behind plan" —
 * a false verdict caused by the very action that produced it.
 */
export const PLAN_DRIFT_GRACE_MS = 5 * 60 * 1000;

export function planChangedAfterPage(
    nodeUpdatedAt: string | null,
    pageUpdatedAt: string | null,
    pageLastPublishedAt: string | null = null,
): boolean {
    const node = parseTime(nodeUpdatedAt);
    // The page's real "as of" moment is the LATER of its last content write and
    // its last publish — publishing is a page event too.
    const written = parseTime(pageUpdatedAt);
    const published = parseTime(pageLastPublishedAt);
    const page =
        written === null
            ? published
            : published === null
              ? written
              : Math.max(written, published);
    if (node === null || page === null) return false;
    return node > page + PLAN_DRIFT_GRACE_MS;
}

export function judgePageReality(input: RealityInput): RealityVerdict {
    if (!input.cmsLinked) {
        return {
            state: "no-cms-site",
            headline: "This plan has no website yet, so there is nowhere to build this page.",
            action: "link-site",
            actionLabel: "Set up the website",
            settled: false,
        };
    }

    const page = input.page;
    if (!page) {
        return {
            state: "not-built",
            headline: "This page does not exist on the website yet.",
            action: "create-page",
            actionLabel: "Create the page",
            settled: false,
        };
    }

    if (page.excludedAt) {
        return {
            state: "retired",
            headline:
                "This page was deliberately taken out of the plan — it is not built or maintained from here.",
            action: "edit-in-cms",
            actionLabel: "Open it in the CMS",
            settled: true,
        };
    }

    // Unknown content is NOT empty. Fall through to the publish states, which
    // are answerable from the summary alone, rather than claiming a blank page.
    const hasContent =
        !page.contentKnown || page.contentChars > 0 || page.draftChars > 0;
    if (!hasContent) {
        return {
            state: "empty",
            headline: "The page exists but is empty — nothing has been written into it.",
            action: "write-content",
            actionLabel: "Write the content",
            settled: false,
        };
    }

    if (!page.isPublished) {
        return {
            state: "unpublished",
            headline: "The page is written but not live — nobody can see it yet.",
            action: "publish",
            actionLabel: "Publish it",
            settled: false,
        };
    }

    if (page.hasDraft) {
        return {
            state: "draft-pending",
            headline: "The live page has newer edits waiting that nobody can see yet.",
            action: "publish",
            actionLabel: "Publish the changes",
            settled: false,
        };
    }

    if (
        planChangedAfterPage(
            input.nodeUpdatedAt,
            page.updatedAt,
            page.lastPublishedAt,
        )
    ) {
        return {
            state: "stale",
            headline: "The plan changed after this page was written — the live page is behind.",
            // NOT "rewrite": the authoring pipeline refuses published pages
            // outright (`_fillable` excludes them), so offering to rewrite one
            // was a button that could only ever fail. Editing a LIVE page is a
            // CMS job until the server can re-author into a draft.
            action: "edit-in-cms",
            actionLabel: "Open it in the CMS",
            settled: false,
        };
    }

    return {
        state: "live",
        headline: "This page is live and matches the plan.",
        action: null,
        actionLabel: "",
        settled: true,
    };
}

/**
 * The nodes that must be created, root-first, for this one page to be able to
 * exist — its unbuilt ancestors, then itself.
 *
 * A deep URL is a real page tree on the CMS side, not a path string: realizing
 * `/industry/telecom-data-destruction` while nothing serves `/industry` is
 * refused outright ("has nothing to hang from"). The BULK rung never hit this
 * because it sorts its whole batch shallowest-first; a single-page build has to
 * bring its own ancestors, and the server happily takes them in one call.
 *
 * Already-built ancestors are EXCLUDED — re-realizing a route that already has
 * a page fails the batch (`content_plan_cms_route_taken`).
 *
 * A parent id that is not in `nodesById` (a partially-loaded tree) stops the
 * walk rather than guessing; the server's refusal is a better answer than a
 * chain we invented. The visited set makes a cyclic parent chain terminate —
 * the DB forbids cycles, but this must not hang if one ever exists.
 */
export function buildChainToRealize<
    T extends { id: string; parent_id: string | null },
>(
    nodeId: string,
    nodesById: Map<string, T>,
    isBuilt: (nodeId: string) => boolean,
): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    let current = nodesById.get(nodeId) ?? null;
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (!isBuilt(current.id)) chain.push(current.id);
        current = current.parent_id
            ? (nodesById.get(current.parent_id) ?? null)
            : null;
    }
    return chain.reverse();
}

/**
 * Is this failure the CMS site's write policy refusing us?
 *
 * aidream answers `403 cms_write_policy_denied` with "Write blocked: site
 * policy 'blocked' forbids 'update'." Sites created through Setup's rung 1 are
 * seeded `agent_write_policy: "full"`, but every site linked BEFORE that seed
 * existed still sits at the default `blocked` — so the whole build path is dead
 * for them, with the reason buried in an HTTP response nobody sees.
 *
 * Matched on the message because the bridge narrows the server envelope to its
 * text. This drives an OFFER (a button the user may press), never a silent
 * decision, so a false positive costs nothing.
 */
export function isWritePolicyBlocked(message: string | null): boolean {
    if (!message) return false;
    return (
        /cms_write_policy_denied/i.test(message) ||
        (/site policy/i.test(message) && /forbid/i.test(message))
    );
}

/** Compact badge text for tree/table rows — the same verdict, in two words. */
export const REALITY_BADGE: Record<RealityState, string> = {
    "no-cms-site": "No site",
    "not-built": "Not built",
    retired: "Retired",
    empty: "Empty",
    unpublished: "Draft",
    "draft-pending": "Draft pending",
    stale: "Behind plan",
    live: "Live",
};
