/**
 * features/hr/exports/service.ts — THE ONE DOOR to the payroll-export lane (L13).
 *
 * Thin, typed wrappers over the nine frozen export operations (SPEC-CONTRACTS §3.5 / §4) plus the
 * one history read. **No business logic lives here.** Nothing in this file decides whether an
 * export may be superseded, what a state means, or what a number should be — those are the
 * server's, and a rule re-implemented in a browser is a rule that will drift from the one that
 * actually runs.
 *
 * 🚨 NO CLIENT COMPUTES MONEY OR HOURS. Every figure below arrives as a DECIMAL STRING and is
 * carried, formatted and displayed as one. Parsing `total_amount` into a JS number to add,
 * compare or re-format it is a defect: binary floating point cannot represent 241880.12, and the
 * one place that error is unacceptable is the file payroll is about to pay people from.
 *
 * 🚨 THE IDEMPOTENCY RULE, WHICH IS THE WHOLE POINT (§1.4). Every mutating POST carries
 * `X-Idempotency-Key`, minted ONCE PER USER INTENT by {@link newExportIntentKey} and REUSED across
 * every retry of that intent. A fresh key on retry is not weaker idempotency, it is none — and on
 * this family it is how a payroll file is generated, sent, and paid twice.
 */

"use client";

import {
  hrApiGet,
  hrApiPost,
  hrBuildPath,
  type HrRequestOptions,
} from "@/lib/api/hr-contract-client";
import { supabase } from "@/utils/supabase/client";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { HR_EXPORT_HISTORY_FIXTURES } from "./mock/history";
import type {
  AsyncAccepted,
  ExportAcknowledgeBody,
  ExportAcknowledgeResult,
  ExportEnvelope,
  ExportFailBody,
  ExportFailResult,
  ExportFormat,
  ExportPreviewBody,
  ExportPreviewResult,
  ExportSupersedeBody,
  PayrollExportCreateBody,
  PayrollExportListResult,
  PayrollExportRead,
  TimesheetExportCreateBody,
} from "./types";

/** Options every call in this lane accepts. */
export interface ExportServiceOptions extends HrRequestOptions {
  mockCase?: HrFixtureCase;
}

// ---------------------------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------------------------

/**
 * Mint the transport idempotency key for ONE user intent.
 *
 * Hold the returned value for the lifetime of the intent and pass the SAME string to every
 * attempt — the first try, the retry after a timeout, the retry after the user clicks again. The
 * server replays the stored outcome verbatim for a repeat key; a different key with the same body
 * is a second, real request.
 */
export function newExportIntentKey(): string {
  return crypto.randomUUID();
}

/**
 * The DOMAIN idempotency key `POST /hr/exports/payroll` takes in its BODY — distinct from the
 * transport header above, and unique on `(organization_id, idempotency_key)`.
 *
 * §1.4 / §4.4 spell it `payperiod:<pay_period_id>:v1`, and that spelling is frozen. The
 * consequence is deliberate and worth stating plainly: a second generate for the same period
 * REPLAYS the first export rather than producing a second one. Regeneration is not a second
 * generate — it is `POST /hr/exports/{id}/supersede`, which is the only path that increments
 * `export_version`, and that asymmetry is what stops a period being exported twice and paid twice.
 */
export function payrollExportDomainKey(payPeriodId: string): string {
  return `payperiod:${payPeriodId}:v1`;
}

// ---------------------------------------------------------------------------------------------
// E-18 — the format registry
// ---------------------------------------------------------------------------------------------

/**
 * `GET /hr/exports/formats`. The registry, so no client ever hard-codes a format list — including
 * which of them are `available` and which identifiers each `requires_mapping`.
 */
export async function listExportFormats(
  opts?: ExportServiceOptions,
): Promise<ExportFormat[]> {
  const { data } = await hrApiGet("/hr/exports/formats", opts);
  return data.formats;
}

// ---------------------------------------------------------------------------------------------
// E-19 / E-20 / E-21 — preview and generate
// ---------------------------------------------------------------------------------------------

/**
 * `POST /hr/exports/payroll/preview` — SYNCHRONOUS, and it creates no `hr.payroll_export` row.
 * It is a separate endpoint precisely so that LOOKING IS NOT AN ACT WITH A RECORD, which is also
 * why it carries no idempotency key: there is nothing to replay.
 */
export async function previewPayrollExport(
  body: ExportPreviewBody,
  opts?: ExportServiceOptions,
): Promise<ExportPreviewResult> {
  const { data } = await hrApiPost("/hr/exports/payroll/preview", body, opts);
  return data;
}

/** `POST /hr/exports/payroll` — async. Returns the §1.5 runtime reference, not the export. */
export async function createPayrollExport(
  body: PayrollExportCreateBody,
  idempotencyKey: string,
  opts?: ExportServiceOptions,
): Promise<AsyncAccepted> {
  const { data } = await hrApiPost("/hr/exports/payroll", body, {
    ...opts,
    idempotencyKey,
  });
  return data;
}

/**
 * `POST /hr/exports/timesheet` — the human-readable sibling. It writes an `hr.access_audit` row
 * and creates NO `hr.payroll_export` row: it is a report, not a payroll artifact, and conflating
 * the two would let a report supersede a payroll file.
 */
export async function createTimesheetExport(
  body: TimesheetExportCreateBody,
  idempotencyKey: string,
  opts?: ExportServiceOptions,
): Promise<AsyncAccepted> {
  const { data } = await hrApiPost("/hr/exports/timesheet", body, {
    ...opts,
    idempotencyKey,
  });
  return data;
}

// ---------------------------------------------------------------------------------------------
// E-22 / E-23 — read and artifact
// ---------------------------------------------------------------------------------------------

/** `GET /hr/exports/{export_id}`. */
export async function getExport(
  exportId: string,
  opts?: ExportServiceOptions,
): Promise<PayrollExportRead> {
  const { data } = await hrApiGet(
    hrBuildPath("/hr/exports/{export_id}", { export_id: exportId }),
    opts,
  );
  return data;
}

/**
 * `GET /hr/exports/{export_id}/artifact` — returns the URL ENVELOPE, never bytes.
 *
 * 🚨 Only `file_id` and `sha256` may be persisted from the result. `download_url`, `signed_url`,
 * `cdn_url` and `expires_at` are a handoff, not an identity (the platform's `_durable_only` rule):
 * storing an expiring URL produces a link that works in review and is dead in production.
 */
export async function getExportArtifact(
  exportId: string,
  opts?: ExportServiceOptions,
): Promise<ExportEnvelope> {
  const { data } = await hrApiGet(
    hrBuildPath("/hr/exports/{export_id}/artifact", { export_id: exportId }),
    opts,
  );
  return data;
}

// ---------------------------------------------------------------------------------------------
// E-24 / E-25 / E-26 — the §4.5 state machine
// ---------------------------------------------------------------------------------------------

/** `POST /hr/exports/{export_id}/acknowledge`. `acknowledgement_ref` is theirs, opaque to us. */
export async function acknowledgeExport(
  exportId: string,
  body: ExportAcknowledgeBody,
  idempotencyKey: string,
  opts?: ExportServiceOptions,
): Promise<ExportAcknowledgeResult> {
  const { data } = await hrApiPost(
    hrBuildPath("/hr/exports/{export_id}/acknowledge", {
      export_id: exportId,
    }),
    body,
    { ...opts, idempotencyKey },
  );
  return data;
}

/** `POST /hr/exports/{export_id}/fail`. Failure is recorded, not swallowed. */
export async function failExport(
  exportId: string,
  body: ExportFailBody,
  idempotencyKey: string,
  opts?: ExportServiceOptions,
): Promise<ExportFailResult> {
  const { data } = await hrApiPost(
    hrBuildPath("/hr/exports/{export_id}/fail", { export_id: exportId }),
    body,
    { ...opts, idempotencyKey },
  );
  return data;
}

/**
 * `POST /hr/exports/{export_id}/supersede` — async; generates a NEW export at
 * `export_version = n+1` with `supersedes_export_id` pointing back.
 *
 * 🚨 An `acknowledged` export can never be superseded, regenerated or re-sent — the server answers
 * `409 hr_export_already_acknowledged`. Once payroll has taken the file, the only correction path
 * is an `hr.time_adjustment` that lands in the NEXT export, tagged to the original period. A
 * re-export double-pays. The surface must state this BEFORE the click, not discover it in a 409.
 */
export async function supersedeExport(
  exportId: string,
  body: ExportSupersedeBody,
  idempotencyKey: string,
  opts?: ExportServiceOptions,
): Promise<AsyncAccepted> {
  const { data } = await hrApiPost(
    hrBuildPath("/hr/exports/{export_id}/supersede", { export_id: exportId }),
    body,
    { ...opts, idempotencyKey },
  );
  return data;
}

// ---------------------------------------------------------------------------------------------
// The history read — RPC, not a table read
// ---------------------------------------------------------------------------------------------

/**
 * `public.hr_payroll_export_list` — the export history.
 *
 * 🚨 NOT A TABLE READ. `hr` is not exposed to PostgREST, so a browser client pointed at that
 * schema answers PGRST106 and reaches nothing. This `SECURITY DEFINER` reader in `public` is the
 * only client-reachable door.
 *
 * 🚨 A `granted:false` RESULT IS RETURNED, NOT THROWN, AND IT IS NOT AN EMPTY LIST. The caller
 * must render the refusal by name ("you need the payroll.read capability"). Collapsing a denial
 * into "no exports yet" tells a payroll administrator their permissions are fine when they are
 * not, and that is how a period silently never gets exported.
 */
export async function listPayrollExports(args: {
  organizationId: string;
  payPeriodId?: string | null;
  limit?: number;
  mockCase?: HrFixtureCase;
}): Promise<PayrollExportListResult> {
  if (HR_MOCK_ENABLED) {
    return HR_EXPORT_HISTORY_FIXTURES[args.mockCase ?? "happy"];
  }

  const { data, error } = await supabase.rpc("hr_payroll_export_list", {
    p_organization_id: args.organizationId,
    p_pay_period_id: args.payPeriodId ?? undefined,
    p_limit: args.limit ?? 100,
  });

  if (error) {
    throw new Error(
      `hr_payroll_export_list failed: ${error.message}${error.hint ? ` (${error.hint})` : ""}`,
    );
  }
  return data as unknown as PayrollExportListResult;
}
