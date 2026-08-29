/**
 * features/commerce-intake/labels/service.ts
 *
 * Persistence for the commerce label pool — direct Supabase against
 * `commerce.label_batch` / `commerce.label_code` (data-flow rule: plain row
 * reads/writes never route through the Python server).
 *
 * The pool model: codes are MINTED rows (state 'available', no asset), printed
 * as `https://aimatrx.com/l/<code>` QR sheets, and ASSIGNMENT stamps them —
 * claim writes the `our_qr` identifier row on the asset and moves the code
 * `available → assigned` in a state-guarded update, so two racing scanners
 * can never both claim one code.
 *
 * Uniqueness is DB-enforced (live 2026-08-29):
 * - `asset_identifier_org_kind_value_live_uq` — one live (org, kind, value)
 *   identifier; makes `findAssetIdByIdentifier` deterministic.
 * - `label_code_org_value_uq` — one code value per org; minting retries on a
 *   violation with fresh random values.
 *
 * TYPING NOTE: `labelsDb()` casts the shared browser client onto hand-declared
 * row twins because the generated `types/database.types.ts` predates these two
 * tables and this session cannot run `pnpm db-types` (no CLI token). Replace
 * with `Database["commerce"]` on the next regeneration — see labels/types.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";

import { generateCodeValue } from "./codes";
import type {
  LabelBatch,
  LabelBatchListRow,
  LabelBatchRow,
  LabelBatchState,
  LabelCode,
  LabelCodeRow,
  LabelCodeState,
  ScanResolution,
} from "./types";

// ── Typed facade over the two new tables (see TYPING NOTE above) ────────────

type LabelPoolSchema = {
  Tables: {
    label_batch: {
      Row: LabelBatchRow;
      Insert: Partial<LabelBatchRow>;
      Update: Partial<LabelBatchRow>;
      Relationships: [];
    };
    label_code: {
      Row: LabelCodeRow;
      Insert: Partial<LabelCodeRow>;
      Update: Partial<LabelCodeRow>;
      Relationships: [];
    };
  };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
};

type LabelPoolDatabase = { commerce: LabelPoolSchema };

function labelsDb() {
  return (
    createClient() as unknown as SupabaseClient<LabelPoolDatabase, "commerce">
  ).schema("commerce");
}

const BATCH_COLUMNS =
  "id, organization_id, template_id, requested_count, code_prefix, purpose, state, printed_at, created_at, version";
const CODE_COLUMNS =
  "id, label_batch_id, organization_id, value, state, assigned_at, intake_asset_id, asset_identifier_id, void_reason, created_at";

type BatchRow = Pick<
  LabelBatchRow,
  | "id"
  | "organization_id"
  | "template_id"
  | "requested_count"
  | "code_prefix"
  | "purpose"
  | "state"
  | "printed_at"
  | "created_at"
  | "version"
>;

type CodeRow = Pick<
  LabelCodeRow,
  | "id"
  | "label_batch_id"
  | "organization_id"
  | "value"
  | "state"
  | "assigned_at"
  | "intake_asset_id"
  | "asset_identifier_id"
  | "void_reason"
  | "created_at"
>;

function toBatch(row: BatchRow): LabelBatch {
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    requestedCount: row.requested_count,
    codePrefix: row.code_prefix,
    purpose: row.purpose,
    state: row.state as LabelBatchState,
    printedAt: row.printed_at,
    createdAt: row.created_at,
    version: row.version,
  };
}

function toCode(row: CodeRow): LabelCode {
  return {
    id: row.id,
    batchId: row.label_batch_id,
    organizationId: row.organization_id,
    value: row.value,
    state: row.state as LabelCodeState,
    assignedAt: row.assigned_at,
    assetId: row.intake_asset_id,
    identifierId: row.asset_identifier_id,
    voidReason: row.void_reason,
    createdAt: row.created_at,
  };
}

// ── Batches ─────────────────────────────────────────────────────────────────

export async function createLabelBatch(args: {
  organizationId: string;
  templateId: string;
  requestedCount: number;
  codePrefix?: string | null;
  purpose?: string | null;
}): Promise<LabelBatch> {
  const { data, error } = await labelsDb()
    .from("label_batch")
    .insert({
      organization_id: args.organizationId,
      template_id: args.templateId,
      requested_count: args.requestedCount,
      code_prefix: args.codePrefix?.trim() || null,
      purpose: args.purpose?.trim() || null,
      state: "open",
      visibility: "internal",
    })
    .select(BATCH_COLUMNS)
    .single();
  if (error) throw error;
  return toBatch(data as BatchRow);
}

export async function loadLabelBatch(
  batchId: string,
): Promise<LabelBatch | null> {
  const { data, error } = await labelsDb()
    .from("label_batch")
    .select(BATCH_COLUMNS)
    .eq("id", batchId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toBatch(data as BatchRow) : null;
}

/** The org's batches, newest first — one page for the entity-list shell. */
export async function fetchLabelBatchPage(args: {
  organizationId: string;
  search: string;
  page: number;
  pageSize: number;
  sort: string;
  ascending: boolean;
  states?: string[];
}): Promise<{ rows: LabelBatchListRow[]; total: number }> {
  const sortable = new Set([
    "created_at",
    "state",
    "template_id",
    "requested_count",
    "printed_at",
    "purpose",
  ]);
  let q = labelsDb()
    .from("label_batch")
    .select(BATCH_COLUMNS, { count: "exact" })
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null);
  if (args.states && args.states.length > 0) q = q.in("state", args.states);
  const search = args.search.trim();
  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim();
    if (term) {
      q = q.or(`purpose.ilike.%${term}%,code_prefix.ilike.%${term}%`);
    }
  }
  q = q.order(sortable.has(args.sort) ? args.sort : "created_at", {
    ascending: args.ascending,
  });
  const from = (args.page - 1) * args.pageSize;
  q = q.range(from, from + args.pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: ((data ?? []) as BatchRow[]).map((r) => ({
      id: r.id,
      template_id: r.template_id,
      requested_count: r.requested_count,
      code_prefix: r.code_prefix,
      purpose: r.purpose,
      state: r.state,
      printed_at: r.printed_at,
      created_at: r.created_at,
    })),
    total: count ?? 0,
  };
}

/** The batch's open batches for pickers (Print label on an asset). */
export async function listOpenLabelBatches(
  organizationId: string,
): Promise<LabelBatch[]> {
  const { data, error } = await labelsDb()
    .from("label_batch")
    .select(BATCH_COLUMNS)
    .eq("organization_id", organizationId)
    .in("state", ["open", "printed"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as BatchRow[]).map(toBatch);
}

/** EVERY code of a batch, mint order — complete by contract (`readAllRows`):
 *  printing and void/exhaust decisions read this list as the whole truth. */
export async function listBatchCodes(batchId: string): Promise<LabelCode[]> {
  const rows = await readAllRows<CodeRow>(
    ({ from, to }) =>
      labelsDb()
        .from("label_code")
        .select(CODE_COLUMNS, { count: "exact" })
        .eq("label_batch_id", batchId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "commerce.label_code" },
  );
  return rows.map(toCode);
}

/**
 * Derive what a batch's state SHOULD be from its codes (mission: batch state
 * is auto-derived, never hand-managed): void stays void; every code
 * assigned/void → exhausted; printed_at stamped → printed; else open.
 */
export function deriveBatchState(
  batch: LabelBatch,
  codes: LabelCode[],
): LabelBatchState {
  if (batch.state === "void") return "void";
  const hasCodes = codes.length > 0;
  const available = codes.filter((c) => c.state === "available").length;
  if (hasCodes && available === 0) return "exhausted";
  if (batch.printedAt) return "printed";
  return "open";
}

/** Stamp the derived state when it drifted (best-effort reconcile-on-read). */
export async function reconcileBatchState(
  batch: LabelBatch,
  codes: LabelCode[],
): Promise<LabelBatch> {
  const derived = deriveBatchState(batch, codes);
  if (derived === batch.state) return batch;
  const { data, error } = await labelsDb()
    .from("label_batch")
    .update({ state: derived, version: batch.version + 1 })
    .eq("id", batch.id)
    .eq("version", batch.version)
    .select(BATCH_COLUMNS)
    .maybeSingle();
  if (error || !data) return { ...batch, state: derived };
  return toBatch(data as BatchRow);
}

/** Mark the run printed (idempotent; keeps the first printed_at). */
export async function markBatchPrinted(batch: LabelBatch): Promise<LabelBatch> {
  if (batch.printedAt) return batch;
  const { data, error } = await labelsDb()
    .from("label_batch")
    .update({
      printed_at: new Date().toISOString(),
      state: batch.state === "open" ? "printed" : batch.state,
      version: batch.version + 1,
    })
    .eq("id", batch.id)
    .is("printed_at", null)
    .select(BATCH_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toBatch(data as BatchRow) : batch;
}

/** Void a whole batch (its remaining available codes go with it). */
export async function voidBatch(
  batch: LabelBatch,
  reason: string,
): Promise<void> {
  const { error } = await labelsDb()
    .from("label_code")
    .update({ state: "void", void_reason: reason })
    .eq("label_batch_id", batch.id)
    .eq("state", "available");
  if (error) throw error;
  const { error: batchError } = await labelsDb()
    .from("label_batch")
    .update({ state: "void", version: batch.version + 1 })
    .eq("id", batch.id);
  if (batchError) throw batchError;
}

// ── Minting ─────────────────────────────────────────────────────────────────

const MINT_CHUNK = 500;

/**
 * Mint `n` pooled codes into a batch. Values come from the confusable-free
 * alphabet (codes.ts); org-scoped uniqueness is the DB's unique index — on a
 * 23505 violation (astronomically rare at ~69 bits, but a prefix typo or a
 * replay can produce one) the whole chunk retries with fresh values.
 */
export async function mintLabelCodes(
  batch: LabelBatch,
  n: number,
): Promise<LabelCode[]> {
  const minted: LabelCode[] = [];
  let remaining = n;
  while (remaining > 0) {
    const size = Math.min(MINT_CHUNK, remaining);
    let lastError: unknown = null;
    let inserted: LabelCode[] | null = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const rows = Array.from({ length: size }, () => ({
        label_batch_id: batch.id,
        organization_id: batch.organizationId,
        value: generateCodeValue(batch.codePrefix),
        state: "available",
      }));
      const { data, error } = await labelsDb()
        .from("label_code")
        .insert(rows)
        .select(CODE_COLUMNS);
      if (!error) {
        inserted = ((data ?? []) as CodeRow[]).map(toCode);
        break;
      }
      lastError = error;
      // 23505 = unique violation — regenerate and retry; anything else throws.
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    if (!inserted) throw lastError;
    minted.push(...inserted);
    remaining -= size;
  }
  return minted;
}

// ── Reverse lookup + claim-on-scan ──────────────────────────────────────────

/**
 * The asset a live identifier value points at, if any — deterministic thanks
 * to the (org, kind, value) live unique index. Searches ALL identifier kinds:
 * a typed serial or a legacy QR string reverse-resolves the same way.
 */
export async function findAssetIdByIdentifier(
  organizationId: string,
  value: string,
): Promise<string | null> {
  const { data, error } = await createClient()
    .schema("commerce")
    .from("asset_identifier")
    .select("intake_asset_id, identifier_kind")
    .eq("organization_id", organizationId)
    .eq("value", value)
    .is("replaced_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { intake_asset_id: string } | null)?.intake_asset_id ?? null;
}

/** The pooled code row carrying this exact value, if any. */
export async function findLabelCode(
  organizationId: string,
  value: string,
): Promise<LabelCode | null> {
  const { data, error } = await labelsDb()
    .from("label_code")
    .select(CODE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("value", value)
    .maybeSingle();
  if (error) throw error;
  return data ? toCode(data as CodeRow) : null;
}

/**
 * Resolve a NORMALIZED scanned value (see codes.ts) to what it names — the
 * claim-on-scan decision input. Precedence: a live identifier row wins (the
 * code is in use, whatever its pool row says), then the pool row, then unknown.
 */
export async function resolveScannedValue(
  organizationId: string,
  value: string,
): Promise<ScanResolution> {
  const [assetId, code] = await Promise.all([
    findAssetIdByIdentifier(organizationId, value),
    findLabelCode(organizationId, value),
  ]);
  if (assetId) return { type: "asset", assetId };
  if (code) {
    if (code.state === "void") return { type: "void" };
    if (code.state === "assigned" && code.assetId) {
      // Assigned but its identifier row was replaced/lost — still that asset.
      return { type: "asset", assetId: code.assetId };
    }
    if (code.state === "available") return { type: "pooled", code };
    return { type: "void" };
  }
  return { type: "unknown" };
}

/**
 * Claim a pooled code for an asset — the stamp half of claim-on-scan. The
 * `our_qr` identifier row is written by the CALLER (the intake session / the
 * print dialog own identifier semantics); this function moves the code
 * `available → assigned` with a state-guarded update, then back-links the
 * identifier row it can now find via the live unique index (best-effort).
 *
 * Returns false when the guard lost — someone else claimed the code first.
 */
export async function claimLabelCode(
  code: LabelCode,
  assetId: string,
): Promise<boolean> {
  const { data, error } = await labelsDb()
    .from("label_code")
    .update({
      state: "assigned",
      assigned_at: new Date().toISOString(),
      intake_asset_id: assetId,
    })
    .eq("id", code.id)
    .eq("state", "available")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;
  // Back-link the identifier row (deterministic via the live unique index).
  try {
    const { data: identifier } = await createClient()
      .schema("commerce")
      .from("asset_identifier")
      .select("id")
      .eq("organization_id", code.organizationId)
      .eq("identifier_kind", "our_qr")
      .eq("value", code.value)
      .is("replaced_at", null)
      .maybeSingle();
    const identifierId = (identifier as { id: string } | null)?.id;
    if (identifierId) {
      await labelsDb()
        .from("label_code")
        .update({ asset_identifier_id: identifierId })
        .eq("id", code.id);
    }
  } catch {
    // The claim itself stands; the back-link is a convenience column.
  }
  return true;
}

/** The oldest still-available code in a batch (the pick-from-pool path). */
export async function firstAvailableCode(
  batchId: string,
): Promise<LabelCode | null> {
  const { data, error } = await labelsDb()
    .from("label_code")
    .select(CODE_COLUMNS)
    .eq("label_batch_id", batchId)
    .eq("state", "available")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toCode(data as CodeRow) : null;
}

/** Available-code counts for many batches at once (the batch picker). */
export async function countAvailableCodes(
  batchIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (batchIds.length === 0) return map;
  const rows = await readAllRows<{ label_batch_id: string }>(
    ({ from, to }) =>
      labelsDb()
        .from("label_code")
        .select("label_batch_id", { count: "exact" })
        .in("label_batch_id", batchIds)
        .eq("state", "available")
        .range(from, to),
    { label: "commerce.label_code availability" },
  );
  for (const row of rows) {
    map.set(row.label_batch_id, (map.get(row.label_batch_id) ?? 0) + 1);
  }
  return map;
}

/** Release a claim that could not complete (identifier write failed after the
 *  code was stamped) — never strand a code half-assigned. */
export async function releaseLabelCode(codeId: string): Promise<void> {
  const { error } = await labelsDb()
    .from("label_code")
    .update({
      state: "available",
      assigned_at: null,
      intake_asset_id: null,
      asset_identifier_id: null,
    })
    .eq("id", codeId)
    .eq("state", "assigned");
  if (error) throw error;
}

/** Void specific codes (damaged sheet, lost labels). Available codes only —
 *  an assigned code is an asset's identity and is retired through the
 *  identifier replacement lifecycle instead. */
export async function voidCodes(
  codeIds: string[],
  reason: string,
): Promise<number> {
  if (codeIds.length === 0) return 0;
  const { data, error } = await labelsDb()
    .from("label_code")
    .update({ state: "void", void_reason: reason })
    .in("id", codeIds)
    .eq("state", "available")
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}

// ── Conversion import (client_ref / asset_tag) ──────────────────────────────

/**
 * Find assets by existing identifier values, in bulk (the CSV import's match
 * step). Returns value → assetId for LIVE identifiers of the given kind.
 */
export async function matchAssetsByIdentifier(
  organizationId: string,
  kind: string,
  values: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await createClient()
      .schema("commerce")
      .from("asset_identifier")
      .select("value, intake_asset_id")
      .eq("organization_id", organizationId)
      .eq("identifier_kind", kind)
      .is("replaced_at", null)
      .in("value", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as {
      value: string;
      intake_asset_id: string;
    }[]) {
      map.set(row.value, row.intake_asset_id);
    }
  }
  return map;
}
