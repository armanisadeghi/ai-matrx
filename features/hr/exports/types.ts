/**
 * features/hr/exports/types.ts — the payroll-export lane's contract types (lane L13).
 *
 * 🚨 EVERY HTTP SHAPE HERE IS *DERIVED* FROM `types/python-generated/hr-contracts.api-types.ts`,
 * NEVER HAND-COPIED. That generated file is produced from `aidream/hr-contracts.openapi.json` —
 * the hand-written stub of SPEC-CONTRACTS §6.3 — and the whole point of the stub is step 4: when
 * the real handlers land, the stub entries are deleted, `/schema/all` takes over, and a shape that
 * changed makes this file's consumers go RED. **That red build is the contract-drift detector.**
 * A hand-typed interface here would silently absorb the drift and destroy the signal, so a
 * transcribed shape is a defect even when it is transcribed correctly.
 *
 * WHAT IS HAND-WRITTEN, AND WHY IT HAS TO BE
 * ------------------------------------------
 * One thing: {@link PayrollExportHistoryRow}. The export-history list is NOT an HTTP operation —
 * the `hr` schema is not exposed to PostgREST, so the list is read through the `SECURITY DEFINER`
 * reader `public.hr_payroll_export_list`, whose generated signature returns bare `Json`. There is
 * no generated row type to derive from. It is marked and dated below; when that RPC gains a
 * typed return, this shape gets replaced rather than reconciled.
 */

import type {
  components,
  operations,
} from "@/types/python-generated/hr-contracts.api-types";

// ---------------------------------------------------------------------------------------------
// Derivation helpers — one place that knows how openapi-typescript spells things.
// ---------------------------------------------------------------------------------------------

type Ok200<O> = O extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : never;

type JsonBody<O> = O extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

// ---------------------------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------------------------

/** One row of the §4.3 format registry. `available:false` rows carry their reason in `notes`. */
export type ExportFormat = components["schemas"]["ExportFormat"];

/** The `export_format` closed set (SPEC-DATA-MODEL §7.8). A seventh is a schema change. */
export type ExportFormatKey = ExportFormat["key"];

/**
 * §3.5 / E-23: the artifact is a URL ENVELOPE, never bytes.
 * 🚨 Only `file_id` and `sha256` are safe to persist — the URLs expire (`_durable_only`).
 */
export type ExportEnvelope = components["schemas"]["ExportEnvelope"];

/** The §1.3 error envelope every HR failure arrives in. */
export type HrErrorBody = components["schemas"]["HrError"];

/** The §1.5 runtime reference a 202 answers with. */
export type AsyncAccepted = components["schemas"]["AsyncAccepted"];

// ---------------------------------------------------------------------------------------------
// Operation shapes (the nine frozen export operations)
// ---------------------------------------------------------------------------------------------

/** E-18 `GET /hr/exports/formats`. */
export type ExportFormatsResult = Ok200<operations["hr_exports_formats_list"]>;

/** E-19 `POST /hr/exports/payroll/preview` — synchronous, creates NO row. */
export type ExportPreviewBody = JsonBody<
  operations["hr_exports_payroll_preview"]
>;
export type ExportPreviewResult = Ok200<
  operations["hr_exports_payroll_preview"]
>;

/** E-20 `POST /hr/exports/payroll` — async, 202 + the runtime reference. */
export type PayrollExportCreateBody = JsonBody<
  operations["hr_exports_payroll_create"]
>;

/** E-21 `POST /hr/exports/timesheet` — a REPORT, not a payroll artifact. */
export type TimesheetExportCreateBody = JsonBody<
  operations["hr_exports_timesheet_create"]
>;

/** E-22 `GET /hr/exports/{export_id}`. */
export type PayrollExportRead = Ok200<operations["hr_exports_get"]>;

/** The §4.5 delivery-state machine: `generated → sent → acknowledged`, `failed`/`superseded` exit. */
export type ExportDeliveryState = PayrollExportRead["delivery_state"];

/** E-24 acknowledge. `acknowledgement_ref` is the receiving system's, opaque to us. */
export type ExportAcknowledgeBody = JsonBody<
  operations["hr_exports_acknowledge"]
>;
export type ExportAcknowledgeResult = Ok200<
  operations["hr_exports_acknowledge"]
>;

/** E-25 fail. Failure is RECORDED, not swallowed. */
export type ExportFailBody = JsonBody<operations["hr_exports_fail"]>;
export type ExportFailResult = Ok200<operations["hr_exports_fail"]>;

/** E-26 supersede — async; generates a NEW export at `export_version = n+1`. */
export type ExportSupersedeBody = JsonBody<operations["hr_exports_supersede"]>;

// ---------------------------------------------------------------------------------------------
// The history read — the ONE hand-written shape, and why
// ---------------------------------------------------------------------------------------------

/**
 * One row of `public.hr_payroll_export_list`.
 *
 * HAND-WRITTEN, verified against the reader's projection 2026-08-26. `hr` is not exposed to
 * PostgREST (a browser client pointed there answers PGRST106), so this list cannot be a table read; the
 * `SECURITY DEFINER` reader in `public` is the only client-reachable door, and its generated
 * signature returns `Json`. Replace this shape the day the RPC returns a typed row — do not
 * reconcile the two.
 */
export interface PayrollExportHistoryRow {
  export_id: string;
  pay_period_id: string;
  period_start_on: string;
  period_end_on: string;
  pay_period_state: string;
  export_format: string;
  export_version: number;
  delivery_state: ExportDeliveryState;
  line_count: number;
  /** Decimal STRING. Never a float — precision is load-bearing. */
  total_hours: string;
  /** Decimal string, or null where the format carries no money. */
  total_amount: string | null;
  artifact_file_id: string | null;
  artifact_sha256: string | null;
  supersedes_export_id: string | null;
  acknowledgement_ref: string | null;
  acknowledged_at: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  includes_adjustment_ids: string[];
  generated_at: string;
  includes_pii: boolean;
  /** §4.4 — disputes travel to the export as EVIDENCE; the export never resolves them. */
  disputes_carried: Array<{
    employment_id: string;
    dispute_note_present?: boolean;
  }>;
}

/**
 * What `public.hr_payroll_export_list` answers with.
 *
 * 🚨 `granted:false` IS NOT AN EMPTY LIST. "You do not have the payroll.read capability" and
 * "this period has never been exported" are different facts, and a surface that renders them
 * identically teaches a payroll administrator that their permissions are fine when they are not.
 * The reader keeps them distinct; so must every consumer.
 */
export type PayrollExportListResult =
  | { granted: true; exports: PayrollExportHistoryRow[] }
  | { granted: false; reason: string; capability?: string };

// ---------------------------------------------------------------------------------------------
// The four named preconditions (§4.4) — parsed, never guessed
// ---------------------------------------------------------------------------------------------

/**
 * The specific export refusals §4.4 enumerates, each with its own door. `unknown` is the honest
 * fallback: an unrecognised failure is shown with the server's own `user_message`, never dressed
 * up as one of these four.
 */
export type ExportPrecondition =
  | {
      kind: "period_not_approved";
      /** The state the period is actually in. */
      state: string;
    }
  | {
      kind: "pending_workweeks";
      /** Every workweek still `is_final=false`. Each one is an identity that must open. */
      pendingWorkweekIds: string[];
    }
  | {
      kind: "advisory_rule_blocks_money";
      ruleClass: string | null;
      ruleId: string | null;
      jurisdictionKey: string | null;
      affectedEmploymentIds: string[];
    }
  | {
      kind: "unmapped_identifiers";
      unmapped: Array<{ employment_id: string; field: string }>;
    }
  | { kind: "unknown" };
