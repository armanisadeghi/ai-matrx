"use client";

// features/esign/envelopes/EnvelopeDetail.tsx — /esign/[envelopeId]: one SENT envelope, for its sender.
//
// Who has signed and who is next (role, step, opened / signed times, fields done); remind, send
// again or change an address, void with a reason; every document by its own name; downloads (each
// document, one combined file, the certificate); a copy or a template from it; and an honest
// history. Once complete the page previews the signed copy and the certificate.

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Circle, Copy, Download, Eye, FileText, LayoutTemplate, PenLine, RotateCw, ShieldCheck, XCircle } from "lucide-react";

import { Badge, Button, Field, SegmentedControl, Switch } from "@ai-matrx/design-system/controls";
import { downloadFile } from "@ai-matrx/kit/download";
import { RecordPageHeader, type RecordPageAction } from "@/features/shell/components/header/templates/RecordPageHeader";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import { makeRealEditorApi } from "../editor/api/realApi";
import { TemplateDialog } from "../editor/components/Dialogs";
import { toTemplate } from "../editor/components/EsignEditor";
import type { EnvelopeDraftV1 } from "../contract/draft";
import {
  downloadEnvelope,
  EnvelopeRefusal,
  fetchEnvelope,
  finalizeEnvelope,
  remindEnvelope,
  resendToSigner,
  verifyEnvelope,
  voidEnvelope,
  type EnvelopeActAnswer,
  type EnvelopeState,
} from "./service";
import { SIGNER_STATUS_LABEL, signHref, statusLabel } from "./types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const PdfPreview = dynamic(() => import("@/features/pdf/components/viewer/PdfPreview"), {
  ssr: false,
  loading: () => <Spinner size="sm" className="m-auto text-muted-foreground" />,
});

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  document_frozen: "Documents sealed",
  sent: "Sent",
  opened: "Opened the link",
  viewed: "Viewed the document",
  consent_given: "Agreed to sign electronically",
  signature_adopted: "Chose a signature",
  signed: "Signed",
  declined: "Declined",
  delegated: "Passed it to someone else",
  reminded: "Reminder sent",
  resent: "Sent again",
  voided: "Voided",
  expired: "Expired",
  completed: "Everyone signed",
  certificate_generated: "Certificate issued",
  downloaded: "Downloaded a document",
  delivery_failed: "Could not be delivered",
  acknowledged: "Finished reviewing",
  signed_copy_made: "Signed copy made",
  certificate_filed: "Certificate filed",
};

const REFUSAL_TEXT: Record<string, string> = {
  envelope_completed: "This envelope is already complete.",
  envelope_voided: "This envelope was voided.",
  envelope_declined: "This envelope was declined.",
  envelope_expired: "This envelope expired.",
  cannot_void_completed: "A completed envelope cannot be voided.",
  waiting_on_earlier_position: "That signer's turn has not come yet.",
};

const ROLE_LABEL: Record<string, string> = { signer: "Signs", viewer: "Needs to view", cc_recipient: "Receives a copy" };

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function text(r: Record<string, unknown> | undefined, key: string): string | null {
  const v = r?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}
function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function humanize(code: string): string {
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function refusalText(reason: string | null | undefined): string {
  return (reason && REFUSAL_TEXT[reason]) || "That could not be done right now.";
}
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86_400_000);
}
function bytesOf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

const OPEN_STATUSES = new Set(["sent", "in_progress"]);

export function EnvelopeDetail({ envelopeId }: { envelopeId: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const userId = useAppSelector(selectUserId);
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const [state, setState] = useState<EnvelopeState | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<EnvelopeActAnswer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [resendFor, setResendFor] = useState<{ id: string; email: string; outsider: boolean } | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [signedCopies, setSignedCopies] = useState<Record<string, string>>({});
  const [certificateFile, setCertificateFile] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ fileId: string; name: string } | null>(null);
  const [previewTab, setPreviewTab] = useState<string>("copy");

  useEffect(() => {
    let live = true;
    fetchEnvelope(envelopeId)
      .then((next) => {
        if (!live) return;
        setState(next);
        if (next && text(next.envelope, "status") === "completed") {
          setFinalizeError(null);
          // Finish what completion owes, then read the copies and certificate it made.
          finalizeEnvelope(dispatch, envelopeId)
            .then((out) => {
              if (!live) return;
              const copies: Record<string, string> = {};
              for (const c of out.copies ?? []) copies[c.document_id] = c.file_id;
              setSignedCopies(copies);
              setCertificateFile(out.certificate_file_id ?? null);
            })
            .catch((err: unknown) => {
              if (live) setFinalizeError(err instanceof Error ? err.message : "The signed copy could not be made.");
            })
            // Verify reads what finalize made, so it waits for it (a copy still owed would not check).
            .then(() => (live ? verifyEnvelope(dispatch, envelopeId) : null))
            .then((v) => live && v && setVerdict(v))
            .catch(() => live && setVerdict({ granted: false, reason: "unavailable" }));
        }
      })
      .catch((err: unknown) => live && setFailed(err instanceof Error ? err.message : "This envelope could not be loaded."));
    return () => {
      live = false;
    };
  }, [dispatch, envelopeId, reload]);

  async function run(key: string, action: () => Promise<{ granted: boolean; reason?: string | null }>, done: string): Promise<boolean> {
    setBusy(key);
    try {
      const answer = await action();
      if (answer.granted) {
        toast.success(done);
        setReload((n) => n + 1);
        return true;
      }
      toast.error(refusalText(answer.reason));
    } catch (err) {
      toast.error(err instanceof EnvelopeRefusal ? err.message : "That could not be done right now.");
    } finally {
      setBusy(null);
    }
    return false;
  }

  if (failed) return <Centered>{failed}</Centered>;
  if (state === undefined) {
    return (
      <Centered>
        <Spinner size="sm" className="text-current" />
      </Centered>
    );
  }
  if (state === null) return <Centered>You do not have access to this envelope.</Centered>;

  const e = state.envelope;
  const title = text(e, "title") ?? "Envelope";
  const status = text(e, "status") ?? "sent";
  const isOpen = OPEN_STATUSES.has(status);
  const mySigner = state.signers.find((s) => s.signer_user_id === userId && s.status !== "signed");
  const left = isOpen ? daysLeft(text(e, "expires_at")) : null;
  const verdictDocs = Array.isArray(verdict?.documents) ? (verdict.documents as Record<string, unknown>[]) : [];
  const certificate = (verdict?.certificate ?? null) as Record<string, unknown> | null;
  const verified = verdict?.granted === true && verdict.intact === true && certificate?.signature_verifies === true && verdictDocs.length > 0 && verdictDocs.every((d) => d.result === "match");
  const draft = state.draft as { composition?: EnvelopeDraftV1 } | EnvelopeDraftV1 | null;
  const composition = (draft && "composition" in draft ? draft.composition : draft) as EnvelopeDraftV1 | null | undefined;
  const reminders = state.scheduledNotices.filter((n) => text(n, "status") === "scheduled" || text(n, "status") === "pending");

  const actions: RecordPageAction[] = [
    ...(mySigner
      ? [{ label: "Sign now", icon: PenLine, primary: true, disabled: navigating, onPress: () => startNavigation(() => router.push(signHref(envelopeId))) }]
      : []),
    ...(isOpen ? [{ label: "Remind", icon: BellRing, disabled: busy !== null, onPress: () => void run("remind", () => remindEnvelope(dispatch, envelopeId), "Reminder sent.") }] : []),
    { label: "Download", icon: Download, onPress: () => setDownloadOpen(true) },
    { label: "Make a copy", icon: Copy, onPress: () => startNavigation(() => router.push(`/esign/new?copy=${envelopeId}&name=${encodeURIComponent(title)}`)) },
    ...(composition ? [{ label: "Save as template", icon: LayoutTemplate, onPress: () => setTemplateOpen(true) }] : []),
    ...(isOpen ? [{ label: "Void", icon: XCircle, destructive: true, disabled: busy !== null, onPress: () => setVoidOpen(true) }] : []),
  ];

  const copyFiles = state.documents.map((d) => ({ name: text(d, "name") ?? "Document", fileId: signedCopies[String(d.id)] ?? text(asRecord(d.metadata), "signed_copy_file_id") })).filter((c) => c.fileId);

  return (
    <>
      <RecordPageHeader
        backHref="/esign"
        parents={[{ label: "E-Signatures", href: "/esign" }]}
        record={{ name: title }}
        status={{ label: statusLabel(status), tone: status === "completed" ? "success" : status === "declined" || status === "voided" || status === "expired" ? "destructive" : "info" }}
        actions={actions}
      />
      {/* The shell header is a solid band: the scroll body starts BELOW it. */}
      <div className="h-full overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
        <div data-matrx-page-scroll className="h-full overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 print:max-w-none">
            {navigating && (
              <p className="flex items-center gap-2 type-secondary text-muted-foreground" role="status">
                <Spinner size="xs" className="text-current" />
                Opening…
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 type-body sm:grid-cols-4">
              <Fact label="Sent" value={when(text(e, "sent_at"))} />
              <Fact label={left !== null && left <= 7 && left >= 0 ? "Expires soon" : "Expires"} value={left !== null && left >= 0 && left <= 7 ? `In ${left} ${left === 1 ? "day" : "days"}` : when(text(e, "expires_at"))} />
              <Fact label="Completed" value={when(text(e, "completed_at"))} />
              <Fact label="Order" value={text(e, "signing_order") === "parallel" ? "All at once" : "In order"} />
            </dl>
            {text(e, "email_subject") && <Fact label="Email subject" value={text(e, "email_subject") ?? ""} />}
            {text(e, "message") && <p className="rounded-md border border-border bg-card p-3 type-body">{text(e, "message")}</p>}
            {text(e, "void_reason") && <p className="type-body text-muted-foreground">Voided: {text(e, "void_reason")}</p>}

            <Section title="Recipients">
              {[...state.signers].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).map((s) => {
                const id = String(s.id);
                const st = text(s, "status") ?? "pending";
                const signed = st === "signed";
                const role = text(s, "role") ?? "signer";
                const prog = state.progress[id];
                const next = reminders.find((n) => text(n, "signer_id") === id);
                return (
                  <div key={id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                    {signed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate type-title">{text(s, "full_name")}</span>
                        {role !== "signer" && <Badge>{ROLE_LABEL[role] ?? role}</Badge>}
                      </div>
                      <div className="truncate type-secondary text-muted-foreground">{text(s, "email")}</div>
                    </div>
                    <div className="shrink-0 text-right type-secondary text-muted-foreground">
                      <div>{!signed && st !== "declined" && ["voided", "expired"].includes(text(e, "status") ?? "") ? (text(e, "status") === "voided" ? "Voided" : "Expired") : (SIGNER_STATUS_LABEL[st] ?? humanize(st))}</div>
                      {signed ? <div>{when(text(s, "signed_at"))}</div> : prog && prog.required_total > 0 ? <div className="tabular-nums">{prog.required_done} of {prog.required_total} fields</div> : next ? <div>Reminder {when(text(next, "deliver_at"))}</div> : text(s, "viewed_at") ? <div>Viewed {when(text(s, "viewed_at"))}</div> : null}
                    </div>
                    {isOpen && !signed && st !== "declined" && (
                      <Button
                        icon={<RotateCw />}
                        variant="quiet"
                        aria-label={`Send again to ${text(s, "full_name") ?? "this recipient"}`}
                        className="print:hidden"
                        disabled={busy !== null}
                        onClick={() => setResendFor({ id, email: text(s, "email") ?? "", outsider: text(s, "actor_type") !== "internal_user" })}
                      />
                    )}
                  </div>
                );
              })}
            </Section>

            <Section title="Documents">
              {state.documents.map((d) => {
                const fileId = text(d, "content_file_id");
                return (
                  <div key={String(d.id)} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate type-body">{text(d, "name")}</div>
                      {typeof d.page_count === "number" && <div className="type-secondary text-muted-foreground">{d.page_count} {d.page_count === 1 ? "page" : "pages"}</div>}
                    </div>
                    {fileId && (
                      <Button icon={<Eye />} className="print:hidden" onClick={() => setViewing({ fileId, name: text(d, "name") ?? "Document" })}>
                        View
                      </Button>
                    )}
                  </div>
                );
              })}
            </Section>

            {status === "completed" && (
              <Section title="Signed copy and certificate">
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 type-body">
                  <ShieldCheck className={verified ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                  <span data-error-box>{verdict === null ? "Checking…" : verified ? "Documents and signatures verified" : verdict.reason === "unavailable" ? "Could not check right now" : "Does not verify"}<ErrorAlchemyMenu /></span>
                  <span className="ml-auto truncate type-secondary text-muted-foreground">{text(e, "certificate_id")}</span>
                </div>
                {finalizeError ? (
                  <div className="flex items-center gap-2 rounded-md border border-border p-3 type-body text-destructive">
                    <span className="min-w-0 flex-1">{finalizeError}</span>
                    <Button onClick={() => setReload((n) => n + 1)}>Try again</Button>
                  <ErrorAlchemyMenu error={finalizeError} /></div>
                ) : copyFiles.length === 0 ? (
                  <p className="flex items-center gap-2 type-secondary text-muted-foreground" role="status">
                    <Spinner size="xs" className="text-current" />
                    Preparing the signed copy
                  </p>
                ) : (
                  <>
                    <SegmentedControl
                      aria-label="Preview"
                      value={previewTab}
                      onValueChange={setPreviewTab}
                      data={[...copyFiles.map((c, i) => ({ value: i === 0 ? "copy" : `copy-${i}`, label: copyFiles.length > 1 ? c.name : "Signed copy" })), ...(certificateFile ? [{ value: "certificate", label: "Certificate" }] : [])]}
                    />
                    <div className="relative h-[70dvh] overflow-auto rounded-md border border-border bg-muted/40">
                      {previewTab === "certificate" && certificateFile ? (
                        <PdfPreview key={certificateFile} fileId={certificateFile} layout="continuous" />
                      ) : (
                        (() => {
                          const idx = previewTab === "copy" ? 0 : Number(previewTab.replace("copy-", ""));
                          const f = copyFiles[idx] ?? copyFiles[0];
                          return f.fileId ? <PdfPreview key={f.fileId} fileId={f.fileId} layout="continuous" /> : null;
                        })()
                      )}
                    </div>
                  </>
                )}
              </Section>
            )}

            <Section title="History">
              <ol className="flex flex-col">
                {state.events.map((v) => {
                  const kind = text(v, "event_type") ?? "";
                  return (
                    <li key={String(v.id)} className="flex gap-3 border-b border-border py-2 type-body last:border-b-0">
                      <span className="w-40 shrink-0 tabular-nums type-secondary text-muted-foreground">{when(text(v, "occurred_at"))}</span>
                      <span className="min-w-0 flex-1">
                        {EVENT_LABEL[kind] ?? humanize(kind)}
                        {text(v, "actor_label") && text(v, "actor_label") !== "requester" && <span className="text-muted-foreground"> · {text(v, "actor_label")}</span>}
                      </span>
                      {text(v, "ip_address") && <span className="hidden shrink-0 tabular-nums type-secondary text-muted-foreground sm:inline">{text(v, "ip_address")}</span>}
                    </li>
                  );
                })}
              </ol>
            </Section>
          </div>
        </div>
      </div>

      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />

      <DownloadDialog
        open={downloadOpen}
        completed={status === "completed"}
        documents={state.documents.map((d) => ({ id: String(d.id), name: text(d, "name") ?? "Document" }))}
        onClose={() => setDownloadOpen(false)}
        onDownload={async (input) => {
          const files = await downloadEnvelope(dispatch, envelopeId, input);
          for (const f of files) downloadFile(f.name, bytesOf(f.content_base64), f.mime_type);
          setDownloadOpen(false);
        }}
      />

      <TemplateDialog
        key={String(templateOpen)}
        open={templateOpen}
        initialName={title}
        saving={templateSaving}
        error={templateError}
        onClose={() => setTemplateOpen(false)}
        onSave={(name, description) => {
          if (!composition) return;
          setTemplateSaving(true);
          setTemplateError(null);
          void (async () => {
            try {
              const organizationId = text(e, "organization_id") ?? activeOrg ?? (await ensureOrgId(null));
              await makeRealEditorApi(dispatch).saveTemplate({ organizationId, templateId: null, name, description, composition: toTemplate(composition) });
              setTemplateOpen(false);
              toast.success("Template saved.");
            } catch (err) {
              setTemplateError(err instanceof Error ? err.message : "The template could not be saved.");
            } finally {
              setTemplateSaving(false);
            }
          })();
        }}
      />

      <Dialog open={voidOpen} onOpenChange={(open) => busy !== "void" && setVoidOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this envelope</DialogTitle>
            <DialogDescription>Every signing link stops working. You can send a new one later.</DialogDescription>
          </DialogHeader>
          <ProTextarea value={voidReason} placeholder="Sent the wrong version" onChange={(ev) => setVoidReason(ev.target.value)} />
          <DialogFooter>
            <Button variant="quiet" disabled={busy === "void"} onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              icon={busy === "void" ? <Spinner size="xs" className="text-current" /> : undefined}
              variant="danger"
              disabled={!voidReason.trim() || busy === "void"}
              onClick={() => void run("void", () => voidEnvelope(dispatch, envelopeId, voidReason.trim()), "Envelope voided.").then((ok) => ok && setVoidOpen(false))}
            >
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendFor !== null} onOpenChange={(open) => !open && busy !== "resend" && setResendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send again</DialogTitle>
            <DialogDescription>{resendFor?.outsider ? "A fresh link replaces the old one. Fix the address if it was wrong." : "They get the request again in their email and notifications."}</DialogDescription>
          </DialogHeader>
          {resendFor?.outsider && (
            <Field aria-label="Email" type="email" value={resendFor.email} onChange={(ev) => setResendFor((r) => (r ? { ...r, email: ev.target.value } : r))} />
          )}
          <DialogFooter>
            <Button variant="quiet" disabled={busy === "resend"} onClick={() => setResendFor(null)}>Cancel</Button>
            <Button
              icon={busy === "resend" ? <Spinner size="xs" className="text-current" /> : undefined}
              variant="primary"
              disabled={busy === "resend" || (resendFor?.outsider === true && !resendFor.email.trim())}
              onClick={() => {
                const target = resendFor;
                if (!target) return;
                void run("resend", () => resendToSigner(dispatch, envelopeId, target.id, target.outsider ? target.email.trim() || null : null), "Sent again.").then((ok) => ok && setResendFor(null));
              }}
            >
              Send again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DownloadDialog(p: {
  open: boolean;
  completed: boolean;
  documents: { id: string; name: string }[];
  onClose(): void;
  onDownload(input: { parts: ("documents" | "certificate")[]; combine: boolean; documentIds?: string[] }): Promise<void>;
}) {
  const [what, setWhat] = useState<"documents" | "certificate" | "both">("documents");
  const [combine, setCombine] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = chosen.size === 0 ? p.documents.map((d) => d.id) : [...chosen];
  const wantsDocs = what !== "certificate";
  return (
    <Dialog open={p.open} onOpenChange={(o) => !o && !working && p.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download</DialogTitle>
          <DialogDescription>{p.completed ? "The signed copies, the certificate, or both." : "The documents as sent."}</DialogDescription>
        </DialogHeader>
        {p.completed && (
          <SegmentedControl aria-label="What to download" fill value={what} onValueChange={setWhat} data={[{ value: "documents", label: "Documents" }, { value: "certificate", label: "Certificate" }, { value: "both", label: "Both" }]} />
        )}
        {wantsDocs && p.documents.length > 1 && (
          <div className="flex flex-col gap-1.5">
            {p.documents.map((d) => (
              <label key={d.id} className="flex items-center gap-2 type-body">
                <input
                  type="checkbox"
                  checked={chosen.size === 0 || chosen.has(d.id)}
                  onChange={(ev) => {
                    const next = new Set(chosen.size === 0 ? p.documents.map((x) => x.id) : chosen);
                    if (ev.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    setChosen(next);
                  }}
                />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="type-body">One combined file</span>
          <Switch aria-label="One combined file" checked={combine} onCheckedChange={setCombine} />
        </div>
        {error && <p className="type-body text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}
        <DialogFooter>
          <Button variant="quiet" disabled={working} onClick={p.onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={working ? <Spinner size="xs" className="text-current" /> : <Download />}
            disabled={working}
            onClick={() => {
              setWorking(true);
              setError(null);
              p.onDownload({ parts: what === "both" ? ["documents", "certificate"] : [what], combine, documentIds: wantsDocs ? ids : undefined })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : "The download did not work."))
                .finally(() => setWorking(false));
            }}
          >
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center type-body text-muted-foreground">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="type-title text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-secondary text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function DocumentViewer({ doc, onClose }: { doc: { fileId: string; name: string } | null; onClose(): void }) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl" height="tall" className="flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{doc?.name}</DialogTitle>
          <DialogDescription className="sr-only">The document as it was sent for signature.</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border">{doc && <PdfPreview fileId={doc.fileId} layout="continuous" />}</div>
      </DialogContent>
    </Dialog>
  );
}
