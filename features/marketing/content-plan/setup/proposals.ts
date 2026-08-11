/**
 * features/marketing/content-plan/setup/proposals.ts
 *
 * THE SERVER'S copy of the three whole-plan Setup runs.
 *
 * The keyword strategist, the entity attacher and the plan reviewer used to
 * run their agent slot FROM THIS BROWSER. They run on aidream now
 * (`aidream/services/content_plan/setup_agents.py`), which writes the complete
 * proposal to `web.site.settings.content_plan.*_proposal` the instant the
 * model answers — before anything streams — and records the whole run on a
 * `chat.agent_run` row.
 *
 * That makes these the RECOVERY copy: a user who closes the tab mid-run, or
 * whose connection drops, comes back to the finished proposal instead of a
 * silently-lost paid run. The Setup draft (`draft.ts`) remains the user's
 * WORKING copy — what they have applied, added, or dismissed.
 *
 * The payload is the agent's own wire shape (snake_case), so the `coerce*`
 * parsers in `./ai` stay the ONE validator for each of these three shapes.
 */
import {
  coerceEntityAttachPlan,
  coerceKeywordStrategy,
  coercePlanReview,
  type EntityAttachPlan,
  type KeywordStrategyResult,
  type PlanReviewResult,
} from "./ai";
import { SITE_SETTINGS_KEY } from "./archetypes";

/** Twins of the server's keys — `setup_agents.py` names the same three. */
export const KEYWORD_STRATEGY_PROPOSAL_KEY = "keyword_strategy_proposal";
export const ENTITY_ATTACH_PROPOSAL_KEY = "entity_attach_proposal";
export const PLAN_REVIEW_PROPOSAL_KEY = "plan_review_proposal";

/** One persisted proposal, with the provenance that makes it auditable. */
export interface PlanProposal<T> {
  result: T;
  /** The `chat.agent_run` row holding the complete request + result. */
  runId: string | null;
  modelId: string | null;
  agentId: string | null;
  generatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readProposal<T>(
  settings: unknown,
  key: string,
  coerce: (value: unknown) => T,
): PlanProposal<T> | null {
  if (!isRecord(settings)) return null;
  const block = settings[SITE_SETTINGS_KEY];
  if (!isRecord(block)) return null;
  const raw = block[key];
  if (!isRecord(raw)) return null;
  let result: T;
  try {
    // A proposal that no longer parses degrades to "none" — the user re-runs.
    // It never throws, because that would take the whole Setup view with it.
    result = coerce(raw.result);
  } catch {
    return null;
  }
  const text = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;
  return {
    result,
    runId: text(raw.run_id),
    modelId: text(raw.model_id),
    agentId: text(raw.agent_id),
    generatedAt: text(raw.generated_at) ?? "",
  };
}

export function readKeywordStrategyProposal(
  settings: unknown,
): PlanProposal<KeywordStrategyResult> | null {
  return readProposal(settings, KEYWORD_STRATEGY_PROPOSAL_KEY, coerceKeywordStrategy);
}

export function readEntityAttachProposal(
  settings: unknown,
): PlanProposal<EntityAttachPlan> | null {
  return readProposal(settings, ENTITY_ATTACH_PROPOSAL_KEY, coerceEntityAttachPlan);
}

export function readPlanReviewProposal(
  settings: unknown,
): PlanProposal<PlanReviewResult> | null {
  return readProposal(settings, PLAN_REVIEW_PROPOSAL_KEY, coercePlanReview);
}
