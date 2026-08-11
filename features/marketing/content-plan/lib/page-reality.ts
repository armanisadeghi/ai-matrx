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
    | "rewrite"
    | null;

export interface RealityPageFacts {
    isPublished: boolean;
    hasDraft: boolean;
    /** Characters of published HTML. */
    contentChars: number;
    /** Characters of draft HTML. */
    draftChars: number;
    /** `client_pages.updated_at` — when the page last changed. */
    updatedAt: string | null;
    lastPublishedAt: string | null;
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
 * do not have would be worse than the honest phrasing the headline uses ("the
 * plan changed after this page was written"). Unknown timestamps are NOT
 * treated as drift: a missing stamp means we cannot tell, and inventing a
 * "stale" verdict from absent data would nag the user forever.
 */
export function planChangedAfterPage(
    nodeUpdatedAt: string | null,
    pageUpdatedAt: string | null,
): boolean {
    const node = parseTime(nodeUpdatedAt);
    const page = parseTime(pageUpdatedAt);
    if (node === null || page === null) return false;
    return node > page;
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

    const hasContent = page.contentChars > 0 || page.draftChars > 0;
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

    if (planChangedAfterPage(input.nodeUpdatedAt, page.updatedAt)) {
        return {
            state: "stale",
            headline: "The plan changed after this page was written — the live page is behind.",
            action: "rewrite",
            actionLabel: "Rewrite from the brief",
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

/** Compact badge text for tree/table rows — same verdict, four characters wide. */
export const REALITY_BADGE: Record<RealityState, string> = {
    "no-cms-site": "No site",
    "not-built": "Not built",
    empty: "Empty",
    unpublished: "Draft",
    "draft-pending": "Draft pending",
    stale: "Behind plan",
    live: "Live",
};

/**
 * Roll a whole plan's verdicts up into the site-level answer. Counts are the
 * honest denominator (every planned page), so "12 of 40 built" cannot flatter
 * itself by only counting the pages that already exist.
 */
export interface RealityRollup {
    planned: number;
    built: number;
    written: number;
    published: number;
    behind: number;
}

export function rollupReality(states: RealityState[]): RealityRollup {
    const rollup: RealityRollup = {
        planned: states.length,
        built: 0,
        written: 0,
        published: 0,
        behind: 0,
    };
    for (const state of states) {
        if (state === "no-cms-site" || state === "not-built") continue;
        rollup.built += 1;
        if (state === "empty") continue;
        rollup.written += 1;
        if (state === "unpublished") continue;
        rollup.published += 1;
        if (state === "stale" || state === "draft-pending") rollup.behind += 1;
    }
    return rollup;
}
