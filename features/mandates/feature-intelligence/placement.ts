// features/mandates/feature-intelligence/placement.ts
//
// WHERE EACH JOB LIVES IN THE REGISTRY — every mandate key placed on its real
// Domain and Feature (`taxonomy.ts`), read from the key's namespace, the code
// that declares it and the registry node that owns that code. The /intelligence
// directory groups by it, and every intelligence link resolves through it.
//
// A pattern is an exact key (`seo.finding_fixer`) or a prefix ending in `*`
// (`seo.*`, `education.quiz_*`); the longest matching pattern wins. A rule with
// `feature: null` is an honest gap: the job belongs to that Domain but no
// registry Feature holds it yet (listed in the Intelligence UI-REGISTER, never
// given an invented name). A key no rule matches has no Domain yet.

import { registryDomain, registryFeature } from "./taxonomy";

export interface PlacementRule {
  pattern: string;
  domain: string;
  feature: string | null;
}

const rule = (
  domain: string,
  feature: string | null,
  ...patterns: string[]
): PlacementRule[] => patterns.map((pattern) => ({ pattern, domain, feature }));

export const PLACEMENT_RULES: readonly PlacementRule[] = [
  // ── Agents ────────────────────────────────────────────────────────────────
  // Arman, 2026-09-26: Agents holds ONLY jobs that create or modify agents
  // and system prompts. A job belongs where its feature lives, never under
  // Agents because an agent fills it. (Display sections: index-model.ts.)
  ...rule("agents", "agent-apps", "agent_apps.*", "app.*"),
  ...rule(
    "agents",
    "agent-apps",
    "shortcut.build_ui_for_prompt*",
    "shortcut.prompt_app_metadata_gen",
    "shortcut.update_prompt_app_code*",
  ),
  ...rule(
    "agents",
    "agent-studio",
    "agent_factory.*",
    "foundry.*",
    "shortcut.agent_generator",
    "shortcut.agent_structure_builder",
    "shortcut.badass_agent_*",
    "shortcut.transcript_to_instructions*",
  ),
  ...rule(
    "agents",
    "prompts",
    "shortcut.full_prompt_optimizer",
    "shortcut.full_prompt_structure_builder",
    "shortcut.improve_system_prompt_concise",
    "shortcut.matrx_prompt_assistant_sc",
    "shortcut.simple_system_message_generator",
    "shortcut.system_prompt_enhancer_*",
  ),

  ...rule("platform", "agent-tools", "tools.*", "content_gate.*"),

  ...rule("platform", "execution-runtime", "orchestration.*"),
  ...rule("workflows", "orchestras", "orchestras.*"),

  // ── Chat (Arman, 2026-09-26: "Chat is chat" — its own Domain, the same
  // registry row that was the Chat feature; its own jobs sit on the Domain) ──
  ...rule(
    "chat",
    null,
    "chat.*",
    "conversation.*",
    "shortcut.matrx_custom_chat",
  ),
  ...rule("chat", "agent-memory", "memory.*"),
  ...rule("chat", "voice", "voice.*"),
  // Every other shortcut sits with the feature it serves (below); the rest,
  // and the scroll assistant (`ambient.*`), have no Domain yet.

  // ── Clients ───────────────────────────────────────────────────────────────
  ...rule("clients", "desktop", "local.*"),
  ...rule("clients", "extension", "extend.*"),

  // ── Coding ────────────────────────────────────────────────────────────────
  ...rule(
    "coding",
    "code-workspace",
    "code_editor.*",
    "shortcut.dynamic_context_code_editor",
    "shortcut.master_code_editor",
    "shortcut.quick_code_explanation",
  ),
  ...rule("coding", "coding-session-bridge", "coding_session.*"),

  // ── Communications ────────────────────────────────────────────────────────
  ...rule("communications", "meet", "meet.*"),
  ...rule("communications", "messaging", "messaging.*"),
  ...rule("communications", "messaging-channels", "sms.*"),
  ...rule("communications", "personal-staff", "personal_staff.*"),
  // Declared by aidream services/communications — the phone line, not the voice agent.
  ...rule("communications", "voice-calls", "voice.owner_beta"),

  // ── Content IR ────────────────────────────────────────────────────────────
  ...rule("content-ir", "kind-authoring", "content_ir.*"),
  // Generates the component that displays a tool's result.
  ...rule("content-ir", "render-blocks", "tool_viz.*"),

  // ── CRM ───────────────────────────────────────────────────────────────────
  ...rule("crm", "party", "crm.*"),

  // ── Education ─────────────────────────────────────────────────────────────
  ...rule(
    "education",
    "flashcards",
    "flashcards.*",
    "shortcut.flashcard_master",
    "shortcut.make_flashcards*",
    "education.flashcards_guidance",
    "education.fastfire_guidance",
  ),
  ...rule("education", "flashcard-images", "education.card_image_*"),
  ...rule(
    "education",
    "quizzes-and-tests",
    "education.quiz_*",
    "shortcut.generate_quiz",
    "education.quizzes_guidance",
    "education.practice_tests_guidance",
    "education.exam_prep_guidance",
    "education.grade_handwritten",
    "education.grade_work_guidance",
  ),
  ...rule(
    "education",
    "ai-tutor",
    "education.tutor_*",
    "education.voice_tutor",
    "education.spoken_practice_*",
    "education.practice_oral_guidance",
  ),
  ...rule(
    "education",
    "study-kit",
    "education.study_pack_*",
    "education.kit_title",
    "education.start_guidance",
    "media.*",
  ),
  ...rule(
    "education",
    "study-media",
    "education.media_guidance",
    "education.audio_study_guidance",
    "education.mind_maps_guidance",
    "education.mindmap_generate",
    "education.memory_*",
    "education.notes_*",
    "education.summarize",
    "education.summaries_guidance",
    "education.study_aids_guidance",
  ),
  ...rule(
    "education",
    "planner-and-progress",
    "education.plan_generate",
    "education.planner_guidance",
    "education.progress_guidance",
    "education.analytics_narrate",
  ),
  ...rule(
    "education",
    "classes-and-creators",
    "education.classes_guidance",
    "education.creator_guidance",
  ),
  ...rule("education", "education-games", "education.game_guidance"),
  ...rule("education", "learn-content", "education.learn_guidance"),
  // Page guides for education screens no registry Feature covers yet.
  ...rule("education", null, "education.*"),

  // ── Improvement ───────────────────────────────────────────────────────────
  ...rule("improvement", "agent-iteration", "iteration.*"),
  ...rule("improvement", "feedback", "feedback.*"),
  ...rule("improvement", "hindsight", "hindsight.*"),
  ...rule("improvement", "judges", "evaluators.*"),
  ...rule("improvement", "pattern-patrols", "patrol.*"),

  // ── Integrations ──────────────────────────────────────────────────────────
  ...rule("integrations", "google", "google.*"),

  // ── Intelligence ──────────────────────────────────────────────────────────
  ...rule(
    "intelligence",
    "mandates",
    "mandates.*",
    "mandate.*",
    "mandate_outcome.*",
  ),

  // ── Knowledge ─────────────────────────────────────────────────────────────
  ...rule("knowledge", "document-intelligence", "knowledge.*", "docproc.*"),
  ...rule("knowledge", "ingestion", "ner.*"),
  ...rule("knowledge", "knowledge-graph", "kg.*"),
  ...rule("knowledge", "rag", "rag.*", "rag_kinds.*"),
  ...rule("knowledge", "research", "research.*", "research_client.*"),
  ...rule(
    "knowledge",
    "scraper",
    "scraper.*",
    "shortcut.clean_up_webpage_content",
  ),

  // ── Legal ─────────────────────────────────────────────────────────────────
  ...rule("legal", "wc-ratings", "shortcut.wc_medical_legal_report_extractor*"),

  // ── Marketing ─────────────────────────────────────────────────────────────
  ...rule("marketing", "commerce", "commerce_intake.*"),
  ...rule(
    "marketing",
    "competitor-classification",
    "seo.competitor_classifier",
  ),
  ...rule("marketing", "content-planning", "content_plan.*"),
  ...rule("marketing", "growth-loop", "growth_loop.*"),
  ...rule("marketing", "outreach", "crm.outreach_*"),
  ...rule(
    "marketing",
    "public-relations",
    "crm.journalist_beat_analyst",
    "crm.media_list_ranker",
    "seo.press_*",
    "seo.digital_pr_reputation_adjudicator",
  ),
  ...rule("marketing", "seo", "seo.*", "shortcut.get_lsi_variations_metadata"),
  // `web` is the Websites node's schema (site endpoint rules).
  ...rule("marketing", "websites-and-brands", "web.*"),
  // Page images, video metadata, endowment analysis: no registry Feature yet.
  ...rule("marketing", null, "marketing.*"),

  // ── Masterwork ────────────────────────────────────────────────────────────
  ...rule(
    "masterwork",
    "agent-creation-studio",
    "masterwork.audition_judge",
    "masterwork.pairwise_judge",
    "masterwork.faithfulness_judge",
    "masterwork.outcome_judge",
    "masterwork.bad_draft",
    "masterwork.draft_triage",
    "masterwork.template.*",
  ),
  ...rule(
    "masterwork",
    "rulebooks",
    "masterwork.checkup_auditor",
    "masterwork.corpus_cleaner",
    "masterwork.exception_hunter",
    "masterwork.rule_improver",
    "masterwork.rulebook_auditor",
    "masterwork.understudy",
  ),
  ...rule("masterwork", "distillation", "distillation.*", "masterwork.*"),
  ...rule(
    "masterwork",
    "vision-interview",
    "vision_interview.*",
    "conversation.vision_extractor",
    "conversation.vision_interviewer",
  ),
  // The unfolding case and the Masterwork bench: no registry Feature yet.
  ...rule(
    "masterwork",
    null,
    "masterwork.case_oracle",
    "masterwork.sealed_case_oracle",
    "masterwork.counterparty",
    "masterwork.unfolding_judge",
    "masterworks.*",
  ),

  // ── Media ─────────────────────────────────────────────────────────────────
  ...rule("media", "audio-tts", "audio.*"),
  ...rule(
    "media",
    "images",
    "image.*",
    "image_pipeline.*",
    "shortcut.generate_image*",
    "shortcut.create_gemini_image*",
    "shortcut.get_image_metadata",
  ),
  ...rule("media", "media-source-catalog", "media_catalog.*"),
  ...rule("media", "pdf", "pdf.*", "shortcut.clean_pdf_extraction"),
  ...rule("media", "podcasts", "podcast.*", "podcast_client.*"),
  ...rule("media", "product-capture", "product_capture.*"),
  ...rule(
    "media",
    "transcription",
    "transcripts.*",
    "transcript_studio.*",
    "shortcut.live_transcription_cleaner",
  ),

  // ── Platform ──────────────────────────────────────────────────────────────
  ...rule(
    "platform",
    "dictionary",
    "dictionary.*",
    "shortcut.dictionary_assistant_sc",
  ),
  ...rule("platform", "observability", "observability.*"),
  ...rule("platform", "proof-runs", "proof_runs.*"),
  ...rule("platform", "purpose-registry", "purpose.*"),
  ...rule("platform", "surfaces", "surfaces_client.*"),
  // Copy for AI (the Alchemy layer) has no registry node yet.
  ...rule("platform", null, "alchemy.*"),

  // ── Website Platform ──────────────────────────────────────────────────────
  ...rule("website-platform", "cms", "cms.*"),

  // ── Workflows ─────────────────────────────────────────────────────────────
  ...rule("workflows", "plan-nodes", "workflow.plan_*"),
  ...rule(
    "workflows",
    "workflow-authoring",
    "workflow.conductor",
    "workflow.steward",
    "workflow.steward.*",
    "workflow.wizard.*",
    "workflow.extract_namer",
    "workflow.step_intelligence",
  ),
  ...rule(
    "workflows",
    "workflow-runtime",
    "workflow.recovery_advisor",
    "workflow.run_assist_suggester",
    "human_decisions.*",
  ),
  // The built-in research workflows' own steps: no registry Feature yet.
  ...rule("workflows", null, "workflow.*"),

  // ── Workspace ─────────────────────────────────────────────────────────────
  ...rule("workspace", "lists-and-workbooks", "data.*", "records.*"),
  ...rule("workspace", "notes", "notes.*"),
  ...rule("workspace", "tasks-and-projects", "tasks.*", "projects.*"),
  ...rule("workspace", "war-room", "war_room.*"),
  // The Mermaid diagram editor has no registry Feature yet.
  ...rule("workspace", null, "mermaid.*"),
];

/** Key prefixes that exist only for tests and parity fixtures. */
export function isFixtureKey(mandateKey: string): boolean {
  const prefix = firstSegment(mandateKey);
  return (
    prefix === "zzz" ||
    prefix === "wfparity" ||
    /^(test|fixture|e2e)(_|$)/.test(prefix)
  );
}

function firstSegment(key: string): string {
  const dot = key.indexOf(".");
  return dot === -1 ? key : key.slice(0, dot);
}

/** The page a rule's jobs land on. */
function ruleTarget(rule: PlacementRule): string {
  if (rule.feature) return rule.feature;
  return DOMAINS_HOLDING_OWN_JOBS.has(rule.domain)
    ? rule.domain
    : unassignedTarget(rule.domain);
}

function matches(pattern: string, key: string): boolean {
  return pattern.endsWith("*")
    ? key.startsWith(pattern.slice(0, -1))
    : key === pattern;
}

/** Where a job lives: its Domain and Feature, or the honest gap. */
export interface Placement {
  domain: string | null;
  feature: string | null;
  fixture: boolean;
}

export function placementForKey(mandateKey: string): Placement {
  let best: PlacementRule | null = null;
  for (const candidate of PLACEMENT_RULES) {
    if (!matches(candidate.pattern, mandateKey)) continue;
    // Exact beats prefix of equal length; otherwise the longer pattern wins.
    const length =
      candidate.pattern.length + (candidate.pattern.endsWith("*") ? 0 : 1);
    const bestLength = best
      ? best.pattern.length + (best.pattern.endsWith("*") ? 0 : 1)
      : -1;
    if (length > bestLength) best = candidate;
  }
  if (!best)
    return { domain: null, feature: null, fixture: isFixtureKey(mandateKey) };
  return { domain: best.domain, feature: best.feature, fixture: false };
}

// ── Targets: the one id a page, card and link all use ──────────────────────
//
// A target is a registry Feature id (`seo`), `<domain>/unassigned` for a
// Domain's jobs with no Feature yet, or `unassigned` for jobs with no Domain.

export const NO_DOMAIN_TARGET = "unassigned";

/**
 * Domains whose own registry row holds jobs directly (Chat was a Feature and
 * was promoted in place, 2026-09-26): their jobs are the Domain's own, never
 * "not yet assigned", and the page id is the Domain id.
 */
export const DOMAINS_HOLDING_OWN_JOBS: ReadonlySet<string> = new Set(["chat"]);

export function unassignedTarget(domain: string): string {
  return `${domain}/unassigned`;
}

export function targetForKey(mandateKey: string): string {
  const placed = placementForKey(mandateKey);
  if (placed.feature) return placed.feature;
  if (placed.domain && DOMAINS_HOLDING_OWN_JOBS.has(placed.domain))
    return placed.domain;
  if (placed.domain) return unassignedTarget(placed.domain);
  return NO_DOMAIN_TARGET;
}

export function keyInTarget(mandateKey: string, target: string): boolean {
  return targetForKey(mandateKey) === target;
}

/** Is this a page id the directory can open? */
export function isTarget(target: string): boolean {
  if (target === NO_DOMAIN_TARGET || DOMAINS_HOLDING_OWN_JOBS.has(target))
    return true;
  if (target.endsWith("/unassigned")) {
    return registryDomain(target.slice(0, -"/unassigned".length)) !== null;
  }
  return registryFeature(target) !== null;
}

/** The Domain a target sits under (null for jobs with no Domain). */
export function targetDomain(target: string): string | null {
  if (target === NO_DOMAIN_TARGET) return null;
  if (DOMAINS_HOLDING_OWN_JOBS.has(target)) return target;
  if (target.endsWith("/unassigned"))
    return target.slice(0, -"/unassigned".length);
  return registryFeature(target)?.domain ?? null;
}

export const NOT_ASSIGNED_TO_FEATURE = "Not yet assigned to a feature";
export const NOT_ASSIGNED_TO_DOMAIN = "Not yet assigned to a domain";

/** The name a person reads for a target — the registry's own words. */
export function targetLabel(target: string): string {
  if (target === NO_DOMAIN_TARGET) return NOT_ASSIGNED_TO_DOMAIN;
  if (DOMAINS_HOLDING_OWN_JOBS.has(target))
    return registryDomain(target)?.name ?? target;
  if (target.endsWith("/unassigned")) {
    const domain = registryDomain(targetDomain(target) ?? "");
    return domain
      ? `${domain.name}: ${NOT_ASSIGNED_TO_FEATURE.toLowerCase()}`
      : NOT_ASSIGNED_TO_FEATURE;
  }
  return registryFeature(target)?.name ?? target;
}

/**
 * The key prefixes a target's jobs can start with — what the page asks the
 * database for before it keeps the exact keys. Null means "every key" (the
 * no-Domain group can hold any prefix no rule knows).
 */
export function targetPrefixes(target: string): string[] | null {
  if (target === NO_DOMAIN_TARGET) return null;
  const prefixes = new Set<string>();
  for (const candidate of PLACEMENT_RULES) {
    const lands =
      candidate.feature !== null
        ? candidate.feature === target
        : unassignedTarget(candidate.domain) === target ||
          (DOMAINS_HOLDING_OWN_JOBS.has(candidate.domain) &&
            candidate.domain === target);
    if (!lands) continue;
    prefixes.add(firstSegment(candidate.pattern.replace(/\*$/, "")));
  }
  // A more specific rule elsewhere can pull a key out of these prefixes; the
  // caller keeps only the keys that land here (`keyInTarget`).
  return [...prefixes];
}

/**
 * Where an old page id lands (`/intelligence/marketing`, `/intelligence/podcast`
 * from before the registry grouping): a target when every job the old id's
 * prefix held lands on one, otherwise its Domain's section of the directory.
 */
/** Old page ids whose remaining jobs have no Domain yet. */
const ORPHANED_OLD_IDS = new Set(["shortcut", "ambient"]);

export type LegacyDestination = { target: string } | { domain: string } | null;

export function legacyDestination(
  oldId: string,
  extraPrefixes: readonly string[] = [],
): LegacyDestination {
  if (isTarget(oldId)) return { target: oldId };
  const prefixes = new Set([oldId, ...extraPrefixes]);
  const targets = new Set<string>();
  const domains = new Set<string>();
  for (const candidate of PLACEMENT_RULES) {
    if (!prefixes.has(firstSegment(candidate.pattern.replace(/\*$/, ""))))
      continue;
    targets.add(ruleTarget(candidate));
    domains.add(candidate.domain);
  }
  if (targets.size === 1) return { target: [...targets][0] };
  if (domains.size === 1) return { domain: [...domains][0] };
  const whole = PLACEMENT_RULES.find(
    (candidate) => candidate.pattern === `${oldId}.*`,
  );
  if (whole) return { target: ruleTarget(whole) };
  if (registryDomain(oldId)) return { domain: oldId };
  // Old pages whose leftover jobs have no Domain yet (the rest moved out by key).
  if (ORPHANED_OLD_IDS.has(oldId)) return { target: NO_DOMAIN_TARGET };
  return null;
}

/** A short name for a link to a target ("Manage Seo intelligence", "Manage Education intelligence"). */
export function targetDoorLabel(target: string): string {
  if (target === NO_DOMAIN_TARGET) return "other";
  if (target.endsWith("/unassigned")) {
    return registryDomain(targetDomain(target) ?? "")?.name ?? target;
  }
  return targetLabel(target);
}
