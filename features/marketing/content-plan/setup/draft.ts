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

import { SITE_SETTINGS_KEY } from "./archetypes";

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
      Object.keys(draft.topicsByArchetype).length > 0,
  );
}

function draftToStorage(draft: SetupDraft): Record<string, unknown> {
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
    .single();
  if (response.error) throw response.error;
  return {
    settings: response.data.settings,
    version: response.data.version,
    domain: response.data.domain,
    name: response.data.name,
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
