"use client";

// features/esign/signer/parts/Dialogs.tsx — the signer's dialogs (esign-parity CONTRACT §11, §13.2):
// Finish (review what is recorded, an optional message to the sender, Finalize), Decline with a
// reason, Assign to someone else, History, Help. Each is a plain Dialog — on a phone it becomes a
// bottom sheet by itself.

import { useState } from "react";
import { CheckCircle2, CircleHelp, History, Mail } from "lucide-react";

import { Button, Field } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Spinner } from "@/components/ui/loaders/Spinner";

export interface RecordedRow {
  id: string;
  label: string;
  value: string;
  markUrl?: string | null;
}

export function FinishDialog({
  open,
  rows,
  senderName,
  messageAllowed,
  busy,
  error,
  voice,
  onEdit,
  onFinalize,
}: {
  open: boolean;
  rows: RecordedRow[];
  senderName: string;
  messageAllowed: boolean;
  busy: boolean;
  error: string | null;
  voice: boolean;
  onEdit: () => void;
  onFinalize: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onEdit()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review and finish</DialogTitle>
          <DialogDescription>This is what will be recorded with your signature.</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-[40dvh] flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="truncate type-secondary text-muted-foreground">{row.label}</span>
              {row.markUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signer's own mark
                <img src={row.markUrl} alt={row.value} className="h-7 max-w-[10rem] rounded-sm bg-white object-contain" />
              ) : (
                <span className="max-w-[60%] truncate text-right type-body text-foreground">{row.value}</span>
              )}
            </li>
          ))}
        </ul>
        {messageAllowed ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="esign-message-to-sender" className="type-secondary font-medium text-foreground">
              Message to {senderName} (optional)
            </label>
            <ProTextarea
              id="esign-message-to-sender"
              aria-label={`Message to ${senderName}`}
              value={message}
              maxLength={2000}
              enableVoice={voice}
              placeholder="Add a note for the sender"
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        ) : null}
        {error ? <p className="type-body text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="quiet" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="success"
            autoFocus
            disabled={busy}
            icon={busy ? <Spinner size="xs" className="text-current" /> : <CheckCircle2 />}
            onClick={() => onFinalize(message.trim())}
          >
            Finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeclineDialog({
  open,
  busy,
  error,
  voice,
  onClose,
  onDecline,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  voice: boolean;
  onClose: () => void;
  onDecline: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline to sign</DialogTitle>
          <DialogDescription>The request closes and the sender sees your reason.</DialogDescription>
        </DialogHeader>
        <ProTextarea
          aria-label="Reason for declining"
          value={reason}
          maxLength={2000}
          enableVoice={voice}
          placeholder="Why are you declining?"
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="type-body text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy || reason.trim() === ""}
            icon={busy ? <Spinner size="xs" className="text-current" /> : undefined}
            onClick={() => onDecline(reason.trim())}
          >
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignDialog({
  open,
  busy,
  error,
  voice,
  onClose,
  onAssign,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  voice: boolean;
  onClose: () => void;
  onAssign: (input: { full_name: string; email: string; message: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const valid = name.trim() !== "" && /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to someone else</DialogTitle>
          <DialogDescription>They get your fields and an email; the sender is told.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {/* ui-exception: a person's name and address — raw values for the request */}
          <Field aria-label="Their full name" placeholder="Full name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          {/* ui-exception: an email address — a raw value */}
          <Field aria-label="Their email" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <ProTextarea
            aria-label="Message to them"
            value={message}
            maxLength={2000}
            enableVoice={voice}
            placeholder="Message to them (optional)"
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        {error ? <p className="type-body text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !valid}
            icon={busy ? <Spinner size="xs" className="text-current" /> : <Mail />}
            onClick={() => onAssign({ full_name: name.trim(), email: email.trim(), message: message.trim() })}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryDialog({
  open,
  events,
  error,
  onClose,
}: {
  open: boolean;
  events: Array<{ event: string; at: string; label: string; mine: boolean }> | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> History
          </DialogTitle>
          <DialogDescription>What has happened to this document so far.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="type-body text-destructive">{error}</p>
        ) : events === null ? (
          <div className="flex justify-center py-4">
            <Spinner size="sm" className="text-muted-foreground" />
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {events.map((e, i) => (
              <li key={`${e.event}-${i}`} className="flex items-start justify-between gap-3">
                <span className={e.mine ? "type-body text-foreground" : "type-body text-muted-foreground"}>{e.label}</span>
                <span className="shrink-0 type-secondary tabular-nums text-muted-foreground">
                  {new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function HelpDialog({
  open,
  senderName,
  senderEmail,
  onClose,
}: {
  open: boolean;
  senderName: string;
  senderEmail: string | null;
  onClose: () => void;
}) {
  const steps = [
    ["Start", "jumps to your first field. Next field moves on."],
    ["Coloured tags", "are yours. A star means required."],
    ["Finish later", "keeps what you entered. Open the same link to return."],
    ["Finish", "shows what is recorded before you finalize."],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleHelp className="h-4 w-4" /> Help with signing
          </DialogTitle>
          <DialogDescription>Your signature here is legally binding, like ink.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5">
          {steps.map(([lead, rest]) => (
            <li key={lead} className="type-body text-muted-foreground">
              <span className="font-medium text-foreground">{lead}</span> {rest}
            </li>
          ))}
        </ul>
        {senderEmail ? (
          <DialogFooter>
            <Button variant="outline" icon={<Mail />} asChild>
              <a href={`mailto:${senderEmail}`}>Ask {senderName}</a>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
