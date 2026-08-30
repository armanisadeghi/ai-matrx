"use client";

/**
 * PrintLabelDialog — the asset detail's "Print label" action.
 *
 * Two lanes:
 * - REPRINT: the asset already carries a live our_qr — print that exact
 *   payload again (pool codes print their resolver URL; a legacy raw string
 *   prints as-is). No identifier writes.
 * - ASSIGN NEW: take the next available code from an open batch (or mint a
 *   single-code batch), claim it (state-guarded), and write the identifier
 *   row honoring the REPLACEMENT LIFECYCLE — an existing live primary is
 *   retired with `replaced_at`/`replaced_reason='label_replaced'`, never
 *   deleted, freeing its slot in the live unique index.
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { printQrLabelSheet, type QrEcLevel } from "@ai-matrx/print/labels";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";
import { toast } from "@/lib/toast";

import type { AssetIdentifier, IntakeAsset } from "../../types";
import { addIdentifier, replaceIdentifier } from "../../service";
import { labelUrlForCode } from "../codes";
import {
  claimLabelCode,
  countAvailableCodes,
  createLabelBatch,
  findLabelCode,
  firstAvailableCode,
  listOpenLabelBatches,
  mintLabelCodes,
  releaseLabelCode,
} from "../service";
import type { LabelBatch } from "../types";

const MINT_SINGLE = "__mint_single__";

export function PrintLabelDialog({
  asset,
  identifiers,
  open,
  onOpenChange,
  onChanged,
}: {
  asset: IntakeAsset;
  identifiers: AssetIdentifier[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after identifier rows changed (assign-new lane). */
  onChanged: () => void;
}) {
  const organizationId = asset.organizationId;
  const { knobs } = useScopedKnobs({
    organizationId,
    featurePrefix: "commerce.labels",
  });
  const ecLevel = useMemo<QrEcLevel>(() => {
    const v = knobs.find((k) => k.key === "qr_ec_level")?.effective_value;
    return v === "L" || v === "M" || v === "Q" ? v : "M";
  }, [knobs]);
  const defaultTemplate = useMemo(() => {
    const v = knobs.find((k) => k.key === "default_template")?.effective_value;
    return typeof v === "string" && v ? v : "avery-5163";
  }, [knobs]);

  const livePrimary = identifiers.find(
    (i) => i.kind === "our_qr" && !i.replacedAt,
  );

  const [batches, setBatches] = useState<LabelBatch[]>([]);
  const [availableByBatch, setAvailableByBatch] = useState<Map<string, number>>(
    new Map(),
  );
  const [source, setSource] = useState<string>(MINT_SINGLE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const openBatches = await listOpenLabelBatches(organizationId);
        if (cancelled) return;
        const counts = await countAvailableCodes(openBatches.map((b) => b.id));
        if (cancelled) return;
        const withCodes = openBatches.filter(
          (b) => (counts.get(b.id) ?? 0) > 0,
        );
        setBatches(withCodes);
        setAvailableByBatch(counts);
        setSource(withCodes[0]?.id ?? MINT_SINGLE);
      } catch (err) {
        console.error("[commerce-labels] batch picker load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const printOne = async (value: string) => {
    // A pool code prints its resolver URL; a legacy raw string prints as-is.
    const pooled = await findLabelCode(organizationId, value).catch(() => null);
    const outcome = await printQrLabelSheet(
      {
        labels: [
          { qrValue: pooled ? labelUrlForCode(value) : value, caption: value },
        ],
        templateId: defaultTemplate,
      },
      undefined,
      { ecLevel },
    );
    // Popup blocked → the sheet downloaded as .html; say so (QA F5).
    notifyPrintOutcome(outcome);
  };

  const reprint = async () => {
    if (!livePrimary) return;
    setBusy(true);
    try {
      await printOne(livePrimary.value);
      onOpenChange(false);
    } catch (err) {
      console.error("[commerce-labels] reprint failed", err);
      toast.error("Could not print the label.");
    } finally {
      setBusy(false);
    }
  };

  const assignNew = async () => {
    setBusy(true);
    try {
      // 1. A code to claim: next from the chosen batch, or mint a single.
      let code =
        source !== MINT_SINGLE ? await firstAvailableCode(source) : null;
      if (!code) {
        const single = await createLabelBatch({
          organizationId,
          templateId: defaultTemplate,
          requestedCount: 1,
          purpose: "Single label (asset detail)",
        });
        [code] = await mintLabelCodes(single, 1);
      }
      // 2. Claim FIRST (state-guarded) so two devices can't share the code.
      const claimed = await claimLabelCode(code, asset.id);
      if (!claimed) throw new Error("That code was just taken — try again.");
      try {
        // 3. Identifier writes, honoring the replacement lifecycle.
        if (livePrimary) {
          await replaceIdentifier(livePrimary.id, "label_replaced");
        }
        await addIdentifier({
          assetId: asset.id,
          organizationId,
          kind: "our_qr",
          value: code.value,
          isPrimary: true,
          isMachineReadable: true,
        });
      } catch (err) {
        await releaseLabelCode(code.id).catch(() => undefined);
        throw err;
      }
      toast.success("Label assigned.");
      onChanged();
      await printOne(code.value);
      onOpenChange(false);
    } catch (err) {
      console.error("[commerce-labels] assign label failed", err);
      toast.error(
        err instanceof Error ? err.message : "Could not assign a label.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Print label</DialogTitle>
          <DialogDescription>
            {livePrimary
              ? `This item's label is ${livePrimary.value}. Reprint it, or assign a new code (the old one is retired, never deleted).`
              : "Assign a QR code to this item and print its label."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              New code from
            </p>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.purpose || "Label batch"} (
                    {availableByBatch.get(b.id) ?? 0} left)
                  </SelectItem>
                ))}
                <SelectItem value={MINT_SINGLE}>Mint a single code</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {livePrimary && (
            <Button variant="outline" disabled={busy} onClick={() => void reprint()}>
              Reprint current
            </Button>
          )}
          <Button disabled={busy} onClick={() => void assignNew()}>
            {busy
              ? "Working…"
              : livePrimary
                ? "Assign new & print"
                : "Assign & print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
