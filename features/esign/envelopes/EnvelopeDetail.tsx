"use client";

// features/esign/envelopes/EnvelopeDetail.tsx — /esign/[envelopeId]: one envelope, for its sender.
//
// Who has signed and who is next; remind, resend (optionally to a corrected address) and void;
// every document; the evidence trail (every open, view, consent and signature, with its time and
// address); and, once complete, whether the stored documents and signatures still verify.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  PenLine,
  Printer,
  RotateCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@ai-matrx/design-system";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import {
  EnvelopeRefusal,
  fetchEnvelope,
  remindEnvelope,
  resendToSigner,
  verifyEnvelope,
  voidEnvelope,
  type EnvelopeState,
} from "./service";
import { SIGNER_STATUS_LABEL, signHref, statusLabel } from "./types";

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  document_frozen: "Document sealed",
  sent: "Sent",
  opened: "Opened",
  viewed: "Viewed the document",
  consent_given: "Agreed to sign electronically",
  signature_adopted: "Adopted a signature",
  signed: "Signed",
  declined: "Declined",
  delegated: "Passed it on",
  reminded: "Reminder sent",
  resent: "Sent again",
  voided: "Voided",
  expired: "Expired",
  completed: "Completed",
  certificate_generated: "Certificate issued",
  downloaded: "Downloaded a document",
  delivery_failed: "Could not be delivered",
};

const REFUSAL_TEXT: Record<string, string> = {
  envelope_completed: "This envelope is already complete.",
  envelope_voided: "This envelope was voided.",
  envelope_declined: "This envelope was declined.",
  envelope_expired: "This envelope expired.",
  cannot_void_completed: "A completed envelope cannot be voided.",
  waiting_on_earlier_position: "That signer's turn has not come yet.",
};

function text(record: Record<string, unknown> | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function refusalText(reason: string | null | undefined): string {
  return (reason && REFUSAL_TEXT[reason]) || "That could not be done right now.";
}

const OPEN_STATUSES = new Set(["sent", "in_progress"]);

export function EnvelopeDetail({ envelopeId }: { envelopeId: string }) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const [state, setState] = useState<EnvelopeState | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [resendFor, setResendFor] = useState<{ id: string; email: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    fetchEnvelope(envelopeId)
      .then((next) => {
        if (!live) return;
        setState(next);
        if (next && text(next.envelope, "status") === "completed") {
          void verifyEnvelope(envelopeId)
            .then((v) => live && setVerdict(v))
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => live && setFailed(err instanceof Error ? err.message : "This envelope could not be loaded."));
    return () => {
      live = false;
    };
  }, [envelopeId, reload]);

  async function run(key: string, action: () => Promise<{ granted: boolean; reason?: string | null }>, done: string) {
    setBusy(key);
    try {
      const answer = await action();
      if (answer.granted) {
        toast.success(done);
        setReload((n) => n + 1);
      } else {
        toast.error(refusalText(answer.reason));
      }
    } catch (err) {
      toast.error(err instanceof EnvelopeRefusal ? err.message : "That could not be done right now.");
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return <Centered>{failed}</Centered>;
  }
  if (state === undefined) {
    return (
      <Centered>
        <Loader2 className="h-5 w-5 animate-spin" />
      </Centered>
    );
  }
  if (state === null) {
    return <Centered>You do not have access to this envelope.</Centered>;
  }

  const e = state.envelope;
  const status = text(e, "status") ?? "sent";
  const isOpen = OPEN_STATUSES.has(status);
  const mySigner = state.signers.find((s) => s.signer_user_id === userId && s.status !== "signed");
  const verified = verdict?.granted === true && (verdict.valid === true || verdict.intact === true || verdict.ok === true);

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">{text(e, "title") ?? "Envelope"}</h1>
          <Badge variant="outline" className="shrink-0 py-0 text-[11px]">
            {statusLabel(status)}
          </Badge>
        </div>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-safe print:max-w-none">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {mySigner && (
              <Button size="sm" asChild>
                <Link href={signHref(envelopeId)}>
                  <PenLine className="h-4 w-4" />
                  Sign now
                </Link>
              </Button>
            )}
            {isOpen && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void run("remind", () => remindEnvelope(dispatch, envelopeId), "Reminder sent.")}
              >
                {busy === "remind" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                Remind
              </Button>
            )}
            {isOpen && (
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setVoidOpen(true)}>
                <XCircle className="h-4 w-4" />
                Void
              </Button>
            )}
            {status === "completed" && (
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print record
              </Button>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Fact label="Sent" value={when(text(e, "sent_at"))} />
            <Fact label="Expires" value={when(text(e, "expires_at"))} />
            <Fact label="Completed" value={when(text(e, "completed_at"))} />
            <Fact label="Order" value={text(e, "signing_order") === "parallel" ? "All at once" : "In order"} />
          </dl>
          {text(e, "message") && <p className="rounded-md border border-border bg-card p-3 text-sm">{text(e, "message")}</p>}
          {text(e, "void_reason") && <p className="text-sm text-muted-foreground">Voided: {text(e, "void_reason")}</p>}

          <Section title="Signers">
            {state.signers.map((s) => {
              const id = String(s.id);
              const signerStatus = text(s, "status") ?? "pending";
              const signed = signerStatus === "signed";
              return (
                <div key={id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                  {signed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{text(s, "full_name")}</div>
                    <div className="truncate text-xs text-muted-foreground">{text(s, "email")}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>{SIGNER_STATUS_LABEL[signerStatus] ?? signerStatus}</div>
                    {signed && <div>{when(text(s, "signed_at"))}</div>}
                  </div>
                  {isOpen && !signed && signerStatus !== "declined" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Send again to ${text(s, "full_name") ?? "this signer"}`}
                      className="print:hidden"
                      disabled={busy !== null}
                      onClick={() => setResendFor({ id, email: text(s, "email") ?? "" })}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </Section>

          <Section title="Documents">
            {state.documents.map((d) => (
              <div key={String(d.id)} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{text(d, "name")}</span>
                {typeof d.page_count === "number" && (
                  <span className="text-xs text-muted-foreground">
                    {d.page_count} {d.page_count === 1 ? "page" : "pages"}
                  </span>
                )}
                {text(d, "content_file_id") && (
                  <Button variant="ghost" size="sm" asChild className="print:hidden">
                    <Link href={`/files/f/${text(d, "content_file_id")}`}>Open</Link>
                  </Button>
                )}
              </div>
            ))}
          </Section>

          {status === "completed" && (
            <Section title="Certificate">
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <ShieldCheck className={verified ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                <span>
                  {verdict === null ? "Checking…" : verified ? "Documents and signatures verified" : "Could not verify"}
                </span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{text(e, "certificate_id")}</span>
              </div>
            </Section>
          )}

          <Section title="History">
            <ol className="flex flex-col">
              {state.events.map((v) => (
                <li key={String(v.id)} className="flex gap-3 border-b border-border py-2 text-sm last:border-b-0">
                  <span className="w-40 shrink-0 tabular-nums text-xs text-muted-foreground">{when(text(v, "occurred_at"))}</span>
                  <span className="min-w-0 flex-1">
                    {EVENT_LABEL[text(v, "event_type") ?? ""] ?? text(v, "event_type")}
                    {text(v, "actor_label") && text(v, "actor_label") !== "requester" && (
                      <span className="text-muted-foreground"> · {text(v, "actor_label")}</span>
                    )}
                  </span>
                  {text(v, "ip_address") && (
                    <span className="hidden shrink-0 tabular-nums text-xs text-muted-foreground sm:inline">
                      {text(v, "ip_address")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>

      <Dialog open={voidOpen} onOpenChange={(open) => busy !== "void" && setVoidOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this envelope</DialogTitle>
            <DialogDescription>Every signing link stops working. Signers are told your reason.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={voidReason}
            placeholder="Sent the wrong version"
            className="text-base"
            onChange={(ev) => setVoidReason(ev.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" disabled={busy === "void"} onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || busy === "void"}
              onClick={() =>
                void run("void", () => voidEnvelope(dispatch, envelopeId, voidReason.trim()), "Envelope voided.").then(() =>
                  setVoidOpen(false),
                )
              }
            >
              {busy === "void" && <Loader2 className="h-4 w-4 animate-spin" />}
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendFor !== null} onOpenChange={(open) => !open && busy !== "resend" && setResendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send again</DialogTitle>
            <DialogDescription>Fix the address if it was wrong; the old link stops working.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="esign-resend-email">Email</Label>
            <Input
              id="esign-resend-email"
              type="email"
              value={resendFor?.email ?? ""}
              className="text-base"
              onChange={(ev) => setResendFor((r) => (r ? { ...r, email: ev.target.value } : r))}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy === "resend"} onClick={() => setResendFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy === "resend" || !resendFor?.email.trim()}
              onClick={() => {
                const target = resendFor;
                if (!target) return;
                void run(
                  "resend",
                  () => resendToSigner(dispatch, envelopeId, target.id, target.email.trim() || null),
                  "Sent again.",
                ).then(() => setResendFor(null));
              }}
            >
              {busy === "resend" && <Loader2 className="h-4 w-4 animate-spin" />}
              Send again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{children}</div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
