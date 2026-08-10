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
 * a json_schema output contract. They run HEADLESS through the
 * canonical `useHeadlessAgentJson` primitive (D126). Results
 * stage into the Setup view's existing state setters (the same funnel the
 * surface writeTargets use); the USER still commits.
 */
import { useRef, useState } from "react";

import { useLiveAgentRun } from "@/features/agents/hooks/useLiveAgentRun";

import type { MarketingSite } from "@/features/marketing/types";

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
export const SHAPE_PLANNER_SLOT = "content_plan.shape_planner";

/**
 * Platform agent "Content Plan Family Namer" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, family_key, family_label, family_route,
 * target_count, existing_names, guidance. Structured output:
 * {names: [{label, reason}], notes}.
 */
export const FAMILY_NAMER_SLOT = "content_plan.family_namer";

/**
 * Platform agent "Content Plan Entity Curator" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, existing_entities, guidance. Structured
 * output: {entities: [{label, entity_type, description, reason}], notes}.
 */
export const ENTITY_CURATOR_SLOT = "content_plan.entity_curator";

/**
 * Platform agent "Content Plan Reviewer" — permanent latest-version pointer
 * (created 2026-07-30 via the AI Dream MCP). Variables: research_report,
 * site_domain, current_plan, guidance. Structured output:
 * {summary, findings: [{severity, title, detail, suggested_route,
 * suggested_label}]}.
 */
export const PLAN_REVIEWER_SLOT = "content_plan.plan_reviewer";

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

/**
 * Platform agent "Content Plan Keyword Strategist" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * research_report, site_domain, current_plan, available_keywords, guidance.
 *
 * WHOLE-PLAN by design: it sees every page at once so money pages get
 * distinct commercial primaries and educational pages are assigned easier
 * terms that support a NAMED money page, with the internal links to carry
 * authority there. A per-page keyword agent cannot do that — which is
 * exactly why this one takes the whole tree.
 */
export const KEYWORD_STRATEGIST_SLOT = "content_plan.keyword_strategist";

/** Whole-plan reasoning over a long report — well past the default poll. */
const STRATEGY_TIMEOUT_MS = 420_000;

export const PAGE_ROLES = ["money", "supporting", "navigational"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

export interface KeywordAssignment {
  route: string;
  pageRole: PageRole;
  primaryKeyword: string | null;
  /** The phrase is not in the existing library — flag it for review. */
  primaryIsNew: boolean;
  secondaryKeywords: string[];
  /** For a supporting page: the money routes it exists to feed. */
  supportsRoutes: string[];
  internalLinks: Array<{ toRoute: string; anchorText: string }>;
  reason: string;
}

export interface KeywordStrategyResult {
  strategySummary: string;
  assignments: KeywordAssignment[];
  warnings: string[];
}

/**
 * Platform agent "Content Plan Entity Attacher" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables:
 * current_plan, entity_roster, research_report, guidance. Chooses ONLY from
 * the roster by label; gaps come back as `missing_entities`, never invented.
 */
export const ENTITY_ATTACHER_SLOT = "content_plan.entity_attacher";

/**
 * Platform agent "Content Plan Brief Writer" — permanent latest-version
 * pointer (created 2026-07-30 via the AI Dream MCP). Variables: page,
 * keyword_assignment, neighbours, research_report, guidance. Neighbour-aware
 * by design: a brief written without the siblings duplicates them.
 */
export const BRIEF_WRITER_SLOT = "content_plan.brief_writer";

export interface EntityAttachment {
  route: string;
  entityLabel: string;
  role: string;
  reason: string;
}

export interface EntityAttachPlan {
  attachments: EntityAttachment[];
  missingEntities: Array<{
    suggestedLabel: string;
    entityType: string;
    whyNeeded: string;
  }>;
  notes: string;
}

export interface PageBriefResult {
  angle: string;
  brief: string[];
  mustNotCover: string[];
  suggestedWordCount: number | null;
  concerns: string[];
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

export function coerceEntityAttachPlan(value: unknown): EntityAttachPlan {
  const root = asRecord(value, "Entity Attacher output");
  if (!Array.isArray(root.attachments)) {
    throw new Error("Entity Attacher output has no attachments array");
  }
  const attachments: EntityAttachment[] = [];
  for (const item of root.attachments) {
    const row = asRecord(item, "attachments item");
    if (
      typeof row.route !== "string" ||
      !row.route.trim() ||
      typeof row.entity_label !== "string" ||
      !row.entity_label.trim() ||
      typeof row.role !== "string"
    ) {
      throw new Error("Entity Attacher returned a malformed attachment");
    }
    attachments.push({
      route: row.route.trim(),
      entityLabel: row.entity_label.trim(),
      role: row.role.trim(),
      reason: typeof row.reason === "string" ? row.reason : "",
    });
  }
  const missing: EntityAttachPlan["missingEntities"] = [];
  if (Array.isArray(root.missing_entities)) {
    for (const item of root.missing_entities) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.suggested_label !== "string" || !row.suggested_label.trim()) {
        continue;
      }
      missing.push({
        suggestedLabel: row.suggested_label.trim(),
        entityType: typeof row.entity_type === "string" ? row.entity_type : "source",
        whyNeeded: typeof row.why_needed === "string" ? row.why_needed : "",
      });
    }
  }
  return {
    attachments,
    missingEntities: missing,
    notes: typeof root.notes === "string" ? root.notes : "",
  };
}

export function coercePageBrief(value: unknown): PageBriefResult {
  const root = asRecord(value, "Brief Writer output");
  const lines = Array.isArray(root.brief)
    ? root.brief.filter(
        (line): line is string => typeof line === "string" && Boolean(line.trim()),
      )
    : [];
  if (lines.length === 0) {
    throw new Error("Brief Writer returned no brief lines");
  }
  return {
    angle: typeof root.angle === "string" ? root.angle : "",
    brief: lines.map((line) => line.trim()),
    mustNotCover: Array.isArray(root.must_not_cover)
      ? root.must_not_cover.filter((v): v is string => typeof v === "string")
      : [],
    suggestedWordCount:
      typeof root.suggested_word_count === "number"
        ? Math.max(0, Math.floor(root.suggested_word_count))
        : null,
    concerns: Array.isArray(root.concerns)
      ? root.concerns.filter((v): v is string => typeof v === "string")
      : [],
  };
}

export function coerceKeywordStrategy(value: unknown): KeywordStrategyResult {
  const root = asRecord(value, "Keyword Strategist output");
  if (!Array.isArray(root.assignments)) {
    throw new Error("Keyword Strategist output has no assignments array");
  }
  const assignments: KeywordAssignment[] = [];
  for (const item of root.assignments) {
    const row = asRecord(item, "assignments item");
    if (typeof row.route !== "string" || !row.route.trim()) {
      throw new Error("Keyword Strategist returned an assignment with no route");
    }
    const pageRole = PAGE_ROLES.find((role) => role === row.page_role);
    if (!pageRole) {
      throw new Error(
        `Keyword Strategist returned unknown page_role ${JSON.stringify(row.page_role)}`,
      );
    }
    const strings = (raw: unknown): string[] =>
      Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string" && Boolean(v.trim()))
        : [];
    const links: KeywordAssignment["internalLinks"] = [];
    if (Array.isArray(row.internal_links)) {
      for (const link of row.internal_links) {
        if (!link || typeof link !== "object" || Array.isArray(link)) continue;
        const entry = link as Record<string, unknown>;
        if (
          typeof entry.to_route === "string" &&
          entry.to_route.trim() &&
          typeof entry.anchor_text === "string" &&
          entry.anchor_text.trim()
        ) {
          links.push({
            toRoute: entry.to_route.trim(),
            anchorText: entry.anchor_text.trim(),
          });
        }
      }
    }
    assignments.push({
      route: row.route.trim(),
      pageRole,
      primaryKeyword:
        typeof row.primary_keyword === "string" && row.primary_keyword.trim()
          ? row.primary_keyword.trim()
          : null,
      primaryIsNew: row.primary_is_new === true,
      secondaryKeywords: strings(row.secondary_keywords),
      supportsRoutes: strings(row.supports_routes),
      internalLinks: links,
      reason: typeof row.reason === "string" ? row.reason : "",
    });
  }
  return {
    strategySummary:
      typeof root.strategy_summary === "string" ? root.strategy_summary : "",
    assignments,
    warnings: Array.isArray(root.warnings)
      ? root.warnings.filter((w): w is string => typeof w === "string")
      : [],
  };
}

/**
 * The plan as the strategist's `current_plan` variable expects it — one line
 * per page WITH its current keyword, so the agent can see what is already
 * assigned and keep or replace it deliberately.
 */
export function buildKeywordPlanLines(
  nodes: PlanNodeRow[],
  statusSlugById: Map<string, string> | undefined,
  keywordPhraseById: Map<string, string>,
): string {
  if (nodes.length === 0) return "empty plan";
  return nodes
    .slice()
    .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
    .map((node) => {
      const status =
        (node.status_id ? statusSlugById?.get(node.status_id) : null) ?? "unknown";
      const keyword =
        (node.primary_keyword_id
          ? keywordPhraseById.get(node.primary_keyword_id)
          : null) ?? "(none)";
      return [
        node.route ?? "(no route)",
        node.label,
        node.node_type,
        status,
        keyword,
      ].join(" | ");
    })
    .join("\n");
}

/** The keyword library as the strategist's `available_keywords` expects it. */
export function buildAvailableKeywordLines(
  rows: Array<{
    phrase: string;
    intent: string | null;
    contentRole: string | null;
    priority: number | null;
  }>,
): string {
  if (rows.length === 0) return "";
  return rows
    .map((row) =>
      [
        row.phrase,
        row.intent ?? "unknown",
        row.contentRole ?? "unassigned",
        row.priority ?? "",
      ].join(" | "),
    )
    .join("\n");
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

/**
 * The plan as the reviewer's `current_plan` variable expects it:
 * `route | label | node_type | status`, one page per line.
 *
 * `statusSlugById` maps `plan.node.status_id` to its category slug. Passing a
 * hardcoded "planned" would tell the auditor every page is still unbuilt —
 * fabricated input on the one variable the whole audit reasons over, which
 * makes it recommend work that is already published.
 */
export function buildCurrentPlanLines(
  nodes: PlanNodeRow[],
  statusSlugById?: Map<string, string>,
): string {
  if (nodes.length === 0) return "empty plan";
  return nodes
    .slice()
    .sort((a, b) => (a.route ?? "").localeCompare(b.route ?? ""))
    .map((node) => {
      const status =
        (node.status_id ? statusSlugById?.get(node.status_id) : null) ?? "unknown";
      return [node.route ?? "(no route)", node.label, node.node_type, status].join(
        " | ",
      );
    })
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

/**
 * The user's answers to the Build-with-AI questions — HINTS, not commitments.
 * The agents treat the research report as primary evidence and may deviate
 * (saying so in the rationale); the user never opts into a structure here.
 */
export interface SetupGuidance {
  /** Rough size feel; "ai" = let the evidence decide. */
  sizeHint: "ai" | "micro" | "small" | "medium" | "large";
  /** Physical footprint; "ai" = let the evidence decide. */
  locationsHint: "ai" | "single" | "multiple";
  /** Optional location count when "multiple" (free text, e.g. "4"). */
  locationCount: string;
  /** Free-form emphasis / avoid / anything-else notes. */
  notes: string;
}

export const DEFAULT_SETUP_GUIDANCE: SetupGuidance = {
  sizeHint: "ai",
  locationsHint: "ai",
  locationCount: "",
  notes: "",
};

const SIZE_HINT_PAGES: Record<
  Exclude<SetupGuidance["sizeHint"], "ai">,
  string
> = {
  micro: "5-8",
  small: "10-15",
  medium: "18-30",
  large: "30-60",
};

/**
 * Serialize the guidance answers into the two agent inputs: the free-text
 * `guidance` block (framed as overridable hints) and the Shape Planner's
 * `target_page_count`. All-default answers produce empty strings — the agents
 * then work from the research alone.
 */
export function buildGuidanceInputs(input: SetupGuidance): {
  guidance: string;
  targetPageCount: string;
} {
  const lines: string[] = [];
  if (input.sizeHint !== "ai") {
    lines.push(
      `The user expects roughly a ${input.sizeHint} site (about ${SIZE_HINT_PAGES[input.sizeHint]} pages).`,
    );
  }
  if (input.locationsHint === "single") {
    lines.push(
      "The business operates from a SINGLE location — do not plan a locations section unless the research clearly contradicts this.",
    );
  } else if (input.locationsHint === "multiple") {
    const count = input.locationCount.trim();
    lines.push(
      `The business has MULTIPLE locations${count ? ` (around ${count})` : ""} — plan location pages accordingly.`,
    );
  }
  if (input.notes.trim()) {
    lines.push(`Operator notes: ${input.notes.trim()}`);
  }
  if (lines.length === 0) return { guidance: "", targetPageCount: "" };
  return {
    guidance:
      "USER HINTS (not commitments — the research report is the primary evidence; " +
      "deviate when the evidence clearly disagrees, and say so in your rationale):\n" +
      lines.map((line) => `- ${line}`).join("\n"),
    targetPageCount:
      input.sizeHint !== "ai" ? SIZE_HINT_PAGES[input.sizeHint] : "",
  };
}

/**
 * The Shape Planner's `site_context` variable — what we actually KNOW about
 * the site, from its own row. This used to be passed as an empty string,
 * which silently threw away the name/description a user had already written.
 */
export function buildSiteContext(site: MarketingSite): string {
  const parts = [
    `Site: ${site.name} (${site.domain})`,
    site.root_url && site.root_url !== site.domain
      ? `Root URL: ${site.root_url}`
      : null,
    site.description?.trim() ? `Description: ${site.description.trim()}` : null,
  ];
  return parts.filter((part): part is string => Boolean(part)).join("\n");
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

/**
 * Run the two Setup agents headlessly and hand back coerced results. One
 * in-flight run at a time per kind — the busy flags drive the buttons.
 */
export function useSetupAgents(siteId: string | null) {
  // Live-by-default (Arman's standing rule — no spinner while AI works): every
  // run keeps its instance alive so `<LiveRunDisplay conversationId={…}>` can
  // render the stream as it arrives. The hook owns instance cleanup.
  const {
    run: runHeadless,
    conversationId: liveConversationId,
    activeRequestId,
    dismiss: dismissLive,
    isRunning: liveRunning,
  } = useLiveAgentRun();
  const [liveLabel, setLiveLabel] = useState<string | null>(null);
  const [shapeBusy, setShapeBusy] = useState(false);
  /** The family key currently being named, or null. */
  const [namingFamilyKey, setNamingFamilyKey] = useState<string | null>(null);
  const [entitiesBusy, setEntitiesBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [keywordsBusy, setKeywordsBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const inFlight = useRef(false);

  async function run<T>(
    slotKey: string,
    label: string,
    variables: Record<string, string>,
    coerce: (value: unknown) => T,
    timeoutMs?: number,
  ): Promise<T> {
    setLiveLabel(label);
    // Which agent runs this step is a SLOT, never a hardcoded id: the system
    // default is managed in the admin console and any user may bind their own
    // agent at /agents/slots. Resolution is loud — an unresolvable slot throws
    // here rather than silently running the wrong agent. The round-trip itself
    // is the canonical headless primitive (useHeadlessAgentJson, D126).
    return runHeadless<T>({
      slotKey,
      surfaceKey: `content-plan-setup:${siteId ?? "none"}:${slotKey}`,
      sourceFeature: "marketing",
      variables,
      timeoutMs: timeoutMs ?? EXTRACTION_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      failureMessages: {
        streamError: "The agent run failed before returning a result",
        noJson: "The agent finished but produced no structured JSON",
        timeout: "Timed out waiting for the agent to respond",
      },
      coerce,
    });
  }

  async function recommendShape(
    variables: Record<string, string>,
  ): Promise<ShapePlanResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setShapeBusy(true);
    try {
      return await run(
        SHAPE_PLANNER_SLOT,
        "Recommending shape & counts",
        variables,
        coerceShapePlan,
      );
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
      return await run(
        FAMILY_NAMER_SLOT,
        "Naming pages",
        variables,
        coerceFamilyNames,
      );
    } finally {
      inFlight.current = false;
      setNamingFamilyKey(null);
    }
  }

  async function planKeywords(
    variables: Record<string, string>,
  ): Promise<KeywordStrategyResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setKeywordsBusy(true);
    try {
      return await run(
        KEYWORD_STRATEGIST_SLOT,
        "Planning keyword strategy",
        variables,
        coerceKeywordStrategy,
        STRATEGY_TIMEOUT_MS,
      );
    } finally {
      inFlight.current = false;
      setKeywordsBusy(false);
    }
  }

  async function attachEntities(
    variables: Record<string, string>,
  ): Promise<EntityAttachPlan> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setAttachBusy(true);
    try {
      return await run(
        ENTITY_ATTACHER_SLOT,
        "Attaching entities",
        variables,
        coerceEntityAttachPlan,
        STRATEGY_TIMEOUT_MS,
      );
    } finally {
      inFlight.current = false;
      setAttachBusy(false);
    }
  }

  /** ONE page's brief, written against its neighbours. Staged, never saved. */
  async function writeBrief(
    variables: Record<string, string>,
  ): Promise<PageBriefResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setBriefBusy(true);
    try {
      return await run(
        BRIEF_WRITER_SLOT,
        "Drafting brief",
        variables,
        coercePageBrief,
      );
    } finally {
      inFlight.current = false;
      setBriefBusy(false);
    }
  }

  async function reviewPlan(
    variables: Record<string, string>,
  ): Promise<PlanReviewResult> {
    if (inFlight.current) throw new Error("An agent run is already in progress");
    inFlight.current = true;
    setReviewBusy(true);
    try {
      return await run(
        PLAN_REVIEWER_SLOT,
        "Reviewing the plan",
        variables,
        coercePlanReview,
      );
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
      return await run(
        ENTITY_CURATOR_SLOT,
        "Curating entities",
        variables,
        coerceEntityCuration,
      );
    } finally {
      inFlight.current = false;
      setEntitiesBusy(false);
    }
  }

  const dismissLiveRun = () => {
    setLiveLabel(null);
    dismissLive();
  };

  return {
    /** Live-render handle — mount `<LiveRunDisplay {...agents.live} />`. */
    live: {
      conversationId: liveConversationId,
      activeRequestId,
      label: liveLabel,
      isRunning: liveRunning,
      dismiss: dismissLiveRun,
    },
    recommendShape,
    nameFamily,
    curateEntities,
    reviewPlan,
    planKeywords,
    attachEntities,
    writeBrief,
    shapeBusy,
    namingFamilyKey,
    entitiesBusy,
    reviewBusy,
    keywordsBusy,
    attachBusy,
    briefBusy,
  };
}
