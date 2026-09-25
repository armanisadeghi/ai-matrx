"use client";

/**
 * RequestAccess — the platform's answer to a control the viewer cannot use.
 *
 * Owner ruling (Arman, 2026-09-25): the control is ABSENT; where the person
 * would plausibly want it, render this instead. One line + "Ask for access"
 * (or a key icon where space is tight) → a compact dialog with a note box and
 * the context we already know → organization admins (access-request ledger +
 * DM) or the platform team (user feedback). See `features/access-gate/FEATURE.md`.
 */

import { useState } from "react";
import { Check, KeyRound, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useRequestAccess } from "@/features/access-gate/hooks/useRequestAccess";
import {
  contextLines,
  type RequestAccessTarget,
} from "@/features/access-gate/service/requestAccess";

export type { RequestAccessTarget } from "@/features/access-gate/service/requestAccess";

export function RequestAccess({
  target,
  variant = "inline",
  reason,
  className,
}: {
  target: RequestAccessTarget;
  /** `inline` = one line + button; `icon` = key icon only (tight headers). */
  variant?: "inline" | "icon";
  /** Inline only: the one-line why. Defaults from the owner. */
  reason?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const request = useRequestAccess(target);
  const label = `Ask for access to ${target.action.toLowerCase()}`;
  const why =
    reason ??
    (request.owner.kind === "system"
      ? "Only the platform team can change this."
      : `Only ${request.destination} can change this.`);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {request.sent ? (
            <Check className="size-3.5 text-primary" aria-hidden="true" />
          ) : (
            <KeyRound className="size-3.5" aria-hidden="true" />
          )}
        </button>
      ) : (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground",
            className,
          )}
        >
          <span>{request.sent ? "Request sent." : why}</span>
          {request.sent ? null : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setOpen(true)}
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Ask for access
            </Button>
          )}
        </div>
      )}
      {open ? (
        <RequestAccessDialog
          target={target}
          request={request}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

function RequestAccessDialog({
  target,
  request,
  onOpenChange,
}: {
  target: RequestAccessTarget;
  request: ReturnType<typeof useRequestAccess>;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const lines = contextLines(target, request.context());

  async function send() {
    try {
      const result = await request.send(note);
      if (result.undelivered) toast.warning(result.message);
      else toast.success(result.message);
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't send that request.",
      );
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="matrx-touch-targets sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ask for access</DialogTitle>
          <DialogDescription>Goes to {request.destination}.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
          {lines.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <ProTextarea
          className="min-h-20 text-base md:text-sm"
          value={note}
          maxLength={1000}
          autoFocus
          placeholder="What do you need, and why? (optional)"
          aria-label="Note"
          onChange={(event) => setNote(event.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={request.sending} onClick={() => void send()}>
            {request.sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
