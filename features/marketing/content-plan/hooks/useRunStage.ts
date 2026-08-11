"use client";

/**
 * features/marketing/content-plan/hooks/useRunStage.ts
 *
 * ONE narration system for every multi-second run in the content-plan feature.
 *
 * 🚨 A SPINNER IS NEVER THE ANSWER while AI works. These endpoints are
 * request/response — they emit ONE event, at the end — so there are no real
 * milestones to relay. Approximate stages are the platform's sanctioned
 * fallback in exactly that case: declared, honest about what the server is
 * doing, and never a bare spinner sitting on a two-minute LLM call.
 *
 * Every table below is "show this label from N seconds in". Add a table here
 * when a new rung needs different wording — NEVER inline a stage list in a
 * component, and never fork the ticker. One implementation, many tables.
 *
 * The seconds are drawn from measured runs against real sites; being roughly
 * right is the whole point of an approximation. A run that outlives its last
 * stage simply keeps that label — the elapsed counter beside it keeps telling
 * the truth about how long it has taken.
 */
import { useEffect, useState } from "react";

export interface RunStage {
    /** Show this label once the run has been going this many seconds. */
    after: number;
    label: string;
}

/** Pick the stage in force at `elapsedSeconds`. Tables are ordered by `after`. */
export function stageLabel(stages: readonly RunStage[], elapsedSeconds: number): string {
    let label = stages[0].label;
    for (const stage of stages) {
        if (elapsedSeconds >= stage.after) label = stage.label;
    }
    return label;
}

/**
 * Authoring ONE page from its brief (`bridgeFillPreview`) — a full LLM pass,
 * routinely two minutes. Used by the node panel's Write action and by Setup's
 * "Preview one page" rung, which call the very same endpoint.
 */
export const WRITE_STAGES: readonly RunStage[] = [
    { after: 0, label: "Reading the brief and keyword targeting" },
    { after: 12, label: "Researching and outlining the page" },
    { after: 40, label: "Writing the page content" },
    { after: 110, label: "Saving it into the website" },
];

export function writeStageLabel(elapsedSeconds: number): string {
    return stageLabel(WRITE_STAGES, elapsedSeconds);
}

/** Setup rung 1 — create/pick the CMS site, record both sides, first compare. */
export const LINK_STAGES: readonly RunStage[] = [
    { after: 0, label: "Setting up the website in the CMS" },
    { after: 4, label: "Recording the link on both sides" },
    { after: 9, label: "Comparing the plan to the website" },
];

/** Setup rung 2 — the starter kit: AI-generated styles, header, footer, nav. */
export const KIT_STAGES: readonly RunStage[] = [
    { after: 0, label: "Reading the site's brand, colors and voice" },
    { after: 15, label: "Designing the global styles" },
    { after: 45, label: "Building the header and footer" },
    { after: 90, label: "Seeding the navigation menu" },
    { after: 120, label: "Saving the shell into the website" },
];

/** Setup rung 3 — reconcile: read both sides page-by-page and diff them. */
export const COMPARE_STAGES: readonly RunStage[] = [
    { after: 0, label: "Reading every planned page" },
    { after: 5, label: "Reading every page on the website" },
    { after: 12, label: "Matching them up and listing the differences" },
];

/** Setup rung 3 — realize: create the missing pages, then re-compare. */
export const REALIZE_STAGES: readonly RunStage[] = [
    { after: 0, label: "Creating the draft pages" },
    { after: 10, label: "Linking each page to its plan row" },
    { after: 25, label: "Comparing the plan to the website again" },
];

/** Setup rung 4 — seeding the durable fill job (the run itself then polls). */
export const FILL_SEED_STAGES: readonly RunStage[] = [
    { after: 0, label: "Finding the pages that still need content" },
    { after: 6, label: "Queuing them for the writer" },
];

/** Setup rung 5 — publish dry run: what would change if this went live. */
export const PUBLISH_PREVIEW_STAGES: readonly RunStage[] = [
    { after: 0, label: "Reading every page on the website" },
    { after: 6, label: "Working out what would change if it went live" },
];

/** Setup rung 5 — publish apply: the one rung that changes the public site. */
export const PUBLISH_STAGES: readonly RunStage[] = [
    { after: 0, label: "Publishing the pages, one by one" },
    { after: 15, label: "Advancing the plan to match what is live" },
    { after: 40, label: "Refreshing the site" },
];

/**
 * Ticking elapsed seconds for a stage line. `null` = nothing is running.
 *
 * The interval only exists while a run does, so an idle panel does no work, and
 * each tick recomputes from the wall clock rather than counting its own firings
 * — a throttled background tab therefore reports the true elapsed time.
 */
export function useElapsedSeconds(startedAt: number | null): number {
    // The sample carries the run it was taken FOR, so a new run reads zero
    // until its own first tick instead of inheriting the last run's total.
    // (Reading the clock lives in the interval callback — never in render, and
    // never as a setState in an effect body: both are compiler-lint errors.)
    const [sample, setSample] = useState<{ runAt: number; seconds: number }>({
        runAt: 0,
        seconds: 0,
    });
    useEffect(() => {
        if (startedAt === null) return;
        const timer = window.setInterval(() => {
            setSample({
                runAt: startedAt,
                seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
            });
        }, 1000);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    if (startedAt === null || sample.runAt !== startedAt) return 0;
    return sample.seconds;
}
