/**
 * features/commerce-intake/labels/printers/service.ts
 *
 * Persistence for printer certification — direct Supabase against
 * `commerce.certified_printer` (data-flow rule: plain row reads/writes never
 * route through the Python server).
 *
 * Org discipline: every INSERT carries an EXPLICIT `organization_id` handed in
 * by the caller from the active org context — no resolver, no fallback
 * (no-db-assigned-org doctrine).
 *
 * A re-check UPDATES the existing row rather than stacking a second one: the
 * live unique index `certified_printer_org_model_template_live_uq` makes a
 * duplicate (org, make, model, stock) unrepresentable while both are live.
 */

import { createClient } from "@/utils/supabase/client";

import {
  type CertificationResultNotes,
  type CertificationStatus,
  type CertifiedPrinter,
  type CertifiedPrinterListRow,
  type CertifiedPrinterRow,
} from "./types";

function db() {
  return createClient().schema("commerce");
}

const COLUMNS =
  "id, organization_id, printer_make, printer_model, connection_note, template_id, status, certified_by, certified_at, result_notes, created_at, version";

type Row = Pick<
  CertifiedPrinterRow,
  | "id"
  | "organization_id"
  | "printer_make"
  | "printer_model"
  | "connection_note"
  | "template_id"
  | "status"
  | "certified_by"
  | "certified_at"
  | "result_notes"
  | "created_at"
  | "version"
>;

function toPrinter(row: Row): CertifiedPrinter {
  return {
    id: row.id,
    organizationId: row.organization_id,
    printerMake: row.printer_make,
    printerModel: row.printer_model,
    connectionNote: row.connection_note,
    templateId: row.template_id,
    status: row.status as CertificationStatus,
    certifiedBy: row.certified_by,
    certifiedAt: row.certified_at,
    resultNotes: (row.result_notes as CertificationResultNotes | null) ?? null,
    createdAt: row.created_at,
    version: row.version,
  };
}

export async function loadCertifiedPrinter(
  id: string,
): Promise<CertifiedPrinter | null> {
  const { data, error } = await db()
    .from("certified_printer")
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPrinter(data as Row) : null;
}

/** The live row for this exact (org, make, model, stock), if one exists. */
export async function findCertifiedPrinter(args: {
  organizationId: string;
  printerMake: string;
  printerModel: string;
  templateId: string;
}): Promise<CertifiedPrinter | null> {
  const { data, error } = await db()
    .from("certified_printer")
    .select(COLUMNS)
    .eq("organization_id", args.organizationId)
    .eq("printer_make", args.printerMake)
    .eq("printer_model", args.printerModel)
    .eq("template_id", args.templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPrinter(data as Row) : null;
}

const SORTABLE = new Set([
  "printer_make",
  "printer_model",
  "connection_note",
  "template_id",
  "status",
  "certified_at",
  "created_at",
]);

/** Relative-bucket date filters (DATE_FILTER_OPTIONS) → an ISO floor. */
function bucketFloor(bucket: string): string | null {
  const hours: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90,
    "1y": 24 * 365,
  };
  const h = hours[bucket];
  if (!h) return null;
  return new Date(Date.now() - h * 3600_000).toISOString();
}

/** The widest bucket wins when several are selected (an OR of "since X"). */
function widestFloor(buckets: string[]): string | null {
  const floors = buckets
    .map(bucketFloor)
    .filter((v): v is string => v !== null)
    .sort();
  return floors[0] ?? null;
}

export interface CertifiedPrinterPageArgs {
  organizationId: string;
  search: string;
  page: number;
  pageSize: number;
  sort: string;
  ascending: boolean;
  makeContains?: string;
  modelContains?: string;
  connectionContains?: string;
  statuses?: string[];
  templateIds?: string[];
  certifiedBuckets?: string[];
  createdBuckets?: string[];
}

export async function fetchCertifiedPrinterPage(
  args: CertifiedPrinterPageArgs,
): Promise<{ rows: CertifiedPrinterListRow[]; total: number }> {
  let q = db()
    .from("certified_printer")
    .select(COLUMNS, { count: "exact" })
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null);

  const like = (value: string) => `%${value.replace(/[%_,()]/g, " ").trim()}%`;

  const search = args.search.trim();
  if (search) {
    const term = search.replace(/[%_,()]/g, " ").trim();
    if (term) {
      q = q.or(
        `printer_make.ilike.%${term}%,printer_model.ilike.%${term}%,connection_note.ilike.%${term}%,template_id.ilike.%${term}%`,
      );
    }
  }
  if (args.makeContains?.trim())
    q = q.ilike("printer_make", like(args.makeContains));
  if (args.modelContains?.trim())
    q = q.ilike("printer_model", like(args.modelContains));
  if (args.connectionContains?.trim())
    q = q.ilike("connection_note", like(args.connectionContains));
  if (args.statuses && args.statuses.length > 0)
    q = q.in("status", args.statuses);
  if (args.templateIds && args.templateIds.length > 0)
    q = q.in("template_id", args.templateIds);
  if (args.certifiedBuckets && args.certifiedBuckets.length > 0) {
    const floor = widestFloor(args.certifiedBuckets);
    if (floor) q = q.gte("certified_at", floor);
  }
  if (args.createdBuckets && args.createdBuckets.length > 0) {
    const floor = widestFloor(args.createdBuckets);
    if (floor) q = q.gte("created_at", floor);
  }

  q = q.order(SORTABLE.has(args.sort) ? args.sort : "created_at", {
    ascending: args.ascending,
  });
  const from = (args.page - 1) * args.pageSize;
  q = q.range(from, from + args.pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      printer_make: r.printer_make,
      printer_model: r.printer_model,
      connection_note: r.connection_note,
      template_id: r.template_id,
      status: r.status,
      certified_at: r.certified_at,
      created_at: r.created_at,
    })),
    total: count ?? 0,
  };
}

// ── The verdict write ───────────────────────────────────────────────────────

export interface RecordCertificationArgs {
  /** EXPLICIT, from the active org context — never resolved or defaulted. */
  organizationId: string;
  /** The admin who physically looked at the page. */
  certifiedBy: string;
  printerMake: string;
  printerModel: string;
  connectionNote: string | null;
  templateId: string;
  status: CertificationStatus;
  resultNotes: CertificationResultNotes;
  /** Set when re-checking a known row — that row is updated, never duplicated. */
  existingId?: string;
}

/**
 * Write the verdict. A certified/failed row always stamps `certified_at` +
 * `certified_by` (the CHECK requires both for 'certified'; a failure records
 * who tested it too — a failed attempt with no author is unactionable).
 */
export async function recordCertification(
  args: RecordCertificationArgs,
): Promise<CertifiedPrinter> {
  const now = new Date().toISOString();
  const values = {
    printer_make: args.printerMake,
    printer_model: args.printerModel,
    connection_note: args.connectionNote,
    template_id: args.templateId,
    status: args.status,
    certified_by: args.certifiedBy,
    certified_at: now,
    result_notes: args.resultNotes,
  };

  const targetId =
    args.existingId ??
    (
      await findCertifiedPrinter({
        organizationId: args.organizationId,
        printerMake: args.printerMake,
        printerModel: args.printerModel,
        templateId: args.templateId,
      })
    )?.id;

  if (targetId) {
    const { data, error } = await db()
      .from("certified_printer")
      .update(values)
      .eq("id", targetId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return toPrinter(data as Row);
  }

  const { data, error } = await db()
    .from("certified_printer")
    .insert({
      ...values,
      organization_id: args.organizationId,
      visibility: "internal",
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toPrinter(data as Row);
}

/** Mark a certification stale — the re-check entry point from the list. */
export async function markNeedsRecheck(id: string): Promise<void> {
  const { error } = await db()
    .from("certified_printer")
    .update({ status: "needs_recheck" })
    .eq("id", id);
  if (error) throw error;
}

/** Soft delete (the table carries `deleted_at`; we never hard-delete). */
export async function deleteCertifiedPrinter(id: string): Promise<void> {
  const { error } = await db()
    .from("certified_printer")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
