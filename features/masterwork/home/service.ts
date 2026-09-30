// features/masterwork/home/service.ts
//
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import { fetchMandatePins } from "@/features/mandates/service";
import { listAuditionScores } from "../audition/listAuditionScores";
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
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { defaultListFilter, type ListScopeWord } from "@/lib/list-scope";

/**
 * Reads for the Masterwork HOME (the authed landing at /masterwork) — a
 * bounded overview surface, so bare selects with limits are correct here
 * (never completeness reads). Direct supabase-js per platform doctrine.
 *
 * THE VIEW LAW: every read declares its own scope — this page is "yours":
 * your Rulebooks, the Masterworks built from them, their recent runs.
 */

const RULEBOOK_LIMIT = 12;
const MASTERWORK_LIMIT = 12;
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
  /** The most recently updated Masterworks — active and archived halves, each bounded. */
  masterworks: HomeMasterwork[];
  /** True totals behind the bounded grid (every readable Masterwork, not only the shown Rulebooks'). */
  masterworkActiveTotal: number;
  masterworkArchivedTotal: number;
  recentRuns: HomeRun[];
}

function toRules(value: unknown): RulebookRule[] {
  return Array.isArray(value) ? (value as unknown as RulebookRule[]) : [];
}

/** Everything the home page shows about YOUR corner of Masterwork. */
export async function fetchMasterworkHome(
  scope?: ListScopeWord,
): Promise<MasterworkHomeData> {
  const userId = requireUserId();

  // DD-137c / §3.3: `rulebook` is registered `organization`, so the home page opens on the
  // organization's Rulebooks — the viewer's own included, which is the half the old filter removed.
  const listScope = await defaultListFilter("rulebook", { userId, requested: scope });
  let homeQuery = supabase
    .schema("platform")
    .from("rulebook")
    .select(
      "id,name,description,source,rules,version,status,updated_at",
      { count: "exact" },
    )
    .is("deleted_at", null);
  homeQuery = listScope.apply(homeQuery);
  const { data, error, count } = await homeQuery
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

  // Masterworks and runs are read ACROSS every Rulebook the viewer can read,
  // not only the bounded twelve above — reading them through the shown
  // Rulebooks' ids made "Your Masterworks (n)" and "Recent work" silently
  // omit everything built from the 13th Rulebook on.
  const [masterworkHalves, runs] = await Promise.all([
    // The home grid carries the reveal control, so it reads BOTH halves.
    fetchRecentMasterworks(),
    fetchRecentRuns(),
  ]);
  const masterworks = [...masterworkHalves.active, ...masterworkHalves.archived];

  const nameById = new Map(rulebooks.map((r) => [r.id, r.name]));
  const referencedIds = new Set<string>();
  for (const m of masterworks)
    if (m.built_from_rulebook) referencedIds.add(m.built_from_rulebook);
  for (const r of runs) referencedIds.add(r.rulebook_id);
  const missingNames = [...referencedIds].filter((id) => !nameById.has(id));
  if (missingNames.length > 0) {
    const { data: named, error: nameError } = await supabase
      .schema("platform")
      .from("rulebook")
      .select("id,name")
      .in("id", missingNames);
    if (nameError) throw new Error(`${nameError.message} (${nameError.code})`);
    for (const row of named ?? []) nameById.set(row.id, row.name);
  }

  // Attach the quality trend from audited runs (quality_score is stamped by
  // the Audition judge on platform.masterwork_run, per Rulebook).
  const scoresByRulebook = new Map<string, number[]>();
  const masterworkRulebookIds = [
    ...new Set(
      masterworks
        .map((m) => m.built_from_rulebook)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const scored = await listAuditionScores(masterworkRulebookIds);
  for (const s of scored) {
    const list = scoresByRulebook.get(s.rulebookId) ?? [];
    list.push(s.qualityScore);
    scoresByRulebook.set(s.rulebookId, list);
  }
  const withQuality: HomeMasterwork[] = masterworks.map((m) => {
    const scores = m.built_from_rulebook
      ? (scoresByRulebook.get(m.built_from_rulebook) ?? [])
      : [];
    return {
      ...m,
      rulebookName: m.built_from_rulebook
        ? (nameById.get(m.built_from_rulebook) ?? null)
        : null,
      qualityLatest: scores.length > 0 ? scores[scores.length - 1] : null,
      qualityPrevious: scores.length > 1 ? scores[scores.length - 2] : null,
    };
  });

  return {
    rulebooks,
    rulebookTotal: count ?? rulebooks.length,
    masterworks: withQuality,
    masterworkActiveTotal: masterworkHalves.activeTotal,
    masterworkArchivedTotal: masterworkHalves.archivedTotal,
    recentRuns: runs.map((r) => ({
      ...r,
      rulebookName: nameById.get(r.rulebook_id) ?? null,
    })),
  };
}

/**
 * THE ARCHIVED-ITEMS LAW (`common-docs/policies/archived-items.md`, Arman
 * 2026-09-09). The home page OWNS a reveal control, so it reads both halves —
 * each bounded, each with its true total — and its grid and every count on it
 * are the live half; the archived half is one click below the grid. Each row
 * carries `is_archived` (from `MASTERWORK_SELECT_COLUMNS`), so a revealed card
 * says what it is. A Masterwork is a workflow.definition row whose metadata
 * names the Rulebook it was built from.
 */
async function fetchRecentMasterworks(): Promise<{
  active: Masterwork[];
  archived: Masterwork[];
  activeTotal: number;
  archivedTotal: number;
}> {
  const half = async (archived: boolean) => {
    const { data, error, count } = await supabase
      .schema("workflow")
      .from("definition")
      .select(MASTERWORK_SELECT_COLUMNS, { count: "exact" })
      .not("metadata->>built_from_rulebook", "is", null)
      .is("deleted_at", null)
      .eq("is_archived", archived)
      .order("updated_at", { ascending: false })
      .limit(MASTERWORK_LIMIT);
    if (error) throw new Error(`${error.message} (${error.code})`);
    const rows = (data ?? []).map((row) =>
      parseMasterworkRow(row as MasterworkDefinitionRow),
    );
    return { rows, total: count ?? rows.length };
  };
  const [active, archived] = await Promise.all([half(false), half(true)]);
  return {
    active: active.rows,
    archived: archived.rows,
    activeTotal: active.total,
    archivedTotal: archived.total,
  };
}

async function fetchRecentRuns(): Promise<HomeRun[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("masterwork_run")
    .select("id,operation,status,label,created_at,rulebook_id,quality_score")
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
    rulebookName: null,
    quality_score: row.quality_score,
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
  MANDATE_KEYS.masterwork__scout,
  MANDATE_KEYS.masterwork__source_distiller,
  MANDATE_KEYS.masterwork__exemplar_distiller,
  MANDATE_KEYS.masterwork__rulebook_auditor,
  MANDATE_KEYS.masterwork__audition_judge,
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
export interface ImprovementPanelData {
  rows: ImprovementRow[];
  /** Set when the review aggregates could not be read — the rows then carry no review counts. */
  reviewsError: string | null;
}

export async function fetchImprovementRows(): Promise<ImprovementPanelData> {
  const [pins, { summaries, error: reviewsError }] = await Promise.all([
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

  const rows = MASTERWORK_MANDATE_KEYS.map((key): ImprovementRow => {
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
  return { rows, reviewsError };
}

/**
 * The de-identified Hindsight aggregates behind the panel — the ONE sanctioned
 * read of review activity for the five Masterwork jobs. A failed read returns
 * an empty map AND the error, so the panel still renders its floor (mandates +
 * revisions) while saying plainly that the review counts are missing.
 */
async function fetchImprovementSummaries(): Promise<{
  summaries: Map<string, ImprovementSummaryRow>;
  error: string | null;
}> {
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
    return { summaries: new Map(), error: `${error.message} (${error.code})` };
  }
  const out = new Map<string, ImprovementSummaryRow>();
  for (const row of (data ?? []) as ImprovementSummaryRow[]) {
    out.set(row.mandate_key, {
      ...row,
      lever_counts: row.lever_counts ?? {},
    });
  }
  return { summaries: out, error: null };
}
