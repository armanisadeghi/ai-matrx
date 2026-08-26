"use client";

/**
 * ExportRunPanel — pick a format, look at what the file WOULD contain, then build it.
 *
 * ═══ WHY PREVIEW AND GENERATE ARE TWO SEPARATE THINGS ══════════════════════════════════════════
 * E-19 preview is synchronous and creates NO `hr.payroll_export` row; E-20 generate is async and
 * creates one. That split is deliberate and §4.4 states the reason: **looking is not an act with a
 * record.** A payroll administrator must be able to check the numbers as many times as they like
 * without leaving a trail of half-exports behind them, and without the next person wondering which
 * of six rows is the real file. So this panel makes looking free and building deliberate.
 *
 * ═══ THE THREE THINGS THIS PANEL REFUSES TO DO ═════════════════════════════════════════════════
 *
 * 1. 🚨 **A `blocking[]` ENTRY DISABLES GENERATE, AND THE REASONS ARE ON SCREEN.** Not a warning
 *    the user can click past, not a button that fails at the server. If the preview says the file
 *    cannot be built, the build control is unavailable and every blocking reason is listed under
 *    it. `warnings[]` are different — those are shown and do NOT block, because a warning the user
 *    cannot proceed past is a block wearing a friendlier word.
 *
 * 2. 🚨 **AN `available:false` FORMAT IS SHOWN, DISABLED, WITH ITS `notes` AS THE REASON.** Both
 *    QuickBooks mappers ship unavailable because Intuit publishes no column spec for them (§4.2).
 *    Hiding them would make a QuickBooks customer think we do not support QuickBooks at all;
 *    enabling them would produce a file with guessed columns. The registry says which and why, and
 *    the picker repeats it verbatim.
 *
 * 3. 🚨 **`requires_mapping` IS SHOWN BEFORE THE USER COMMITS, NOT AFTER.** §4.3 calls this "the
 *    honest half of every integration": no external system knows our employee numbers. Finding out
 *    at generate time — via a 400 — that every employee needs an ADP File # first is a worse
 *    version of the same information, arriving after the decision instead of before it.
 *
 * 🚨 NO CLIENT COMPUTES MONEY OR HOURS. Every figure below is the server's decimal string,
 * displayed verbatim. Nothing here parses, sums or re-formats one.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Loader2,
  Play,
  ShieldAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useExportFormats } from "../hooks/useExportFormats";
import { useExportRun } from "../hooks/useExportRun";
import { useIntentKeys } from "../hooks/useIntentKey";
import {
  createPayrollExport,
  payrollExportDomainKey,
  previewPayrollExport,
} from "../service";
import { toExportFailure, type ExportFailure } from "../errors";
import type { ExportFormat, ExportPreviewResult } from "../types";
import { ExportPreconditionAlert } from "./ExportPreconditionAlert";

/** The identifiers an integration needs, spelled for a person rather than for a schema. */
const MAPPING_LABEL: Record<string, string> = {
  external_employee_id: "an employee ID from the payroll system",
  external_earning_code: "a pay-code mapping for each kind of hour",
  co_code: "your ADP company code",
  batch_id: "an ADP batch ID",
  file_number: "each employee's ADP File #",
};

function mappingLabel(field: string): string {
  return MAPPING_LABEL[field] ?? field;
}

function FormatOption({
  format,
  selected,
  onSelect,
}: {
  format: ExportFormat;
  selected: boolean;
  onSelect: () => void;
}) {
  const disabled = !format.available;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-muted/40 opacity-70"
          : "border-border bg-card hover:border-primary/50",
        selected && !disabled && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{format.label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {format.key}
        </span>
        {format.delivery.includes("api") ? (
          <Badge variant="info" className="text-[10px]">
            Direct connection available
          </Badge>
        ) : null}
        {disabled ? (
          <Badge variant="outline" className="text-[10px]">
            Not available yet
          </Badge>
        ) : null}
      </div>

      {/*
        The registry's own `notes` is the reason, verbatim. An unavailable format with no stated
        reason is the thing this rule exists to prevent — the user is left guessing whether it is
        broken, unsupported, or something they did.
      */}
      {format.notes ? (
        <p
          className={cn(
            "mt-1.5 text-xs",
            disabled ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {format.notes}
        </p>
      ) : null}

      {/* §4.3's honest half — said BEFORE the commit, never discovered in a 400. */}
      {format.requires_mapping.length > 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Needs first:{" "}
          {format.requires_mapping.map((field) => mappingLabel(field)).join(", ")}
          .
        </p>
      ) : null}
    </button>
  );
}

function PreviewSummary({ preview }: { preview: ExportPreviewResult }) {
  // The money figure follows the HR sensitivity rule: a key the reader omitted is ABSENT from the
  // DOM — no label, no dash, no reserved slot. A present key that is empty is a different fact.
  const showsAmounts = "total_amount" in preview;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Lines</dt>
          <dd className="font-mono text-lg text-foreground">
            {preview.line_count}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">People</dt>
          <dd className="font-mono text-lg text-foreground">
            {preview.employments_included}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total hours</dt>
          <dd className="font-mono text-lg text-foreground">
            {preview.total_hours}
          </dd>
        </div>
        {showsAmounts ? (
          <div>
            <dt className="text-xs text-muted-foreground">Total amount</dt>
            <dd className="font-mono text-lg text-foreground">
              {preview.total_amount ?? "—"}
            </dd>
          </div>
        ) : null}
      </dl>

      {preview.by_earning_code.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                  Pay code
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                  Hours
                </th>
                {showsAmounts ? (
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {preview.by_earning_code.map((line) => (
                <tr key={line.earning_code} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs text-foreground">
                    {line.earning_code}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-foreground">
                    {line.hours}
                  </td>
                  {showsAmounts ? (
                    <td className="px-3 py-1.5 text-right font-mono text-foreground">
                      {line.amount ?? "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ExportRunPanel({
  payPeriodId,
  mockCase,
  onGenerated,
  className,
}: {
  payPeriodId: string;
  /** Mock-mode fixture selector. Ignored entirely when `NEXT_PUBLIC_HR_MOCK` is not `1`. */
  mockCase?: HrFixtureCase;
  /** Fired when a build is accepted, so the history beside this panel can re-read. */
  onGenerated?: () => void;
  className?: string;
}) {
  const hr = useHrContext();
  const organizationId = hr.active?.organization_id ?? null;
  const formats = useExportFormats(mockCase);
  const intentKeys = useIntentKeys();
  const run = useExportRun({ onSettled: () => onGenerated?.() });

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExportPreviewResult | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [busy, setBusy] = useState<"preview" | "generate" | null>(null);

  const available = formats.formats ?? [];
  const selected =
    available.find((format) => format.key === selectedKey) ??
    // `generic_csv` is the floor and the day-one default, and no integration is ever a
    // precondition for getting paid data out (§4.3 ruling 5).
    available.find((format) => format.key === "generic_csv" && format.available) ??
    available.find((format) => format.available) ??
    null;

  const blocking = preview?.blocking ?? [];
  const canGenerate =
    selected !== null &&
    selected.available &&
    preview !== null &&
    blocking.length === 0 &&
    organizationId !== null &&
    busy === null;

  const runPreview = async () => {
    if (!selected || !organizationId) return;
    setBusy("preview");
    setFailure(null);
    setPreview(null);
    try {
      const result = await previewPayrollExport(
        {
          organization_id: organizationId,
          pay_period_id: payPeriodId,
          export_format: selected.key,
        },
        { mockCase },
      );
      setPreview(result);
    } catch (err: unknown) {
      setFailure(toExportFailure(err));
    } finally {
      setBusy(null);
    }
  };

  const runGenerate = async () => {
    if (!selected || !organizationId) return;
    setBusy("generate");
    setFailure(null);
    try {
      const accepted = await createPayrollExport(
        {
          organization_id: organizationId,
          pay_period_id: payPeriodId,
          export_format: selected.key,
          // The DOMAIN key (§1.4) — distinct from the transport header below. A second build of
          // the same period REPLAYS the first rather than producing a second file; regenerating
          // is supersede, and that asymmetry is what stops a period being paid twice.
          idempotency_key: payrollExportDomainKey(payPeriodId),
        },
        // The TRANSPORT key — one per user intent, reused across every retry of that intent.
        intentKeys.forIntent("generate", payPeriodId, selected.key),
        { mockCase },
      );
      run.follow(accepted);
      toast.success("Building the file. It will appear in the history below.");
      onGenerated?.();
    } catch (err: unknown) {
      setFailure(toExportFailure(err));
    } finally {
      setBusy(null);
    }
  };

  if (formats.failure) {
    return (
      <ExportPreconditionAlert failure={formats.failure} className={className} />
    );
  }

  if (!organizationId && !hr.isLoading) {
    return (
      <Alert className={className}>
        <ShieldAlert className="h-4 w-4" aria-hidden />
        <AlertTitle>Choose an employer first</AlertTitle>
        <AlertDescription>
          Payroll exports belong to one employer at a time. Pick the employer
          this pay period belongs to and this panel will load.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">
          Build a payroll file
        </h2>
      </div>

      {/* ── Format picker ─────────────────────────────────────────────────── */}
      {formats.isLoading ? (
        <div
          className="h-24 animate-pulse rounded-lg bg-muted/40"
          aria-label="Loading the available formats"
        />
      ) : available.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" aria-hidden />
          <AlertTitle>No export formats are configured</AlertTitle>
          <AlertDescription>
            Nothing can be built until at least one format is available. Ask
            whoever administers HR for your organization to check the export
            settings.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((format) => (
            <FormatOption
              key={format.key}
              format={format}
              selected={selected?.key === format.key}
              onSelect={() => {
                setSelectedKey(format.key);
                // A preview belongs to the format it was run for. Keeping it visible after the
                // format changes would show one format's numbers under another's name.
                setPreview(null);
                setFailure(null);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Preview → generate ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runPreview()}
          disabled={!selected?.available || busy !== null}
        >
          {busy === "preview" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="mr-2 h-4 w-4" aria-hidden />
          )}
          Check what it would contain
        </Button>

        <Button size="sm" onClick={() => void runGenerate()} disabled={!canGenerate}>
          {busy === "generate" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          Build the file
        </Button>

        {preview === null && selected?.available ? (
          <span className="text-xs text-muted-foreground">
            Check the numbers first — looking leaves no record.
          </span>
        ) : null}
      </div>

      {/* ── The run, once one is in flight ────────────────────────────────── */}
      {run.phase === "not_observable" ? (
        <Alert>
          <Info className="h-4 w-4" aria-hidden />
          <AlertTitle>The build was accepted</AlertTitle>
          <AlertDescription>
            This environment is running against fixtures, so its progress
            can&apos;t be followed here. On a real server the file appears in the
            history below when it finishes.
          </AlertDescription>
        </Alert>
      ) : null}
      {run.phase === "running" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Building the file… it will appear in the history below.
        </p>
      ) : null}
      {run.phase === "timed_out" ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>This is taking longer than expected</AlertTitle>
          <AlertDescription>
            The build is still running on the server — nothing is lost. Refresh
            the history below to check on it.
          </AlertDescription>
        </Alert>
      ) : null}
      {run.failure ? (
        <ExportPreconditionAlert failure={run.failure} />
      ) : null}

      {/* ── The four named preconditions, and anything else the server refused with ── */}
      {failure ? <ExportPreconditionAlert failure={failure} /> : null}

      {/* ── Preview result ────────────────────────────────────────────────── */}
      {preview ? (
        <div className="space-y-3 border-t border-border pt-4">
          <PreviewSummary preview={preview} />

          {/*
            🚨 BLOCKING DISABLES THE BUILD AND SAYS WHY. The button above is already unavailable;
            this is the half that makes that honest rather than mysterious.
          */}
          {blocking.length > 0 ? (
            <Alert variant="destructive">
              <Ban className="h-4 w-4" aria-hidden />
              <AlertTitle>
                This file can&apos;t be built yet
                {blocking.length > 1 ? ` — ${blocking.length} things are in the way` : ""}
              </AlertTitle>
              <AlertDescription>
                <ul className="ml-4 list-disc space-y-1">
                  {blocking.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Warnings inform; they never block. A warning you cannot proceed past is a block. */}
          {preview.warnings.length > 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              <AlertTitle>
                Worth a look before you build
              </AlertTitle>
              <AlertDescription>
                <ul className="ml-4 list-disc space-y-1">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {blocking.length === 0 && preview.line_count === 0 ? (
            <Alert>
              <Info className="h-4 w-4" aria-hidden />
              <AlertTitle>There is nothing to export</AlertTitle>
              <AlertDescription>
                This period has no approved hours for the people this format
                covers, so the file would be empty.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
