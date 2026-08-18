import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { fetchMandatePins } from "@/features/agents/mandates/service";
import {
  MASTERWORK_SELECT_COLUMNS,
  parseMasterworkRow,
  type MasterworkDefinitionRow,
} from "../service";
import type {
  Masterwork,
  RulebookRule,
  RulebookSource,
} from "../types";

/**
 * Reads for the Masterwork HOME (the authed landing at /masterwork) — a
 * bounded overview surface, so bare selects with limits are correct here
 * (never completeness reads). Direct supabase-js per platform doctrine.
 *
 * THE VIEW LAW: every read declares its own scope — this page is "yours":
 * your Rulebooks, the Masterworks built from them, their recent runs.
 */

const RULEBOOK_LIMIT = 12;
const RUN_LIMIT = 8;

export interface HomeRulebook {
  id: string;
  name: string;
  description: string;
  /** The Expert behind it (source.author, else blank). */
  expert: string;
  version: number;
  status: string;
  updated_at: string;
  rules: RulebookRule[];
}

export interface HomeMasterwork extends Masterwork {
  rulebookName: string | null;
  /** Latest audited quality score (platform.masterwork_run.quality_score), 0-100. */
  qualityLatest: number | null;
  /** The score before that — the trend is latest vs. previous. */
  qualityPrevious: number | null;
}

export interface HomeRun {
  id: string;
  operation: string;
  status: string;
  label: string | null;
  created_at: string;
  rulebook_id: string;
  rulebookName: string | null;
  quality_score: number | null;
}

export interface MasterworkHomeData {
  rulebooks: HomeRulebook[];
  /** Total count of the viewer's Rulebooks (the list above is bounded). */
  rulebookTotal: number;
  masterworks: HomeMasterwork[];
  recentRuns: HomeRun[];
}

function toRules(value: unknown): RulebookRule[] {
  return Array.isArray(value) ? (value as unknown as RulebookRule[]) : [];
}

/** Everything the home page shows about YOUR corner of Masterwork. */
export async function fetchMasterworkHome(): Promise<MasterworkHomeData> {
  const userId = requireUserId();

  const { data, error, count } = await supabase
    .schema("platform")
    .from("rulebook")
    .select(
      "id,name,description,source,rules,version,status,updated_at",
      { count: "exact" },
    )
    .eq("created_by", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(RULEBOOK_LIMIT);
  if (error) throw new Error(`${error.message} (${error.code})`);

  const rulebooks: HomeRulebook[] = (data ?? []).map((row) => {
    const source = (row.source ?? {}) as RulebookSource;
    return {
      id: row.id,
      name: row.name,
      description: String(row.description ?? ""),
      expert:
        typeof source.author === "string" && source.author.trim()
          ? source.author
          : "",
      version: Number(row.version),
      status: String(row.status),
      updated_at: row.updated_at,
      rules: toRules(row.rules),
    };
  });

  const rulebookIds = rulebooks.map((r) => r.id);
  const nameById = new Map(rulebooks.map((r) => [r.id, r.name]));
  const [masterworks, runs] = await Promise.all([
    fetchMasterworksFor(rulebookIds, nameById),
    fetchRecentRuns(rulebookIds, nameById),
  ]);

  // Attach the quality trend from audited runs (quality_score is stamped by
  // the Audition judge on platform.masterwork_run).
  const scoresByRulebook = new Map<string, number[]>();
  const scored = await fetchQualityScores(rulebookIds);
  for (const s of scored) {
    const list = scoresByRulebook.get(s.rulebook_id) ?? [];
    list.push(s.quality_score);
    scoresByRulebook.set(s.rulebook_id, list);
  }
  const withQuality: HomeMasterwork[] = masterworks.map((m) => {
    const scores = m.built_from_rulebook
      ? (scoresByRulebook.get(m.built_from_rulebook) ?? [])
      : [];
    return {
      ...m,
      qualityLatest: scores.length > 0 ? scores[scores.length - 1] : null,
      qualityPrevious: scores.length > 1 ? scores[scores.length - 2] : null,
    };
  });

  return {
    rulebooks,
    rulebookTotal: count ?? rulebooks.length,
    masterworks: withQuality,
    recentRuns: runs,
  };
}

async function fetchMasterworksFor(
  rulebookIds: string[],
  nameById: Map<string, string>,
): Promise<(Masterwork & { rulebookName: string | null })[]> {
  if (rulebookIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select(MASTERWORK_SELECT_COLUMNS)
    .in("metadata->>built_from_rulebook", rulebookIds)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? []).map((row) => {
    const m = parseMasterworkRow(row as MasterworkDefinitionRow);
    return {
      ...m,
      rulebookName: m.built_from_rulebook
        ? (nameById.get(m.built_from_rulebook) ?? null)
        : null,
    };
  });
}

async function fetchRecentRuns(
  rulebookIds: string[],
  nameById: Map<string, string>,
): Promise<HomeRun[]> {
  if (rulebookIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("id,operation,status,label,created_at,rulebook_id,quality_score")
    .in("rulebook_id", rulebookIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RUN_LIMIT);
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? []).map((row) => ({
    id: row.id,
    operation: String(row.operation),
    status: String(row.status),
    label: row.label,
    created_at: row.created_at,
    rulebook_id: row.rulebook_id,
    rulebookName: nameById.get(row.rulebook_id) ?? null,
    quality_score: row.quality_score,
  }));
}

/** Audited quality scores, oldest first, so callers can read a trend. */
async function fetchQualityScores(
  rulebookIds: string[],
): Promise<{ rulebook_id: string; quality_score: number }[]> {
  if (rulebookIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("rulebook_id,quality_score,created_at")
    .in("rulebook_id", rulebookIds)
    .not("quality_score", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`${error.message} (${error.code})`);
  return (data ?? [])
    .filter((row) => typeof row.quality_score === "number")
    .map((row) => ({
      rulebook_id: row.rulebook_id,
      quality_score: row.quality_score as number,
    }));
}

// ── "How it's improving" — the Expert-facing Hindsight panel ─────────────────
//
// The five Masterwork agents are enrolled in Hindsight (reviews of their real
// transcripts that produce applied improvements). The hindsight.* schema is
// NOT browser-readable (not PostgREST-exposed; RLS scopes rows to the
// platform's own operators). The ONE deliberate window through that wall is
// the `masterwork_improvement_summary` SECURITY DEFINER RPC
// (migrations/masterwork_improvement_summary_rpc.sql): DE-IDENTIFIED
// aggregates for exactly the masterwork.* mandates — review counts,
// last-review time, per-lever theme counts. Never user ids, never transcript
// or reviewer text. This panel renders that plus the public mandate registry
// and each bound agent's definition row. NEVER fabricate review activity.

export const MASTERWORK_MANDATE_KEYS = [
  "masterwork.scout",
  "masterwork.source_distiller",
  "masterwork.exemplar_distiller",
  "masterwork.rulebook_auditor",
  "masterwork.audition_judge",
] as const;

export type MasterworkMandateKey = (typeof MASTERWORK_MANDATE_KEYS)[number];

/** What each agent does FOR the Expert — plain words, zero jargon. */
export const MANDATE_EXPERT_COPY: Record<
  MasterworkMandateKey,
  { label: string; job: string }
> = {
  "masterwork.scout": {
    label: "The interviewer",
    job: "Draws your method out of you in conversation and drafts rules from it",
  },
  "masterwork.source_distiller": {
    label: "The reader",
    job: "Reads your documents and turns them into rules you approve",
  },
  "masterwork.exemplar_distiller": {
    label: "The reverse-engineer",
    job: "Studies your best finished work and works out the rules behind it",
  },
  "masterwork.rulebook_auditor": {
    label: "The checker",
    job: "Checks work against your rules — every verdict cites the exact rule",
  },
  "masterwork.audition_judge": {
    label: "The judge",
    job: "Scores your system's output against plain AI, side by side",
  },
};

export interface ImprovementRow {
  mandateKey: MasterworkMandateKey;
  label: string;
  job: string;
  agentId: string | null;
  agentName: string | null;
  /** How many times this agent's definition has been revised. */
  agentVersion: number | null;
  /** When it last changed. */
  updatedAt: string | null;
  /** True when the last change was applied by the review system, not a human. */
  lastChangeBySystem: boolean;
  /** True when this job is under standing Hindsight review (enrolled). */
  enrolled: boolean;
  /** Completed reviews of this agent's real sessions. */
  reviewCount: number;
  /** When the last completed review finished. */
  lastReviewAt: string | null;
  /** Improvements found across all reviews (proposals; the Expert decides). */
  findingsTotal: number;
  /** Improvements a human approved and applied to the agent. */
  findingsApplied: number;
  /** Improvements still awaiting a decision. */
  findingsOpen: number;
  /** De-identified theme counts by improvement lever (instructions/tools/…). */
  leverCounts: Record<string, number>;
}

interface ImprovementSummaryRow {
  mandate_key: string;
  enrolled: boolean;
  review_cadence: number | null;
  review_count: number;
  last_review_at: string | null;
  findings_total: number;
  findings_applied: number;
  findings_open: number;
  lever_counts: Record<string, number> | null;
}

/**
 * The honest read behind "How it's improving": which agent fulfils each of
 * the five Masterwork jobs (public mandate rows), how many times each has
 * been revised, and when. Agents the viewer cannot read render with the job
 * only — never invented detail.
 */
export async function fetchImprovementRows(): Promise<ImprovementRow[]> {
  const [pins, summaries] = await Promise.all([
    fetchMandatePins(MASTERWORK_MANDATE_KEYS),
    fetchImprovementSummaries(),
  ]);
  const agentIds = Object.values(pins).map((p) => p.agentId);

  const byAgentId = new Map<
    string,
    {
      name: string;
      version: number;
      updated_at: string;
      updated_by_system: string | null;
      updated_by_tier: string | null;
    }
  >();
  if (agentIds.length > 0) {
    const { data, error } = await supabase
      .schema("agent")
      .from("definition")
      .select("id,name,version,updated_at,updated_by_system,updated_by_tier")
      .in("id", agentIds)
      .is("deleted_at", null);
    if (error) throw new Error(`${error.message} (${error.code})`);
    for (const row of data ?? []) {
      byAgentId.set(row.id, {
        name: row.name,
        version: Number(row.version),
        updated_at: row.updated_at,
        updated_by_system: row.updated_by_system,
        updated_by_tier: row.updated_by_tier,
      });
    }
  }

  return MASTERWORK_MANDATE_KEYS.map((key) => {
    const copy = MANDATE_EXPERT_COPY[key];
    const pin = pins[key];
    const agent = pin ? byAgentId.get(pin.agentId) : undefined;
    const summary = summaries.get(key);
    return {
      mandateKey: key,
      label: copy.label,
      job: copy.job,
      agentId: pin?.agentId ?? null,
      agentName: agent?.name ?? null,
      agentVersion: agent?.version ?? null,
      updatedAt: agent?.updated_at ?? null,
      lastChangeBySystem:
        agent !== undefined &&
        (agent.updated_by_tier === "system" ||
          (agent.updated_by_system ?? "").toLowerCase().includes("hindsight")),
      enrolled: summary?.enrolled ?? false,
      reviewCount: summary?.review_count ?? 0,
      lastReviewAt: summary?.last_review_at ?? null,
      findingsTotal: summary?.findings_total ?? 0,
      findingsApplied: summary?.findings_applied ?? 0,
      findingsOpen: summary?.findings_open ?? 0,
      leverCounts: summary?.lever_counts ?? {},
    };
  });
}

/**
 * The de-identified Hindsight aggregates behind the panel — the ONE sanctioned
 * read of review activity for the five Masterwork jobs. A failed read returns
 * an empty map (the panel still renders its honest floor) but screams first.
 */
async function fetchImprovementSummaries(): Promise<
  Map<string, ImprovementSummaryRow>
> {
  const { data, error } = await supabase.rpc("masterwork_improvement_summary", {
    p_mandate_keys: [...MASTERWORK_MANDATE_KEYS],
  });
  if (error) {
    // Enrichment, not the floor: the panel's honest baseline (mandates +
    // agent revisions) must not blank because the aggregate read failed.
    console.error(
      "[masterwork-home] masterwork_improvement_summary RPC failed",
      error,
    );
    return new Map();
  }
  const out = new Map<string, ImprovementSummaryRow>();
  for (const row of (data ?? []) as ImprovementSummaryRow[]) {
    out.set(row.mandate_key, {
      ...row,
      lever_counts: row.lever_counts ?? {},
    });
  }
  return out;
}
