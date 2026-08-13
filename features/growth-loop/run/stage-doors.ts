/**
 * THE DOOR LAW for a loop run.
 *
 * A stage names two kinds of thing, and both must be reachable:
 *
 * 1. Its REF — the row the stage is actually working on
 *    (`growth.stage_ref_kind` stores schema/table/id_column per kind, so the
 *    server can always resolve one). The database knows WHERE the row lives;
 *    it does not know which URL shows it to a human, which is the fact this
 *    module holds. `Record<StageRefKind, …>` means a new kind on the server is
 *    a COMPILE ERROR here, never a silently unopenable id.
 *
 * 2. Its ENTRY — the surface where a human does that stage's work today,
 *    declared once per stage as `LoopStage.entry` in `../map/loop-map.ts`
 *    (`/marketing/brands/[brandId]/sites/[siteId]` and friends). This module
 *    only substitutes the ids; it never invents a route.
 *
 * A kind with `href: null` renders its LABEL and no id — per no-dead-ends,
 * never print an identifier the user cannot open.
 */

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { stageById } from "../map/loop-map";
import type { LoopStageId, StageRefKind } from "./api";

export interface RefSubject {
  brandId: string | null;
  siteId: string;
}

export interface StageDoor {
  /** What the user is looking at, in their words. */
  label: string;
  /** Where it opens. `null` = we have no viewer for this kind yet. */
  href: string | null;
}

type RefResolver = (id: string, subject: RefSubject) => string | null;

/**
 * kind → the surface that shows that row. Kinds resolved to `null` have no
 * user-facing viewer in this repo today; they are internal execution
 * bookkeeping (a workflow run, an agent-usage row) and the loop shows the
 * stage's own status instead of a broken link.
 */
const REF_HREF: Record<StageRefKind, RefResolver> = {
  research_topic: (id) => `/research/topics/${id}`,
  crawl_session: (id, s) =>
    marketingRoutes.site(s.brandId, s.siteId, `/crawls/${id}`),
  finding: (id, s) =>
    marketingRoutes.site(s.brandId, s.siteId, `/findings/${id}`),
  analysis_result: (_id, s) =>
    marketingRoutes.site(s.brandId, s.siteId, "/analysis"),
  cms_fill_job: (_id, s) => marketingRoutes.contentPlanSite(s.siteId),
  chat_request: () => null,
  workflow_run: () => null,
  runtime_execution: () => null,
  sch_run: () => null,
  assist: () => null,
  agent_usage: () => null,
};

/** The label for each kind — mirrors `growth.stage_ref_kind.label`. */
const REF_LABEL: Record<StageRefKind, string> = {
  research_topic: "Research topic",
  crawl_session: "Crawl session",
  finding: "Finding",
  analysis_result: "Analysis result",
  cms_fill_job: "Page-fill job",
  chat_request: "Conversation request",
  workflow_run: "Workflow run",
  runtime_execution: "Runtime execution",
  sch_run: "Scheduled run",
  assist: "Assist",
  agent_usage: "Agent usage",
};

export function resolveStageRef(
  ref: { kind: StageRefKind; id: string } | null | undefined,
  subject: RefSubject,
): StageDoor | null {
  if (!ref) return null;
  return {
    label: REF_LABEL[ref.kind] ?? ref.kind,
    href: REF_HREF[ref.kind](ref.id, subject),
  };
}

/**
 * Where a human goes to DO this stage. The map declares the template with
 * `[brandId]` / `[siteId]` / `[topicId]` placeholders; a template we cannot
 * fully resolve (an id we do not have) returns null rather than a link to a
 * literal `[topicId]` segment.
 */
export function resolveStageEntry(
  stage: LoopStageId,
  subject: RefSubject,
): string | null {
  const entry = stageById(stage)?.entry;
  if (!entry) return null;

  // The map annotates a few entries with a parenthetical hint for readers
  // ("/marketing/content-plan (node panel)"). Take the path only.
  const path = entry.split(" ")[0];

  // Site-scoped entries go through the canonical builder, so a caller with no
  // brand id still gets a working URL (the flat route server-redirects).
  const sitePrefix = "/marketing/brands/[brandId]/sites/[siteId]";
  if (path.startsWith(sitePrefix)) {
    return marketingRoutes.site(
      subject.brandId,
      subject.siteId,
      path.slice(sitePrefix.length),
    );
  }

  const resolved = path.replace("[siteId]", subject.siteId);
  return resolved.includes("[") ? null : resolved;
}
