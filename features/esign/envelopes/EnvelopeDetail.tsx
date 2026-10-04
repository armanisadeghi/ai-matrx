"use client";

// features/esign/envelopes/EnvelopeDetail.tsx — /esign/[envelopeId]: one envelope, for its sender.
//
// Who has signed and who is next; remind, resend (optionally to a corrected address) and void;
// every document; the evidence trail (every open, view, consent and signature, with its time and
// address); and, once complete, whether the stored documents and signatures still verify.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Circle,
  Download,
  Eye,
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
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
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
  type EnvelopeActAnswer,
  type EnvelopeState,
} from "./service";
import { SIGNER_STATUS_LABEL, signHref, statusLabel } from "./types";

// react-pdf needs the browser, and only a sender who opens a document pays for the viewer.
const PdfPreview = dynamic(() => import("@/features/pdf/components/viewer/PdfPreview"), {
  ssr: false,
  loading: () => <Loader2 className="m-auto h-5 w-5 animate-spin text-muted-foreground" />,
});

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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

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
  const [verdict, setVerdict] = useState<EnvelopeActAnswer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [resendFor, setResendFor] = useState<{ id: string; email: string; outsider: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const [viewing, setViewing] = useState<{ fileId: string; name: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetchEnvelope(envelopeId)
      .then((next) => {
        if (!live) return;
        setState(next);
        if (next && text(next.envelope, "status") === "completed") {
          void verifyEnvelope(dispatch, envelopeId)
            .then((v) => live && setVerdict(v))
            .catch((err: unknown) => {
              console.error("[esign] verification failed", err);
              if (live) setVerdict({ granted: false, reason: "unavailable" });
            });
        }
      })
      .catch((err: unknown) => live && setFailed(err instanceof Error ? err.message : "This envelope could not be loaded."));
    return () => {
      live = false;
    };
  }, [dispatch, envelopeId, reload]);

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
  // Verified = the certificate's signature checks AND every document re-hashed to its sealed hash.
  const verdictDocs = Array.isArray(verdict?.documents) ? (verdict.documents as Record<string, unknown>[]) : [];
  const certificate = (verdict?.certificate ?? null) as Record<string, unknown> | null;
  const verified =
    verdict?.granted === true &&
    verdict.intact === true &&
    certificate?.signature_verifies === true &&
    verdictDocs.length > 0 &&
    verdictDocs.every((d) => d.result === "match");

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
      {/* The shell header is a solid band over the page: the scroll body starts BELOW it, or the
       * top of the envelope (actions, dates) sits under the band and reads as cut off. */}
      <div className="h-full overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
        <div data-matrx-page-scroll className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 print:max-w-none">
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
                      onClick={() => setResendFor({ id, email: text(s, "email") ?? "", outsider: text(s, "actor_type") !== "internal_user" })}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </Section>

          <Section title="Documents">
            {state.documents.map((d) => {
              const fileId = text(d, "content_file_id");
              const signedCopy = text(asRecord(d.metadata), "signed_copy_file_id");
              return (
                <div key={String(d.id)} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{text(d, "name")}</div>
                    {typeof d.page_count === "number" && (
                      <div className="text-xs text-muted-foreground">
                        {d.page_count} {d.page_count === 1 ? "page" : "pages"}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 print:hidden">
                    {fileId && (
                      <ControlButton icon={<Eye />} onClick={() => setViewing({ fileId, name: text(d, "name") ?? "Document" })}>
                        View
                      </ControlButton>
                    )}
                    {status === "completed" &&
                      (signedCopy ? (
                        <ControlButton variant="primary" icon={<Download />} asChild>
                          <Link href={`/files/f/${signedCopy}`}>Download signed copy</Link>
                        </ControlButton>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Preparing signed copy
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </Section>

          {status === "completed" && (
            <Section title="Certificate">
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <ShieldCheck className={verified ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                <span>
                  {verdict === null
                    ? "Checking…"
                    : verified
                      ? "Documents and signatures verified"
                      : verdict.reason === "unavailable"
                        ? "Could not check right now"
                        : "Does not verify"}
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
      </div>

      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />

      <Dialog open={voidOpen} onOpenChange={(open) => busy !== "void" && setVoidOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this envelope</DialogTitle>
            <DialogDescription>Every signing link stops working. You can send a new envelope later.</DialogDescription>
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
            <DialogDescription>
              {resendFor?.outsider ? "A fresh link replaces the old one. Fix the address if it was wrong." : "They get the request again in their email and notifications."}
            </DialogDescription>
          </DialogHeader>
          {resendFor?.outsider && (
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
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={busy === "resend"} onClick={() => setResendFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy === "resend" || (resendFor?.outsider === true && !resendFor.email.trim())}
              onClick={() => {
                const target = resendFor;
                if (!target) return;
                void run(
                  "resend",
                  () => resendToSigner(dispatch, envelopeId, target.id, target.outsider ? target.email.trim() || null : null),
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

function DocumentViewer({ doc, onClose }: { doc: { fileId: string; name: string } | null; onClose: () => void }) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85dvh] max-w-4xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{doc?.name}</DialogTitle>
          <DialogDescription className="sr-only">The document as it was sent for signature.</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          {doc && <PdfPreview fileId={doc.fileId} />}
        </div>
        {doc && (
          <div className="flex justify-end">
            <ControlButton asChild>
              <Link href={`/files/f/${doc.fileId}`}>Open in Files</Link>
            </ControlButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
