// features/unified-data/cutover/copyAgain.ts — "COPY AGAIN": THE ONE CLIENT (lane COPY-AGAIN-DOOR).
//
// While an organization's Data tables switch is off, each older table has a same-id copy in the new
// system. When the switch names a difference ("1 colour differs … Copying again brings the older
// table's colours"), an owner copies again from the switch card or from one table's ⋯ menu. Both call
// the server's mover rerun through this file:
//
//   POST /cutover/organizations/{organization_id}/copy-again   — every older table
//   POST /cutover/tables/{table_id}/copy-again                 — one table (organization read from it)
//
// The server refuses with a sentence before anything runs (not an owner, already switched, archived)
// and says so in the stream when a copy is already running. Progress arrives one table at a time;
// the last event is the report with the one line the page shows. This file adds no rule of its own.

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type {
  CutoverCopyAgainProgressData,
  CutoverCopyAgainReportData,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";

/** The readiness checks a copy-again rerun clears — the switch shows "Copy again" when one is unmet. */
export const CHECKS_COPY_AGAIN_CLEARS: readonly string[] = [
  "copied",
  "rows_present",
  "rows_current",
  "colours_match",
  "checks_match",
  "formats_match",
  "shares_match",
];

export type CopyAgainProgress = { done: number; total: number; says: string };

export type CopyAgainAnswer =
  | { ok: true; says: string; report: CutoverCopyAgainReportData }
  | { ok: false; says: string; report?: CutoverCopyAgainReportData };

function isProgress(d: unknown): d is CutoverCopyAgainProgressData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "cutover_copy_again_progress";
}

function isReport(d: unknown): d is CutoverCopyAgainReportData {
  return !!d && typeof d === "object" && (d as { type?: unknown }).type === "cutover_copy_again_report";
}

/** Copy one organization's older tables again (`{ organizationId }`) or one table (`{ tableId }`). */
export async function copyAgain(
  dispatch: AppDispatch,
  target: { organizationId: string } | { tableId: string; organizationId?: string },
  onProgress?: (p: CopyAgainProgress) => void,
): Promise<CopyAgainAnswer> {
  let report: CutoverCopyAgainReportData | null = null;
  let refusal: string | null = null;

  const onStreamEvent = (event: TypedStreamEvent) => {
    if (event.event === "data") {
      const d = event.data as unknown;
      if (isProgress(d)) onProgress?.({ done: d.done, total: d.total, says: d.says });
      else if (isReport(d)) report = d;
    } else if (event.event === "error") {
      const e = event.data as { user_message?: string | null; message?: string };
      refusal = e.user_message || e.message || "Copying again was refused.";
    }
  };

  const scopeOverrides = target.organizationId ? { organization_id: target.organizationId } : undefined;
  const result =
    "tableId" in target
      ? await dispatch(
          callApi({
            path: "/cutover/tables/{table_id}/copy-again",
            method: "POST",
            pathParams: { table_id: target.tableId },
            stream: true,
            expectedErrorStatuses: [401, 403, 404, 409],
            scopeOverrides,
            onStreamEvent,
          }),
        )
      : await dispatch(
          callApi({
            path: "/cutover/organizations/{organization_id}/copy-again",
            method: "POST",
            pathParams: { organization_id: target.organizationId },
            stream: true,
            expectedErrorStatuses: [401, 403, 404, 409],
            scopeOverrides,
            onStreamEvent,
          }),
        );

  if (result.error) {
    const detail = result.error.serverDetail;
    const says =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && typeof (detail as { detail?: unknown }).detail === "string"
          ? (detail as { detail: string }).detail
          : result.error.message;
    return { ok: false, says: says || "Copying again did not start." };
  }
  if (refusal) return { ok: false, says: refusal };
  const done = report as CutoverCopyAgainReportData | null;
  if (!done) return { ok: false, says: "The copy ended without saying what it did. Check again to see where it stands." };
  return done.ok ? { ok: true, says: done.says, report: done } : { ok: false, says: done.says, report: done };
}
