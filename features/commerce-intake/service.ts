/**
 * features/commerce-intake/service.ts
 *
 * Persistence for the intake capture app — direct Supabase against the C1
 * `commerce` schema, per the data-flow rule (plain row reads/writes never
 * route through the Python server). Bytes never touch this module: media
 * uploads through `fileHandler` (see `uploads.ts`) and only the resulting
 * `file_id` lands on `intake_artifact` rows.
 *
 * The six §2 policies this module carries
 * (/projects/ebay-store-management/PROTOTYPE-CONCEPTS.md):
 * - Policy 3 — THE STATUS WRITE IS THE TRIGGER: `finishAsset` writes
 *   `pipeline_state = 'captured'` and NOTHING else. No pipeline call, no
 *   workflow fire from client code — the DB transition IS the handoff.
 * - Policy 4 — notes flush BEFORE the close write (enforced by the session
 *   hook ordering; this module keeps the two writes separate so ordering is
 *   possible at all).
 * - Policy 1 — transcript routing: the capture app never writes
 *   `intake_artifact.transcript` (the pipeline fills it and converges notes
 *   onto `intake_asset.notes` downstream); `appendToAssetNotes` is the
 *   server-side read-append for any late writer.
 *
 * Concurrency: every asset UPDATE rides the platform `guardedUpdate` CAS on
 * `version` (typing and a late transcript legitimately race).
 *
 * Org discipline: every INSERT carries an EXPLICIT `organization_id` — no
 * resolver, no fallback (no-db-assigned-org doctrine).
 */

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import { readAllRows } from "@ai-matrx/data/db";

import type {
  ArtifactKind,
  AssetIdentifier,
  AssetIdentifierRow,
  AssetQuestion,
  AssetUnknownRow,
  BatchCaptureMode,
  ChoiceOption,
  IdentifierKind,
  IntakeArtifact,
  IntakeArtifactRow,
  IntakeAsset,
  IntakeAssetRow,
  IntakeBatch,
  IntakeBatchRow,
  InstantRunPointer,
  PipelineState,
  StreamKind,
} from "./types";

/** The generated Supabase client scoped to the live `commerce` schema. */
function db() {
  return createClient().schema("commerce");
}

const BATCH_COLUMNS =
  "id, organization_id, stream_kind, capture_mode, label, status, notes, version";
const ASSET_COLUMNS =
  "id, intake_batch_id, organization_id, tracking_mode, quantity, pipeline_state, notes, attributes, featured_artifact_id, composition, metadata, created_at, version";
const ARTIFACT_COLUMNS =
  "id, intake_batch_id, intake_asset_id, file_id, artifact_kind, sequence_index, is_delineator, created_at";
const IDENTIFIER_COLUMNS =
  "id, intake_asset_id, identifier_kind, value, is_primary, replaced_at";
const QUESTION_COLUMNS =
  "id, intake_asset_id, question, question_kind, options, value_impact, skip_count, priority, created_at, version";

// ── Mappers ─────────────────────────────────────────────────────────────────

type BatchRow = Pick<
  IntakeBatchRow,
  | "id"
  | "organization_id"
  | "stream_kind"
  | "capture_mode"
  | "label"
  | "status"
  | "notes"
  | "version"
>;

function toBatch(row: BatchRow): IntakeBatch {
  return {
    id: row.id,
    organizationId: row.organization_id,
    streamKind: row.stream_kind as StreamKind,
    captureMode: row.capture_mode as BatchCaptureMode,
    label: row.label,
    status: row.status,
    notes: row.notes,
    version: row.version,
  };
}

type AssetRow = Pick<
  IntakeAssetRow,
  | "id"
  | "intake_batch_id"
  | "organization_id"
  | "tracking_mode"
  | "quantity"
  | "pipeline_state"
  | "notes"
  | "attributes"
  | "featured_artifact_id"
  | "composition"
  | "metadata"
  | "created_at"
  | "version"
>;

function toMetadata(
  value: IntakeAssetRow["metadata"],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** jsonb write cast for merged metadata — every value merged in is JSON-safe
 *  by construction (booleans, the pointer object, the agent's jsonb record),
 *  but `Record<string, unknown>` is not assignable to the generated Json. */
function asMetadataColumn(
  value: Record<string, unknown>,
): NonNullable<IntakeAssetRow["metadata"]> {
  return value as NonNullable<IntakeAssetRow["metadata"]>;
}

function toAttributes(
  value: IntakeAssetRow["attributes"],
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function toAsset(row: AssetRow, qrCode: string | null = null): IntakeAsset {
  return {
    id: row.id,
    batchId: row.intake_batch_id,
    organizationId: row.organization_id,
    trackingMode: row.tracking_mode as IntakeAsset["trackingMode"],
    quantity: row.quantity,
    pipelineState: row.pipeline_state as PipelineState,
    notes: row.notes ?? "",
    attributes: toAttributes(row.attributes),
    featuredArtifactId: row.featured_artifact_id,
    composition: row.composition as IntakeAsset["composition"],
    createdAt: row.created_at,
    version: row.version,
    qrCode,
    metadata: toMetadata(row.metadata),
  };
}

type ArtifactRow = Pick<
  IntakeArtifactRow,
  | "id"
  | "intake_batch_id"
  | "intake_asset_id"
  | "file_id"
  | "artifact_kind"
  | "sequence_index"
  | "is_delineator"
  | "created_at"
>;

function toArtifact(row: ArtifactRow): IntakeArtifact {
  return {
    id: row.id,
    batchId: row.intake_batch_id,
    assetId: row.intake_asset_id,
    fileId: row.file_id,
    kind: row.artifact_kind as ArtifactKind,
    sequenceIndex: row.sequence_index,
    isDelineator: row.is_delineator,
    createdAt: row.created_at,
  };
}

type IdentifierRow = Pick<
  AssetIdentifierRow,
  | "id"
  | "intake_asset_id"
  | "identifier_kind"
  | "value"
  | "is_primary"
  | "replaced_at"
>;

function toIdentifier(row: IdentifierRow): AssetIdentifier {
  return {
    id: row.id,
    assetId: row.intake_asset_id,
    kind: row.identifier_kind as IdentifierKind,
    value: row.value,
    isPrimary: row.is_primary,
    replacedAt: row.replaced_at,
  };
}

type QuestionRow = Pick<
  AssetUnknownRow,
  | "id"
  | "intake_asset_id"
  | "question"
  | "question_kind"
  | "options"
  | "value_impact"
  | "skip_count"
  | "priority"
  | "created_at"
  | "version"
>;

function toOptions(value: AssetUnknownRow["options"]): ChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [{ value: entry, label: entry }];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const o = entry as Record<string, unknown>;
      const v = typeof o.value === "string" ? o.value : null;
      if (!v) return [];
      return [{ value: v, label: typeof o.label === "string" ? o.label : v }];
    }
    return [];
  });
}

function toQuestion(row: QuestionRow): AssetQuestion {
  return {
    id: row.id,
    assetId: row.intake_asset_id,
    prompt: row.question,
    kind: row.question_kind as AssetQuestion["kind"],
    options: toOptions(row.options),
    valueImpact: row.value_impact as AssetQuestion["valueImpact"],
    skipCount: row.skip_count,
    priority: row.priority,
    createdAt: row.created_at,
    version: row.version,
  };
}

// ── Batches ─────────────────────────────────────────────────────────────────

/**
 * The org's open capture batch for a mode — reused when one exists (a capture
 * session continues the open batch), created otherwise. Ad-hoc capture uses
 * `mixed_retirement`; tracked ITAD batches arrive with client/party context
 * from elsewhere (out of W4 scope).
 */
export async function ensureOpenBatch(args: {
  organizationId: string;
  captureMode: BatchCaptureMode;
}): Promise<IntakeBatch> {
  const { data, error } = await db()
    .from("intake_batch")
    .select(BATCH_COLUMNS)
    .eq("organization_id", args.organizationId)
    .eq("status", "open")
    .eq("capture_mode", args.captureMode)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return toBatch(data as BatchRow);

  const { data: created, error: insertError } = await db()
    .from("intake_batch")
    .insert({
      organization_id: args.organizationId,
      stream_kind: "mixed_retirement",
      capture_mode: args.captureMode,
      status: "open",
      received_at: new Date().toISOString(),
      visibility: "internal",
    })
    .select(BATCH_COLUMNS)
    .single();
  if (insertError) throw insertError;
  return toBatch(created as BatchRow);
}

export async function loadBatch(batchId: string): Promise<IntakeBatch | null> {
  const { data, error } = await db()
    .from("intake_batch")
    .select(BATCH_COLUMNS)
    .eq("id", batchId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toBatch(data as BatchRow) : null;
}

/** Append text to the batch notes (untracked-mode voice/typed notes have no
 *  asset row yet — batch notes are the §2 convergence point until
 *  segmentation mints the assets). Read-append CAS, never clobbers. */
export async function appendToBatchNotes(
  batchId: string,
  text: string,
): Promise<void> {
  const current = await loadBatch(batchId);
  if (!current) throw new Error("This intake batch no longer exists.");
  const result = await guardedUpdate<BatchRow & { version: number }>({
    expectedVersion: current.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db()
        .from("intake_batch")
        .update({
          notes: current.notes ? `${current.notes}\n\n${text}` : text,
          version: nextVersion,
        })
        .eq("id", batchId)
        .eq("version", expectedVersion)
        .select(BATCH_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db()
        .from("intake_batch")
        .select(BATCH_COLUMNS)
        .eq("id", batchId)
        .maybeSingle(),
  });
  if (result.status === "conflict") {
    // Re-apply once onto the row that landed.
    await appendToBatchNotesOnce(result.currentRow as BatchRow, text);
  } else if (result.status === "not_found") {
    throw new Error("This intake batch no longer exists.");
  }
}

async function appendToBatchNotesOnce(row: BatchRow, text: string) {
  const result = await guardedUpdate<BatchRow & { version: number }>({
    expectedVersion: row.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      db()
        .from("intake_batch")
        .update({
          notes: row.notes ? `${row.notes}\n\n${text}` : text,
          version: nextVersion,
        })
        .eq("id", row.id)
        .eq("version", expectedVersion)
        .select(BATCH_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      db()
        .from("intake_batch")
        .select(BATCH_COLUMNS)
        .eq("id", row.id)
        .maybeSingle(),
  });
  if (result.status !== "saved") {
    throw new Error("Could not save the batch note — please retry.");
  }
}

// ── Assets ──────────────────────────────────────────────────────────────────

/**
 * Create an asset in a batch. The id is generated client-side so the fixed
 * cloud folder can be derived in the same tick (P13 — the folder is never
 * renamed, even when a code arrives later). Born in the schema's initial
 * `captured` state with `metadata.capture_open = true`; `finishAsset` clears
 * the flag and re-writes `pipeline_state='captured'` — THAT status write is
 * the pipeline's trigger (policy 3), so a mid-capture row is distinguishable
 * by the open flag, never by an invented state.
 */
export async function createAsset(args: {
  batchId: string;
  organizationId: string;
  qrCode?: string | null;
}): Promise<IntakeAsset> {
  const id = crypto.randomUUID();
  const { data, error } = await db()
    .from("intake_asset")
    .insert({
      id,
      intake_batch_id: args.batchId,
      organization_id: args.organizationId,
      tracking_mode: "serialized",
      quantity: 1,
      pipeline_state: "captured",
      metadata: { capture_open: true },
    })
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;
  let asset = toAsset(data as AssetRow);
  if (args.qrCode?.trim()) {
    await addIdentifier({
      assetId: id,
      organizationId: args.organizationId,
      kind: "our_qr",
      value: args.qrCode.trim(),
      isPrimary: true,
      isMachineReadable: true,
    });
    asset = { ...asset, qrCode: args.qrCode.trim() };
  }
  return asset;
}

export async function loadAsset(assetId: string): Promise<IntakeAsset | null> {
  const { data, error } = await db()
    .from("intake_asset")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const identifiers = await listIdentifiers(assetId);
  const primary =
    identifiers.find(
      (i) => i.kind === "our_qr" && i.isPrimary && !i.replacedAt,
    ) ?? null;
  return toAsset(data as AssetRow, primary?.value ?? null);
}

/** EVERY asset of the org, newest first — the list page's read. Complete by
 *  contract (`readAllRows`): the list drives decisions, and a silent
 *  1000-row cap would hide real assets. */
export async function listAllAssets(
  organizationId: string,
): Promise<IntakeAsset[]> {
  const rows = await readAllRows<AssetRow>(
    ({ from, to }) =>
      db()
        .from("intake_asset")
        .select(ASSET_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "commerce.intake_asset" },
  );
  return rows.map((r) => toAsset(r));
}

/** Recent assets of the org (the in-capture review drawer). Rendering, not a
 *  completeness check — a bounded list is the right answer. */
export async function listRecentAssets(
  organizationId: string,
  limit = 50,
): Promise<IntakeAsset[]> {
  const { data, error } = await db()
    .from("intake_asset")
    .select(ASSET_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AssetRow[]).map((r) => toAsset(r));
}

export async function listAssetsByIds(
  assetIds: string[],
): Promise<Map<string, IntakeAsset>> {
  const map = new Map<string, IntakeAsset>();
  if (assetIds.length === 0) return map;
  const { data, error } = await db()
    .from("intake_asset")
    .select(ASSET_COLUMNS)
    .in("id", assetIds)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of (data ?? []) as AssetRow[]) {
    map.set(row.id, toAsset(row));
  }
  return map;
}

type AssetPatch = Partial<
  Pick<
    IntakeAssetRow,
    | "notes"
    | "attributes"
    | "pipeline_state"
    | "metadata"
    | "featured_artifact_id"
    | "quantity"
    | "tracking_mode"
    | "composition"
  >
>;

/** One CAS attempt of `mutate(current)` onto the asset, retried once on a
 *  version conflict against the row that actually landed. */
async function guardedAssetWrite(
  asset: IntakeAsset,
  mutate: (current: IntakeAsset) => AssetPatch,
): Promise<IntakeAsset> {
  const attempt = async (
    current: IntakeAsset,
  ): Promise<{ saved: IntakeAsset } | { conflict: IntakeAsset }> => {
    const patch = mutate(current);
    const result = await guardedUpdate<AssetRow & { version: number }>({
      expectedVersion: current.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        db()
          .from("intake_asset")
          .update({ ...patch, version: nextVersion })
          .eq("id", current.id)
          .eq("version", expectedVersion)
          .select(ASSET_COLUMNS)
          .maybeSingle(),
      fetchCurrent: () =>
        db()
          .from("intake_asset")
          .select(ASSET_COLUMNS)
          .eq("id", current.id)
          .maybeSingle(),
    });
    if (result.status === "saved")
      return { saved: toAsset(result.row, current.qrCode) };
    if (result.status === "conflict")
      return { conflict: toAsset(result.currentRow, current.qrCode) };
    throw new Error("This intake asset no longer exists.");
  };

  const first = await attempt(asset);
  if ("saved" in first) return first.saved;
  const second = await attempt(first.conflict);
  if ("saved" in second) return second.saved;
  throw new Error(
    "Could not save — someone else is editing this asset at the same moment.",
  );
}

/** Replace the asset's notes (the textarea autosave path — ONE writer for
 *  visible text; policy 1). */
export async function setAssetNotes(
  asset: IntakeAsset,
  notes: string,
): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, () => ({ notes }));
}

/** Server-side read-append onto the asset's notes — the late-writer path of
 *  policy 1 (the user already moved on; never clobber what they typed). */
export async function appendToAssetNotes(
  assetId: string,
  text: string,
): Promise<IntakeAsset> {
  const current = await loadAsset(assetId);
  if (!current) throw new Error("This intake asset no longer exists.");
  return guardedAssetWrite(current, (row) => ({
    notes: row.notes ? `${row.notes}\n\n${text}` : text,
  }));
}

/** Replace the asset's editable attributes (the generic-rows editor). */
export async function setAssetAttributes(
  asset: IntakeAsset,
  attributes: Record<string, string>,
): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, () => ({ attributes }));
}

/**
 * 🚨 Policy 3 — THE STATUS WRITE IS THE TRIGGER. Finishing an item writes
 * `pipeline_state = 'captured'` (clearing the mid-capture open flag) and
 * NOTHING else: no pipeline call, no workflow fire, no side channel. Agents,
 * SQL, imports and this UI all hand off identically, and "reprocess" is just
 * re-firing this same transition. The session hook guarantees the notes
 * flush lands BEFORE this write (policy 4) so this is the last write of the
 * item's capture life.
 */
export async function finishAsset(asset: IntakeAsset): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, (current) => ({
    pipeline_state: "captured" as PipelineState,
    // MERGE — the metadata column also carries the instant lane's durable
    // seams; replacing it wholesale would orphan a paid run.
    metadata: asMetadataColumn({ ...current.metadata, capture_open: false }),
  }));
}

/** Reopen an asset on the capture surface (resume / more shots). Marks the
 *  row mid-capture again so finishing later re-fires the same transition —
 *  more photos ARE a reprocess. */
export async function reopenAsset(asset: IntakeAsset): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, (current) => ({
    metadata: asMetadataColumn({ ...current.metadata, capture_open: true }),
  }));
}

// ── The instant lane (client-run analysis; see hooks/useInstantIntakeAnalysis) ─
//
// WHERE THE SEAMS LIVE, AND WHY: `commerce.asset_mandate_result` is the W5
// pipeline's OWN durable ledger — its `step` CHECK enumerates the pipeline
// steps and W5 reads the latest non-superseded succeeded row per step as that
// step's output under its own idempotency contract (pending-before-run,
// BatchRouter custom_id, superseded_by chaining). A client-lane row there
// would be read back as a pipeline step's output and corrupt that contract,
// so the instant lane persists on the asset row itself:
// `metadata.instant_run` (the pointer) + `metadata.instant_analysis` (the
// settled record, `__kind` marker and all) — merged, CAS-guarded, no DDL.

/** SEAM 1 — the durable run pointer, before the first token streams. */
export async function saveInstantRunPointer(
  asset: IntakeAsset,
  pointer: InstantRunPointer,
): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, (current) => ({
    metadata: asMetadataColumn({ ...current.metadata, instant_run: { ...pointer } }),
  }));
}

/**
 * SEAM 2 (and 3's backfill) — persist the settled record AND take the asset
 * out of the server pipeline's reach in ONE write. An instant-processed asset
 * moves `captured → awaiting_triage` (never re-fires `captured`): the W5
 * sweep only picks up captured/extracting/grouped/researching/valuing, so
 * this is the commerce mirror of product-capture's skip-captured semantics —
 * the analysis is done and a human triages next. A row already past
 * `captured` keeps its state; only the record merges in.
 */
export async function saveInstantResult(
  asset: IntakeAsset,
  record: Record<string, unknown>,
): Promise<IntakeAsset> {
  return guardedAssetWrite(asset, (current) => ({
    ...(current.pipelineState === "captured"
      ? { pipeline_state: "awaiting_triage" as PipelineState }
      : {}),
    metadata: asMetadataColumn({
      ...current.metadata,
      instant_analysis: record,
      capture_open: false,
    }),
  }));
}

/** Soft-delete an asset. Its uploaded files stay in the org's file tree. */
export async function deleteAsset(assetId: string): Promise<void> {
  const { error } = await db()
    .from("intake_asset")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw error;
}

// ── Artifacts ───────────────────────────────────────────────────────────────

/**
 * Record one captured artifact (after `fileHandler.upload` — see uploads.ts).
 * `transcript` is deliberately NEVER written here: it arrives asynchronously
 * from the pipeline (policy 1). Non-photo kinds must carry `duration_ms`
 * (live CHECK `intake_artifact_media_chk`).
 */
export async function recordArtifact(args: {
  batchId: string;
  assetId: string | null;
  organizationId: string;
  fileId: string;
  kind: ArtifactKind;
  sequenceIndex: number;
  isDelineator?: boolean;
  durationMs?: number | null;
}): Promise<IntakeArtifact> {
  const { data, error } = await db()
    .from("intake_artifact")
    .insert({
      intake_batch_id: args.batchId,
      intake_asset_id: args.assetId,
      organization_id: args.organizationId,
      file_id: args.fileId,
      artifact_kind: args.kind,
      source: "app",
      captured_at: new Date().toISOString(),
      sequence_index: args.sequenceIndex,
      is_delineator: args.isDelineator ?? false,
      duration_ms: args.durationMs ?? null,
    })
    .select(ARTIFACT_COLUMNS)
    .single();
  if (error) throw error;
  return toArtifact(data as ArtifactRow);
}

/** Artifacts of one asset, in capture order. */
export async function listAssetArtifacts(
  assetId: string,
): Promise<IntakeArtifact[]> {
  const { data, error } = await db()
    .from("intake_artifact")
    .select(ARTIFACT_COLUMNS)
    .eq("intake_asset_id", assetId)
    .is("deleted_at", null)
    .order("sequence_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ArtifactRow[]).map(toArtifact);
}

/** Artifacts of many assets at once (list thumbnails / the answer queue). */
export async function listArtifactsForAssets(
  assetIds: string[],
): Promise<Map<string, IntakeArtifact[]>> {
  const map = new Map<string, IntakeArtifact[]>();
  if (assetIds.length === 0) return map;
  const { data, error } = await db()
    .from("intake_artifact")
    .select(ARTIFACT_COLUMNS)
    .in("intake_asset_id", assetIds)
    .is("deleted_at", null)
    .order("sequence_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const row of (data ?? []) as ArtifactRow[]) {
    if (!row.intake_asset_id) continue;
    const list = map.get(row.intake_asset_id) ?? [];
    list.push(toArtifact(row));
    map.set(row.intake_asset_id, list);
  }
  return map;
}

/** The largest sequence_index already used in a batch (resume support — the
 *  session's monotonic counter must continue, never restart at 0). */
export async function maxSequenceIndex(batchId: string): Promise<number> {
  const { data, error } = await db()
    .from("intake_artifact")
    .select("sequence_index")
    .eq("intake_batch_id", batchId)
    .not("sequence_index", "is", null)
    .order("sequence_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as { sequence_index: number | null } | null)?.sequence_index ?? 0
  );
}

/** Soft-delete an artifact row (the retake path — cloud-file removal is the
 *  caller's concern, best-effort). */
export async function deleteArtifact(artifactId: string): Promise<void> {
  const { error } = await db()
    .from("intake_artifact")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", artifactId);
  if (error) throw error;
}

// ── Identifiers ─────────────────────────────────────────────────────────────

/** Add an identifier ROW (schema.sql §12: never key anything on the raw QR
 *  or serial string — identity is rows). The partial unique index enforces
 *  one live primary per asset. */
export async function addIdentifier(args: {
  assetId: string;
  organizationId: string;
  kind: IdentifierKind;
  value: string;
  isPrimary?: boolean;
  isMachineReadable?: boolean;
}): Promise<AssetIdentifier> {
  const { data, error } = await db()
    .from("asset_identifier")
    .insert({
      intake_asset_id: args.assetId,
      organization_id: args.organizationId,
      identifier_kind: args.kind,
      value: args.value.trim(),
      is_primary: args.isPrimary ?? false,
      is_machine_readable: args.isMachineReadable ?? false,
    })
    .select(IDENTIFIER_COLUMNS)
    .single();
  if (error) throw error;
  return toIdentifier(data as IdentifierRow);
}

export async function listIdentifiers(
  assetId: string,
): Promise<AssetIdentifier[]> {
  const { data, error } = await db()
    .from("asset_identifier")
    .select(IDENTIFIER_COLUMNS)
    .eq("intake_asset_id", assetId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as IdentifierRow[]).map(toIdentifier);
}

/** Primary live our_qr per asset, for many assets at once. */
export async function listPrimaryQrForAssets(
  assetIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (assetIds.length === 0) return map;
  const { data, error } = await db()
    .from("asset_identifier")
    .select(IDENTIFIER_COLUMNS)
    .in("intake_asset_id", assetIds)
    .eq("identifier_kind", "our_qr")
    .eq("is_primary", true)
    .is("replaced_at", null);
  if (error) throw error;
  for (const row of (data ?? []) as IdentifierRow[]) {
    map.set(row.intake_asset_id, row.value);
  }
  return map;
}

// ── The answer queue (asset_unknown) ────────────────────────────────────────

/** All open questions across the org, in the queue order the prototype
 *  proved: `skip_count ASC, priority DESC, created_at ASC` — skipped
 *  questions genuinely sink. Open = unanswered and not deferred. */
export async function listOpenQuestions(
  organizationId: string,
): Promise<AssetQuestion[]> {
  const rows = await readAllRows<QuestionRow>(
    ({ from, to }) =>
      db()
        .from("asset_unknown")
        .select(QUESTION_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .is("answered_at", null)
        .is("deferred_at", null)
        .order("skip_count", { ascending: true })
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "commerce.asset_unknown" },
  );
  return rows.map(toQuestion);
}

/** A human raising a question FOR the agents (P8). */
export async function raiseQuestion(args: {
  assetId: string;
  organizationId: string;
  prompt: string;
}): Promise<AssetQuestion> {
  const { data, error } = await db()
    .from("asset_unknown")
    .insert({
      intake_asset_id: args.assetId,
      organization_id: args.organizationId,
      question: args.prompt.trim(),
      question_kind: "text",
      raised_by: "human",
    })
    .select(QUESTION_COLUMNS)
    .single();
  if (error) throw error;
  return toQuestion(data as QuestionRow);
}

export async function answerQuestion(
  question: AssetQuestion,
  answer: string,
): Promise<void> {
  const { error } = await db()
    .from("asset_unknown")
    .update({
      answer,
      answered_at: new Date().toISOString(),
      answer_source: "human",
      version: question.version + 1,
    })
    .eq("id", question.id)
    .is("answered_at", null);
  if (error) throw error;
}

/** Skip = "not near that shelf": skip_count++ → the back of the queue. */
export async function skipQuestion(
  question: AssetQuestion,
): Promise<AssetQuestion> {
  const { data, error } = await db()
    .from("asset_unknown")
    .update({
      skip_count: question.skipCount + 1,
      version: question.version + 1,
    })
    .eq("id", question.id)
    .select(QUESTION_COLUMNS)
    .single();
  if (error) throw error;
  return toQuestion(data as QuestionRow);
}

/** Defer = "not a quick answer": leaves the quick flow entirely, with a
 *  reason (P7 — a different verb than skip). */
export async function deferQuestion(
  question: AssetQuestion,
  reason: string,
): Promise<void> {
  const { error } = await db()
    .from("asset_unknown")
    .update({
      deferred_at: new Date().toISOString(),
      deferred_reason: reason,
      version: question.version + 1,
    })
    .eq("id", question.id);
  if (error) throw error;
}
