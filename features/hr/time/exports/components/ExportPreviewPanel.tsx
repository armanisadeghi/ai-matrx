"use client";

/**
 * features/hr/time/exports/components/ExportPreviewPanel.tsx — E-19, the synchronous dry run.
 *
 * 🚨 LOOKING IS NOT AN ACT WITH A RECORD. `POST /hr/exports/payroll/preview` creates **no**
 * `hr.payroll_export` row, carries no idempotency key (there is nothing to replay), and is a
 * separate endpoint from generation for exactly that reason. This panel says so on screen, because
 * a payroll administrator who believes looking creates a version will not look.
 *
 * 🚨 `blocking[]` AND `warnings[]` ARE BOTH RENDERED, AND THEY ARE NOT THE SAME THING.
 * A warning is something to know; a blocking line is something that will refuse the run. Collapsing
 * them into one list — or worse, into a count — is how a blocking line gets scrolled past and the
 * refusal arrives as a surprise at generation time. §7.2's whole design is that *the preview named
 * the blocking lines before anyone committed*.
 *
 * 🚨 NO CLIENT COMPUTES HOURS OR MONEY. `total_hours` and `total_amount` are DECIMAL STRINGS,
 * rendered verbatim. They are never parsed into a JS number to compare or re-format: binary floating
 * point cannot represent 241880.12, and this is the one file where that matters most.
 */

import { AlertTriangle, Eye, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ExportPreviewResult } from "@/features/hr/exports/types";

export interface ExportPreviewPanelProps {
  preview: ExportPreviewResult | null;
  isRunning: boolean;
  canPreview: boolean;
  onPreview: () => void;
  /** Disputes travelling with the file, from the period. Evidence, never resolved by the export. */
  disputesCarried: number;
  /** Adjustments this run will carry from earlier locked periods. */
  adjustmentsCarried: number;
}

export function ExportPreviewPanel({
  preview,
  isRunning,
  canPreview,
  onPreview,
  disputesCarried,
  adjustmentsCarried,
}: ExportPreviewPanelProps) {
  const blocking = preview?.blocking ?? [];
  const warnings = preview?.warnings ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Eye className="h-4 w-4 text-muted-foreground" aria-hidden />
            Check before generating
          </h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            A dry run. It records nothing and creates no version — looking is not an act with a
            record. It reports exactly what a real run would produce, including anything that would
            refuse it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="min-h-[44px]"
          disabled={!canPreview || isRunning}
          onClick={onPreview}
        >
          {isRunning ? "Checking…" : "Check this period"}
        </Button>
      </div>

      {preview ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Figure label="People included" value={String(preview.employments_included)} />
            <Figure label="Lines" value={String(preview.line_count)} />
            {/* Decimal strings, verbatim. */}
            <Figure label="Total hours" value={preview.total_hours} />
            <Figure
              label="Total amount"
              value={preview.total_amount ?? null}
              absentSentence="This format carries hours, not amounts."
            />
          </dl>

          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <Figure label="Adjustments carried" value={String(adjustmentsCarried)} />
            <Figure label="Disagreements travelling" value={String(disputesCarried)} />
          </dl>
          {disputesCarried > 0 ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              A disagreement travels with the file as evidence. The export does not resolve it by
              exporting the manager&apos;s number.
            </p>
          ) : null}

          {preview.by_earning_code.length > 0 ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                By earning code
              </p>
              <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
                {preview.by_earning_code.map((line) => (
                  <li
                    key={line.earning_code}
                    className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-[12px]"
                  >
                    <span className="text-foreground">{line.earning_code}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {line.hours} h
                      {line.amount ? (
                        <span className="ml-3 text-foreground">{line.amount}</span>
                      ) : (
                        <span className="ml-3 text-[11px] text-amber-700 dark:text-amber-400">
                          amount not calculated
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 🚨 BLOCKING first, and visually separate from warnings. */}
          {blocking.length > 0 ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <h4 className="flex items-center gap-2 text-[12px] font-semibold text-destructive">
                <ShieldAlert className="h-4 w-4" aria-hidden />
                {blocking.length === 1
                  ? "1 line will refuse this run"
                  : `${blocking.length} lines will refuse this run`}
              </h4>
              <p className="mt-1 text-[12px] leading-relaxed text-destructive">
                These are named now, before anything is committed. An export refuses as a whole — it
                never omits a line and carries on.
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] text-destructive">
                {blocking.map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <h4 className="flex items-center gap-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {warnings.length === 1 ? "1 thing to know" : `${warnings.length} things to know`}
              </h4>
              <p className="mt-1 text-[12px] text-amber-800/80 dark:text-amber-300/80">
                These do not stop the run.
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] text-amber-800 dark:text-amber-300">
                {warnings.map((line, i) => (
                  <li key={`${line}-${i}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {blocking.length === 0 && warnings.length === 0 ? (
            <p className="mt-3 text-[12px] text-muted-foreground">
              Nothing would block or warn on this run.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * 🚨 An absent amount is a SENTENCE, never a zero and never a dash (SPEC-TIME §0 law 4). The
 * discriminated `value: string | null` forces the caller to hand over a real decimal string or
 * nothing at all — there is no numeric path through this component that could produce a `0`.
 */
function Figure({
  label,
  value,
  absentSentence,
}: {
  label: string;
  value: string | null;
  absentSentence?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums text-foreground">
        {value !== null ? (
          value
        ) : (
          <span className="text-[11px] font-normal not-italic text-amber-700 dark:text-amber-400">
            {absentSentence ?? "Not calculated."}
          </span>
        )}
      </dd>
    </div>
  );
}
