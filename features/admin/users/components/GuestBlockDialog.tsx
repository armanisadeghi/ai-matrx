"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

const DURATIONS = {
  "1h": { label: "1 hour", ms: 3_600_000 },
  "24h": { label: "24 hours", ms: 86_400_000 },
  "7d": { label: "7 days", ms: 7 * 86_400_000 },
  "30d": { label: "30 days", ms: 30 * 86_400_000 },
  indefinite: { label: "Until a super admin unblocks it", ms: null },
} as const;

type DurationKey = keyof typeof DURATIONS;

export interface GuestBlockDialogProps {
  open: boolean;
  /** How the table names this identity. */
  label: string;
  fingerprintHint: string | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (args: { reason: string | null; blockedUntil: string | null }) => void;
}

export function GuestBlockDialog({
  open,
  label,
  fingerprintHint,
  pending,
  onOpenChange,
  onConfirm,
}: GuestBlockDialogProps) {
  const [duration, setDuration] = useState<DurationKey>("24h");
  const [reason, setReason] = useState("");
  const ms = DURATIONS[duration].ms;
  const until = ms === null ? null : new Date(Date.now() + ms);
  const untilText = until
    ? `until ${until.toLocaleString()}`
    : "until a super admin unblocks it";

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Block guest access: {label}</DialogTitle>
          <DialogDescription className="text-xs">
            Every signed-out request from this browser
            {fingerprintHint ? ` (fingerprint ${fingerprintHint}…)` : ""} is refused
            with 403 — guest chat, agent runs, and every other AI Matrx server call —{" "}
            <span className="font-medium text-foreground">{untilText}</span>. Signing in
            to an account is not affected.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs font-medium">
            Duration
            <Select value={duration} onValueChange={(v) => setDuration(v as DurationKey)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DURATIONS) as DurationKey[]).map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {DURATIONS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Reason (optional, kept in the guest's block history)
            <Textarea
              value={reason}
              maxLength={500}
              rows={2}
              className="text-xs"
              placeholder="e.g. scripted requests burning LLM spend"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            className="gap-1"
            onClick={() =>
              onConfirm({
                reason: reason.trim() || null,
                // Recomputed at click time so the stored end matches the promise.
                blockedUntil: ms === null ? null : new Date(Date.now() + ms).toISOString(),
              })
            }
          >
            <Ban className="h-3.5 w-3.5" />
            {pending ? "Blocking…" : "Block guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
