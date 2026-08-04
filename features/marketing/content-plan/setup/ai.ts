"use client";

/**
 * features/marketing/content-plan/setup/ai.ts
 *
 * The Site Setup view's AI integrations — one platform agent per step,
 * grounded in the RESEARCH system's final report (the "Document"):
 *
 *   - Shape step  → "Content Plan Shape Planner" recommends which archetype
 *     and how many pages each family gets.
 *   - Counts step → "Content Plan Family Namer" names the real pages of ONE
 *     family (services, locations, guides…) so nobody types them by hand.
 *
 * Both are DB platform agents (agx_agent, created via the AI Dream MCP) with
 * a json_schema output contract. They run HEADLESS through the canonical
 * execution system (`launchAgentExecution` + JSON extraction) — the exact
 * pattern of features/education/assessment/data/useGenerateQuiz.ts. Results
 * stage into the Setup view's existing state setters (the same funnel the
 * surface writeTargets use); the USER still commits.
 */
import { useRef, useState } from "react";

import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectRequestError,
  selectRequestStatus,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";

import type { PlanNodeRow } from "../types";
import type { Archetype, ExpandedArchetype } from "./archetypes";
import type { CommittedArchetype } from "./service";

/**
 * Platform agent "Content Plan Shape Planner" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, site_context, archetype_options,
 * current_plan_summary, target_page_count, guidance. Structured output:
 * {archetype_key, rationale, family_counts[], concept_names[]}.
 */
export const SHAPE_PLANNER_AGENT_ID = "b600975c-fc8f-4f1d-ab36-670be436a038";

/**
 * Platform agent "Content Plan Family Namer" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, family_key, family_label, family_route,
 * target_count, existing_names, guidance. Structured output:
 * {names: [{label, reason}], notes}.
 */
export const FAMILY_NAMER_AGENT_ID = "7a16db8c-48eb-4997-a8d0-dc4a8892d7c5";

/**
 * Platform agent "Content Plan Entity Curator" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, existing_entities, guidance. Structured
 * output: {entities: [{label, entity_type, description, reason}], notes}.
 */
export const ENTITY_CURATOR_AGENT_ID = "c43e4497-3093-4b18-a906-b088127d8b9c";

/**
 * Platform agent "Content Plan Reviewer" — permanent latest-version pointer
 * (created 2026-07-30 via the AI Dream MCP). Variables: research_report,
 * site_domain, current_plan, guidance. Structured output:
 * {summary, findings: [{severity, title, detail, suggested_route,
 * suggested_label}]}.
 */
export const PLAN_REVIEWER_AGENT_ID = "2a7f0dc8-5525-437a-8f2e-35f12a45cb27";

/**
 * BINDING contract sent as the reviewer's `guidance` on every run.
 *
 * Measured, not guessed: without it the agent writes a summary naming six
 * missing services and returns ONE finding (or an empty array) — the summary
 * and the findings disagree, and the useful half is the one that goes
 * missing. With it the same input returns 11 evidence-cited findings, one
 * per missing page. Any operator guidance is appended AFTER this block.
 */
export const REVIEWER_OUTPUT_CONTRACT =
  "BINDING OUTPUT CONTRACT: summary and findings must agree. Every problem you " +
  "name in the summary MUST appear as its own entry in findings — a summary " +
  "naming missing pages while findings is empty or shorter than the problems " +
  "named is a failed response. Emit ONE finding per missing page (never lump " +
  "several missing services or locations into one finding). Only return an " +
  "empty findings array if the plan genuinely has no problems at all.";

const EXTRACTION_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 300;

export interface ShapePlanResult {
  archetypeKey: string;
  rationale: string;
  familyCounts: Array<{ familyKey: string; count: number; reason: string }>;
  conceptNames: Array<{ conceptKey: string; name: string }>;
}

export interface FamilyNamesResult {
  names: Array<{ label: string; reason: string }>;
  notes: string;
}

export const REVIEW_SEVERITIES = [
  "gap",
  "mismatch",
  "structure",
  "priority",
] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export interface PlanReviewFinding {
  severity: ReviewSeverity;
  title: string;
  detail: string;
  /** Proposed route for a missing page; null when the finding adds no page. */
  suggestedRoute: string | null;
  suggestedLabel: string | null;
}

export interface PlanReviewResult {
  summary: string;
  findings: PlanReviewFinding[];
}

export const ENTITY_TYPES = ["person", "source", "media", "org"] as const;
export type CuratedEntityType = (typeof ENTITY_TYPES)[number];

export interface EntityCurationResult {
  entities: Array<{
    label: string;
    entityType: CuratedEntityType;
    description: string;
    reason: string;
  }>;
  notes: string;
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what}: expected an object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

/** Loud coercion — a drifting agent schema surfaces as an error, never NaN. */
export function coerceShapePlan(value: unknown): ShapePlanResult {
  const root = asRecord(value, "Shape Planner output");
  if (typeof root.archetype_key !== "string" || !root.archetype_key.trim()) {
    throw new Error("Shape Planner output has no archetype_key");
  }
  const familyCounts: ShapePlanResult["familyCounts"] = [];
  if (Array.isArray(root.family_counts)) {
    for (const item of root.family_counts) {
      const row = asRecord(item, "family_counts item");
      if (typeof row.family_key !== "string" || typeof row.count !== "number") {
        throw new Error("Shape Planner family_counts item is malformed");
      }
      familyCounts.push({
        familyKey: row.family_key,
        count: Math.max(0, Math.floor(row.count)),
        reason: typeof row.reason === "string" ? row.reason : "",
      });
    }
  }
  const conceptNames: ShapePlanResult["conceptNames"] = [];
  if (Array.isArray(root.concept_names)) {
    for (const item of root.concept_names) {
      const row = asRecord(item, "concept_names item");
      if (typeof row.concept_key === "string" && typeof row.name === "string" && row.name.trim()) {
        conceptNames.push({ conceptKey: row.concept_key, name: row.name.trim() });
      }
    }
  }
  return {
    archetypeKey: root.archetype_key,
    rationale: typeof root.rationale === "string" ? root.rationale : "",
    familyCounts,
    conceptNames,
  };
}

export function coerceFamilyNames(value: unknown): FamilyNamesResult {
  const root = asRecord(value, "Family Namer output");
  if (!Array.isArray(root.names) || root.names.length === 0) {
    throw new Error("Family Namer returned no names");
  }
  const names: FamilyNamesResult["names"] = [];
  for (const item of root.names) {
    const row = asRecord(item, "names item");
    if (typeof row.label !== "string" || !row.label.trim()) {
      throw new Error("Family Namer returned a nameless entry");
    }
    names.push({
      label: row.label.trim(),
      reason: typeof row.reason === "string" ? row.reason : "",
    });
  }
  return { names, notes: typeof root.notes === "string" ? root.notes : "" };
}

export function coerceEntityCuration(value: unknown): EntityCurationResult {
  const root = asRecord(value, "Entity Curator output");
  if (!Array.isArray(root.entities)) {
    throw new Error("Entity Curator output has no entities array");
  }
  const entities: EntityCurationResult["entities"] = [];
  for (const item of root.entities) {
    const row = asRecord(item, "entities item");
    if (typeof row.label !== "string" || !row.label.trim()) {
      throw new Error("Entity Curator returned a nameless entity");
    }
    const entityType = ENTITY_TYPES.find((t) => t === row.entity_type);
    if (!entityType) {
      throw new Error(
        `Entity Curator returned unknown entity_type ${JSON.stringify(row.entity_type)}`,
      );
    }
    entities.push({
      label: row.label.trim(),
      entityType,
      description: typeof row.description === "string" ? row.description : "",
      reason: typeof row.reason === "string" ? row.reason : "",
    });
  }
  return {
    entities,
    notes: typeof root.notes === "string" ? root.notes : "",
  };
}

export function coercePlanReview(value: unknown): PlanReviewResult {
  const root = asRecord(value, "Plan Reviewer output");
  if (!Array.isArray(root.findings)) {
    throw new Error("Plan Reviewer output has no findings array");
  }
  const findings: PlanReviewFinding[] = [];
  for (const item of root.findings) {
    const row = asRecord(item, "findings item");
    const severity = REVIEW_SEVERITIES.find((s) => s === row.severity);
    if (!severity) {
      throw new Error(
        `Plan Reviewer returned unknown severity ${JSON.stringify(row.severity)}`,
      );
    }
    if (typeof row.title !== "string" || !row.title.trim()) {
      throw new Error("Plan Reviewer returned a finding with no title");
    }
    const route =
      typeof row.suggested_route === "string" && row.suggested_route.trim()
        ? row.suggested_route.trim()
        : null;
    const label =
      typeof row.suggested_label === "string" && row.suggested_label.trim()
        ? row.suggested_label.trim()
        : null;
    findings.push({
      severity,
      title: row.title.trim(),
      detail: typeof row.detail === "string" ? row.detail : "",
      // A route with no label (or the reverse) cannot create a page — treat
      // the pair as all-or-nothing so the UI never offers a broken Add.
      suggestedRoute: route && label ? route : null,
      suggestedLabel: route && label ? label : null,
    });
  }
  return {
    summary: typeof root.summary === "string" ? root.summary : "",
    findings,
  };
}

/** The plan as the reviewer's `current_plan` variable expects it. */
export function buildCurrentPlanLines(nodes: PlanNodeRow[]): string {
  if (nodes.length === 0) return "empty plan";
  return nodes
    .slice()
    .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
    .map((node) =>
      [node.route ?? "(no route)", node.label, node.node_type, "planned"].join(
        " | ",
      ),
    )
    .join("\n");
}

/** The archetype menu, serialized exactly as the Shape Planner's variable expects. */
export function buildArchetypeOptionsJson(
  archetypes: Archetype[],
  baseline: Map<string, ExpandedArchetype | null>,
): string {
  return JSON.stringify(
    archetypes.map((item) => {
      const expanded = baseline.get(item.key);
      return {
        key: item.key,
        label: expanded?.label ?? item.key,
        families: (expanded?.families ?? []).map((family) => ({
          key: family.key,
          label: family.label,
          route: family.route,
          default_count: family.count,
          materialize: family.materialize,
        })),
        omits: expanded?.omits ?? [],
      };
    }),
  );
}

export function buildCurrentPlanSummary(
  committed: CommittedArchetype | null,
  liveNodes: PlanNodeRow[],
): string {
  if (liveNodes.length === 0 && !committed) return "empty plan";
  const parts: string[] = [`${liveNodes.length} page(s) already planned`];
  if (committed) {
    parts.push(
      `committed shape "${committed.key}" with counts ${JSON.stringify(committed.counts)}`,
    );
  }
  const routes = liveNodes
    .map((node) => node.route)
    .filter((route): route is string => Boolean(route))
    .sort()
    .slice(0, 60);
  if (routes.length > 0) parts.push(`existing routes: ${routes.join(", ")}`);
  return parts.join(". ");
}

async function waitForExtraction<T>(
  getState: () => RootState,
  requestId: string,
  coerce: (value: unknown) => T,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < EXTRACTION_TIMEOUT_MS) {
    const state = getState();
    if (selectJsonExtractionComplete(requestId)(state)) {
      const snapshot = selectFirstExtractedObject(requestId)(state);
      if (!snapshot) {
        throw new Error("The agent finished but produced no structured JSON");
      }
      return coerce(snapshot.value);
    }
    const status = selectRequestStatus(requestId)(state);
    if (status === "error") {
      const requestError = selectRequestError(requestId)(state);
      throw new Error(
        requestError?.user_message ??
          requestError?.message ??
          "The agent run failed before returning a result",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the agent to respond");
}

/**
 * Run the two Setup agents headlessly and hand back coerced results. One
 * in-flight run at a time per kind — the busy flags drive the buttons.
 */
export function useSetupAgents(siteId: string | null) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [shapeBusy, setShapeBusy] = useState(false);
  /** The family key currently being named, or null. */
  const [namingFamilyKey, setNamingFamilyKey] = useState<string | null>(null);
  const [entitiesBusy, setEntitiesBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const inFlight = useRef(false);

  async function run<T>(
    agentId: string,
    variables: Record<string, string>,
    coerce: (value: unknown) => T,
  ): Promise<T> {
    const { requestId } = await dispatch(
      launchAgentExecution({
        agentId,
        surfaceKey: `content-plan-setup:${siteId ?? "none"}:${agentId}`,
        sourceFeature: "marketing",
        jsonExtraction: { enabled: true, fuzzyOnFinalize: true },
        runtime: { variables },
        config: { autoRun: true, displayMode: "background" },
      }),
    ).unwrap();
    if (!requestId) throw new Error("Agent launch did not return a request id");
    return waitForExtraction(store.getState, requestId, coerce);
  }

  async function recommendShape(
    variables: Record<string, string>,
  ): Promise<ShapePlanResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setShapeBusy(true);
    try {
      return await run(SHAPE_PLANNER_AGENT_ID, variables, coerceShapePlan);
    } finally {
      inFlight.current = false;
      setShapeBusy(false);
    }
  }

  async function nameFamily(
    familyKey: string,
    variables: Record<string, string>,
  ): Promise<FamilyNamesResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setNamingFamilyKey(familyKey);
    try {
      return await run(FAMILY_NAMER_AGENT_ID, variables, coerceFamilyNames);
    } finally {
      inFlight.current = false;
      setNamingFamilyKey(null);
    }
  }

  async function reviewPlan(
    variables: Record<string, string>,
  ): Promise<PlanReviewResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setReviewBusy(true);
    try {
      return await run(PLAN_REVIEWER_AGENT_ID, variables, coercePlanReview);
    } finally {
      inFlight.current = false;
      setReviewBusy(false);
    }
  }

  async function curateEntities(
    variables: Record<string, string>,
  ): Promise<EntityCurationResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setEntitiesBusy(true);
    try {
      return await run(ENTITY_CURATOR_AGENT_ID, variables, coerceEntityCuration);
    } finally {
      inFlight.current = false;
      setEntitiesBusy(false);
    }
  }

  return {
    recommendShape,
    nameFamily,
    curateEntities,
    reviewPlan,
    shapeBusy,
    namingFamilyKey,
    entitiesBusy,
    reviewBusy,
  };
}
