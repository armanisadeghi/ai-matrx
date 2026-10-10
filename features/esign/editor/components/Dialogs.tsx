"use client";

// features/esign/editor/components/Dialogs.tsx — Send confirmation (D9.2), Save as template, and
// Preview as a recipient (D9.1). Plain Dialogs: on a phone they become bottom sheets by themselves.

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";

import { Badge, Button, Select } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { EnvelopeDraftV1 } from "../../contract/draft";
import { useSenderName } from "../useSenderName";
import { recipientColor } from "../../contract/paper";
import { draftWarnings, effectiveSubject, ROLE_LABEL, sendBlockers } from "../model";
import type { SendResult } from "../api/types";
import { DocumentStage, type StageHandlers } from "./DocumentStage";
import { ProInput } from "@/components/official/ProInput";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const VERIFY_LABEL = { none: "Email link", email_code: "Email code", access_code: "Access code" } as const;

export function SendDialog(p: {
  open: boolean;
  draft: EnvelopeDraftV1;
  sending: boolean;
  result: SendResult | null;
  error: string | null;
  onClose(): void;
  onSend(): void;
  /** Where "Only me" goes straight to signing. */
  onlyMe: boolean;
}) {
  const sender = useSenderName();
  const blockers = sendBlockers(p.draft);
  const warnings = draftWarnings(p.draft);
  const recipients = [...p.draft.recipients].sort((a, b) => a.order - b.order);
  const s = p.draft.settings;
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && !p.sending && p.onClose()}>
      <DialogContent>
        {p.result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {p.onlyMe ? "Ready for you to sign" : "Sent"}
              </DialogTitle>
              <DialogDescription>{p.onlyMe ? "Open it and sign." : `${p.result.notified} ${p.result.notified === 1 ? "person has" : "people have"} been told.`}</DialogDescription>
            </DialogHeader>
            {p.result.warnings.length > 0 && (
              <p className="flex items-start gap-1.5 type-secondary text-muted-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                {p.result.warnings.length} {p.result.warnings.length === 1 ? "recipient has" : "recipients have"} no signature field.
              </p>
            )}
            <DialogFooter>
              <Button variant="primary" asChild>
                <Link href={p.onlyMe ? `/sign/e/${p.result.envelope_id}` : `/esign/${p.result.envelope_id}`}>{p.onlyMe ? "Sign now" : "View envelope"}</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send for signature</DialogTitle>
              <DialogDescription className="truncate">{effectiveSubject(p.draft, sender)}</DialogDescription>
            </DialogHeader>
            <ol className="flex flex-col gap-1.5">
              {recipients.map((r, i) => (
                <li key={r.key} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5" style={{ borderLeft: `4px solid ${recipientColor(r.color_index)}` }}>
                  {s.signing_order === "sequential" && <span className="w-4 text-center type-secondary tabular-nums text-muted-foreground">{i + 1}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate type-body">{r.full_name}</div>
                    <div className="truncate type-secondary text-muted-foreground">{r.email}</div>
                  </div>
                  <Badge>{ROLE_LABEL[r.role]}</Badge>
                  {!r.user_id && r.verification !== "none" && <Badge tone="info">{VERIFY_LABEL[r.verification]}</Badge>}
                </li>
              ))}
            </ol>
            <p className="type-secondary text-muted-foreground">
              Expires in {s.expires_in_days} days · {s.reminders.enabled ? `reminders after day ${s.reminders.cadence_days.join(", ")}` : "no reminders"}
            </p>
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 type-secondary text-muted-foreground">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                {w}
              </p>
            ))}
            {blockers.map((b) => (
              <p key={b} className="type-secondary text-destructive">{b}</p>
            ))}
            {p.error && <p className="type-body text-destructive">{p.error}<ErrorAlchemyMenu error={p.error} /></p>}
            <DialogFooter>
              <Button variant="quiet" disabled={p.sending} onClick={p.onClose}>
                Keep editing
              </Button>
              <Button variant="primary" disabled={p.sending || blockers.length > 0} icon={p.sending ? <Spinner size="xs" className="text-current" /> : <Send />} onClick={p.onSend}>
                Send
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TemplateDialog(p: {
  open: boolean;
  initialName: string;
  saving: boolean;
  error: string | null;
  onClose(): void;
  onSave(name: string, description: string): void;
}) {
  const [name, setName] = useState(p.initialName);
  const [description, setDescription] = useState("");
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && !p.saving && p.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>Documents, roles and fields. Names and access codes stay out.</DialogDescription>
        </DialogHeader>
        <ProInput aria-label="Template name" placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
        <ProTextarea aria-label="Description" placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        {p.error && <p className="type-body text-destructive">{p.error}<ErrorAlchemyMenu error={p.error} /></p>}
        <DialogFooter>
          <Button variant="quiet" disabled={p.saving} onClick={p.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || p.saving} icon={p.saving ? <Spinner size="xs" className="text-current" /> : undefined} onClick={() => p.onSave(name.trim(), description.trim())}>
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewDialog(p: {
  open: boolean;
  draft: EnvelopeDraftV1;
  initialRecipient: string | null;
  onClose(): void;
}) {
  const sender = useSenderName();
  const recipients = [...p.draft.recipients].sort((a, b) => a.order - b.order);
  const [key, setKey] = useState<string | null>(p.initialRecipient);
  const [zoom, setZoom] = useState(1);
  const r = recipients.find((x) => x.key === (key ?? recipients[0]?.key));
  const mine = r ? p.draft.fields.filter((f) => f.recipient_key === r.key) : [];
  const required = mine.filter((f) => f.required && f.kind !== "date_signed").length;
  const noop = () => undefined;
  const handlers: StageHandlers = {
    onSelect: noop, onPlace: noop, onMoveMany: noop, onResize: noop, onDuplicate: noop, onDelete: noop,
    onAcceptCandidate: noop, onRemoveCandidate: noop, onPages: noop,
  };
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && p.onClose()}>
      <DialogContent size="xl" height="tall" className="flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview as a recipient</DialogTitle>
          <DialogDescription className="sr-only">What this person sees when they open the envelope.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Preview as"
            value={r?.key ?? ""}
            options={recipients.map((x) => ({ value: x.key, label: `${x.full_name || x.email || "Recipient"} · ${ROLE_LABEL[x.role]}` }))}
            onValueChange={setKey}
          />
          {r && <Badge tone="info">{required} required</Badge>}
          <span className="min-w-0 flex-1 truncate type-secondary text-muted-foreground">{effectiveSubject(p.draft, sender)}</span>
        </div>
        {(p.draft.message || r?.private_message) && (
          <div className="rounded-md border border-border bg-card p-2.5 type-body">
            {p.draft.message && <p className="line-clamp-3 whitespace-pre-wrap">{p.draft.message}</p>}
            {r?.private_message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.private_message}</p>}
          </div>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          <DocumentStage
            {...handlers}
            draft={p.draft}
            selection={new Set()}
            armed={null}
            candidates={{}}
            onlyRecipient={r?.key ?? null}
            readOnly
            zoom={zoom}
            onZoom={setZoom}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
