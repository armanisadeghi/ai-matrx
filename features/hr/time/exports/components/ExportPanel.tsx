"use client";

/**
 * features/hr/time/exports/components/ExportPanel.tsx — the payroll-export UI on ROUTE 33 (L3-63).
 *
 * 🚨 WHAT THIS LANE DOES **NOT** OWN. The payroll-export **engine** — E-18…E-26 — belongs to lane
 * **L13 / HRB-025**, not to L3: R-L3 U-02 moved export generation onto the server lane and L3 builds
 * **no export RPC**. This file is a consumer of `features/hr/exports/{service,errors,hooks}` and
 * adds no second client, no second idempotency scheme and no second error classifier. Until L13's
 * router ships in aidream, every screen here is **mock-only** — it renders the frozen fixture set
 * behind `NEXT_PUBLIC_HR_MOCK=1` and nothing on it has ever reached a real server.
 *
 * 🚨 THE IDEMPOTENCY KEY IS MINTED ONCE PER USER INTENT AND REUSED ON EVERY RETRY OF THAT INTENT
 * (§1.4). A fresh key on retry is not weaker idempotency, it is none — and on this family it is how
 * a payroll file gets generated, delivered and paid twice. The transport key is held in a ref for
 * the life of the intent; the DOMAIN key in the body is `payperiod:<id>:v1`, which is why a second
 * generate REPLAYS the first export rather than producing a second one. Regeneration is not a second
 * generate: it is supersede, the only path that increments `export_version`.
 *
 * 🚨 EXPORT IS THE PAYROLL ADMINISTRATOR'S ALONE (§2.7). An HR admin performs every period
 * transition EXCEPT export; a manager sees this read-only.
 *
 * NO CLIENT COMPUTES HOURS OR MONEY: every figure below is a decimal string carried verbatim.
 */

import { useCallback, useRef, useState } from "react";
import { FileDown, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { useExportFormats } from "@/features/hr/exports/hooks/useExportFormats";
import { useExportHistory } from "@/features/hr/exports/hooks/useExportHistory";
import { useExportRun } from "@/features/hr/exports/hooks/useExportRun";
import { classifyPrecondition, toExportFailure, type ExportFailure } from "@/features/hr/exports/errors";
import {
  acknowledgeExport,
  createPayrollExport,
  failExport,
  getExportArtifact,
  newExportIntentKey,
  payrollExportDomainKey,
  previewPayrollExport,
  supersedeExport,
} from "@/features/hr/exports/service";
import type {
  ExportFormatKey,
  ExportPreviewResult,
  PayrollExportHistoryRow,
} from "@/features/hr/exports/types";
import type { PayPeriodRow } from "../../api/types";
import { ONE_WAY_NOTICE, defaultFormatKey } from "../exportPresentation";
import { ExportFormatPicker } from "./ExportFormatPicker";
import { ExportPreconditionNotice } from "./ExportPreconditionNotice";
import { ExportPreviewPanel } from "./ExportPreviewPanel";
import { ExportRunList } from "./ExportRunList";
import { RunVerdictNotice } from "./RunVerdictNotice";

export interface ExportPanelProps {
  period: PayPeriodRow;
  organizationId: string;
  /** Payroll administrator only. HR admin does every transition EXCEPT export (§2.7). */
  canExport: boolean;
  mockCase?: HrFixtureCase;
}

type PendingAction =
  | { kind: "acknowledge"; row: PayrollExportHistoryRow }
  | { kind: "fail"; row: PayrollExportHistoryRow }
  | { kind: "supersede"; row: PayrollExportHistoryRow };

export function ExportPanel({ period, organizationId, canExport, mockCase }: ExportPanelProps) {
  const formats = useExportFormats(mockCase);
  const history = useExportHistory(period.id, { mockCase });
  const run = useExportRun({ onSettled: () => history.reload() });

  const [selectedKey, setSelectedKey] = useState<ExportFormatKey | null>(null);
  const [preview, setPreview] = useState<ExportPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * One key per user intent. `generateKey.current` is cleared only when the intent CHANGES (a
   * different format), never on retry — retrying with a fresh key is how a payroll file is built
   * twice.
   */
  const generateKey = useRef<string | null>(null);
  const intentSignature = useRef<string>("");

  // The default lands on `generic_csv` when the server offers it — never QuickBooks (U-11).
  const resolvedKey =
    selectedKey ?? (formats.formats ? defaultFormatKey(formats.formats) : null);

  const onFailure = useCallback((err: unknown) => {
    const normalized = toExportFailure(err);
    setFailure(normalized);
    return normalized;
  }, []);

  const runPreview = async () => {
    if (!resolvedKey) return;
    setPreviewing(true);
    setFailure(null);
    setPreview(null);
    try {
      const result = await previewPayrollExport(
        {
          organization_id: organizationId,
          pay_period_id: period.id,
          export_format: resolvedKey,
          include_adjustments: true,
          includes_pii: false,
        },
        { mockCase },
      );
      setPreview(result);
    } catch (err: unknown) {
      onFailure(err);
    } finally {
      setPreviewing(false);
    }
  };

  const runGenerate = async () => {
    if (!resolvedKey) return;

    const signature = `${period.id}:${resolvedKey}`;
    if (intentSignature.current !== signature) {
      intentSignature.current = signature;
      generateKey.current = newExportIntentKey();
    }
    const key = generateKey.current ?? newExportIntentKey();
    generateKey.current = key;

    const ok = await confirm({
      title: "Generate the payroll file",
      description:
        `${ONE_WAY_NOTICE}\n\n` +
        "If this period has already been exported with this format, the existing file is returned " +
        "instead of a second one being built — there is no second version and no second payment. " +
        "Replacing a delivered file is a separate action.",
      confirmLabel: "Generate",
    });
    if (!ok) return;

    setBusy(true);
    setFailure(null);
    try {
      const accepted = await createPayrollExport(
        {
          organization_id: organizationId,
          pay_period_id: period.id,
          export_format: resolvedKey,
          idempotency_key: payrollExportDomainKey(period.id),
          include_adjustments: true,
          includes_pii: false,
          delivery: { mode: "file" },
        },
        key,
        { mockCase },
      );
      run.follow(accepted);
    } catch (err: unknown) {
      onFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (row: PayrollExportHistoryRow) => {
    try {
      const envelope = await getExportArtifact(row.export_id, { mockCase });
      // Only `file_id` and `sha256` are durable; the URLs expire and are a handoff, never stored.
      const href = envelope.signed_url ?? envelope.download_url ?? envelope.cdn_url;
      if (!href) {
        toast.error("This file has no download link right now. Try again in a moment.");
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      const normalized = onFailure(err);
      toast.error(normalized.userMessage);
    }
  };

  const confirmPending = async (value: string) => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setBusy(true);
    setFailure(null);
    const key = newExportIntentKey();
    try {
      if (action.kind === "acknowledge") {
        await acknowledgeExport(action.row.export_id, { acknowledgement_ref: value }, key, {
          mockCase,
        });
        toast.success("Recorded that payroll accepted this file.");
      } else if (action.kind === "fail") {
        await failExport(action.row.export_id, { failure_reason: value }, key, { mockCase });
        toast.success("The failure is recorded beside the file.");
      } else {
        const accepted = await supersedeExport(action.row.export_id, { reason: value }, key, {
          mockCase,
        });
        run.follow(accepted);
      }
      history.reload();
    } catch (err: unknown) {
      const normalized = onFailure(err);
      toast.error(normalized.userMessage);
    } finally {
      setBusy(false);
    }
  };

  const precondition = failure ? classifyPrecondition(failure) : null;
  const rows = history.result?.granted ? history.result.exports : [];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <FileDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          Payroll export
        </h3>
        <p className="mt-1 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {ONE_WAY_NOTICE}
        </p>

        {!canExport ? (
          <p className="mt-3 rounded-md border border-border bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            Generating, accepting and failing a payroll file is the payroll administrator&apos;s. You
            can see every version and its state here.
          </p>
        ) : null}

        {formats.failure ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {formats.failure.userMessage}
          </p>
        ) : null}

        {canExport && formats.formats ? (
          <div className="mt-4 space-y-4">
            <ExportFormatPicker
              formats={formats.formats}
              selectedKey={resolvedKey}
              onSelect={setSelectedKey}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="min-h-[44px]"
                disabled={!resolvedKey || busy}
                onClick={() => void runGenerate()}
              >
                Generate the payroll file
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {canExport ? (
        <ExportPreviewPanel
          preview={preview}
          isRunning={previewing}
          canPreview={Boolean(resolvedKey)}
          onPreview={() => void runPreview()}
          disputesCarried={period.counts.disputed}
          adjustmentsCarried={0}
        />
      ) : null}

      {failure && precondition ? (
        <ExportPreconditionNotice precondition={precondition} failure={failure} />
      ) : null}

      <RunVerdictNotice
        phase={run.phase}
        accepted={run.accepted}
        envelope={run.status ? { status: run.status } : null}
        failureMessage={run.failure?.userMessage ?? null}
        onDismiss={run.clear}
      />

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-foreground">Export history</h3>
        {history.result && !history.result.granted ? (
          // 🚨 A denial is NOT an empty list. Rendering them the same way tells a payroll
          // administrator their access is fine when it is not — and the period silently never
          // gets exported.
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
            {history.result.reason}
            {history.result.capability ? (
              <span className="ml-1 font-mono text-[11px]">({history.result.capability})</span>
            ) : null}
          </p>
        ) : (
          <ExportRunList
            rows={rows}
            isLoading={history.isLoading}
            canAct={canExport}
            onAcknowledge={(row) => setPending({ kind: "acknowledge", row })}
            onFail={(row) => setPending({ kind: "fail", row })}
            onSupersede={(row) => setPending({ kind: "supersede", row })}
            onDownload={(row) => void onDownload(row)}
          />
        )}
      </div>

      {pending ? (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={
            pending.kind === "acknowledge"
              ? "Payroll accepted this file"
              : pending.kind === "fail"
                ? "Record a delivery failure"
                : "Generate a replacement file"
          }
          description={
            pending.kind === "acknowledge"
              ? "Their reference for this import. It is theirs and opaque to us — we store it so the two systems can be matched later. Once recorded, this file can never be superseded, regenerated or re-sent."
              : pending.kind === "fail"
                ? "What the receiving system said. The failure is recorded beside the file and neither is ever deleted."
                : "Why a replacement is needed. This creates a NEW version; the current file stays on disk forever as evidence of what was nearly sent."
          }
          multiline={pending.kind !== "acknowledge"}
          confirmLabel={pending.kind === "acknowledge" ? "Record it" : "Continue"}
          busy={busy}
          validate={(value) => (value.trim().length === 0 ? "Required." : null)}
          onConfirm={(value) => void confirmPending(value.trim())}
        />
      ) : null}
    </section>
  );
}
