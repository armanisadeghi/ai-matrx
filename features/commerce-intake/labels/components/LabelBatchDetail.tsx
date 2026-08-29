"use client";

/**
 * LabelBatchDetail — one print run: counts, print / preview / PDF /
 * calibration through the `lib/label-print` seam, reprint ranges (the
 * printer's own labelRange/startAt settings), void remaining codes, and the
 * full code list with doors to the owning assets.
 *
 * Batch state is AUTO-DERIVED from the codes (open → printed → exhausted;
 * void wins) — `reconcileBatchState` stamps drift on load, and nothing here
 * hand-manages the lifecycle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  Ruler,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import {
  PrintOptionsDialog,
  usePrintOptions,
} from "@/lib/block-print/PrintOptionsDialog";
import type { BlockPrinter } from "@/lib/block-print/block-print-utils";
import { LabelSheetPreview } from "@/lib/label-print/LabelSheetPreview";
import {
  LABEL_TEMPLATES,
  getLabelTemplate,
} from "@/lib/label-print/label-templates";
import { downloadLabelsPdf } from "@/lib/label-print/qr-labels-pdf";
import {
  printCalibrationSheet,
  qrLabelsPrinter,
  type QrEcLevel,
  type QrLabelPrintData,
} from "@/lib/label-print/qr-labels-printer";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { toast } from "@/lib/toast";

import { labelUrlForCode } from "../codes";
import {
  listBatchCodes,
  loadLabelBatch,
  markBatchPrinted,
  reconcileBatchState,
  voidCodes,
} from "../service";
import type { LabelBatch, LabelCode } from "../types";
import { formatBatchState } from "../columns";

function stateTone(state: string): string {
  return state === "open"
    ? "border-primary/40 text-primary"
    : state === "printed"
      ? "border-border text-foreground"
      : "border-border text-muted-foreground";
}

export function LabelBatchDetail({
  batchId,
  organizationId,
}: {
  batchId: string;
  organizationId: string | null;
}) {
  const [batch, setBatch] = useState<LabelBatch | null>(null);
  const [codes, setCodes] = useState<LabelCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingVoid, setPendingVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const { knobs } = useScopedKnobs({
    organizationId,
    featurePrefix: "commerce.labels",
  });
  const ecLevel = useMemo<QrEcLevel>(() => {
    const v = knobs.find((k) => k.key === "qr_ec_level")?.effective_value;
    return v === "L" || v === "M" || v === "Q" ? v : "M";
  }, [knobs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const loaded = await loadLabelBatch(batchId);
        if (cancelled) return;
        if (!loaded) {
          setBatch(null);
          setCodes([]);
          return;
        }
        const loadedCodes = await listBatchCodes(loaded.id);
        if (cancelled) return;
        const reconciled = await reconcileBatchState(loaded, loadedCodes);
        if (cancelled) return;
        setBatch(reconciled);
        setCodes(loadedCodes);
      } catch (err) {
        console.error("[commerce-labels] batch load failed", err);
        toast.error("Could not load the batch.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, reloadNonce]);

  const template =
    getLabelTemplate(batch?.templateId ?? "") ?? LABEL_TEMPLATES[0];
  const perPage = template.cols * template.rows;

  const printData = useMemo<QrLabelPrintData>(
    () => ({
      // The printed payload is the resolver URL; the caption keeps the bare
      // code human-readable on the label.
      labels: codes
        .filter((c) => c.state !== "void")
        .map((c) => ({ qrValue: labelUrlForCode(c.value), caption: c.value })),
      templateId: template.id,
    }),
    [codes, template.id],
  );

  /** The seam printer with the org's error-correction knob as its default. */
  const orgPrinter = useMemo<BlockPrinter>(
    () => ({
      ...qrLabelsPrinter,
      settings: (qrLabelsPrinter.settings ?? []).map((s) =>
        s.type === "select" && s.id === "ecLevel"
          ? { ...s, defaultValue: ecLevel }
          : s,
      ),
    }),
    [ecLevel],
  );

  const { open, setOpen, triggerPrint } = usePrintOptions(
    orgPrinter,
    printData,
  );

  const stampPrinted = useCallback(async () => {
    if (!batch || batch.printedAt) return;
    try {
      setBatch(await markBatchPrinted(batch));
    } catch (err) {
      console.error("[commerce-labels] mark printed failed", err);
    }
  }, [batch]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!batch) {
    return (
      <AccessGate
        token="commerce_label_batch"
        id={batchId}
        onRetry={() => setReloadNonce((n) => n + 1)}
        fallbackHref="/commerce/labels"
        fallbackLabel="All label batches"
      />
    );
  }

  const available = codes.filter((c) => c.state === "available").length;
  const assigned = codes.filter((c) => c.state === "assigned").length;
  const voided = codes.filter((c) => c.state === "void").length;
  const printable = codes.filter((c) => c.state !== "void");
  const pageCount = Math.max(1, Math.ceil(printable.length / perPage));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-safe">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {batch.purpose || "Label batch"}
            </h2>
            <Badge
              variant="outline"
              className={`py-0 text-[10px] ${stateTone(batch.state)}`}
            >
              {formatBatchState(batch.state)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {template.name} · {codes.length} codes — {available} available ·{" "}
            {assigned} assigned · {voided} voided
            {batch.codePrefix ? ` · prefix ${batch.codePrefix}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9"
            disabled={printable.length === 0}
            onClick={() => {
              void stampPrinted();
              void triggerPrint();
            }}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={printable.length === 0}
            onClick={() => {
              void stampPrinted();
              void downloadLabelsPdf(
                printData,
                template.id,
                { ecLevel },
                `labels-${batch.id.slice(0, 8)}.pdf`,
              ).catch((err: unknown) => {
                console.error("[commerce-labels] pdf failed", err);
                toast.error("Could not build the PDF.");
              });
            }}
          >
            <Download className="mr-1.5 h-4 w-4" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => printCalibrationSheet(template)}
          >
            <Ruler className="mr-1.5 h-4 w-4" />
            Calibration
          </Button>
          {available > 0 && batch.state !== "void" && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-destructive"
              onClick={() => setPendingVoid(true)}
            >
              <Ban className="mr-1.5 h-4 w-4" />
              Void remaining
            </Button>
          )}
        </div>
      </div>

      {/* Sheet preview (exact proportions; the printer's geometry brain) */}
      {printable.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Sheet preview — {template.name}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  {pageIndex + 1}/{pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={pageIndex >= pageCount - 1}
                  onClick={() =>
                    setPageIndex((p) => Math.min(pageCount - 1, p + 1))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <LabelSheetPreview
            template={template}
            labels={printable.map((c) => ({
              qrValue: labelUrlForCode(c.value),
              caption: c.value,
            }))}
            ecLevel={ecLevel}
            pageIndex={pageIndex}
          />
        </div>
      )}

      {/* Codes — every identity opens (no dead ends): assigned → its asset */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Item</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c, i) => (
              <tr key={c.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{c.value}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      c.state === "available"
                        ? "text-primary"
                        : c.state === "assigned"
                          ? "text-foreground"
                          : "text-muted-foreground line-through"
                    }
                  >
                    {c.state}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {c.assetId ? (
                    <Link
                      href={`/commerce/intake/assets/${c.assetId}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Open item
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PrintOptionsDialog
        printer={orgPrinter}
        data={printData}
        open={open}
        onOpenChange={setOpen}
      />

      <ConfirmDialog
        open={pendingVoid}
        onOpenChange={setPendingVoid}
        title="Void the remaining codes?"
        description={`${available} unassigned code${available === 1 ? "" : "s"} will be voided — scanning one will be refused. Codes already on items keep working.`}
        confirmLabel="Void remaining"
        variant="destructive"
        busy={voiding}
        onConfirm={async () => {
          setVoiding(true);
          try {
            const ids = codes
              .filter((c) => c.state === "available")
              .map((c) => c.id);
            const n = await voidCodes(ids, "voided from batch detail");
            toast.success(`Voided ${n} codes.`);
            setPendingVoid(false);
            setReloadNonce((x) => x + 1);
          } catch (err) {
            console.error("[commerce-labels] void failed", err);
            toast.error("Could not void the codes.");
          } finally {
            setVoiding(false);
          }
        }}
      />
    </div>
  );
}
