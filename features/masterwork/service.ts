import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";
import { pokeUnderstudy } from "./understudy/refresh";
import {
  parseRulebook,
  type DumpUrlSource,
  type Masterwork,
  type Rulebook,
  type RulebookRow,
  type RulebookRule,
  type RulebookSections,
  type RulebookSource,
  type RulebookStatus,
} from "./types";

/**
 * Direct supabase-js data layer for Rulebooks (platform.rulebook).
 * RLS is live (canonical 'system' variant): public Rulebooks readable by
 * everyone, owner/org writes. Per platform doctrine there is no Python hop for
 * these pure UI↔DB operations.
 */

const rulebookTable = () => supabase.schema("platform").from("rulebook");

export async function getRulebook(id: string): Promise<Rulebook | null> {
  const { data, error } = await rulebookTable()
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? parseRulebook(data as RulebookRow) : null;
}

export interface RulebookIntake {
  /** "What are you trying to build?" — the only required intake answer. */
  goal: string;
  /** Who will actually run this? */
  who_runs_it?: string;
  /** Where does the knowledge live? */
  knowledge_lives?: string;
  /** What happens if it gets it wrong? Sets guardrail intensity later. */
  stakes?: string;
  /** "If you handed this to ChatGPT today…" — the baseline we're beating. */
  benchmark?: string;
  /** The Distillation Approach the Expert picked (platform.approach key). */
  approach?: string;
}

export interface CreateRulebookInput {
  name: string;
  description: string;
  source: RulebookSource;
  organizationId: string;
  /** Guided-start answers; stored on metadata.intake — the Scout reads them. */
  intake?: RulebookIntake;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export async function createDraftRulebook(
  input: CreateRulebookInput,
): Promise<Rulebook> {
  const base = slugify(input.name) || "rulebook";
  // Slug is globally unique among live rows; suffix on collision.
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await rulebookTable()
      .insert({
        name: input.name,
        slug,
        description: input.description,
        source: input.source as never,
        sections: { G: { label: "General" } } as never,
        rules: [] as never,
        status: "draft",
        organization_id: input.organizationId,
        ...(input.intake
          ? { metadata: { intake: input.intake } as never }
          : {}),
      })
      .select("*")
      .single();
    if (!error) {
      const created = parseRulebook(data as RulebookRow);
      // Running from minute one: the Understudy exists the moment the
      // Rulebook does — zero rules, pure improvisation on the intake.
      pokeUnderstudy(created.id);
      return created;
    }
    if (error.code === "23505") {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }
    throw error;
  }
  throw new Error("Could not create the Rulebook: slug collision persisted.");
}

/**
 * Save the Rulebook's rules (and optionally sections). Bumps `version` with an
 * optimistic-lock on the version the editor loaded — a concurrent edit
 * surfaces as a conflict instead of silently overwriting.
 */
export async function saveRules(opts: {
  rulebookId: string;
  expectedVersion: number;
  rules: RulebookRule[];
  sections?: RulebookSections;
  /**
   * Whole-column replacement for `metadata` — read-modify-write it at the
   * CALLSITE and hand the finished object here, so a rule change and the
   * metadata that explains it land in ONE compare-and-swap. The Final Checkup
   * uses it for `metadata.checkup` (what the Expert already said no to);
   * omitting it leaves metadata untouched.
   */
  metadata?: Record<string, unknown>;
}): Promise<Rulebook> {
  const patch: Record<string, unknown> = {
    rules: opts.rules,
    version: opts.expectedVersion + 1,
  };
  if (opts.sections) patch.sections = opts.sections;
  if (opts.metadata) patch.metadata = opts.metadata;
  const { data, error } = await rulebookTable()
    .update(patch as never)
    .eq("id", opts.rulebookId)
    .eq("version", opts.expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "This Rulebook changed while you were editing (someone else saved a newer version). Reload to get the latest rules — your changes are still on screen.",
    );
  }
  // ONE funnel covers every FE rules write (editor, wizard, approve-all,
  // checkup apply): the Understudy rebuilds — free, in place — so the Expert
  // watches the running system get better as approvals land.
  pokeUnderstudy(opts.rulebookId);
  return parseRulebook(data as RulebookRow);
}

const RULE_UPSERT_CAS_RETRIES = 3;

/**
 * Land ONE rule on a Rulebook — replace by id when it exists, append when it
 * doesn't — through the canonical `saveRules` compare-and-swap, with a bounded
 * re-read retry (a single-rule upsert is commutative with other edits, same
 * contract as the Oracle tap's append). Used by the Improve verb landing its
 * rewrite as a draft revision, by Improve's discard restoring the original,
 * and by the Add-rule window's two tabs. NEVER a second write path.
 */
export async function upsertRuleWithRetry(opts: {
  rulebookId: string;
  rule: RulebookRule;
}): Promise<Rulebook> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < RULE_UPSERT_CAS_RETRIES; attempt++) {
    const rulebook = await getRulebook(opts.rulebookId);
    if (!rulebook) throw new Error("That Rulebook no longer exists.");
    const exists = rulebook.rules.some((r) => r.id === opts.rule.id);
    const rules = exists
      ? rulebook.rules.map((r) => (r.id === opts.rule.id ? opts.rule : r))
      : [...rulebook.rules, opts.rule];
    try {
      return await saveRules({
        rulebookId: opts.rulebookId,
        expectedVersion: rulebook.version,
        rules,
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("changed while you were editing")) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not save to the Rulebook — it kept changing. Try again.");
}

export async function updateRulebookMeta(opts: {
  rulebookId: string;
  patch: Partial<{
    name: string;
    description: string;
    source: RulebookSource;
    status: RulebookStatus;
    visibility: RulebookRow["visibility"];
  }>;
}): Promise<Rulebook> {
  const { data, error } = await rulebookTable()
    .update(opts.patch as never)
    .eq("id", opts.rulebookId)
    .select("*")
    .single();
  if (error) throw error;
  return parseRulebook(data as RulebookRow);
}

export type DumpUrlWriteResult =
  | { status: "saved"; rulebook: Rulebook }
  /** Someone else saved a newer version — `rulebook` is the fresh row. */
  | { status: "conflict"; rulebook: Rulebook }
  | { status: "not_found" };

/**
 * Replace the dump Approach's staged URL list
 * (`metadata.dump_url_sources`) with a guarded compare-and-swap on the
 * canonical `version` column — the same optimistic-concurrency contract the
 * Release flow uses. Read-modify-write happens HERE against the caller's
 * loaded row: the rest of `metadata` is carried forward untouched, and a
 * concurrent save (the Scout, another tab) surfaces as a conflict with the
 * fresh Rulebook instead of silently clobbering it.
 */
export async function writeDumpUrlSources(opts: {
  rulebook: Rulebook;
  urls: DumpUrlSource[];
}): Promise<DumpUrlWriteResult> {
  const { rulebook, urls } = opts;
  const baseMeta =
    rulebook.metadata &&
    typeof rulebook.metadata === "object" &&
    !Array.isArray(rulebook.metadata)
      ? (rulebook.metadata as Record<string, unknown>)
      : {};
  const metadata = { ...baseMeta, dump_url_sources: urls };
  const result = await guardedUpdate<RulebookRow>({
    expectedVersion: rulebook.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      rulebookTable()
        .update({ metadata, version: nextVersion } as never)
        .eq("id", rulebook.id)
        .eq("version", expectedVersion)
        .is("deleted_at", null)
        .select("*")
        .maybeSingle(),
    fetchCurrent: () =>
      rulebookTable()
        .select("*")
        .eq("id", rulebook.id)
        .is("deleted_at", null)
        .maybeSingle(),
  });
  if (result.status === "saved") {
    return { status: "saved", rulebook: parseRulebook(result.row) };
  }
  if (result.status === "conflict") {
    return { status: "conflict", rulebook: parseRulebook(result.currentRow) };
  }
  return { status: "not_found" };
}

export async function softDeleteRulebook(rulebookId: string): Promise<void> {
  const { error } = await rulebookTable()
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq("id", rulebookId);
  if (error) throw error;
}

/** One recorded state of a Rulebook (history.row_versions, via the gated RPC). */
export interface RulebookVersionEntry {
  version: number;
  operation: string;
  occurred_at: string;
  actor_id: string | null;
  actor_tier: string | null;
  rule_count: number;
}

/**
 * The Rulebook's version log. Reads history.row_versions through
 * `public.rulebook_versions` — the `history` schema is not exposed to the
 * browser, and the RPC's gate mirrors the table's own std_select RLS predicate.
 */
export async function listRulebookVersions(
  rulebookId: string,
): Promise<RulebookVersionEntry[]> {
  const { data, error } = await supabase.rpc("rulebook_versions", {
    p_rulebook_id: rulebookId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    version: row.version,
    operation: row.operation,
    occurred_at: row.occurred_at,
    actor_id: row.actor_id,
    actor_tier: row.actor_tier,
    rule_count: row.rule_count,
  }));
}

/**
 * The Rulebook's rules AS THEY WERE at one version — the left-hand side of a
 * Masterwork drift diff. `null` means that version predates version capture
 * (Rulebooks created before 2026-08-16): say so, never invent a diff from the
 * current rules.
 */
export async function getRulebookSnapshotRules(
  rulebookId: string,
  version: number,
): Promise<RulebookRule[] | null> {
  const { data, error } = await supabase.rpc("rulebook_snapshot", {
    p_rulebook_id: rulebookId,
    p_version: version,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") return null;
  const rules = (data as { rules?: unknown }).rules;
  return Array.isArray(rules) ? (rules as unknown as RulebookRule[]) : [];
}

export interface MasterworkRun {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps_executed: number | null;
  /** Summed node cost (workflow.node_outcome output.usage.cost_usd); null when unpriced. */
  cost_usd: number | null;
}

const RUNS_PER_MASTERWORK = 5;

/**
 * Recent runs per Masterwork, with per-run cost summed from node outcomes. Two
 * bounded reads (runs, then their node costs) — a preview surface, so a bare
 * select with limits is correct here, never a completeness read.
 */
export async function listRecentRunsForMasterworks(
  masterworkIds: string[],
): Promise<Record<string, MasterworkRun[]>> {
  if (masterworkIds.length === 0) return {};
  const { data: runs, error } = await supabase
    .schema("workflow")
    .from("run")
    .select(
      "id,definition_id,status,created_at,started_at,completed_at,steps_executed",
    )
    .in("definition_id", masterworkIds)
    .order("created_at", { ascending: false })
    .limit(RUNS_PER_MASTERWORK * masterworkIds.length);
  if (error) throw error;

  const byMasterwork: Record<string, MasterworkRun[]> = {};
  const kept: { id: string; definition_id: string }[] = [];
  for (const row of runs ?? []) {
    const masterworkId = String(row.definition_id);
    const bucket = (byMasterwork[masterworkId] ??= []);
    if (bucket.length >= RUNS_PER_MASTERWORK) continue;
    bucket.push({
      id: row.id,
      status: String(row.status),
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      steps_executed: row.steps_executed,
      cost_usd: null,
    });
    kept.push({ id: row.id, definition_id: masterworkId });
  }
  if (kept.length === 0) return byMasterwork;

  const { data: outcomes, error: outcomeError } = await supabase
    .schema("workflow")
    .from("node_outcome")
    // Widened to `string` because the JSON-path alias sends the literal-type
    // parser into TS2589; `.returns<>()` states the row shape at the boundary
    // (the catalog.ts-sanctioned pattern).
    .select("run_id, cost:output->usage->>cost_usd" as string)
    .in(
      "run_id",
      kept.map((r) => r.id),
    )
    .returns<{ run_id: string; cost: string | null }[]>();
  if (outcomeError) throw outcomeError;
  const costByRun = new Map<string, number>();
  for (const row of outcomes ?? []) {
    const cost = row.cost === null ? NaN : Number(row.cost);
    if (Number.isFinite(cost)) {
      costByRun.set(row.run_id, (costByRun.get(row.run_id) ?? 0) + cost);
    }
  }
  for (const bucket of Object.values(byMasterwork)) {
    for (const run of bucket) {
      const total = costByRun.get(run.id);
      if (total !== undefined) run.cost_usd = total;
    }
  }
  return byMasterwork;
}

export interface MasterworkRunVerdict {
  status: string;
  /** The chief's ruling (edit + generate shapes both end on node "chief"). */
  chiefText: string | null;
  /** The editor's corrected text (edit shape only) — prose, never the envelope. */
  editorText: string | null;
  /**
   * The Understudy's whole-job first cut. The Understudy is ONE agent on node
   * "understudy" — it has no chief and no editor — so a run that reads only
   * those two nodes reports "no ruling text came back" on a run that in fact
   * succeeded (proven live 2026-08-18: run 07cf6fe6 completed with a full
   * first cut on `understudy` and the Expert was shown nothing).
   */
  understudyText: string | null;
  /**
   * What the run RECORDED when it failed (`workflow.run.error.message`), raw.
   * The one input to explainRunFailure — without it a failed run can only be
   * described as "it didn't finish", which is the bare error Arman reported.
   */
  errorMessage: string | null;
}

/**
 * The editor node answers with a JSON envelope — `{edited_text, edits:[…]}` —
 * because the auditors' corrections travel with it. The corrected PROSE is the
 * only part a human (or an Audition comparing against a published original)
 * wants, so it is unwrapped here, at the one read boundary, rather than in
 * every surface. A node that answered in plain prose passes through untouched.
 */
function correctedProse(raw: string | null): string | null {
  if (!raw) return null;
  // Models fence their JSON as often as they emit it bare — accept both.
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(raw.trim());
  const trimmed = (fenced ? fenced[1] : raw).trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { edited_text?: unknown }).edited_text === "string"
    ) {
      return (parsed as { edited_text: string }).edited_text;
    }
  } catch {
    // Not JSON after all (a brace-opening sentence) — keep what we were given.
  }
  return raw;
}

/**
 * A finished run's human-facing result: the chief's ruling + (edit shape)
 * the corrected text, read straight off the terminal node outcomes.
 */
export async function getMasterworkRunVerdict(
  runId: string,
): Promise<MasterworkRunVerdict | null> {
  const [{ data: run, error: runError }, { data: outcomes, error }] =
    await Promise.all([
      supabase
        .schema("workflow")
        .from("run")
        .select("id,status,error")
        .eq("id", runId)
        .maybeSingle(),
      supabase
        .schema("workflow")
        .from("node_outcome")
        .select("node_id, text:output->>final_text" as string)
        .eq("run_id", runId)
        .in("node_id", ["chief", "editor", "understudy"])
        .returns<{ node_id: string; text: string | null }[]>(),
    ]);
  if (runError) throw runError;
  if (error) throw error;
  if (!run) return null;
  const byNode = new Map((outcomes ?? []).map((o) => [o.node_id, o.text]));
  return {
    status: String(run.status),
    chiefText: byNode.get("chief") ?? null,
    editorText: correctedProse(byNode.get("editor") ?? null),
    understudyText: byNode.get("understudy") ?? null,
    errorMessage: runErrorMessage(run.error),
  };
}

/**
 * `workflow.run.error` is a jsonb the engine writes as `{message: "..."}`; a
 * plain string and an absent value are both legal in the wild. Narrowed here,
 * at the one read boundary, so no surface has to guess at its shape.
 */
function runErrorMessage(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object") {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string") return message.trim() || null;
  }
  return null;
}

/** The projection the Masterwork reads select (workflow.definition subset). */
export interface MasterworkDefinitionRow {
  id: string;
  name: string;
  description: string | null;
  metadata: unknown;
  version: number;
  created_at: string;
  updated_at: string;
  visibility: string;
}

/** The one metadata→Masterwork projection — every read path goes through it. */
export function parseMasterworkRow(row: MasterworkDefinitionRow): Masterwork {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    masterwork_kind:
      typeof meta.masterwork_kind === "string" ? meta.masterwork_kind : null,
    built_from_rulebook:
      typeof meta.built_from_rulebook === "string"
        ? meta.built_from_rulebook
        : null,
    rulebook_version:
      typeof meta.rulebook_version === "number" ? meta.rulebook_version : null,
    released_at:
      typeof meta.released_at === "string" ? meta.released_at : null,
    understudy: meta.understudy === true,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    visibility: String(row.visibility),
  };
}

export const MASTERWORK_SELECT_COLUMNS =
  "id,name,description,metadata,version,created_at,updated_at,visibility";

/**
 * Masterworks built from a Rulebook — workflow.definition rows whose metadata
 * is stamped `built_from_rulebook` by the Build.
 */
export async function listMasterworksForRulebook(
  rulebookId: string,
): Promise<Masterwork[]> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select(MASTERWORK_SELECT_COLUMNS)
    .eq("metadata->>built_from_rulebook", rulebookId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(parseMasterworkRow);
}

/**
 * Release / un-release a Masterwork (the Studio action). Released = an
 * Operator can find and run it on /masterwork/encore; draft = Studio-only. The stamp is
 * `metadata.released_at`, written with a guarded compare-and-swap on the
 * definition's `version` so a concurrent Studio save surfaces as a conflict
 * instead of silently losing either write (metadata is read-modify-write).
 */
export async function setMasterworkReleased(opts: {
  masterworkId: string;
  expectedVersion: number;
  released: boolean;
}): Promise<Masterwork> {
  const definitionTable = () => supabase.schema("workflow").from("definition");
  const { data: current, error: readError } = await definitionTable()
    .select("metadata")
    .eq("id", opts.masterworkId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error("This Masterwork no longer exists.");
  const meta = {
    ...((current.metadata ?? {}) as Record<string, unknown>),
  };
  if (opts.released) meta.released_at = new Date().toISOString();
  else delete meta.released_at;

  const result = await guardedUpdate<MasterworkDefinitionRow>({
    expectedVersion: opts.expectedVersion,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      definitionTable()
        .update({ metadata: meta as never, version: nextVersion })
        .eq("id", opts.masterworkId)
        .eq("version", expectedVersion)
        .select(MASTERWORK_SELECT_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      definitionTable()
        .select(MASTERWORK_SELECT_COLUMNS)
        .eq("id", opts.masterworkId)
        .maybeSingle(),
  });
  if (result.status === "saved") return parseMasterworkRow(result.row);
  if (result.status === "conflict") {
    throw new Error(
      "This Masterwork changed while you were looking at it (someone saved a newer version). Reload the page and try again.",
    );
  }
  throw new Error("This Masterwork no longer exists.");
}
