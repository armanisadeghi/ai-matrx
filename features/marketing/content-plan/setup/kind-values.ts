/**
 * features/marketing/content-plan/setup/kind-values.ts
 *
 * Pure builders that turn the setup passes' PARSED results (the coerce*
 * shapes in ./ai.ts) back into canonical kind instances, so the persisted
 * proposals render through each kind's registered component via
 * KindInstanceRender — the same render a `__kind` block gets in chat
 * (agent-manifest wave 2, 2026-08-23; pattern: flashcards wave 1's
 * `liveHelpAnswerValue`).
 *
 * Keys mirror the kinds' registered sample_data exactly (snake_case), and
 * every nested item carries its own `__kind` so the parent component can
 * delegate to the item kind's render.
 */

import type {
  EntityAttachPlan,
  EntityCurationResult,
  KeywordStrategyResult,
  PlanReviewResult,
} from "./ai";

export const PLAN_KEYWORD_STRATEGY_KIND = "plan_keyword_strategy";
export const PLAN_ENTITY_ATTACHMENT_SET_KIND = "plan_entity_attachment_set";
export const PLAN_REVIEW_FINDINGS_KIND = "plan_review_findings";
export const PLAN_ENTITY_ROSTER_KIND = "plan_entity_roster";

export function keywordStrategyValue(
  result: KeywordStrategyResult,
): Record<string, unknown> {
  return {
    __kind: PLAN_KEYWORD_STRATEGY_KIND,
    strategy_summary: result.strategySummary,
    warnings: result.warnings,
    assignments: result.assignments.map((assignment) => ({
      __kind: "plan_keyword_assignment",
      route: assignment.route,
      page_role: assignment.pageRole,
      primary_keyword: assignment.primaryKeyword,
      primary_is_new: assignment.primaryIsNew,
      secondary_keywords: assignment.secondaryKeywords,
      supports_routes: assignment.supportsRoutes,
      internal_links: assignment.internalLinks.map((link) => ({
        __kind: "plan_planned_link",
        to_route: link.toRoute,
        anchor_text: link.anchorText,
      })),
      meta_title: assignment.desiredMetaTitle,
      meta_description: assignment.desiredMetaDescription,
      reason: assignment.reason,
    })),
  };
}

export function entityAttachPlanValue(
  plan: EntityAttachPlan,
): Record<string, unknown> {
  return {
    __kind: PLAN_ENTITY_ATTACHMENT_SET_KIND,
    notes: plan.notes,
    attachments: plan.attachments.map((attachment) => ({
      __kind: "plan_entity_attachment",
      route: attachment.route,
      role: attachment.role,
      entity_label: attachment.entityLabel,
      reason: attachment.reason,
    })),
    missing_entities: plan.missingEntities.map((gap) => ({
      __kind: "plan_missing_entity",
      suggested_label: gap.suggestedLabel,
      entity_type: gap.entityType,
      why_needed: gap.whyNeeded,
    })),
  };
}

export function planReviewValue(
  review: PlanReviewResult,
): Record<string, unknown> {
  return {
    __kind: PLAN_REVIEW_FINDINGS_KIND,
    summary: review.summary,
    findings: review.findings.map((finding) => ({
      __kind: "plan_review_finding",
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      suggested_route: finding.suggestedRoute,
      suggested_label: finding.suggestedLabel,
    })),
  };
}

export function entityRosterValue(
  entities: EntityCurationResult["entities"],
  notes: string,
): Record<string, unknown> {
  return {
    __kind: PLAN_ENTITY_ROSTER_KIND,
    notes,
    entities: entities.map((entity) => ({
      __kind: "plan_entity",
      label: entity.label,
      entity_type: entity.entityType,
      description: entity.description,
      reason: entity.reason,
    })),
  };
}
