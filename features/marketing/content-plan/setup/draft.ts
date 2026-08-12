/**
 * features/marketing/content-plan/setup/draft.ts
 *
 * WORK-ORDER DRAFT persistence — every step of Site Setup saves as you go.
 *
 * The committed record (`settings.content_plan.archetype`) is the cross-repo
 * contract written only on commit. This DRAFT is a different fact — "what the
 * user was in the middle of choosing" — under its own sibling key
 * `settings.content_plan.setup_draft`, so twenty minutes of typed service
 * names, count nudges and shape picks survive navigation, refresh, and a
 * different device. It is cleared on a fully-successful commit (from then on
 * the plan itself is the truth and Setup re-derives names from it).
 *
 * Writes are read-modify-write against the FRESH row (PostgREST has no
 * partial-jsonb update), guarded by `version` with one retry — a draft
 * autosave must never clobber a concurrent settings edit, and must never lose
 * one silently.
 */
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

import {
  coerceEntityAttachPlan,
  coerceKeywordStrategy,
  coercePlanReview,
  type EntityAttachPlan,
  type KeywordStrategyResult,
  type PlanReviewResult,
} from "./ai";
import { SITE_SETTINGS_KEY } from "./archetypes";
import { assertFound } from "@/features/marketing/data/service";

export const SETUP_DRAFT_KEY = "setup_draft";

/**
 * The site's linked research topic (`research.rs_topic.id`) — the ONE place
 * both sides read: this client's AI steps AND aidream's generator/deepen
 * (its twin constant `SITE_RESEARCH_TOPIC_KEY` in
 * aidream/services/content_plan/archetypes.py). The FE is the only writer.
 */
export const SITE_RESEARCH_TOPIC_KEY = "research_topic_id";

export interface SetupDraft {
  /** The shape the user last had selected (null = never picked one). */
  archetypeKey: string | null;
  /** Count overrides, keyed by archetype then family. */
  countsByArchetype: Record<string, Record<string, number>>;
  /** Pasted/AI page names, keyed by archetype then family. */
  namesByArchetype: Record<string, Record<string, string[]>>;
  /** Concept display-name picks, keyed by archetype then concept. */
  conceptNamesByArchetype: Record<string, Record<string, string>>;
  /**
   * Proposed article titles for COUNT-ONLY families (blog / guides / learn),
   * keyed by archetype then family. A count-only family materializes only its
   * hub — "the count is the commitment and the titles come from research" —
   * so these are the work order, applied to the hub node's brief on commit,
   * never turned into pages behind the archetype's back.
   */
  topicsByArchetype: Record<string, Record<string, string[]>>;
  /** The research topic grounding the AI steps (rs_topic.id). */
  researchTopicId: string | null;
  /**
   * The three WHOLE-PLAN agent runs staged in Setup — a semantic plan review,
   * a keyword strategy, and an E-E-A-T attachment plan.
   *
   * These are the most expensive things this view produces (the keyword pass
   * alone reasons over the entire plan plus the full research report on a
   * 420s budget), and every one of them is REVIEW-then-apply: the user is
   * meant to read it, argue with it, and decide. Holding them in component
   * state made a refresh or a tab-out silently bill the user again — so they
   * stage exactly like the shape/naming steps do. Applying does NOT clear
   * them; only the user's Dismiss (or a full commit) does.
   */
  review: PlanReviewResult | null;
  /** Routes already created from the staged review — the "added" receipt. */
  reviewAddedRoutes: string[];
  keywordStrategy: KeywordStrategyResult | null;
  /** ISO time the staged strategy was applied (null = still unapplied). */
  keywordsAppliedAt: string | null;
  entityPlan: EntityAttachPlan | null;
  entitiesAppliedAt: string | null;
  updatedAt: string | null;
}

export function emptySetupDraft(): SetupDraft {
  return {
    archetypeKey: null,
    countsByArchetype: {},
    namesByArchetype: {},
    conceptNamesByArchetype: {},
    topicsByArchetype: {},
    researchTopicId: null,
    review: null,
    reviewAddedRoutes: [],
    keywordStrategy: null,
    keywordsAppliedAt: null,
    entityPlan: null,
    entitiesAppliedAt: null,
    updatedAt: null,
  };
}

/** Shared parse for the two `{archetype: {family: string[]}}` sections. */
function readNameMap(raw: unknown): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  if (!isRecord(raw)) return out;
  for (const [archetype, families] of Object.entries(raw)) {
    if (!isRecord(families)) continue;
    const inner: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(families)) {
      if (
        Array.isArray(value) &&
        value.every((name) => typeof name === "string" && name.trim())
      ) {
        inner[key] = value as string[];
      }
    }
    if (Object.keys(inner).length > 0) out[archetype] = inner;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The three staged runs are stored in the AGENT'S OWN WIRE SHAPE (snake_case)
 * so `coerce*` from ./ai stays the ONE parser for each of them — a staged run
 * read back off the draft goes through exactly the validation a fresh run
 * does, and there is no second shape to drift. A section that no longer
 * parses degrades to null (the user re-runs), never throws away the draft.
 */
function planReviewToStorage(review: PlanReviewResult): Record<string, unknown> {
  return {
    summary: review.summary,
    findings: review.findings.map((finding) => ({
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      suggested_route: finding.suggestedRoute,
      suggested_label: finding.suggestedLabel,
    })),
  };
}

function keywordStrategyToStorage(
  strategy: KeywordStrategyResult,
): Record<string, unknown> {
  return {
    strategy_summary: strategy.strategySummary,
    warnings: strategy.warnings,
    assignments: strategy.assignments.map((assignment) => ({
      route: assignment.route,
      page_role: assignment.pageRole,
      primary_keyword: assignment.primaryKeyword,
      primary_is_new: assignment.primaryIsNew,
      secondary_keywords: assignment.secondaryKeywords,
      supports_routes: assignment.supportsRoutes,
      internal_links: assignment.internalLinks.map((link) => ({
        to_route: link.toRoute,
        anchor_text: link.anchorText,
      })),
      reason: assignment.reason,
    })),
  };
}

function entityPlanToStorage(plan: EntityAttachPlan): Record<string, unknown> {
  return {
    notes: plan.notes,
    attachments: plan.attachments.map((attachment) => ({
      route: attachment.route,
      entity_label: attachment.entityLabel,
      role: attachment.role,
      reason: attachment.reason,
    })),
    missing_entities: plan.missingEntities.map((gap) => ({
      suggested_label: gap.suggestedLabel,
      entity_type: gap.entityType,
      why_needed: gap.whyNeeded,
    })),
  };
}

/** Parse one staged run; a malformed section is dropped, never fatal. */
function readStaged<T>(raw: unknown, coerce: (value: unknown) => T): T | null {
  if (!isRecord(raw)) return null;
  try {
    return coerce(raw);
  } catch {
    return null;
  }
}

function readIsoString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** Read the draft off a site's settings. Malformed sections degrade per-key. */
export function readSetupDraft(settings: unknown): SetupDraft | null {
  if (!isRecord(settings)) return null;
  const block = settings[SITE_SETTINGS_KEY];
  if (!isRecord(block)) return null;
  const raw = block[SETUP_DRAFT_KEY];
  if (!isRecord(raw)) return null;

  const draft = emptySetupDraft();
  if (typeof raw.archetype_key === "string" && raw.archetype_key.trim()) {
    draft.archetypeKey = raw.archetype_key;
  }
  if (typeof raw.research_topic_id === "string" && raw.research_topic_id.trim()) {
    draft.researchTopicId = raw.research_topic_id;
  }
  if (typeof raw.updated_at === "string") draft.updatedAt = raw.updated_at;

  if (isRecord(raw.counts_by_archetype)) {
    for (const [archetype, families] of Object.entries(raw.counts_by_archetype)) {
      if (!isRecord(families)) continue;
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(families)) {
        if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
          out[key] = value;
        }
      }
      if (Object.keys(out).length > 0) draft.countsByArchetype[archetype] = out;
    }
  }
  draft.namesByArchetype = readNameMap(raw.names_by_archetype);
  draft.topicsByArchetype = readNameMap(raw.topics_by_archetype);
  if (isRecord(raw.concept_names_by_archetype)) {
    for (const [archetype, concepts] of Object.entries(
      raw.concept_names_by_archetype,
    )) {
      if (!isRecord(concepts)) continue;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(concepts)) {
        if (typeof value === "string") out[key] = value;
      }
      if (Object.keys(out).length > 0) {
        draft.conceptNamesByArchetype[archetype] = out;
      }
    }
  }

  draft.review = readStaged(raw.plan_review, coercePlanReview);
  if (Array.isArray(raw.plan_review_added_routes)) {
    draft.reviewAddedRoutes = raw.plan_review_added_routes.filter(
      (route): route is string => typeof route === "string" && Boolean(route.trim()),
    );
  }
  draft.keywordStrategy = readStaged(raw.keyword_strategy, coerceKeywordStrategy);
  draft.keywordsAppliedAt = draft.keywordStrategy
    ? readIsoString(raw.keywords_applied_at)
    : null;
  draft.entityPlan = readStaged(raw.entity_attach_plan, coerceEntityAttachPlan);
  draft.entitiesAppliedAt = draft.entityPlan
    ? readIsoString(raw.entities_applied_at)
    : null;
  return draft;
}

/** Is there anything worth persisting? An all-empty draft is a delete. */
export function draftHasContent(draft: SetupDraft): boolean {
  return Boolean(
    draft.archetypeKey ||
      draft.researchTopicId ||
      Object.keys(draft.countsByArchetype).length > 0 ||
      Object.keys(draft.namesByArchetype).length > 0 ||
      Object.keys(draft.conceptNamesByArchetype).length > 0 ||
      Object.keys(draft.topicsByArchetype).length > 0 ||
      draft.review ||
      draft.keywordStrategy ||
      draft.entityPlan,
  );
}

/** Exported for the round-trip test — the write half of `readSetupDraft`. */
export function draftToStorage(draft: SetupDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (draft.archetypeKey) out.archetype_key = draft.archetypeKey;
  if (draft.researchTopicId) out.research_topic_id = draft.researchTopicId;
  if (Object.keys(draft.countsByArchetype).length > 0) {
    out.counts_by_archetype = draft.countsByArchetype;
  }
  if (Object.keys(draft.namesByArchetype).length > 0) {
    out.names_by_archetype = draft.namesByArchetype;
  }
  if (Object.keys(draft.conceptNamesByArchetype).length > 0) {
    out.concept_names_by_archetype = draft.conceptNamesByArchetype;
  }
  if (Object.keys(draft.topicsByArchetype).length > 0) {
    out.topics_by_archetype = draft.topicsByArchetype;
  }
  if (draft.review) {
    out.plan_review = planReviewToStorage(draft.review);
    if (draft.reviewAddedRoutes.length > 0) {
      out.plan_review_added_routes = draft.reviewAddedRoutes;
    }
  }
  if (draft.keywordStrategy) {
    out.keyword_strategy = keywordStrategyToStorage(draft.keywordStrategy);
    if (draft.keywordsAppliedAt) out.keywords_applied_at = draft.keywordsAppliedAt;
  }
  if (draft.entityPlan) {
    out.entity_attach_plan = entityPlanToStorage(draft.entityPlan);
    if (draft.entitiesAppliedAt) out.entities_applied_at = draft.entitiesAppliedAt;
  }
  return out;
}

export interface FreshSiteRow {
  settings: unknown;
  version: number;
  domain: string | null;
  name: string | null;
}

/**
 * The row as it is RIGHT NOW — draft autosaves bump `version`, so anything
 * that does a guarded settings write after Setup has been open (the commit's
 * `recordSiteArchetype`) must re-read instead of trusting a stale query cache.
 */
export async function fetchFreshSite(siteId: string): Promise<FreshSiteRow> {
  const response = await (await authenticatedWebDb(supabase))
    .from("site")
    .select("settings, version, domain, name")
    .eq("id", siteId)
    .is("deleted_at", null)
    // `.maybeSingle()` — `.single()`'s 0-row PGRST116 ("Cannot coerce the
    // result to a single JSON object") reached users as a toast on any site
    // their session could not read. `assertFound` carries the token, so the
    // surface asks the platform instead.
    .maybeSingle();
  const row = assertFound(
    response.data,
    response.error,
    "site",
    siteId,
    "web_site",
  );
  return {
    settings: row.settings,
    version: row.version,
    domain: row.domain,
    name: row.name,
  };
}

async function writeDraftOnce(
  siteId: string,
  mutate: (block: Record<string, unknown>) => void,
): Promise<boolean> {
  const fresh = await fetchFreshSite(siteId);
  const settings = isRecord(fresh.settings) ? { ...fresh.settings } : {};
  const block = isRecord(settings[SITE_SETTINGS_KEY])
    ? { ...(settings[SITE_SETTINGS_KEY] as Record<string, unknown>) }
    : {};
  mutate(block);
  settings[SITE_SETTINGS_KEY] = block;

  const response = await (await authenticatedWebDb(supabase))
    .from("site")
    .update({ settings })
    .eq("id", siteId)
    .eq("version", fresh.version)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (response.error) throw response.error;
  return Boolean(response.data);
}

/**
 * Persist the draft (or delete it when empty). Version race → one silent
 * retry against the re-read row; a second failure throws so the caller can
 * scream — an autosave that silently stops saving is the bug this whole file
 * exists to kill.
 */
export async function saveSetupDraft(
  siteId: string,
  draft: SetupDraft,
): Promise<void> {
  const mutate = (block: Record<string, unknown>) => {
    if (draftHasContent(draft)) block[SETUP_DRAFT_KEY] = draftToStorage(draft);
    else delete block[SETUP_DRAFT_KEY];
  };
  if (await writeDraftOnce(siteId, mutate)) return;
  if (await writeDraftOnce(siteId, mutate)) return;
  throw new Error(
    "The site record kept changing while saving the setup draft — your latest choices may not be stored.",
  );
}

/** Remove the draft (after a fully-successful commit). */
export async function clearSetupDraft(siteId: string): Promise<void> {
  const mutate = (block: Record<string, unknown>) => {
    delete block[SETUP_DRAFT_KEY];
  };
  if (await writeDraftOnce(siteId, mutate)) return;
  if (await writeDraftOnce(siteId, mutate)) return;
  throw new Error("Could not clear the setup draft — the site record kept changing.");
}

/**
 * THE APPLIED RECORD — what an Apply left behind that no row of the plan can
 * hold on its own.
 *
 * Applying a keyword strategy writes each page's own share to
 * `plan.node.attributes.keyword_strategy`; applying an entity plan writes
 * canonical association edges. But both agents also return WHOLE-PLAN facts
 * that belong to no single page — the strategy's summary and its warnings,
 * and the roster gaps the attacher refused to invent — and those were
 * previously dropped on the floor at the exact moment the user acted on the
 * run. They land here, in the same guarded `web.site.settings.content_plan`
 * block the committed archetype and the draft already live in: one row, one
 * copy, existing jsonb, no new column and no duplication across N nodes.
 */
export const KEYWORD_STRATEGY_APPLIED_KEY = "keyword_strategy_applied";
export const ENTITY_ATTACH_APPLIED_KEY = "entity_attach_applied";

export interface AppliedKeywordStrategy {
  summary: string;
  warnings: string[];
  /** Pages whose primary keyword the apply actually bound. */
  bound: number;
  appliedAt: string;
}

export interface AppliedEntityAttachments {
  notes: string;
  missingEntities: EntityAttachPlan["missingEntities"];
  attached: number;
  appliedAt: string;
}

export async function recordAppliedKeywordStrategy(
  siteId: string,
  record: Omit<AppliedKeywordStrategy, "appliedAt">,
): Promise<void> {
  const stored = {
    summary: record.summary,
    warnings: record.warnings,
    bound: record.bound,
    applied_at: new Date().toISOString(),
  };
  const mutate = (block: Record<string, unknown>) => {
    block[KEYWORD_STRATEGY_APPLIED_KEY] = stored;
  };
  if (await writeDraftOnce(siteId, mutate)) return;
  if (await writeDraftOnce(siteId, mutate)) return;
  throw new Error(
    "Keywords were applied, but the strategy summary and warnings could not be recorded — the site record kept changing.",
  );
}

export function readAppliedKeywordStrategy(
  settings: unknown,
): AppliedKeywordStrategy | null {
  const raw = readSettingsBlockKey(settings, KEYWORD_STRATEGY_APPLIED_KEY);
  if (!raw) return null;
  const appliedAt = readIsoString(raw.applied_at);
  if (!appliedAt) return null;
  return {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((item): item is string => typeof item === "string")
      : [],
    bound: typeof raw.bound === "number" ? raw.bound : 0,
    appliedAt,
  };
}

export async function recordAppliedEntityAttachments(
  siteId: string,
  record: Omit<AppliedEntityAttachments, "appliedAt">,
): Promise<void> {
  const stored = {
    notes: record.notes,
    missing_entities: record.missingEntities.map((gap) => ({
      suggested_label: gap.suggestedLabel,
      entity_type: gap.entityType,
      why_needed: gap.whyNeeded,
    })),
    attached: record.attached,
    applied_at: new Date().toISOString(),
  };
  const mutate = (block: Record<string, unknown>) => {
    block[ENTITY_ATTACH_APPLIED_KEY] = stored;
  };
  if (await writeDraftOnce(siteId, mutate)) return;
  if (await writeDraftOnce(siteId, mutate)) return;
  throw new Error(
    "Entities were attached, but the roster gaps and notes could not be recorded — the site record kept changing.",
  );
}

export function readAppliedEntityAttachments(
  settings: unknown,
): AppliedEntityAttachments | null {
  const raw = readSettingsBlockKey(settings, ENTITY_ATTACH_APPLIED_KEY);
  if (!raw) return null;
  const appliedAt = readIsoString(raw.applied_at);
  if (!appliedAt) return null;
  const gaps: EntityAttachPlan["missingEntities"] = [];
  if (Array.isArray(raw.missing_entities)) {
    for (const item of raw.missing_entities) {
      if (!isRecord(item)) continue;
      if (typeof item.suggested_label !== "string" || !item.suggested_label.trim()) {
        continue;
      }
      gaps.push({
        suggestedLabel: item.suggested_label,
        entityType: typeof item.entity_type === "string" ? item.entity_type : "source",
        whyNeeded: typeof item.why_needed === "string" ? item.why_needed : "",
      });
    }
  }
  return {
    notes: typeof raw.notes === "string" ? raw.notes : "",
    missingEntities: gaps,
    attached: typeof raw.attached === "number" ? raw.attached : 0,
    appliedAt,
  };
}

function readSettingsBlockKey(
  settings: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!isRecord(settings)) return null;
  const block = settings[SITE_SETTINGS_KEY];
  if (!isRecord(block)) return null;
  const raw = block[key];
  return isRecord(raw) ? raw : null;
}

/** The site's recorded research-topic link, off already-loaded settings. */
export function readSiteResearchTopicId(settings: unknown): string | null {
  if (!isRecord(settings)) return null;
  const block = settings[SITE_SETTINGS_KEY];
  if (!isRecord(block)) return null;
  const value = block[SITE_RESEARCH_TOPIC_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Record (or clear, with null) the site's research-topic link. Same guarded
 * read-modify-write as the draft; aidream's generator and deepen read this
 * key server-side, so one pick grounds EVERY later AI step on the site.
 */
export async function recordSiteResearchTopic(
  siteId: string,
  topicId: string | null,
): Promise<void> {
  const mutate = (block: Record<string, unknown>) => {
    if (topicId) block[SITE_RESEARCH_TOPIC_KEY] = topicId;
    else delete block[SITE_RESEARCH_TOPIC_KEY];
  };
  if (await writeDraftOnce(siteId, mutate)) return;
  if (await writeDraftOnce(siteId, mutate)) return;
  throw new Error(
    "Could not record the research link — the site record kept changing.",
  );
}
