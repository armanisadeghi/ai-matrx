"use client";

// features/esign/signing/SigningSurface.tsx — THE ONE SIGNING SURFACE (SPEC-ESIGN §6.0 U-03).
//
// Mounted behind two doors — `/sign/e/[envelopeId]` (a platform user's own session) and
// `/x/sign` (a verified outsider session) — and identical behind both. DocuSign and Dropbox Sign
// are the bar: one document, one thing to do, nothing else on the screen.
//
// The walk is the database's §4.3 precondition, made visible:
//   1. REVIEW — every document is fetched as its frozen bytes and rendered here; only once it
//      has rendered is `preview` recorded, and its SHA-256 is computed from the bytes on screen.
//   2. CONSENT — the frozen disclosure, in full, on its own step. Never a buried checkbox.
//   3. SIGN — the signer types their name; the Sign press sends the hashes of what they SAW
//      (`observed`), and the database refuses if those bytes are not the frozen ones.
// Every refusal comes back as a reason code and is shown as one short sentence.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Check, Download, FileText, Loader2, PenLine, ShieldCheck, XCircle } from "lucide-react";

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
import { useAppDispatch } from "@/lib/redux/hooks";

import {
  signingAct,
  type SigningAction,
  type SigningAnswer,
  type SigningDoor,
  SigningRefusal,
} from "./signingService";

// THE platform PDF viewer (pdf.js): it draws pages on a canvas, so a document never runs script on
// our origin, and it renders on Android, whose Chrome shows nothing for a PDF in an iframe.
const PdfDocumentRenderer = lazy(() => import("@/features/pdf/components/viewer/PdfDocumentRenderer"));

/** The only types this surface draws inline. Anything else is offered as a download, never run. */
function displayKind(mimeType: string | null): "pdf" | "image" | "download" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.startsWith("image/") && mimeType !== "image/svg+xml") return "image";
  return "download";
}

const SIGN_ACTION_ID = "esign-surface-sign";

/** The sentence for each refusal the doors answer with (esign._can_act and the act bodies). */
const REASON_TEXT: Record<string, string> = {
  link_no_longer_valid: "This link is no longer valid. Ask the sender for a new one.",
  not_your_signer_row: "This document was sent to someone else. Sign in with the account it was sent to.",
  not_a_signer: "You are not a signer on this document.",
  not_authenticated: "Sign in to open this document.",
  waiting_on_earlier_position: "Someone else signs before you. We will email you when it is your turn.",
  envelope_voided: "The sender withdrew this document.",
  envelope_declined: "This document was declined, so it can no longer be signed.",
  envelope_expired: "This signing request expired. Ask the sender for a new one.",
  envelope_draft: "This document has not been sent yet.",
  signer_signed: "You have signed. We will email you when everyone has.",
  signer_declined: "You declined to sign this document.",
  signer_delegated: "You passed this document to someone else to sign.",
  cc_recipient: "You receive a copy of this document; there is nothing to sign.",
  document_hash_mismatch: "The document changed after it was sent. Ask the sender to send it again.",
  document_not_previewed: "Open every document before you sign.",
  no_consent: "Agree to sign electronically before you sign.",
  no_signature_adopted: "Type your name before you sign.",
  typed_name_required: "Type your name before you sign.",
  reason_required: "Say why you are declining.",
};

function reasonText(reason: string | null | undefined): string {
  if (reason && REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (reason?.startsWith("envelope_")) return "This document can no longer be signed.";
  return "This document cannot be signed right now.";
}

interface DocView {
  id: string;
  name: string;
  contentHash: string;
  url: string | null;
  mimeType: string | null;
  seenHash: string | null;
  /** Drawn on this screen (or, for a download-only type, downloaded). */
  rendered: boolean;
  /** The database recorded the preview. */
  previewed: boolean;
  failed: string | null;
}

type Step = "review" | "consent" | "sign" | "done";

type Phase =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "ready"; load: SigningAnswer };

function text(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The frozen bytes of one document, as a local blob and the SHA-256 of exactly those bytes. */
async function readDocument(
  dispatch: ReturnType<typeof useAppDispatch>,
  door: SigningDoor,
  id: string,
): Promise<Partial<DocView>> {
  try {
    const answer = await signingAct(dispatch, door, "document", { document_id: id });
    if (!answer.granted || !answer.content_base64) return { failed: reasonText(answer.reason) };
    const bytes = decodeBase64(answer.content_base64);
    const mimeType = answer.mime_type ?? "application/octet-stream";
    // A blob takes the page's origin: never give it a type a browser would execute.
    const blobType = displayKind(mimeType) === "download" ? "application/octet-stream" : mimeType;
    const url = URL.createObjectURL(new Blob([bytes], { type: blobType }));
    return { url, mimeType, seenHash: await sha256Hex(bytes) };
  } catch (err) {
    return {
      failed:
        err instanceof SigningRefusal
          ? err.message
          : "This document could not be opened. Try again in a moment.",
    };
  }
}

export function SigningSurface({
  door,
  onDoorClosed,
}: {
  door: SigningDoor;
  /** The session this door rode on is gone; the outsider gate asks for a fresh code instead. */
  onDoorClosed?: () => void;
}) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [docs, setDocs] = useState<DocView[]>([]);
  const [activeDoc, setActiveDoc] = useState(0);
  const [step, setStep] = useState<Step>("review");
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState<"consent" | "sign" | "decline" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const urls = useRef<string[]>([]);
  // Held in a ref so a parent's inline callback never re-runs the load (and its `opened` event).
  const doorClosed = useRef(onDoorClosed);
  useEffect(() => {
    doorClosed.current = onDoorClosed;
  }, [onDoorClosed]);

  useEffect(() => {
    let live = true;
    signingAct(dispatch, door, "load")
      .then(async (load) => {
        if (!live) return;
        if (!load.granted) {
          if (load.reason === "link_no_longer_valid" && doorClosed.current) {
            doorClosed.current();
            return;
          }
          setPhase({ kind: "refused", message: reasonText(load.reason) });
          return;
        }
        const me = load.me ?? {};
        setTypedName(text(me, "typed_name") ?? text(me, "full_name") ?? "");
        const envelopeDone = text(load.envelope, "status") === "completed";
        setStep(text(me, "signed_at") || envelopeDone ? "done" : text(me, "consented_at") ? "sign" : "review");
        const listed: DocView[] = (load.documents ?? []).map((d) => ({
          id: String(d.id),
          name: text(d, "name") ?? "Document",
          contentHash: text(d, "content_hash") ?? "",
          url: null,
          mimeType: text(d, "mime_type"),
          seenHash: null,
          rendered: false,
          previewed: false,
          failed: null,
        }));
        setDocs(listed);
        setPhase({ kind: "ready", load });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setPhase({
          kind: "refused",
          message:
            err instanceof SigningRefusal
              ? err.message
              : "We could not reach AI Matrx just now. Your link is fine — try again in a moment.",
        });
      });
    const held = urls.current;
    return () => {
      live = false;
      for (const url of held) URL.revokeObjectURL(url);
    };
  }, [dispatch, door]);

  // A document's bytes are fetched (and its read ledgered) only when the signer opens its tab.
  // Keyed by an in-flight set, not by state: a state flag would change this effect's key and its
  // cleanup would throw the answer away.
  const inFlight = useRef(new Set<string>());
  const wanted = docs[activeDoc];
  const wantedId = wanted && !wanted.url && !wanted.failed ? wanted.id : null;
  useEffect(() => {
    if (!wantedId || inFlight.current.has(wantedId)) return;
    inFlight.current.add(wantedId);
    void readDocument(dispatch, door, wantedId).then((patch) => {
      inFlight.current.delete(wantedId);
      if (patch.url) urls.current.push(patch.url);
      setDocs((all) => all.map((d) => (d.id === wantedId ? { ...d, ...patch } : d)));
    });
  }, [dispatch, door, wantedId]);

  function patchDoc(id: string, patch: Partial<DocView>) {
    setDocs((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  /** One act; an outsider whose session ran out mid-walk is sent back for a fresh code. */
  async function act(action: SigningAction, args: Parameters<typeof signingAct>[3] = {}) {
    const answer = await signingAct(dispatch, door, action, args);
    if (!answer.granted && answer.reason === "link_no_longer_valid" && doorClosed.current) {
      doorClosed.current();
    }
    return answer;
  }

  async function recordPreview(id: string): Promise<boolean> {
    try {
      const answer = await act("preview", { document_id: id });
      if (answer.granted) {
        patchDoc(id, { previewed: true });
        return true;
      }
      setNotice(reasonText(answer.reason));
    } catch (err) {
      setNotice(err instanceof SigningRefusal ? err.message : "We could not record that you opened it. Try again.");
    }
    return false;
  }

  /** The document has rendered on this screen: that is the fact `preview` records (§4.1). */
  function markRendered(doc: DocView) {
    if (doc.rendered) return;
    // A signed document is reopened to read or keep a copy; there is nothing left to record.
    if (step === "done") {
      patchDoc(doc.id, { rendered: true, previewed: true });
      return;
    }
    patchDoc(doc.id, { rendered: true });
    void recordPreview(doc.id);
  }

  /** Continue: any rendered document whose preview did not record is retried, then consent. */
  async function continueToConsent() {
    setNotice(null);
    for (const d of docs) {
      if (d.rendered && !d.previewed && !(await recordPreview(d.id))) return;
    }
    setStep("consent");
  }

  async function agree(disclosureId: string) {
    setBusy("consent");
    setNotice(null);
    try {
      const answer = await act("consent", { disclosure_id: disclosureId });
      if (answer.granted) setStep("sign");
      else setNotice(reasonText(answer.reason));
    } catch (err) {
      setNotice(err instanceof SigningRefusal ? err.message : "We could not save that. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    const name = typedName.trim();
    if (!name) {
      setNotice(REASON_TEXT.typed_name_required);
      return;
    }
    if (docs.some((d) => !d.seenHash || !d.previewed)) {
      setNotice(REASON_TEXT.document_not_previewed);
      return;
    }
    setBusy("sign");
    setNotice(null);
    try {
      const adopted = await act("adopt", {
        kind: "typed",
        typed_name: name,
        typed_style: "script",
      });
      if (!adopted.granted) {
        setNotice(reasonText(adopted.reason));
        return;
      }
      const signed = await act("sign", {
        observed: docs.map((d) => ({ document_id: d.id, content_hash: d.seenHash ?? "" })),
        action_id: SIGN_ACTION_ID,
      });
      if (signed.granted) setStep("done");
      else setNotice(reasonText(signed.reason));
    } catch (err) {
      setNotice(err instanceof SigningRefusal ? err.message : "We could not save your signature. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    const reason = declineReason.trim();
    if (!reason) return;
    setBusy("decline");
    try {
      const answer = await act("decline", { reason });
      if (answer.granted) {
        setDeclineOpen(false);
        setPhase({ kind: "refused", message: REASON_TEXT.signer_declined });
      } else {
        setNotice(reasonText(answer.reason));
        setDeclineOpen(false);
      }
    } catch (err) {
      setNotice(err instanceof SigningRefusal ? err.message : "We could not record that. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  if (phase.kind === "loading") {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening your document
        </div>
      </Shell>
    );
  }

  if (phase.kind === "refused") {
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <XCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-base text-foreground">{phase.message}</p>
        </div>
      </Shell>
    );
  }

  const { load } = phase;
  const title = text(load.envelope, "title") ?? "Document";
  const message = text(load.envelope, "message");
  const sender = text(load.branding, "name") ?? text(load.branding, "organization_name");
  const consent = load.consent ?? null;
  const disclosureId = text(consent, "disclosure_id");
  const allSeen = docs.length > 0 && docs.every((d) => d.rendered && d.seenHash);
  const current = docs[activeDoc] ?? null;

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {sender && <div className="truncate text-xs text-muted-foreground">{sender}</div>}
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
        </div>
        {step !== "done" && (
          <Button variant="ghost" size="sm" onClick={() => setDeclineOpen(true)}>
            Decline
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-[55dvh] flex-1 flex-col lg:min-h-0">
          {docs.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
              {docs.map((d, i) => (
                <Button
                  key={d.id}
                  variant={i === activeDoc ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveDoc(i)}
                >
                  {d.rendered ? <Check className="mr-1 h-3.5 w-3.5" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
                  {d.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 bg-muted/40">
            {current && <DocumentFrame doc={current} onShown={() => markRendered(current)} />}
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-border p-4 pb-safe lg:w-96 lg:border-l lg:border-t-0">
          {message && step !== "done" && <p className="text-sm text-muted-foreground">{message}</p>}

          {step === "review" && (
            <>
              <StepTitle icon={FileText} label="Review the document" />
              <Button disabled={!allSeen} onClick={() => void continueToConsent()}>
                {allSeen ? "Continue" : docs.length > 1 ? "Open every document" : "Opening the document"}
              </Button>
            </>
          )}

          {step === "consent" && (
            <>
              <StepTitle icon={ShieldCheck} label={text(consent, "title") ?? "Agree to sign electronically"} />
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm text-foreground">
                {text(consent, "text") ?? ""}
              </div>
              <Button disabled={!disclosureId || busy !== null} onClick={() => disclosureId && void agree(disclosureId)}>
                {busy === "consent" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}I agree
              </Button>
            </>
          )}

          {step === "sign" && (
            <>
              <StepTitle icon={PenLine} label="Sign" />
              <div className="flex flex-col gap-2">
                <Label htmlFor="esign-typed-name">Your full name</Label>
                <Input
                  id="esign-typed-name"
                  value={typedName}
                  autoComplete="name"
                  className="text-base"
                  onChange={(e) => setTypedName(e.target.value)}
                />
              </div>
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-card px-3">
                <span className="truncate font-serif text-3xl italic text-foreground">{typedName.trim() || " "}</span>
              </div>
              <Button disabled={busy !== null || !typedName.trim()} onClick={() => void sign()}>
                {busy === "sign" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign
              </Button>
            </>
          )}

          {step === "done" && (
            <>
              <StepTitle icon={Check} label="Signed" />
              {docs.map((d) =>
                d.url ? (
                  <Button key={d.id} variant="outline" asChild>
                    <a href={d.url} download={d.name}>
                      <Download className="mr-2 h-4 w-4" />
                      {d.name}
                    </a>
                  </Button>
                ) : null,
              )}
            </>
          )}

          {notice && <p className="text-sm text-destructive">{notice}</p>}
        </aside>
      </div>

      <Dialog open={declineOpen} onOpenChange={(open) => busy !== "decline" && setDeclineOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline to sign</DialogTitle>
            <DialogDescription>The sender sees your reason and the request closes.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={declineReason}
            className="text-base"
            placeholder="I need changes to section 3"
            onChange={(e) => setDeclineReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" disabled={busy === "decline"} onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!declineReason.trim() || busy === "decline"} onClick={() => void decline()}>
              {busy === "decline" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex h-dvh flex-col bg-textured">{children}</main>;
}

function StepTitle({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function DocumentFrame({ doc, onShown }: { doc: DocView; onShown: () => void }) {
  if (doc.failed) {
    return <p className="m-auto px-6 text-center text-sm text-muted-foreground">{doc.failed}</p>;
  }
  if (!doc.url) {
    return <Loader2 className="m-auto h-5 w-5 animate-spin text-muted-foreground" />;
  }
  const kind = displayKind(doc.mimeType);
  if (kind === "pdf") {
    return (
      <Suspense fallback={<Loader2 className="m-auto h-5 w-5 animate-spin text-muted-foreground" />}>
        <PdfDocumentRenderer
          key={doc.id}
          blobUrl={doc.url}
          fileName={doc.name}
          className="h-full w-full"
          renderOverlay={() => <Shown onShown={onShown} />}
        />
      </Suspense>
    );
  }
  if (kind === "image") {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-3">
        {/* A local blob of the frozen bytes; raster types only (displayKind refuses SVG). */}
        <img src={doc.url} alt={doc.name} className="max-h-full max-w-full object-contain" onLoad={onShown} />
      </div>
    );
  }
  return (
    <div className="m-auto flex flex-col items-center gap-3 px-6 text-center">
      <FileText className="h-8 w-8 text-muted-foreground" />
      <Button variant="outline" asChild>
        <a href={doc.url} download={doc.name} onClick={onShown}>
          <Download className="mr-2 h-4 w-4" />
          Download {doc.name}
        </a>
      </Button>
    </div>
  );
}

/** Mounted by the PDF viewer only once a page has drawn; tells the surface so, once. */
function Shown({ onShown }: { onShown: () => void }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onShown();
  });
  return null;
}
