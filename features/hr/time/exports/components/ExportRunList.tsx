"use client";

/**
 * features/hr/time/exports/components/ExportRunList.tsx — `ExportRunList` (SPEC-UI-IA §3.4 row 33).
 *
 * One row per `hr.payroll_export`, in version order, with its delivery state and the controls that
 * state actually admits.
 *
 * 🚨 THE SUPERSEDE CONTROL IS **ABSENT** ONCE ACKNOWLEDGED, WITH THE REASON RENDERED IN ITS PLACE
 * (SPEC-CONTRACTS §4.5, SPEC-TIME §7.2). An acknowledged export can never be superseded,
 * regenerated or re-sent — E-26 answers `409 hr_export_already_acknowledged`. If that 409 ever
 * reaches a user, this component offered a control it should not have. The only correction path
 * after acknowledgement is an adjustment in the **next** export, tagged to the original period.
 * That rule is on SPEC-TIME §13's explicit list of things that are **never a knob**.
 *
 * 🚨 A FAILURE IS A RECORD BESIDE THE RETRY DOOR, NEVER SWALLOWED. `failure_reason` is a durable
 * column and renders next to the control that generates the replacement — not as a toast that
 * disappears, and not instead of the retry.
 *
 * 🚨 A SUPERSEDED EXPORT IS NEVER HIDDEN. It stays in the list forever: it is the evidence of what
 * was nearly sent, and its own `artifact_sha256` is retained alongside the replacement's.
 *
 * 🚨 MONEY IS ABSENT, NOT ZERO. `amountDisplay` returns a discriminated union with no numeric member
 * on the absent branch, so no `?? 0` can creep in here.
 *
 * NO CLIENT COMPUTES ANYTHING: every figure is a decimal string carried verbatim from the server.
 */

import { CircleSlash, Download, FileCheck2, FileX2, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTimeInTz, viewerTimeZone } from "../../shared/format";
import type { ExportDeliveryState, PayrollExportHistoryRow } from "@/features/hr/exports/types";
import {
  DELIVERY_STATE_LABEL,
  DELIVERY_STATE_MEANING,
  acknowledgeAvailability,
  amountDisplay,
  failAvailability,
  supersedeAvailability,
} from "../exportPresentation";

const STATE_CLASS: Record<ExportDeliveryState, string> = {
  generated: "bg-primary/10 text-primary border-primary/30",
  sent: "bg-primary/10 text-primary border-primary/30",
  acknowledged: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  superseded: "bg-muted text-muted-foreground border-border",
};

export interface ExportRunListProps {
  rows: PayrollExportHistoryRow[];
  isLoading: boolean;
  /** True only for a payroll administrator — §2.7: HR admin does everything EXCEPT export. */
  canAct: boolean;
  onAcknowledge: (row: PayrollExportHistoryRow) => void;
  onFail: (row: PayrollExportHistoryRow) => void;
  onSupersede: (row: PayrollExportHistoryRow) => void;
  onDownload: (row: PayrollExportHistoryRow) => void;
}

export function ExportRunList({
  rows,
  isLoading,
  canAct,
  onAcknowledge,
  onFail,
  onSupersede,
  onDownload,
}: ExportRunListProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-[12px] text-muted-foreground">
        Loading export history…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-[13px] font-medium text-foreground">
          This period has never been exported
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Once a payroll file is generated it appears here with its version, its delivery state and
          its checksum. Every version is kept — including any that failed or were replaced.
        </p>
      </div>
    );
  }

  const tz = viewerTimeZone();

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const supersede = supersedeAvailability(row);
        const acknowledge = acknowledgeAvailability(row);
        const fail = failAvailability(row);
        const amount = amountDisplay(row);

        return (
          <li key={row.export_id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    Version {row.export_version}
                  </span>
                  <span
                    title={DELIVERY_STATE_MEANING[row.delivery_state]}
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      STATE_CLASS[row.delivery_state],
                    )}
                  >
                    {DELIVERY_STATE_LABEL[row.delivery_state]}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{row.export_format}</span>
                  {row.includes_pii ? (
                    <span className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                      Contains personal identifiers
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Generated {formatDateTimeInTz(row.generated_at, tz)}
                  {row.supersedes_export_id ? " · replaces an earlier version" : ""}
                </p>
              </div>

              <dl className="flex shrink-0 gap-5 text-right">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Lines</dt>
                  <dd className="text-[13px] font-medium tabular-nums text-foreground">
                    {row.line_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Hours</dt>
                  <dd className="text-[13px] font-medium tabular-nums text-foreground">
                    {row.total_hours}
                  </dd>
                </div>
                <div className="max-w-[16rem]">
                  <dt className="text-[11px] text-muted-foreground">Amount</dt>
                  <dd
                    className={cn(
                      "text-[13px] font-medium tabular-nums text-foreground",
                      !amount.present && "text-[11px] font-normal text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {amount.present ? amount.decimalString : amount.sentence}
                  </dd>
                </div>
              </dl>
            </div>

            {row.acknowledgement_ref ? (
              <p className="mt-2 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Payroll accepted this file
                  {row.acknowledged_at ? ` on ${formatDateTimeInTz(row.acknowledged_at, tz)}` : ""}.
                  Their reference: <span className="font-mono">{row.acknowledgement_ref}</span>.
                </span>
              </p>
            ) : null}

            {/* 🚨 The failure is a RECORD, and it sits beside the retry door. */}
            {row.failure_reason ? (
              <p className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive">
                <FileX2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Delivery failed: {row.failure_reason}. This record is kept, and so is the file —
                  generating a replacement does not erase either.
                </span>
              </p>
            ) : null}

            {row.disputes_carried.length > 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {row.disputes_carried.length}{" "}
                {row.disputes_carried.length === 1 ? "disagreement travelled" : "disagreements travelled"}{" "}
                with this file as evidence. Exporting did not resolve them.
              </p>
            ) : null}

            {row.includes_adjustment_ids.length > 0 ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Carries {row.includes_adjustment_ids.length}{" "}
                {row.includes_adjustment_ids.length === 1 ? "correction" : "corrections"} from an
                earlier locked period.
              </p>
            ) : null}

            {row.artifact_sha256 ? (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                sha256 {row.artifact_sha256.slice(0, 16)}…
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {row.artifact_file_id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => onDownload(row)}
                >
                  <Download className="mr-1.5 h-4 w-4" aria-hidden />
                  Download
                </Button>
              ) : null}

              {canAct && acknowledge.offered ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => onAcknowledge(row)}
                >
                  <FileCheck2 className="mr-1.5 h-4 w-4" aria-hidden />
                  Payroll accepted it
                </Button>
              ) : null}

              {canAct && fail.offered ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => onFail(row)}
                >
                  <FileX2 className="mr-1.5 h-4 w-4" aria-hidden />
                  Record a failure
                </Button>
              ) : null}

              {canAct && supersede.offered ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => onSupersede(row)}
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                  Generate a replacement
                </Button>
              ) : null}
            </div>

            {/*
              🚨 THE ABSENT CONTROL SAYS WHY. This is the acknowledged case: the button is GONE,
              not disabled, and the sentence that replaces it explains the rule rather than leaving
              a payroll administrator to conclude the product is broken.
            */}
            {canAct && !supersede.offered && supersede.reason ? (
              <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{supersede.reason}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
