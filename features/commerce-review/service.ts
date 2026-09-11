/**
 * features/commerce-review/service.ts
 *
 * Persistence for the two human gates + the attention queue — direct
 * Supabase against the `commerce` schema (plain reads/writes never route
 * through the Python server).
 *
 * 🚨 THE LEARNING-TAP LAW (BUILD.md W10/W11): a human decision NEVER
 * destructively overwrites an AI output row. `asset_mandate_result` rows are
 * read-only here forever; every human change lands as
 * (a) a `human_correction` row carrying the AI's `before_value` (without
 *     which there is no learning signal), and
 * (b) an ASSET write (value_bucket / attributes / pipeline_state) via the
 *     guarded CAS — so the pipeline's learning taps can diff human vs AI.
 *
 * The status write is the trigger (W4's policy 3 applies at both gates): a
 * gate decision writes the asset's next `pipeline_state` and nothing else
 * fires from the client — the DB transition IS the handoff.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate, readAllRows } from "@ai-matrx/data/db";
import { listArtifactsForAssets } from "@/features/commerce-intake/service";
import type { Json } from "@/types/database.types";
import type {
  IntakeAssetRow,
  PipelineState,
} from "@/features/commerce-intake/types";

import type {
  AssetMandateResultRow,
  AttentionItem,
  CommerceReviewSchema,
  DraftField,
  DraftItem,
  RecallAuditRow,
  RecallVerdict,
  ReviewVerdict,
  TriageItem,
  ValueBucket,
} from "./types";

interface CommerceReviewDatabase {
  commerce: CommerceReviewSchema;
}

/** Client scoped to `commerce` — hand-typed until `commerce` lands in the
 *  generated Database type (see types.ts header for the removal path). */
function db() {
  return (
    createClient() as unknown as SupabaseClient<
      CommerceReviewDatabase,
      "commerce"
    >
  ).schema("commerce");
}

const ASSET_COLUMNS =
  "id, intake_batch_id, organization_id, tracking_mode, quantity, pipeline_state, value_bucket, is_gem_candidate, estimated_value, estimated_value_currency, notes, attributes, created_at, version";

type AssetRow = Pick<
  IntakeAssetRow,
  | "id"
  | "intake_batch_id"
  | "organization_id"
  | "tracking_mode"
  | "quantity"
  | "pipeline_state"
  | "value_bucket"
  | "is_gem_candidate"
  | "estimated_value"
  | "estimated_value_currency"
  | "notes"
  | "attributes"
  | "created_at"
  | "version"
>;

const RESULT_COLUMNS =
  "id, intake_asset_id, step, mandate_key, output, confidence, reasoning, run_status, superseded_by, created_at";

type ResultRow = Pick<
  AssetMandateResultRow,
  | "id"
  | "intake_asset_id"
  | "step"
  | "mandate_key"
  | "output"
  | "confidence"
  | "reasoning"
  | "run_status"
  | "superseded_by"
  | "created_at"
>;

// ── Shared reads ────────────────────────────────────────────────────────────

/** Assets in one pipeline state, oldest first (queues drain FIFO). Complete
 *  by contract — a silently capped queue would hide real work. */
async function listAssetsInState(
  organizationId: string,
  state: PipelineState,
): Promise<AssetRow[]> {
  return readAllRows<AssetRow>(
    ({ from, to }) =>
      db()
        .from("intake_asset")
        .select(ASSET_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("pipeline_state", state)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: `commerce.intake_asset[${state}]` },
  );
}

/** The LIVE (non-superseded, succeeded) result per asset for one step —
 *  re-runs chain via superseded_by rather than overwrite, so live = the row
 *  nothing points past. */
async function liveResultsByAsset(
  assetIds: string[],
  step: ResultRow["step"],
): Promise<Map<string, ResultRow>> {
  const map = new Map<string, ResultRow>();
  if (assetIds.length === 0) return map;
  const { data, error } = await db()
    .from("asset_mandate_result")
    .select(RESULT_COLUMNS)
    .in("intake_asset_id", assetIds)
    .eq("step", step)
    .eq("run_status", "succeeded")
    .is("superseded_by", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  for (const row of (data ?? []) as ResultRow[]) {
    if (!map.has(row.intake_asset_id)) map.set(row.intake_asset_id, row);
  }
  return map;
}

/** Photo file_ids per asset, capture order (queues are image-first). Reads
 *  through W4's exported artifact reader — one canonical path per operation. */
async function photoIdsByAsset(
  assetIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (assetIds.length === 0) return map;
  const artifacts = await listArtifactsForAssets(assetIds);
  for (const [assetId, list] of artifacts) {
    map.set(
      assetId,
      list
        .filter((a) => a.kind === "photo" && a.fileId)
        .map((a) => a.fileId as string),
    );
  }
  return map;
}

// ── Gate 1 — warehouse triage ───────────────────────────────────────────────

export async function listTriageQueue(
  organizationId: string,
): Promise<TriageItem[]> {
  const assets = await listAssetsInState(organizationId, "awaiting_triage");
  const ids = assets.map((a) => a.id);
  const [valuations, photos] = await Promise.all([
    liveResultsByAsset(ids, "valuation"),
    photoIdsByAsset(ids),
  ]);
  return assets.map((a) => {
    const v = valuations.get(a.id);
    const out =
      v && v.output && typeof v.output === "object" && !Array.isArray(v.output)
        ? (v.output as Record<string, Json>)
        : {};
    return {
      assetId: a.id,
      organizationId: a.organization_id,
      version: a.version,
      pipelineState: a.pipeline_state as PipelineState,
      notes: a.notes ?? "",
      isGemCandidate: a.is_gem_candidate,
      estimatedValue: a.estimated_value,
      estimatedValueCurrency: a.estimated_value_currency,
      aiBucket:
        a.value_bucket ??
        (typeof out.value_bucket === "string" ? out.value_bucket : null),
      aiConfidence: v?.confidence ?? null,
      aiReasoning: v?.reasoning ?? null,
      valuationResultId: v?.id ?? null,
      valuationMandateKey: v?.mandate_key ?? null,
      photoFileIds: photos.get(a.id) ?? [],
      createdAt: a.created_at,
    };
  });
}

/**
 * The gate-1 decision. Writes, in order:
 * 1. a `human_correction` row when the human disagrees with the AI's bucket
 *    (gate_1, field_path 'value_bucket', before = the AI's call — the
 *    learning tap's diffable signal; a no_value the human promoted is a
 *    near-miss 🎯);
 * 2. the ASSET: `value_bucket` + the next `pipeline_state` — `recycled` for
 *    no_value, `drafting` otherwise. That status write is the trigger.
 */
export async function decideValueBucket(
  item: TriageItem,
  bucket: ValueBucket,
): Promise<void> {
  if (item.aiBucket !== bucket) {
    const { error } = await db()
      .from("human_correction")
      .insert({
        intake_asset_id: item.assetId,
        organization_id: item.organizationId,
        source_result_id: item.valuationResultId,
        mandate_key: item.valuationMandateKey,
        gate: "gate_1",
        field_path: "value_bucket",
        before_value: item.aiBucket,
        after_value: bucket,
        is_near_miss: item.aiBucket === "no_value" && bucket !== "no_value",
      });
    if (error) throw error;
  }
  const nextState: PipelineState =
    bucket === "no_value" ? "recycled" : "drafting";
  await guardedAssetWrite(item.assetId, item.version, {
    value_bucket: bucket,
    pipeline_state: nextState,
  });
}

// ── Gate 2 — lister craft (drafts review) ───────────────────────────────────

const DRAFT_SCALAR_LABELS: Record<string, string> = {
  title: "Title",
  subtitle: "Subtitle",
  description: "Description",
  condition: "Condition",
  condition_description: "Condition notes",
  price: "Price",
  category: "Category",
};

/** Flatten a listing_draft output into ordered, editable fields. Aspects
 *  (`aspects: {Brand: …}`) become `aspect:<Name>` paths — the same
 *  field_path vocabulary `human_correction` documents. */
export function toDraftFields(output: Json): DraftField[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const obj = output as Record<string, Json>;
  const fields: DraftField[] = [];
  for (const [key, label] of Object.entries(DRAFT_SCALAR_LABELS)) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    fields.push({
      path: key,
      label,
      value: typeof v === "string" ? v : JSON.stringify(v),
      multiline: key === "description" || key === "condition_description",
    });
  }
  const aspects = obj.aspects;
  if (aspects && typeof aspects === "object" && !Array.isArray(aspects)) {
    for (const [name, v] of Object.entries(aspects as Record<string, Json>)) {
      if (v === null || v === undefined) continue;
      fields.push({
        path: `aspect:${name}`,
        label: name,
        value: typeof v === "string" ? v : JSON.stringify(v),
        multiline: false,
      });
    }
  }
  return fields;
}

export async function listDraftQueue(
  organizationId: string,
): Promise<DraftItem[]> {
  const assets = await listAssetsInState(organizationId, "in_review");
  const ids = assets.map((a) => a.id);
  const [drafts, photos] = await Promise.all([
    liveResultsByAsset(ids, "listing_draft"),
    photoIdsByAsset(ids),
  ]);
  return assets.map((a) => {
    const d = drafts.get(a.id);
    return {
      assetId: a.id,
      organizationId: a.organization_id,
      version: a.version,
      notes: a.notes ?? "",
      draftResultId: d?.id ?? null,
      draftMandateKey: d?.mandate_key ?? null,
      confidence: d?.confidence ?? null,
      reasoning: d?.reasoning ?? null,
      fields: d ? toDraftFields(d.output) : [],
      photoFileIds: photos.get(a.id) ?? [],
      createdAt: a.created_at,
    };
  });
}

/**
 * The gate-2 decision. Field edits land as `human_correction` rows (gate_2,
 * before = the AI draft's value) AND onto `intake_asset.attributes` under
 * `listing.<path>` keys — the AI's draft row itself is never touched, so
 * the pipeline diffs the two. Then the status write: approve →
 * ready_to_publish · revise → drafting (the pipeline re-drafts with the
 * corrections visible) · reject → rejected.
 */
export async function reviewDraft(
  item: DraftItem,
  verdict: ReviewVerdict,
  editedFields: Record<string, string>,
): Promise<void> {
  const edits = Object.entries(editedFields).filter(([path, value]) => {
    const original = item.fields.find((f) => f.path === path);
    return original !== undefined && original.value !== value;
  });

  if (edits.length > 0) {
    const { error } = await db()
      .from("human_correction")
      .insert(
        edits.map(([path, value]) => ({
          intake_asset_id: item.assetId,
          organization_id: item.organizationId,
          source_result_id: item.draftResultId,
          mandate_key: item.draftMandateKey,
          gate: "gate_2" as const,
          field_path: path,
          before_value: item.fields.find((f) => f.path === path)?.value ?? null,
          after_value: value,
        })),
      );
    if (error) throw error;
  }

  const nextState: PipelineState =
    verdict === "approve"
      ? "ready_to_publish"
      : verdict === "revise"
        ? "drafting"
        : "rejected";

  await guardedAssetWrite(item.assetId, item.version, (current) => {
    const attrs =
      current.attributes &&
      typeof current.attributes === "object" &&
      !Array.isArray(current.attributes)
        ? { ...(current.attributes as Record<string, Json>) }
        : {};
    for (const [path, value] of edits) attrs[`listing.${path}`] = value;
    return { pipeline_state: nextState, attributes: attrs as Json };
  });
}

// ── Attention queue ─────────────────────────────────────────────────────────

const RECALL_COLUMNS =
  "id, intake_asset_id, product_id, audit_kind, original_bucket, original_confidence, original_result_id, original_agent_id, original_agent_version, challenge_bucket, challenge_confidence, challenge_reasoning, challenge_agent_id, challenge_agent_version, challenge_value_estimate, is_disagreement, disagreement_value_delta, escalated_at, human_verdict, human_verdict_at, human_verdict_by, days_since_disposal, market_value_at_audit, organization_id, created_by, created_at, updated_at, metadata";

/** Open disagreements + escalations + high-impact unknowns, one list,
 *  newest-escalated first. Complete reads — this queue IS the safety net. */
export async function listAttentionQueue(
  organizationId: string,
): Promise<AttentionItem[]> {
  const [recalls, unknowns] = await Promise.all([
    readAllRows<RecallAuditRow>(
      ({ from, to }) =>
        db()
          .from("recall_audit")
          .select(RECALL_COLUMNS, { count: "exact" })
          .eq("organization_id", organizationId)
          .is("human_verdict", null)
          .or("is_disagreement.eq.true,escalated_at.not.is.null")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "commerce.recall_audit[open]" },
    ),
    listHighImpactUnknowns(organizationId),
  ]);

  const items: AttentionItem[] = recalls.map((r) => ({
    kind: r.escalated_at
      ? ("recall_escalation" as const)
      : ("recall_disagreement" as const),
    id: r.id,
    assetId: r.intake_asset_id,
    title: r.escalated_at
      ? `Escalated ${r.audit_kind.replace(/_/g, " ")}`
      : `Skeptic disagrees: ${r.original_bucket ?? "?"} vs ${r.challenge_bucket ?? "?"}`,
    detail:
      r.challenge_reasoning ??
      (r.disagreement_value_delta !== null
        ? `Value delta ${r.disagreement_value_delta}`
        : ""),
    createdAt: r.created_at,
    audit: r,
  }));

  for (const u of unknowns) {
    items.push({
      kind: "high_impact_unknown",
      id: u.id,
      assetId: u.intake_asset_id,
      title: "High-impact open question",
      detail: u.question,
      createdAt: u.created_at,
    });
  }

  return items.sort((a, b) => {
    const esc =
      Number(b.kind === "recall_escalation") -
      Number(a.kind === "recall_escalation");
    if (esc !== 0) return esc;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

async function listHighImpactUnknowns(organizationId: string) {
  // asset_unknown is W4's table; this read is attention-specific (impact
  // filter) so it lives here rather than widening W4's queue reader.
  const client = createClient() as unknown as SupabaseClient<
    {
      commerce: {
        Tables: {
          asset_unknown: {
            Row: {
              id: string;
              intake_asset_id: string;
              question: string;
              value_impact: string | null;
              answered_at: string | null;
              deferred_at: string | null;
              organization_id: string;
              created_at: string;
            };
            Insert: never;
            Update: never;
            Relationships: [];
          };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
      };
    },
    "commerce"
  >;
  type UnknownRow = {
    id: string;
    intake_asset_id: string;
    question: string;
    value_impact: string | null;
    created_at: string;
  };
  // Complete by contract (the attention queue IS the safety net) — a bare
  // .select() silently caps at 1000 rows.
  return readAllRows<UnknownRow>(
    ({ from, to }) =>
      client
        .schema("commerce")
        .from("asset_unknown")
        .select("id, intake_asset_id, question, value_impact, created_at", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("value_impact", "high")
        .is("answered_at", null)
        .is("deferred_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "commerce.asset_unknown[high-impact]" },
  );
}

/** Record the human verdict on a recall-audit row. Verdict-only write — the
 *  original and challenge columns are the agents' evidence, never edited. */
export async function recordRecallVerdict(
  auditId: string,
  verdict: RecallVerdict,
): Promise<void> {
  const { error } = await db()
    .from("recall_audit")
    .update({
      human_verdict: verdict,
      human_verdict_at: new Date().toISOString(),
    })
    .eq("id", auditId)
    .is("human_verdict", null);
  if (error) throw error;
}

// ── Guarded asset writes ────────────────────────────────────────────────────

/** CAS write onto an intake_asset, retried once against the row that landed
 *  (same contract as W4's writer; the patch may depend on the current row). */
async function guardedAssetWrite(
  assetId: string,
  expectedVersion: number,
  patch:
    | Partial<
        Pick<IntakeAssetRow, "pipeline_state" | "value_bucket" | "attributes">
      >
    | ((
        current: AssetRow,
      ) => Partial<
        Pick<IntakeAssetRow, "pipeline_state" | "value_bucket" | "attributes">
      >),
): Promise<void> {
  const attempt = async (
    version: number,
    current: AssetRow | null,
  ): Promise<{ ok: true } | { retry: AssetRow }> => {
    const body =
      typeof patch === "function"
        ? patch(current ?? (await fetchAsset(assetId)))
        : patch;
    const result = await guardedUpdate<AssetRow & { version: number }>({
      expectedVersion: version,
      applyUpdate: ({ expectedVersion: ev, nextVersion }) =>
        db()
          .from("intake_asset")
          .update({ ...body, version: nextVersion })
          .eq("id", assetId)
          .eq("version", ev)
          .select(ASSET_COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        db()
          .from("intake_asset")
          .select(ASSET_COLUMNS)
          .eq("id", assetId)
          .maybeSingle(),
    });
    if (result.status === "saved") return { ok: true };
    if (result.status === "conflict") return { retry: result.currentRow };
    throw new Error("This asset no longer exists.");
  };

  const first = await attempt(expectedVersion, null);
  if ("ok" in first) return;
  const second = await attempt(first.retry.version, first.retry);
  if ("ok" in second) return;
  throw new Error(
    "Could not save — someone else decided this item at the same moment.",
  );
}

async function fetchAsset(assetId: string): Promise<AssetRow> {
  const { data, error } = await db()
    .from("intake_asset")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This asset no longer exists.");
  return data as AssetRow;
}
