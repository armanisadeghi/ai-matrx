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
//   3. SIGN — the signer types or draws their mark; the Sign press sends the hashes of what they
//      SAW (`observed`), and the database refuses if those bytes are not the frozen ones.
// When the sender placed fields (`documents[].field_map`), they are drawn on the pages: the
// signer's own are highlighted and walked one by one ("Next field"), a Signature field opens the
// adopt step, and once adopted every one of their fields shows its value before the final Sign.
// Another signer's fields show muted and inert. A document with no fields walks exactly as before.
// Every refusal comes back as a reason code and is shown as one short sentence.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, FileText, PenLine, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch } from "@/lib/redux/hooks";

import { AdoptSignature, type SignatureMark } from "./AdoptSignature";
import { initialsOf, needsNewSigningPage, PAPER, readFieldMap, signingDate, type PlacedField } from "./fieldMap";
import { SignedDone } from "./SignedDone";
import { SigningFields, type FieldValues } from "./SigningFields";

import {
  signingAct,
  type SigningAction,
  type SigningAnswer,
  type SigningDoor,
  SigningRefusal,
} from "./signingService";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { downloadUrl } from "@ai-matrx/kit/download";
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
  /** Every field placed on this document, the signer's own and everyone else's. */
  fields: PlacedField[];
}

/** One of the signer's own fields, with the document it sits on. */
interface MyField {
  docIndex: number;
  field: PlacedField;
}

type Step = "review" | "consent" | "sign" | "done";

type Phase =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  /** A document carries fields this page cannot draw (a v2 map): never sign with fields missing. */
  | { kind: "outdated" }
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
  /** The envelope is complete: from the load, or from the answer to this signer's own Sign. */
  const [everyoneSigned, setEveryoneSigned] = useState(false);
  /** An outsider who has signed: the one-time hint that prefills their address at sign-up. */
  const [signupHint, setSignupHint] = useState<string | null>(null);
  /** Once complete, each document is shown as its signed copy (marks stamped in), by document id. */
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [typedName, setTypedName] = useState("");
  const [mark, setMark] = useState<SignatureMark>("typed");
  const [drawing, setDrawing] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  // Placed fields: the signer adopts once (in a dialog) and every one of their fields fills.
  const [adopted, setAdopted] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  const [pageByDoc, setPageByDoc] = useState<Record<string, number>>({});
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
        if ((load.documents ?? []).some((d) => needsNewSigningPage(d))) {
          setPhase({ kind: "outdated" });
          return;
        }
        const me = load.me ?? {};
        setMyId(text(me, "id"));
        setTypedName(text(me, "typed_name") ?? text(me, "full_name") ?? "");
        // On a phone a finger is the natural pen: draw first there, when the sender allows it.
        const options = load.signature_options ?? {};
        const drawAllowed = options.drawn !== false;
        const typeAllowed = options.typed !== false;
        if (drawAllowed && (!typeAllowed || window.matchMedia("(pointer: coarse)").matches)) setMark("drawn");
        const envelopeDone = text(load.envelope, "status") === "completed";
        setEveryoneSigned(envelopeDone);
        if (typeof load.signup_hint === "string") setSignupHint(load.signup_hint);
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
          fields: readFieldMap(d),
        }));
        setDocs(listed);
        // Reopened on the sign step: start at the signer's first field, wherever it is.
        const meId = text(me, "id");
        const firstDoc = listed.findIndex((d) => d.fields.some((f) => f.signerId === meId));
        if (firstDoc >= 0 && !text(me, "signed_at") && !envelopeDone && text(me, "consented_at")) {
          const first = listed[firstDoc].fields.find((f) => f.signerId === meId);
          setActiveDoc(firstDoc);
          if (first) setPageByDoc({ [listed[firstDoc].id]: first.page });
        }
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

  // A completed envelope is shown as its SIGNED COPY — every mark stamped where it was placed —
  // never the clean original with empty boxes. The copy is made at the last signature; when it is
  // still being made, ask again once.
  const showSigned = step === "done" && everyoneSigned;
  useEffect(() => {
    if (!showSigned) return;
    let live = true;
    const made: string[] = [];
    async function fetchCopies(attempt: number) {
      try {
        const answer = await signingAct(dispatch, door, "signed_copy");
        if (!live) return;
        const copies = answer.granted && Array.isArray(answer.signed_copies) ? answer.signed_copies : [];
        if (copies.length === 0) {
          if (attempt < 2) setTimeout(() => void fetchCopies(attempt + 1), 3000);
          return;
        }
        const next: Record<string, string> = {};
        for (const copy of copies) {
          const id = typeof copy.document_id === "string" ? copy.document_id : null;
          const data = typeof copy.content_base64 === "string" ? copy.content_base64 : null;
          if (!id || !data) continue;
          const url = URL.createObjectURL(new Blob([decodeBase64(data)], { type: "application/pdf" }));
          made.push(url);
          next[id] = url;
        }
        setSignedUrls(next);
      } catch {
        // The original stays on screen; the Download button says why if the copy cannot be had.
      }
    }
    void fetchCopies(0);
    return () => {
      live = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [dispatch, door, showSigned]);

  function patchDoc(id: string, patch: Partial<DocView>) {
    setDocs((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  /** One act; an outsider whose session ran out mid-walk is sent back for a fresh code. */
  async function act(action: SigningAction, args: Parameters<typeof signingAct>[3] = {}) {
    const answer = await signingAct(dispatch, door, action, args);
    // Once signed, a dead session never sends the signer back to "Send me the code".
    if (!answer.granted && answer.reason === "link_no_longer_valid" && doorClosed.current && step !== "done") {
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

  // ── Placed fields ────────────────────────────────────────────────────────
  const myFields: MyField[] = docs.flatMap((d, docIndex) =>
    d.fields.filter((field) => field.signerId === myId).map((field) => ({ docIndex, field })),
  );
  const hasMyFields = myFields.length > 0;
  // The field the guide points at: the one "Next field" last moved to, else the first not yet done.
  const guide =
    myFields.find((m) => m.field.id === guideId) ?? myFields.find((m) => !visited.has(m.field.id)) ?? null;

  /** Bring one of the signer's fields on screen: its document, its page, scrolled into view. */
  function goTo(entry: MyField) {
    const doc = docs[entry.docIndex];
    setActiveDoc(entry.docIndex);
    if (doc) setPageByDoc((pages) => ({ ...pages, [doc.id]: entry.field.page }));
    setGuideId(entry.field.id);
    setFocusNonce((n) => n + 1);
  }

  /** The first of the signer's fields after `fromId` (wrapping round) not yet done. */
  function nextAfter(fromId: string | null, done: ReadonlySet<string>): MyField | null {
    const start = fromId ? myFields.findIndex((m) => m.field.id === fromId) : -1;
    for (let step = 1; step <= myFields.length; step += 1) {
      const entry = myFields[(start + step) % myFields.length];
      if (entry && !done.has(entry.field.id)) return entry;
    }
    return null;
  }

  /** A field is done: mark it and move the guide on (or off, when it was the last). */
  function complete(fieldId: string) {
    const done = new Set(visited);
    done.add(fieldId);
    setVisited(done);
    const next = nextAfter(fieldId, done);
    if (next) goTo(next);
    else setGuideId(null);
  }

  function pressField(field: PlacedField) {
    if (step === "review") {
      setNotice("Review the document, then continue.");
      return;
    }
    if (step === "consent") {
      setNotice(REASON_TEXT.no_consent);
      return;
    }
    setNotice(null);
    if (!adopted) {
      setPendingField(field.id);
      setAdoptOpen(true);
      return;
    }
    complete(field.id);
  }

  function openAdopt() {
    setPendingField(guide?.field.id ?? null);
    setAdoptOpen(true);
  }

  /** Adopt in the dialog: every one of the signer's fields fills from it. */
  function confirmAdopt() {
    if (!typedName.trim()) {
      setNotice(REASON_TEXT.typed_name_required);
      return;
    }
    if (mark === "drawn" && !drawing) {
      setNotice("Draw your signature before you adopt it.");
      return;
    }
    setNotice(null);
    setAdopted(true);
    setAdoptOpen(false);
    if (pendingField) complete(pendingField);
    setPendingField(null);
  }

  const fieldValues: FieldValues | null = adopted
    ? {
        signature:
          mark === "drawn" && drawing ? { kind: "drawn", src: drawing } : { kind: "typed", name: typedName.trim() },
        initials: initialsOf(typedName),
        date: signingDate(),
        name: typedName.trim(),
      }
    : null;

  async function agree(disclosureId: string) {
    setBusy("consent");
    setNotice(null);
    try {
      const answer = await act("consent", { disclosure_id: disclosureId });
      if (answer.granted) {
        setStep("sign");
        const first = myFields[0];
        if (first) goTo(first);
      } else setNotice(reasonText(answer.reason));
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
    if (hasMyFields && !adopted) {
      openAdopt();
      return;
    }
    if (docs.some((d) => !d.seenHash || !d.previewed)) {
      setNotice(REASON_TEXT.document_not_previewed);
      return;
    }
    setBusy("sign");
    setNotice(null);
    try {
      if (mark === "drawn" && !drawing) {
        setNotice("Draw your signature before you sign.");
        return;
      }
      const adopted = await act(
        "adopt",
        mark === "drawn"
          ? { kind: "drawn", typed_name: name, image_data_url: drawing }
          : { kind: "typed", typed_name: name, typed_style: "script" },
      );
      if (!adopted.granted) {
        setNotice(reasonText(adopted.reason));
        return;
      }
      const signed = await act("sign", {
        observed: docs.map((d) => ({ document_id: d.id, content_hash: d.seenHash ?? "" })),
        action_id: SIGN_ACTION_ID,
        // So the signed copy's "Date signed" is the signer's own day, not UTC's.
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (signed.granted) {
        const progress = signed.envelope;
        setEveryoneSigned(typeof progress === "object" && progress !== null && "completed" in progress && progress.completed === true);
        if (typeof signed.signup_hint === "string") setSignupHint(signed.signup_hint);
        setStep("done");
      }
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
        <div className="flex flex-1 items-center justify-center gap-2 type-body text-muted-foreground">
          <Spinner size="xs" className="text-current" /> Opening your document
        </div>
      </Shell>
    );
  }

  if (phase.kind === "outdated") {
    return (
      <Shell>
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <XCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-base text-foreground">This document needs the new signing page.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
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
  const canType = load.signature_options?.typed !== false;
  const canDraw = load.signature_options?.drawn !== false;
  const allSeen = docs.length > 0 && docs.every((d) => d.rendered && d.seenHash);
  const original = docs[activeDoc] ?? null;
  // Complete: the signed copy, not the clean original (the frozen bytes stay the evidence).
  const signedUrl = original ? signedUrls[original.id] : undefined;
  const current = original && signedUrl ? { ...original, url: signedUrl, mimeType: "application/pdf" } : original;
  // Who else has already signed: their boxes read "Signed", not an empty placeholder.
  const signedSigners = new Set(
    (load.other_signers ?? [])
      .filter((o) => text(o, "status") === "signed")
      .map((o) => text(o, "id"))
      .filter((id): id is string => id !== null),
  );

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          {sender && <div className="truncate type-secondary text-muted-foreground">{sender}</div>}
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
        </div>
        {step !== "done" && (
          <Button variant="quiet" onClick={() => setDeclineOpen(true)}>
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
                  icon={d.rendered ? <Check /> : <FileText />}
                  key={d.id}
                  variant={i === activeDoc ? "outline" : "quiet"}
                  onClick={() => setActiveDoc(i)}
                >
                  {d.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 bg-muted/40">
            {current && (
              <DocumentFrame
                doc={current}
                onShown={() => markRendered(current)}
                page={pageByDoc[current.id] ?? 1}
                onPage={(page) => setPageByDoc((pages) => ({ ...pages, [current.id]: page }))}
                renderFields={(pageNumber, rotation) => (
                  <SigningFields
                    // The signed copy carries its marks; boxes drawn over it would print them twice.
                    // A signed document whose copy is not ready yet shows no empty boxes either.
                    fields={
                      signedUrl
                        ? []
                        : current.fields.filter((f) => f.page === pageNumber && (step !== "done" || fieldValues !== null))
                    }
                    rotation={rotation}
                    myId={myId}
                    signedSigners={signedSigners}
                    values={fieldValues}
                    pressable={step !== "done"}
                    activeId={step === "sign" ? (guide?.field.id ?? null) : null}
                    focusNonce={focusNonce}
                    done={step === "done" ? new Set(current.fields.map((f) => f.id)) : visited}
                    onPress={pressField}
                  />
                )}
              />
            )}
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-border p-4 pb-safe lg:w-96 lg:border-l lg:border-t-0">
          {message && step !== "done" && <p className="type-body text-muted-foreground">{message}</p>}

          {step === "review" && (
            <>
              <StepTitle icon={FileText} label="Review the document" />
              <Button variant="primary" disabled={!allSeen} onClick={() => void continueToConsent()}>
                {allSeen ? "Continue" : docs.length > 1 ? "Open every document" : "Opening the document"}
              </Button>
            </>
          )}

          {step === "consent" && (
            <>
              <StepTitle icon={ShieldCheck} label={text(consent, "title") ?? "Agree to sign electronically"} />
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 type-body text-foreground">
                {text(consent, "text") ?? ""}
              </div>
              <Button icon={busy === "consent" && <Spinner size="xs" className="text-current" />} variant="primary" disabled={!disclosureId || busy !== null} onClick={() => disclosureId && void agree(disclosureId)}>I agree
              </Button>
            </>
          )}

          {step === "sign" && !hasMyFields && (
            <>
              <StepTitle icon={PenLine} label="Sign" />
              <AdoptSignature
                typedName={typedName}
                onTypedName={setTypedName}
                mark={mark}
                onMark={setMark}
                drawing={drawing}
                onDrawing={setDrawing}
                canType={canType}
                canDraw={canDraw}
                disabled={busy !== null}
              />
              <Button
                icon={busy === "sign" && <Spinner size="xs" className="text-current" />}
                variant="primary"
                disabled={busy !== null || !typedName.trim() || (mark === "drawn" && !drawing)}
                onClick={() => void sign()}
              >Sign
              </Button>
            </>
          )}

          {step === "sign" && hasMyFields && (
            <>
              <div className="flex items-center justify-between gap-2">
                <StepTitle icon={PenLine} label="Sign" />
                <span className="type-secondary text-muted-foreground">
                  {visited.size} of {myFields.length} fields
                </span>
              </div>
              {adopted && fieldValues ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2">
                  {/* The signature on paper, in every theme: dark ink on a dark panel disappears. */}
                  <div className="min-w-0 flex-1 rounded-sm px-2 py-1" style={{ background: PAPER.paper, color: PAPER.ink }}>
                    {fieldValues.signature.kind === "drawn" ? (
                      // The signer's own drawing, a data URL from the pad on this screen.
                      <img src={fieldValues.signature.src} alt="Your signature" className="h-10 max-w-full object-contain" />
                    ) : (
                      <span className="block truncate font-serif text-2xl italic">
                        {fieldValues.signature.name}
                      </span>
                    )}
                  </div>
                  <Button variant="quiet" disabled={busy !== null} onClick={openAdopt}>
                    Change
                  </Button>
                </div>
              ) : (
                <Button icon={<PenLine />} variant="primary" onClick={openAdopt}>
                  Adopt your signature
                </Button>
              )}
              {adopted && guide && (
                <Button iconEnd={<ArrowRight />} variant="primary" onClick={() => complete(guide.field.id)}>
                  Next field
                </Button>
              )}
              <Button
                icon={busy === "sign" && <Spinner size="xs" className="text-current" />}
                variant={adopted && !guide ? "primary" : "outline"}
                disabled={busy !== null || !adopted}
                onClick={() => void sign()}
              >Sign
              </Button>
            </>
          )}

          {step === "done" && (
            <SignedDone
              door={door}
              title={title}
              everyoneSigned={everyoneSigned}
              signupHint={signupHint}
              signedAt={text(load.me, "signed_at")}
            />
          )}

          {notice && <p className="type-body text-destructive">{notice}</p>}
        </aside>
      </div>

      <Dialog open={adoptOpen} onOpenChange={setAdoptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adopt your signature</DialogTitle>
            <DialogDescription>It fills every field marked for you.</DialogDescription>
          </DialogHeader>
          <AdoptSignature
            typedName={typedName}
            onTypedName={setTypedName}
            mark={mark}
            onMark={setMark}
            drawing={drawing}
            onDrawing={setDrawing}
            canType={canType}
            canDraw={canDraw}
            disabled={busy !== null}
          />
          {notice && adoptOpen && <p className="type-body text-destructive">{notice}</p>}
          <DialogFooter>
            <Button variant="quiet" onClick={() => setAdoptOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!typedName.trim() || (mark === "drawn" && !drawing)} onClick={confirmAdopt}>
              Adopt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declineOpen} onOpenChange={(open) => busy !== "decline" && setDeclineOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline to sign</DialogTitle>
            <DialogDescription>The sender sees your reason and the request closes.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={declineReason}
            placeholder="I need changes to section 3"
            onChange={(e) => setDeclineReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="quiet" disabled={busy === "decline"} onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button icon={busy === "decline" && <Spinner size="xs" className="text-current" />} variant="danger" disabled={!declineReason.trim() || busy === "decline"} onClick={() => void decline()}>Decline
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
    <div className="flex items-center gap-2 type-title text-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function DocumentFrame({
  doc,
  onShown,
  page,
  onPage,
  renderFields,
}: {
  doc: DocView;
  onShown: () => void;
  page: number;
  onPage: (page: number) => void;
  /** The placed fields for one drawn page, laid over it at the viewer's rotation. */
  renderFields: (pageNumber: number, rotation: number) => React.ReactNode;
}) {
  if (doc.failed) {
    return <p className="m-auto px-6 text-center type-body text-muted-foreground">{doc.failed}</p>;
  }
  if (!doc.url) {
    return <Spinner size="sm" className="m-auto text-muted-foreground" />;
  }
  const kind = displayKind(doc.mimeType);
  if (kind === "pdf") {
    return (
      <Suspense fallback={<Spinner size="sm" className="m-auto text-muted-foreground" />}>
        <PdfDocumentRenderer
          // The bytes, not just the document: swapping in the signed copy must reload the viewer.
          key={`${doc.id}:${doc.url}`}
          blobUrl={doc.url}
          fileName={doc.name}
          className="h-full w-full"
          pageNumber={page}
          onPageChange={onPage}
          renderOverlay={({ pageNumber, rotation }) => (
            <>
              <Shown onShown={onShown} />
              {renderFields(pageNumber, rotation)}
            </>
          )}
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
      <Button
        icon={<Download />}
        variant="outline"
        onClick={() => {
          if (doc.url) downloadUrl(doc.url, doc.name);
          onShown();
        }}
      >
        Download {doc.name}
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
