/**
 * Deterministic Assists producer for the Content Plan workspace — the
 * "planned pages not on your site yet" noticer. When the plan site has a
 * paired CMS site and some plan nodes have no CMS page behind them, one
 * chip takes the user straight to Setup → the bridge's "Realize planned
 * pages" rung — the literal fix, with its mandatory dry-run preview.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - dedupe key per site; `filterUndecidedKeys` first so a dismissal is
 *   durable — re-noticing never resurrects the chip.
 * - capped: at most ONE chip per site per sweep (the gap aggregates),
 *   expires set.
 * - cheapest-first: a pure join of two datasets the workbench already
 *   loaded (plan nodes × the WF-11 CMS page map); zero extra reads, zero
 *   tokens to notice. An UNPAIRED site never fires — no CMS site is a
 *   normal state, not a defect (useCmsPageMap contract).
 * - the action is real: navigate lands on the setup bridge whose
 *   "Realize planned pages" action creates the missing pages.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { Assist } from "@/features/assists/types";
import { listSiteKeywordValues } from "./data/service";
import { KEYWORD_STRATEGY_ATTR_KEY } from "./setup/keyword-strategy";
import type { CmsPageMapEntry } from "./setup/bridge";
import type { PlanNodeRow } from "./types";

const SOURCE_PREFIX = "content_plan";
const SOURCE_KEY = `${SOURCE_PREFIX}.missing_pages`;
const KEYWORD_SOURCE_KEY = `${SOURCE_PREFIX}.missing_keywords`;

/** `/marketing/content-plan/[siteId]` resolves to this surface
 * (features/surfaces/utils/route-to-surface.ts). */
export const PLAN_ASSIST_SURFACE = "matrx-user/content-plan";

const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

/** Is this pending assist one of ours, addressed to this site? (Assists are
 * per-user and persist across sites; site scope rides the dedupe key.) */
export function isPlanAssist(assist: Assist, siteId: string): boolean {
  return (
    assist.sourceKey.startsWith(`${SOURCE_PREFIX}.`) &&
    (assist.dedupeKey?.includes(`:${siteId}`) ?? false)
  );
}

/** A page carries a keyword assignment through EITHER of the two places the
 * feature writes one: the FK, or the whole-plan strategy record (which is what
 * a supporting page gets — a page role and the money routes it feeds). Mirrors
 * `assert_brief_preconditions` in aidream's brief_writer.py; the two must agree
 * or the UI offers a fix for a gap the server does not see. */
export function hasKeywordAssignment(node: PlanNodeRow): boolean {
  if (node.primary_keyword_id) return true;
  const attributes = node.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return false;
  }
  const strategy = (attributes as Record<string, unknown>)[KEYWORD_STRATEGY_ATTR_KEY];
  return Boolean(strategy && typeof strategy === "object" && !Array.isArray(strategy));
}

/**
 * The keyword-gap noticer — a page with no target query cannot be briefed,
 * written, or differentiated from its siblings, and every downstream agent
 * discovers that the expensive way (the Brief Writer used to spend a full paid
 * run to say so). Noticing is free: a scan of nodes the workbench already has.
 *
 * Independent of CMS pairing on purpose — a plan with no website at all still
 * needs its keywords, so this must never inherit the missing-pages gate.
 *
 * The chip names the RIGHT fix, which needs one cheap read AFTER a gap is found
 * and AFTER the dismissal check passes:
 *   * the site HAS a keyword library → "Plan keywords" assigns the whole plan.
 *   * the site has NONE → that step is a dead end; the fix is upstream, in
 *     keyword research. Sending the user to an empty picker is the dead end
 *     this whole change exists to remove.
 */
export async function produceKeywordAssists(args: {
  siteId: string;
  siteLabel: string;
  nodeRows: readonly PlanNodeRow[];
  userId: string;
  dispatch: AppDispatch;
}): Promise<boolean> {
  const { siteId, siteLabel, nodeRows, userId, dispatch } = args;

  const missing = nodeRows.filter(
    (node) => !node.deleted_at && !hasKeywordAssignment(node),
  );
  if (missing.length === 0) return false;

  const dedupeKey = `${KEYWORD_SOURCE_KEY}:${siteId}`;
  const undecided = await filterUndecidedKeys([dedupeKey]);
  if (undecided.length === 0) return true;

  // Which of the two truths is it? A read failure is the THIRD truth and must
  // not be reported as "you have no keywords" — that sends the user to build
  // something they may already have. No chip beats a wrong chip; the gap is
  // still noticed next session.
  let librarySize: number;
  try {
    librarySize = (await listSiteKeywordValues(siteId)).length;
  } catch {
    return false;
  }

  const count = missing.length;
  const pages = count === 1 ? "page" : "pages";
  const body =
    librarySize > 0
      ? `${count} planned ${pages} on ${siteLabel} ${count === 1 ? "has" : "have"} no target search term yet, so nothing tells them apart — and pages without one can end up competing with each other. Your site already has ${librarySize} researched keyword${librarySize === 1 ? "" : "s"}. "Plan keywords" in Setup assigns them across the whole plan at once, deciding which page owns which term.`
      : `${count} planned ${pages} on ${siteLabel} ${count === 1 ? "has" : "have"} no target search term, and this site has no researched keywords to choose from yet. Start with keyword research for this site — once there are keywords, "Plan keywords" in Setup can assign them across the plan.`;

  await emitAssistTracked(
    userId,
    {
      sourceKey: KEYWORD_SOURCE_KEY,
      title:
        librarySize > 0
          ? `${count} planned ${pages} ${count === 1 ? "has" : "have"} no target keyword`
          : `${siteLabel} has no keywords to plan with yet`,
      body,
      action: {
        kind: "navigate",
        href:
          librarySize > 0
            ? `/marketing/content-plan/${siteId}?view=setup`
            : `/marketing/keyword-research`,
      },
      surfaceName: PLAN_ASSIST_SURFACE,
      dedupeKey,
      expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
      // Above the missing-pages chip: building a page whose keyword is unknown
      // is the more expensive mistake, and it happens first.
      priority: 20,
    },
    dispatch,
  );
  return true;
}

/**
 * One sweep per site per session once a gap exists (the strip gates it).
 * Emits at most one assist per site. Returns true when a gap was found (the
 * caller may stop re-checking this site this session) — false means "no gap
 * yet, keep watching"; no network is touched without a gap.
 */
export async function producePlanAssists(args: {
  siteId: string;
  /** Domain (preferred) or name — used in the chip body. */
  siteLabel: string;
  /** The workbench's already-loaded plan nodes. */
  nodeRows: readonly PlanNodeRow[];
  /** WF-11 page map keyed by plan node id (useCmsPageMap.pagesByNodeId).
   * Callers must only sweep when the site IS paired (map !== null). */
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
  userId: string;
  dispatch: AppDispatch;
}): Promise<boolean> {
  const { siteId, siteLabel, nodeRows, pagesByNodeId, userId, dispatch } = args;

  const missing = nodeRows.filter(
    (node) => !node.deleted_at && !pagesByNodeId.has(node.id),
  );
  if (missing.length === 0) return false;

  const dedupeKey = `${SOURCE_KEY}:${siteId}`;
  const undecided = await filterUndecidedKeys([dedupeKey]);
  if (undecided.length === 0) return true;

  const count = missing.length;
  await emitAssistTracked(
    userId,
    {
      sourceKey: SOURCE_KEY,
      title: `${count} planned ${count === 1 ? "page isn't" : "pages aren't"} on your site yet`,
      body: `Your plan for ${siteLabel} has ${count} ${count === 1 ? "page" : "pages"} that ${count === 1 ? "doesn't" : "don't"} exist on the connected website yet. The Setup view's "Realize planned pages" step creates them — you see a preview of exactly what would be created before anything is applied.`,
      action: {
        kind: "navigate",
        href: `/marketing/content-plan/${siteId}?view=setup`,
      },
      surfaceName: PLAN_ASSIST_SURFACE,
      dedupeKey,
      expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
      priority: 10,
    },
    dispatch,
  );
  return true;
}
