"use client";

/**
 * ImportIdentifiersDialog — the CONVERSION path (census gap d): bring a
 * customer's existing IDs into the identifier system as `client_ref` /
 * `asset_tag` rows, matched to assets by an identifier the system already
 * knows (a serial, a QR, an earlier tag).
 *
 * Input is CSV (papaparse) or pasted lines: column 1 = the MATCH value,
 * column 2 = the NEW id (omit column 2 to reuse column 1 — "their ref IS the
 * serial" is the common degenerate case). Optionally mints a paired our_qr
 * pool batch — one printed QR per matched item, claimed onto it — and lands
 * on that batch to print.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";

import type { IdentifierKind } from "../../types";
import { addIdentifier } from "../../service";
import {
  claimLabelCode,
  createLabelBatch,
  matchAssetsByIdentifier,
  mintLabelCodes,
} from "../service";
import { labelBatchHref } from "../types";

const MATCH_KINDS: { value: IdentifierKind; label: string }[] = [
  { value: "manufacturer_serial", label: "Manufacturer serial" },
  { value: "our_qr", label: "Our QR code" },
  { value: "asset_tag", label: "Asset tag" },
  { value: "client_ref", label: "Client reference" },
];

const TARGET_KINDS: { value: IdentifierKind; label: string }[] = [
  { value: "client_ref", label: "Client reference" },
  { value: "asset_tag", label: "Asset tag" },
];

interface ImportReport {
  matched: number;
  written: number;
  duplicates: number;
  unmatched: string[];
}

export function ImportIdentifiersDialog({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [matchKind, setMatchKind] = useState<IdentifierKind>(
    "manufacturer_serial",
  );
  const [targetKind, setTargetKind] = useState<IdentifierKind>("client_ref");
  const [mintQr, setMintQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const onFile = async (file: File) => {
    setRaw(await file.text());
  };

  const run = async () => {
    setBusy(true);
    setReport(null);
    try {
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<string[]>(raw.trim(), {
        skipEmptyLines: true,
      });
      const pairs: { match: string; next: string }[] = [];
      for (const row of parsed.data) {
        if (!Array.isArray(row) || row.length === 0) continue;
        const match = String(row[0] ?? "").trim();
        if (!match || match.toLowerCase() === "match") continue; // header-ish
        const next = String(row[1] ?? "").trim() || match;
        pairs.push({ match, next });
      }
      if (pairs.length === 0) {
        toast.error("Nothing to import — paste CSV or lines first.");
        return;
      }

      const assetByValue = await matchAssetsByIdentifier(
        organizationId,
        matchKind,
        pairs.map((p) => p.match),
      );

      let written = 0;
      let duplicates = 0;
      const unmatched: string[] = [];
      const matchedPairs = pairs.filter((p) => {
        const hit = assetByValue.has(p.match);
        if (!hit) unmatched.push(p.match);
        return hit;
      });

      for (const pair of matchedPairs) {
        const assetId = assetByValue.get(pair.match)!;
        try {
          await addIdentifier({
            assetId,
            organizationId,
            kind: targetKind,
            value: pair.next,
          });
          written += 1;
        } catch (err) {
          // The live unique index refuses a value already on another item —
          // count it, keep going; the report says how many.
          duplicates += 1;
          console.warn("[commerce-labels] import row refused", pair, err);
        }
      }

      setReport({
        matched: matchedPairs.length,
        written,
        duplicates,
        unmatched,
      });

      if (mintQr && written > 0) {
        // Paired our_qr minting: one pooled code per successfully written
        // row, claimed straight onto the matched asset; print from the batch.
        const batch = await createLabelBatch({
          organizationId,
          templateId: "avery-5163",
          requestedCount: written,
          purpose: `Import ${new Date().toISOString().slice(0, 10)} — paired QR labels`,
        });
        const codes = await mintLabelCodes(batch, written);
        let codeIndex = 0;
        for (const pair of matchedPairs) {
          const assetId = assetByValue.get(pair.match)!;
          const code = codes[codeIndex];
          if (!code) break;
          try {
            const claimed = await claimLabelCode(code, assetId);
            if (!claimed) continue;
            await addIdentifier({
              assetId,
              organizationId,
              kind: "our_qr",
              value: code.value,
              isMachineReadable: true,
            });
            codeIndex += 1;
          } catch (err) {
            // Typically: the asset already carries a live our_qr primary —
            // leave it; the unclaimed code stays available in the batch.
            console.warn("[commerce-labels] paired mint skipped", pair, err);
          }
        }
        toast.success("Import done — opening the label batch to print.");
        onOpenChange(false);
        router.push(labelBatchHref(batch));
        return;
      }

      toast.success(`Imported ${written} identifier${written === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error("[commerce-labels] import failed", err);
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import customer IDs</DialogTitle>
          <DialogDescription>
            Paste CSV or lines: column 1 matches an existing identifier, column
            2 is the new ID to record (omit it to reuse column 1).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Match items by</Label>
              <Select
                value={matchKind}
                onValueChange={(v) => setMatchKind(v as IdentifierKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Record as</Label>
              <Select
                value={targetKind}
                onValueChange={(v) => setTargetKind(v as IdentifierKind)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={"SN12345,CUST-0001\nSN12346,CUST-0002"}
            className="font-mono text-base"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-muted-foreground">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
                id="import-ids-file"
              />
              <Button asChild variant="outline" size="sm" className="h-8">
                <span
                  role="button"
                  onClick={() =>
                    document.getElementById("import-ids-file")?.click()
                  }
                >
                  Choose CSV file
                </span>
              </Button>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mintQr}
                onCheckedChange={(v) => setMintQr(v === true)}
              />
              Also mint a QR label per matched item
            </label>
          </div>

          {report && (
            <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs">
              <p>
                Matched {report.matched} · written {report.written} · refused as
                duplicates {report.duplicates} · unmatched{" "}
                {report.unmatched.length}
              </p>
              {report.unmatched.length > 0 && (
                <p className="mt-1 max-h-20 overflow-y-auto font-mono text-muted-foreground">
                  {report.unmatched.slice(0, 50).join(", ")}
                  {report.unmatched.length > 50 ? " …" : ""}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={busy || !raw.trim()} onClick={() => void run()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
