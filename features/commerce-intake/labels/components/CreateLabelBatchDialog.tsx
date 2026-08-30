"use client";

/**
 * CreateLabelBatchDialog — one print run: choose stock + count, mint the
 * pooled codes, land on the batch detail to print.
 *
 * The form's defaults and its ceiling are KNOBS, never constants
 * (limits-are-knobs): `commerce.labels.default_template` (org+user
 * overridable), `commerce.labels.max_batch_size` (org) — read through
 * `useScopedKnobs`, so an org's configuration screen changes this form with
 * no deploy. A missing knob renders as a hard error, never a silent
 * fallback.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScopedKnobs } from "@/lib/scoped-config/useScopedKnobs";
import { LABEL_TEMPLATES } from "@ai-matrx/print/labels";
import { toast } from "@/lib/toast";

import { createLabelBatch, mintLabelCodes } from "../service";
import { labelBatchHref } from "../types";

function knobString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

function knobInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : fallback;
}

export function CreateLabelBatchDialog({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { knobs, isLoading, missing } = useScopedKnobs({
    organizationId,
    featurePrefix: "commerce.labels",
  });

  const defaultTemplate = useMemo(
    () =>
      knobString(
        knobs.find((k) => k.key === "default_template")?.effective_value,
        "avery-5163",
      ),
    [knobs],
  );
  const maxBatchSize = useMemo(
    () =>
      knobInt(
        knobs.find((k) => k.key === "max_batch_size")?.effective_value,
        1000,
      ),
    [knobs],
  );

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [count, setCount] = useState("100");
  const [prefix, setPrefix] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  // Adopt the knob default once it resolves (unless the user already picked).
  useEffect(() => {
    if (!isLoading) setTemplateId((prev) => prev ?? defaultTemplate);
  }, [isLoading, defaultTemplate]);

  const parsedCount = Number.parseInt(count, 10);
  const countValid =
    Number.isFinite(parsedCount) && parsedCount >= 1 && parsedCount <= maxBatchSize;

  const create = async () => {
    if (!countValid || !templateId) return;
    setBusy(true);
    try {
      const batch = await createLabelBatch({
        organizationId,
        templateId,
        requestedCount: parsedCount,
        codePrefix: prefix || null,
        purpose: purpose || null,
      });
      await mintLabelCodes(batch, parsedCount);
      toast.success(`Minted ${parsedCount} codes.`);
      onOpenChange(false);
      router.push(labelBatchHref(batch));
    } catch (err) {
      console.error("[commerce-labels] create batch failed", err);
      toast.error(
        err instanceof Error ? err.message : "Could not create the batch.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New label batch</DialogTitle>
          <DialogDescription>
            Mint a pool of QR codes, print them on label stock, and stick them
            on items — scanning a label in intake claims it for that item.
          </DialogDescription>
        </DialogHeader>

        {missing.length > 0 && (
          <p className="text-sm text-destructive">
            Label settings are missing for this organization (
            {missing.map((k) => k.key).join(", ")}) — an admin must seed the
            commerce.labels knobs before batches can be created.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lb-purpose">Purpose</Label>
            <Input
              id="lb-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. March intake — shelf A labels"
              className="text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Label stock</Label>
            <Select
              value={templateId ?? defaultTemplate}
              onValueChange={setTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose label stock" />
              </SelectTrigger>
              <SelectContent>
                {LABEL_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lb-count">Codes to mint</Label>
              <Input
                id="lb-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxBatchSize}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">
                1–{maxBatchSize} per batch
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lb-prefix">Code prefix (optional)</Label>
              <Input
                id="lb-prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                placeholder="e.g. AGR"
                className="text-base font-mono"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !countValid || missing.length > 0}
            onClick={() => void create()}
          >
            {busy ? "Minting…" : "Create & mint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
