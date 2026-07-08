/**
 * features/file-analysis/redact/KeyHandoff.tsx
 *
 * One-time reveal of the per-session AES key returned by /redact/mask.
 *
 * The key is also saved in IndexedDB (see ./session-keys.ts) automatically,
 * and — when the KMS escrow pipeline is up — a client-wrapped copy is
 * escrowed for org recovery (see ./escrow.ts, closes D31). This dialog
 * exists for the security ritual:
 *   - Tell the user what the key is + what recovery exists (escrowStatus).
 *   - Offer "Copy to clipboard" + "Download .key.json" for offline backup.
 *   - Require an explicit acknowledge before closing.
 *
 * Caller dismisses by setting `record` back to null.
 */

"use client";

import { useState } from "react";
import { Check, Copy, Download, KeyRound, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadSessionKey, type StoredSession } from "./session-keys";

/** null = escrow not attempted (e.g. non-reversible mode). */
export type EscrowStatus = "escrowed" | "failed" | null;

interface KeyHandoffProps {
  record: StoredSession | null;
  escrowStatus?: EscrowStatus;
  onClose: () => void;
  onDownloadMasked?: () => void;
}

export function KeyHandoff({
  record,
  escrowStatus = null,
  onClose,
  onDownloadMasked,
}: KeyHandoffProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = !!record;

  const copyKey = async () => {
    if (!record) return;
    await navigator.clipboard.writeText(record.session_key_b64);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setAcknowledged(false);
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" />
            Save your session key
          </DialogTitle>
          <DialogDescription>
            This key restores the original values from the masked PDF.{" "}
            <strong>It is shown exactly once.</strong>
            {escrowStatus === "escrowed"
              ? " A KMS-wrapped copy is escrowed for your organization, so an organization admin can recover it if this browser's data is lost."
              : " Without it, no one (including us) can decrypt the originals — that's the point."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Session ID
            </div>
            <div className="break-all font-mono text-xs">{record?.session_id}</div>
            <div className="mt-2 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
              AES-256-GCM key (base64)
            </div>
            <div className="break-all font-mono text-xs">
              {record?.session_key_b64}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyKey()}>
              {copied ? (
                <Check className="h-3 w-3 mr-1" />
              ) : (
                <Copy className="h-3 w-3 mr-1" />
              )}
              {copied ? "Copied" : "Copy key"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => record && void downloadSessionKey(record)}
            >
              <Download className="h-3 w-3 mr-1" /> Download .key.json
            </Button>
            {onDownloadMasked ? (
              <Button size="sm" variant="outline" onClick={onDownloadMasked}>
                <Shield className="h-3 w-3 mr-1" /> Download masked PDF
              </Button>
            ) : null}
          </div>

          {escrowStatus === "failed" ? (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              Organization escrow FAILED — this key exists only in this
              browser. Clearing site data makes the originals permanently
              unrecoverable. Download the key file now and report the escrow
              failure to your administrator.
            </div>
          ) : null}

          <div className="rounded border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            We've also saved this in your browser's local store. You can find
            past sessions in the Redact panel.{" "}
            {escrowStatus === "escrowed"
              ? "If site data is cleared, use \u201cRecover via organization\u201d in the Restore dialog."
              : "Clearing site data wipes them — keep an external copy for important work."}
          </div>

          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <span>
              {escrowStatus === "escrowed"
                ? "I understand this key is shown once here, with organization escrow as the only recovery path."
                : "I understand this key cannot be recovered if I lose it."}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            disabled={!acknowledged}
            onClick={() => {
              setAcknowledged(false);
              onClose();
            }}
            size="sm"
          >
            I've saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
