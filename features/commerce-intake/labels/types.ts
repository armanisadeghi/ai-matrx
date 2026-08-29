/**
 * features/commerce-intake/labels/types.ts
 *
 * The label pool: `commerce.label_batch` (a print run) + `commerce.label_code`
 * (one pooled code, minted before it names anything). Applied live + certified
 * 2026-08-29 (migrations/commerce_label_pool_2026_08_29.sql).
 *
 * ROW TYPES ARE HAND-DECLARED against the live columns (verified 2026-08-29)
 * because this session cannot run `pnpm db-types` (no Supabase CLI access
 * token in the environment). Same precedent as this feature's W4 initial
 * build. The next credentialed session that regenerates
 * `types/database.types.ts` should repoint these aliases at
 * `Database["commerce"]["Tables"]` and delete the hand twins + the cast in
 * `labels/service.ts` (see its `labelsDb()` note).
 */

import type { ListScopeKind } from "@/lib/list-scope/types";

// ── Enumerations (live CHECK constraints, verified 2026-08-29) ──────────────

export type LabelBatchState = "open" | "printed" | "exhausted" | "void";
export type LabelCodeState = "available" | "assigned" | "void";

// ── Hand-declared row twins (see header) ────────────────────────────────────

export interface LabelBatchRow {
  id: string;
  template_id: string;
  requested_count: number;
  code_prefix: string | null;
  purpose: string | null;
  state: string;
  printed_at: string | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  metadata: Record<string, unknown>;
  visibility: string;
}

export interface LabelCodeRow {
  id: string;
  label_batch_id: string;
  value: string;
  state: string;
  assigned_at: string | null;
  intake_asset_id: string | null;
  asset_identifier_id: string | null;
  void_reason: string | null;
  organization_id: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  metadata: Record<string, unknown>;
}

// ── UI shapes ───────────────────────────────────────────────────────────────

export interface LabelBatch {
  id: string;
  organizationId: string;
  templateId: string;
  requestedCount: number;
  codePrefix: string | null;
  purpose: string | null;
  state: LabelBatchState;
  printedAt: string | null;
  createdAt: string;
  version: number;
}

export interface LabelCode {
  id: string;
  batchId: string;
  organizationId: string;
  value: string;
  state: LabelCodeState;
  assignedAt: string | null;
  assetId: string | null;
  identifierId: string | null;
  voidReason: string | null;
  createdAt: string;
}

/** The batches list row (the EntityListPage shell's TRow). */
export interface LabelBatchListRow {
  id: string;
  template_id: string;
  requested_count: number;
  code_prefix: string | null;
  purpose: string | null;
  state: string;
  printed_at: string | null;
  created_at: string;
}

/** Org register: the one scope this surface answers truthfully ("what does
 *  my team have?"); the effective org narrows the declared query. */
export const LABEL_BATCH_LIST_SCOPES: ListScopeKind[] = ["orgs"];

export function labelBatchHref(row: Pick<LabelBatchListRow, "id">): string {
  return `/commerce/labels/${row.id}`;
}

/** What a scanned value resolved to — the claim-on-scan decision input. */
export type ScanResolution =
  | { type: "asset"; assetId: string }
  | { type: "pooled"; code: LabelCode }
  | { type: "void" }
  | { type: "unknown" };
