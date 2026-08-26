/**
 * features/hr/exports/mock/history.ts — the fixture lane for the export-history READ.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT IN `features/hr/__fixtures__/`
 * ----------------------------------------------------------------
 * SPEC-CONTRACTS §6.4's 243-file frozen fixture set covers the sixty `/hr/*` HTTP operations.
 * The export-history list is not one of them: `hr` is not exposed to PostgREST, so the list is a
 * `SECURITY DEFINER` RPC read (`public.hr_payroll_export_list`), not an HTTP operation — exactly
 * the situation lane L3 hit for the punch RPCs, and this follows the precedent it set in
 * `features/hr/time/api/mock/`. Same flag (`NEXT_PUBLIC_HR_MOCK=1`, read in the same single
 * place), same four-case discipline, same rule: **this is not a fake server and it simulates no
 * behaviour.** It returns the case you asked for, verbatim.
 *
 * The four cases are chosen to cover what the surface must be able to render:
 *   happy — every delivery state in §4.5's machine, including the export-failed retry door
 *   empty — granted, but this period has never been exported
 *   error — 🚨 `granted:false`. A capability refusal, which must NEVER render as an empty list
 *   edge  — an acknowledged export (supersede unavailable), a superseded chain, a null money
 *           column, a PII-flagged file, and carried disputes
 */

import type {
  PayrollExportHistoryRow,
  PayrollExportListResult,
} from "../types";
import type { HrFixtureCase } from "@/features/hr/mock/transport";

const PERIOD_ID = "00000000-0000-4000-8000-000000000031";
const SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function row(
  overrides: Partial<PayrollExportHistoryRow> &
    Pick<PayrollExportHistoryRow, "export_id" | "export_version" | "delivery_state">,
): PayrollExportHistoryRow {
  return {
    pay_period_id: PERIOD_ID,
    period_start_on: "2026-03-01",
    period_end_on: "2026-03-15",
    pay_period_state: "approved",
    export_format: "generic_csv",
    line_count: 1184,
    total_hours: "9422.75",
    total_amount: "241880.12",
    artifact_file_id: "00000000-0000-4000-8000-000000000008",
    artifact_sha256: SHA,
    supersedes_export_id: null,
    acknowledgement_ref: null,
    acknowledged_at: null,
    sent_at: null,
    failure_reason: null,
    includes_adjustment_ids: [],
    generated_at: "2026-03-17T18:04:11Z",
    includes_pii: false,
    disputes_carried: [],
    ...overrides,
  };
}

const HAPPY: PayrollExportHistoryRow[] = [
  row({
    export_id: "00000000-0000-4000-8000-000000000101",
    export_version: 4,
    delivery_state: "generated",
    export_format: "adp_csv",
    generated_at: "2026-03-18T09:12:00Z",
    includes_adjustment_ids: ["00000000-0000-4000-8000-000000000061"],
  }),
  row({
    export_id: "00000000-0000-4000-8000-000000000102",
    export_version: 3,
    delivery_state: "sent",
    sent_at: "2026-03-17T19:40:00Z",
    generated_at: "2026-03-17T18:04:11Z",
  }),
  row({
    export_id: "00000000-0000-4000-8000-000000000103",
    export_version: 2,
    delivery_state: "failed",
    failure_reason: "portal rejected the batch: EIN mismatch",
    generated_at: "2026-03-16T11:22:00Z",
  }),
  row({
    export_id: "00000000-0000-4000-8000-000000000104",
    export_version: 1,
    delivery_state: "superseded",
    generated_at: "2026-03-15T08:00:00Z",
    total_amount: "241010.00",
  }),
];

const EDGE: PayrollExportHistoryRow[] = [
  row({
    export_id: "00000000-0000-4000-8000-000000000201",
    export_version: 2,
    delivery_state: "acknowledged",
    export_format: "quickbooks_online",
    acknowledgement_ref: "QBO-2026-03-IMPORT-4471",
    acknowledged_at: "2026-03-18T14:05:00Z",
    sent_at: "2026-03-18T13:50:00Z",
    supersedes_export_id: "00000000-0000-4000-8000-000000000202",
    includes_pii: true,
    disputes_carried: [
      {
        employment_id: "00000000-0000-4000-8000-000000000041",
        dispute_note_present: true,
      },
    ],
    includes_adjustment_ids: [
      "00000000-0000-4000-8000-000000000061",
      "00000000-0000-4000-8000-000000000062",
    ],
  }),
  row({
    export_id: "00000000-0000-4000-8000-000000000202",
    export_version: 1,
    delivery_state: "superseded",
    export_format: "quickbooks_online",
    // A timesheet-shaped format carries no money column; null is not zero.
    total_amount: null,
    artifact_file_id: null,
    artifact_sha256: null,
    generated_at: "2026-03-17T07:31:00Z",
  }),
];

export const HR_EXPORT_HISTORY_FIXTURES: Record<
  HrFixtureCase,
  PayrollExportListResult
> = {
  happy: { granted: true, exports: HAPPY },
  empty: { granted: true, exports: [] },
  error: {
    granted: false,
    reason: "You need the payroll.read capability to see payroll exports.",
    capability: "payroll.read",
  },
  edge: { granted: true, exports: EDGE },
  // §6.4 defines `edge2` only where a second mandated response exists; this read has none, so it
  // reuses the edge case rather than inventing a fifth fiction.
  edge2: { granted: true, exports: EDGE },
};
