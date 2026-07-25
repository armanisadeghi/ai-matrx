/**
 * PIPELINE READINESS — the one place that decides what "done" means.
 *
 * A research topic is a chain: keywords → sources → content → analyses →
 * keyword syntheses → topic report → document. Counting rows at each link only
 * answers "has this ever produced anything?", which is why a topic with a
 * freshly added, completely unprocessed keyword rendered uniformly green.
 *
 * This module answers the honest question instead: **is this stage caught up
 * with the stage above it?** Every rule below mirrors a real gate in the
 * aidream orchestrator (cited per-stage), so the UI never claims work is
 * pending that the pipeline would decline to do — and never claims a stage is
 * finished when it is not.
 *
 * Pure and dependency-free: it reads `ResearchProgress` (including the
 * `pending` ledger from `get_topic_overview`) and returns display-ready state.
 * All rendering decisions elsewhere consume THIS — no surface may re-derive
 * "is it done" locally.
 */

import type { ResearchProgress } from "./types";

/** The pipeline links this module reasons about, in dependency order. */
export type ReadinessStage =
  | "keywords"
  | "sources"
  | "content"
  | "analysis"
  | "synthesis"
  | "report"
  | "document";

export const READINESS_STAGE_ORDER: readonly ReadinessStage[] = [
  "keywords",
  "sources",
  "content",
  "analysis",
  "synthesis",
  "report",
  "document",
] as const;

/**
 * - `empty`   nothing produced yet
 * - `ready`   produced, and caught up with everything upstream
 * - `behind`  produced, but upstream has moved on — this stage owes work
 * - `stale`   produced, upstream is caught up, but this artifact predates the
 *             newest input it should contain (report / document only)
 */
export type StageReadiness = "empty" | "ready" | "behind" | "stale";

export interface StageReadinessInfo {
  stage: ReadinessStage;
  readiness: StageReadiness;
  /** Short user-facing reason, e.g. "1 keyword not searched". Null when ready. */
  reason: string | null;
  /**
   * Whether running the pipeline (or this stage) would actually change
   * something here. Drives whether a "finish this" affordance is offered.
   */
  actionable: boolean;
}

export type ReadinessMap = Record<ReadinessStage, StageReadinessInfo>;

/** "1 keyword" / "3 keywords" — pluralization used across every reason string. */
function keywordCount(n: number): string {
  return `${n} keyword${n === 1 ? "" : "s"}`;
}

/**
 * Derive per-stage readiness from a progress snapshot.
 *
 * IMPORTANT — the cascade rule. A stage is `behind` when it owes work of its
 * OWN. It is NOT marked behind merely because an ancestor is behind: before the
 * search runs, the new keyword has no sources, so Content genuinely has nothing
 * to do and must stay green. The instant that search lands sources, the scrape
 * quota for that keyword goes unmet and Content flips to `behind` on its own
 * evidence. That is the difference between an honest readout and a wall of
 * alarm.
 */
export function deriveReadiness(
  progress: ResearchProgress | null | undefined,
): ReadinessMap {
  const empty = (stage: ReadinessStage): StageReadinessInfo => ({
    stage,
    readiness: "empty",
    reason: null,
    actionable: false,
  });

  if (!progress) {
    return READINESS_STAGE_ORDER.reduce((acc, stage) => {
      acc[stage] = empty(stage);
      return acc;
    }, {} as ReadinessMap);
  }

  const p = progress.pending;

  const info = (
    stage: ReadinessStage,
    args: {
      have: number;
      behindReason?: string | null;
      staleReason?: string | null;
    },
  ): StageReadinessInfo => {
    const { have, behindReason, staleReason } = args;
    if (behindReason) {
      // "Behind" outranks "empty": a stage that has produced nothing yet but
      // owes work is genuinely pending, not merely untouched.
      return { stage, readiness: "behind", reason: behindReason, actionable: true };
    }
    if (have <= 0) return empty(stage);
    if (staleReason) {
      return { stage, readiness: "stale", reason: staleReason, actionable: true };
    }
    return { stage, readiness: "ready", reason: null, actionable: false };
  };

  return {
    // Keywords are a user-authored set, never "behind" — the count IS the
    // truth. Being at the cap is headroom information, not incompleteness.
    keywords: info("keywords", { have: progress.total_keywords }),

    // aidream research/service.py:1687 — `/run` searches a keyword only while
    // `last_searched_at` is null.
    sources: info("sources", {
      have: progress.total_sources,
      behindReason:
        p.keywords_unsearched > 0
          ? `${keywordCount(p.keywords_unsearched)} never searched`
          : null,
    }),

    // aidream research/scraper.py:552-565 — per-keyword quota walk; sources
    // already scraped count toward the quota without being re-fetched.
    content: info("content", {
      have: progress.total_content,
      behindReason:
        p.keywords_pending_scrape > 0
          ? `${keywordCount(p.keywords_pending_scrape)} below the scrape quota`
          : null,
    }),

    // aidream research/service.py:1074-1141 — top-N per keyword, skipping any
    // source that already holds a successful analysis.
    analysis: info("analysis", {
      have: progress.total_analyses,
      behindReason:
        p.keywords_pending_analysis > 0
          ? `${keywordCount(p.keywords_pending_analysis)} below the analysis quota`
          : progress.failed_analyses > 0
            ? `${progress.failed_analyses} failed`
            : null,
    }),

    // aidream research/service.py:1144-1202 — keywords holding a current
    // successful synthesis are skipped and consume a topic-wide quota slot.
    synthesis: info("synthesis", {
      have: progress.keyword_syntheses,
      behindReason:
        p.keywords_pending_synthesis > 0
          ? `${keywordCount(p.keywords_pending_synthesis)} without a synthesis`
          : null,
    }),

    // The report is not "behind" — one report is one report. It goes STALE the
    // moment a keyword synthesis newer than it exists, because it was written
    // without that material.
    report: info("report", {
      have: progress.topic_syntheses,
      staleReason: p.report_stale
        ? "Written before the newest keyword synthesis"
        : null,
    }),

    document: info("document", {
      have: progress.total_documents,
      staleReason: p.document_stale
        ? "Assembled before the newest topic report"
        : null,
    }),
  };
}

/** Every stage owing work, in pipeline order. Empty ⇒ the topic is caught up. */
export function outstandingStages(map: ReadinessMap): StageReadinessInfo[] {
  return READINESS_STAGE_ORDER.map((s) => map[s]).filter((i) => i.actionable);
}

/**
 * Is there outstanding work that a `/run` would actually pick up? Report and
 * document staleness are EXCLUDED: `run_initial_pass` refuses a topic report
 * once one exists (aidream research/service.py:2014-2035) and never assembles a
 * document at all, so offering "Run pipeline" as the fix for those would be a
 * lie. Those two get their own explicit decisions.
 */
export function hasRunnableWork(map: ReadinessMap): boolean {
  return (["sources", "content", "analysis", "synthesis"] as const).some(
    (s) => map[s].readiness === "behind",
  );
}

/**
 * One-line summary of what a `/run` will do next, in the user's words. Null
 * when the pipeline has nothing to pick up.
 */
export function runnableSummary(map: ReadinessMap): string | null {
  const stages = (["sources", "content", "analysis", "synthesis"] as const)
    .map((s) => map[s])
    .filter((i) => i.readiness === "behind");
  if (stages.length === 0) return null;
  return stages.map((i) => i.reason).filter(Boolean).join(" · ");
}
