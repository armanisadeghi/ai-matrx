"use client";

// features/esign/signer/SignerSurface.tsx — THE SIGNING PAGE, v2 (esign-parity CONTRACT §13).
//
// One surface behind every door (`SignerDoorApi`): a signed-in member, an outside signer from an
// emailed link, and the sender's own preview. The bar is the owner's DocHub session and Docusign
// (champion S1–S14): every page of every document in one scroll; "Action required — N required
// fields remaining" with a progress bar; Start / Next field / Skip; a callout on the active field;
// compact inline tags in the signer's colour; an input for every field kind; missed-required
// recovery; a Finish that turns green and takes the focus; the actions one click away; a message to
// the sender; a "Finalized!" screen that says what happens next. On a phone: the document at full
// width, one top bar, and a bottom input drawer.
//
// The server decides everything (§2, §6). This file holds what is on the screen: values autosave
// through the door (single-flight, newest `seq` wins — autosave.ts), and Sign sends the complete
// on-screen map with the hashes of the bytes the signer actually saw.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { PanelLeft, Minus, Plus, ScanLine } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { downloadFile } from "@ai-matrx/kit/download";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/styles/themes/useThemeMode";

import type { FieldValue } from "../contract/fieldModel";
import { DoorRefusal, SessionEnded, type MarkTarget, type SignerDoorApi, type SignerLoadV2 } from "../contract/signerDoor";
import type { CreatedMark } from "../signature-creator/SignatureCreatorDialog";
import { Autosaver, type SaveState } from "./autosave";
import { serverTakes } from "./door";
import {
  describeValue,
  formatDate,
  initialsOf,
  isFilled,
  isMarkKind,
  nextField,
  plainValues,
  readEnvelope,
  requiredUnits,
  screenPatch,
  shownValue,
  today,
  valueProblem,
  walkable,
  type SField,
  type SGroup,
} from "./model";
import { ControlInput } from "./parts/ControlInput";
import { AssignDialog, DeclineDialog, FinishDialog, HelpDialog, HistoryDialog, type RecordedRow } from "./parts/Dialogs";
import { DocumentStack, PageThumbnails, type StackDoc } from "./parts/DocumentStack";
import { ConsentPanel, EndScreen, type EndKind, type LandingFacts } from "./parts/Panels";
import { PaperField } from "./parts/PaperField";
import { TopBar, type GuideMode } from "./parts/TopBar";
import { errorText, reasonText } from "./text";

// The creator carries a dozen handwriting fonts: it loads when first opened, never with the page.
const SignatureCreatorDialog = dynamic(
  () => import("../signature-creator/SignatureCreatorDialog").then((m) => m.SignatureCreatorDialog),
  { ssr: false },
);

interface DocState extends StackDoc {
  bytes: Uint8Array<ArrayBuffer> | null;
  hash: string | null;
  previewed: boolean;
}

type Stage = "consent" | "signing" | "end";

type Phase =
  | { kind: "loading" }
  | { kind: "refused"; message: string }
  | { kind: "ready"; load: SignerLoadV2 };

type DialogName = "finish" | "decline" | "assign" | "history" | "help" | null;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function str(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function dataUrl(base64: string | null, mime = "image/png"): string | null {
  if (!base64) return null;
  return base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
}

/** An outsider's one-time sign-up hint, when the server sends one beside the load answer. */
function signupHintOf(load: object): string | null {
  const value: unknown = Reflect.get(load, "signup_hint");
  return typeof value === "string" && value !== "" ? value : null;
}

function newActionId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `sign-${Date.now()}`;
}

export function SignerSurface({
  door,
  onDoorClosed,
}: {
  door: SignerDoorApi;
  onDoorClosed?: (why: SessionEnded) => void;
}) {
  const isMobile = useIsMobile();
  const dark = useThemeMode() === "dark";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [docs, setDocs] = useState<DocState[]>([]);
  const [fields, setFields] = useState<SField[]>([]);
  const [groups, setGroups] = useState<SGroup[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [marks, setMarks] = useState<Record<MarkTarget, string | null>>({ signature: null, initials: null });
  const [stage, setStage] = useState<Stage>("consent");
  const [end, setEnd] = useState<{ kind: EndKind; message?: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [missed, setMissed] = useState<ReadonlySet<string> | null>(null);
  const [creator, setCreator] = useState<{ target: MarkTarget; fieldId: string | null } | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [formView, setFormView] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [thumbs, setThumbs] = useState(false);
  const [dimChoice, setDimChoice] = useState<boolean | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ event: string; at: string; label: string; mine: boolean }> | null>(null);
  const [result, setResult] = useState<{ signed_at: string; everyone_signed: boolean; remaining: number; final_values: Record<string, FieldValue> } | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const urls = useRef<string[]>([]);
  const closed = useRef(onDoorClosed);
  useEffect(() => {
    closed.current = onDoorClosed;
  }, [onDoorClosed]);

  const dim = dimChoice ?? dark;
  const compact = isMobile;

  /** Any door error: a session that ended goes back to the outsider gate; the rest is a sentence. */
  function fail(err: unknown, where: "notice" | "dialog" = "notice"): void {
    if (err instanceof SessionEnded) {
      if (closed.current) closed.current(err);
      else setPhase({ kind: "refused", message: "Your session ended. Reload the page to continue." });
      return;
    }
    if (where === "dialog") setDialogError(errorText(err));
    else setNotice(errorText(err));
  }

  // ── Autosave (§2.1) ─────────────────────────────────────────────────────
  const [saver] = useState(
    () =>
      new Autosaver({
        save: (patch) => door.saveValues(patch),
        onAdopt: (current) => setValues((v) => ({ ...v, ...current })),
        onState: setSaveState,
        onRefused: (err) => {
          if (err instanceof SessionEnded || err instanceof DoorRefusal) {
            fail(err);
            return true;
          }
          return false;
        },
      }),
  );
  useEffect(() => {
    const flush = () => void saver.flush();
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      saver.stop();
    };
  }, [saver]);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    const held = urls.current;
    door
      .load()
      .then(async (load) => {
        if (!live) return;
        const read = readEnvelope(load);
        setFields(read.fields);
        setGroups(read.groups);
        setValues(plainValues(load.me.field_values ?? {}));
        setMarks({
          signature: dataUrl(load.my_marks.signature_base64, load.my_marks.mime_type),
          initials: dataUrl(load.my_marks.initials_base64, load.my_marks.mime_type),
        });
        const me = load.me;
        const completed = str(load.envelope, "status") === "completed";
        if (str(me, "signed_at") || completed) {
          setEnd({ kind: "already_signed" });
          setStage("end");
        } else if (str(me, "consented_at") || !load.consent) {
          setStage("signing");
        }
        setFormView(load.settings.form_view === "default");
        const sorted = [...load.documents].sort((a, b) => a.position - b.position);
        setDocs(
          sorted.map((d) => ({
            id: d.id,
            name: d.name,
            url: null,
            mimeType: d.mime_type,
            failed: null,
            bytes: null,
            hash: null,
            previewed: Boolean(str(me, "document_previewed_at")),
          })),
        );
        setPhase({ kind: "ready", load });
        for (const d of sorted) void fetchDoc(d.id, () => live);
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof SessionEnded) {
          fail(err);
          return;
        }
        setPhase({ kind: "refused", message: err instanceof DoorRefusal ? reasonText(err.code) : errorText(err) });
      });
    return () => {
      live = false;
      for (const url of held) URL.revokeObjectURL(url);
    };
    // The door is fixed for the life of the page; loading again would record another `opened`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [door]);

  async function fetchDoc(id: string, alive: () => boolean = () => true) {
    try {
      const got = await door.documentBytes(id);
      const bytes = new Uint8Array(new ArrayBuffer(got.bytes.byteLength));
      bytes.set(got.bytes);
      const hash = await sha256Hex(bytes);
      const display = got.mime_type === "application/pdf" || (got.mime_type.startsWith("image/") && got.mime_type !== "image/svg+xml");
      // A blob takes the page's origin: never give it a type a browser would run.
      const url = URL.createObjectURL(new Blob([bytes], { type: display ? got.mime_type : "application/octet-stream" }));
      urls.current.push(url);
      if (!alive()) return;
      setDocs((all) => all.map((d) => (d.id === id ? { ...d, url, bytes, hash, mimeType: got.mime_type, failed: null } : d)));
    } catch (err) {
      if (err instanceof SessionEnded) return fail(err);
      setDocs((all) => all.map((d) => (d.id === id ? { ...d, failed: errorText(err) } : d)));
    }
  }

  // The document has rendered on this screen: that is the fact `preview` records (§13.2).
  const acked = useRef(new Set<string>());
  function pageRendered(docId: string, page: number) {
    if (page !== 1 || acked.current.has(docId)) return;
    acked.current.add(docId);
    door
      .previewAck(docId)
      .then(() => setDocs((all) => all.map((d) => (d.id === docId ? { ...d, previewed: true } : d))))
      .catch((err: unknown) => {
        acked.current.delete(docId);
        fail(err);
      });
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const load = phase.kind === "ready" ? phase.load : null;
  const me = load?.me ?? null;
  const meRecord: Record<string, unknown> = me ?? {};
  const role = str(meRecord, "role") ?? "signer";
  const viewer = role === "viewer" || role === "cc_recipient";
  const dateFormat = load?.settings.date_format_default ?? "MM/DD/YYYY";
  const myWalk = walkable(fields);
  const units = requiredUnits(fields, groups, values, meRecord);
  const remaining = units.open.length;
  const missedFieldIds = new Set(
    missed
      ? units.open.map((u) => u.fieldId).concat(
          units.open.filter((u) => u.key.startsWith("group:")).flatMap((u) => fields.filter((f) => `group:${f.group_id}` === u.key).map((f) => f.id)),
        )
      : [],
  );
  const allPreviewed = docs.length > 0 && docs.every((d) => d.previewed || d.failed !== null);
  const signerName = str(meRecord, "full_name") ?? str(meRecord, "email") ?? "";
  const senderName = load?.sender.name ?? "The sender";
  const title = str(load?.envelope, "title") ?? docs[0]?.name ?? "Document";
  const otherById = new Map((load?.other_signers ?? []).map((o) => [o.id, o]));
  const othersFilled = new Map((load?.others_filled ?? []).map((o) => [o.field_id, o.v]));
  const active = fields.find((f) => f.id === activeId) ?? null;

  const guideMode: GuideMode =
    stage === "consent"
      ? "consent"
      : viewer
        ? "viewer"
        : remaining === 0
          ? "ready"
          : missed
            ? "missed"
            : started
              ? "next"
              : "start";

  // Required work changed while recovering: drop fields that got done; leave the mode when all are.
  useEffect(() => {
    if (missed && remaining === 0) setMissed(null);
  }, [missed, remaining]);

  // Move the screen to the active field and put the cursor in it (S5.11).
  useEffect(() => {
    if (!activeId || focusNonce === 0) return;
    const node = document.getElementById(`esign-field-${activeId}`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (!compact) {
      const input = document.getElementById(`esign-field-${activeId}-input`);
      (input as HTMLElement | null)?.focus({ preventScroll: true });
    }
  }, [activeId, focusNonce, compact]);

  function goTo(field: SField | null) {
    if (!field) return;
    setStarted(true);
    setActiveId(field.id);
    setFocusNonce((n) => n + 1);
  }

  /** Start / Next field / Next required. */
  function guide() {
    if (guideMode === "start") {
      // Start goes where the work is: the first required field still open (Docusign's START tag).
      const firstOpen = units.open[0]?.fieldId;
      const first =
        fields.find((f) => f.id === firstOpen) ??
        myWalk.find((f) => !isFilled(f, shownValue(f, values, meRecord))) ??
        myWalk[0] ??
        null;
      goTo(first);
      return;
    }
    if (guideMode === "missed") {
      const ids = new Set(units.open.map((u) => u.fieldId));
      setMissed(ids);
      goTo(nextField(fields, activeId, values, meRecord, ids) ?? fields.find((f) => ids.has(f.id)) ?? null);
      return;
    }
    const next = nextField(fields, activeId, values, meRecord);
    if (next) {
      goTo(next);
      return;
    }
    if (remaining > 0) enterMissed();
  }

  function enterMissed() {
    const ids = new Set(units.open.map((u) => u.fieldId));
    setMissed(ids);
    goTo(fields.find((f) => ids.has(f.id)) ?? null);
  }

  /** "Next field →" / "Skip →" on the callout or the drawer. */
  function advance(from: SField) {
    const next = missed
      ? nextField(fields, from.id, values, meRecord, new Set(units.open.map((u) => u.fieldId)))
      : nextField(fields, from.id, values, meRecord);
    if (next && next.id !== from.id) goTo(next);
    else if (remaining > 0 && !missed) enterMissed();
    else setActiveId(null);
  }

  // ── Writing values ──────────────────────────────────────────────────────
  function change(fieldId: string, value: FieldValue) {
    const field = fields.find((f) => f.id === fieldId);
    if (!field || !field.mine || field.read_only || stage !== "signing") return;
    setStarted(true);
    const seq = saver.nextSeq();
    if (field.kind === "radio" && value === true && field.group_id) {
      const others = fields.filter((f) => f.group_id === field.group_id && f.id !== fieldId);
      setValues((v) => {
        const nextV = { ...v, [fieldId]: true };
        for (const o of others) nextV[o.id] = false;
        return nextV;
      });
      saver.edit(fieldId, true, seq);
      for (const o of others) if (values[o.id] === true) saver.edit(o.id, false, seq);
      return;
    }
    setValues((v) => ({ ...v, [fieldId]: value }));
    saver.edit(fieldId, value, seq);
  }

  function pressMark(field: SField) {
    if (stage !== "signing") return;
    const target: MarkTarget = field.kind === "initials" ? "initials" : "signature";
    setActiveId(field.id);
    if (marks[target] && values[field.id] !== "applied") {
      change(field.id, "applied");
      return;
    }
    setCreator({ target, fieldId: field.id });
  }

  function clearMark(field: SField) {
    change(field.id, null);
  }

  /**
   * The creator stays open until the server holds the mark. Closing it first lost the mark on a
   * stalled or failed act (2026-10-07: an adopt hung 40 s, then failed; the creator was already
   * gone, the field stayed unsigned and nothing said why). Now: a slow act says it is working, a
   * failed one says so and leaves the creator open with the mark, ready for Adopt again.
   */
  async function adopted(created: CreatedMark[]) {
    if (adopting.current) return;
    adopting.current = true;
    const pending = creator;
    const got: Partial<Record<MarkTarget, string | null>> = {};
    const slow = window.setTimeout(() => toast.loading("Saving your signature…", { id: ADOPT_TOAST }), 1200);
    setBusy("adopt");
    setNotice(null);
    try {
      for (const mark of created) {
        const answer = await door.adopt({
          target: mark.target,
          kind: mark.kind,
          source: mark.source,
          typed_name: mark.target === "initials" ? mark.initials : mark.full_name,
          typed_style: mark.typed_style,
          image_data_url: mark.image_data_url,
          strokes: mark.strokes,
          handoff_id: mark.handoff_id,
          saved_signature_id: mark.saved_signature_id,
          save_to_profile: mark.save_to_profile,
          make_default: mark.make_default,
        });
        setMarks((m) => ({ ...m, [answer.target]: dataUrl(answer.image_base64) ?? mark.preview_url }));
      }
      if (pending?.fieldId) change(pending.fieldId, "applied");
      if (created.some((m) => m.save_to_profile) && !serverTakes("save_to_profile")) {
        setNotice("Saving it to your profile is not available yet.");
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  /** Fill all (S7.8): every empty field of that kind gets the adopted mark. */
  function fillAll(target: MarkTarget) {
    for (const f of myWalk) {
      if (f.kind === target && values[f.id] !== "applied") change(f.id, "applied");
    }
  }

  // ── Consent ─────────────────────────────────────────────────────────────
  async function giveConsent() {
    if (!load?.consent) {
      setStage("signing");
      return;
    }
    setBusy("consent");
    setNotice(null);
    try {
      await door.consent(load.consent.disclosure_id);
      setStage("signing");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  // ── Finish ──────────────────────────────────────────────────────────────
  function finish() {
    if (viewer) {
      void acknowledge();
      return;
    }
    if (remaining > 0) {
      enterMissed();
      return;
    }
    setDialogError(null);
    setDialog("finish");
  }

  async function finalize(message: string) {
    setBusy("sign");
    setDialogError(null);
    try {
      await saver.flush();
      const observed = docs
        .filter((d) => d.hash !== null)
        .map((d) => ({ document_id: d.id, content_hash: d.hash as string }));
      const answer = await door.sign({
        observed,
        action_id: newActionId(),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        values: screenPatch(fields, values, meRecord, saver.nextSeq()),
        message_to_sender: message || undefined,
      });
      setResult(answer);
      setDialog(null);
      setEnd({ kind: "finalized" });
      setStage("end");
      saver.stop();
    } catch (err) {
      if (err instanceof DoorRefusal && err.code === "required_fields_missing") {
        const missing = Array.isArray(err.detail?.missing) ? err.detail.missing.filter((m): m is string => typeof m === "string") : [];
        setDialog(null);
        const ids = new Set(missing.map((m) => (m.startsWith("group:") ? (fields.find((f) => `group:${f.group_id}` === m)?.id ?? m) : m)));
        setMissed(ids);
        goTo(fields.find((f) => ids.has(f.id)) ?? null);
        setNotice(reasonText(err.code));
        return;
      }
      fail(err, "dialog");
    } finally {
      setBusy(null);
    }
  }

  async function acknowledge() {
    setBusy("acknowledge");
    try {
      await door.acknowledge();
      setEnd({ kind: "reviewed" });
      setStage("end");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function finishLater() {
    setBusy("later");
    try {
      await saver.flush();
      setEnd({ kind: "later" });
      setStage("end");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function decline(reason: string) {
    setBusy("decline");
    setDialogError(null);
    try {
      await door.decline(reason);
      setDialog(null);
      saver.stop();
      setEnd({ kind: "declined" });
      setStage("end");
    } catch (err) {
      fail(err, "dialog");
    } finally {
      setBusy(null);
    }
  }

  async function assign(input: { full_name: string; email: string; message: string }) {
    setBusy("assign");
    setDialogError(null);
    try {
      await saver.flush();
      await door.delegate(input);
      setDialog(null);
      saver.stop();
      setEnd({ kind: "assigned", message: input.full_name });
      setStage("end");
    } catch (err) {
      fail(err, "dialog");
    } finally {
      setBusy(null);
    }
  }

  async function openHistory() {
    setHistory(null);
    setDialogError(null);
    setDialog("history");
    try {
      setHistory(await door.history());
    } catch (err) {
      fail(err, "dialog");
    }
  }

  async function download(parts: Array<"documents" | "certificate">) {
    setBusy("download");
    setNotice(null);
    try {
      const files = await door.download({ parts, combine: false });
      for (const f of files) {
        const copy = new Uint8Array(new ArrayBuffer(f.bytes.byteLength));
        copy.set(f.bytes);
        downloadFile(f.name, copy, f.mime_type);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  /** Print the documents as they are (the frozen originals) through the browser's own dialog. */
  function print() {
    const doc = docs.find((d) => d.url && d.mimeType === "application/pdf");
    if (!doc?.url) {
      setNotice("The document is still opening. Try again in a moment.");
      return;
    }
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = doc.url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        void download(["documents"]);
      }
      setTimeout(() => frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  }

  function jumpTo(docId: string, page: number) {
    const node = document.querySelector(`[data-doc="${docId}"] [data-pdf-page="${page}"]`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (phase.kind === "loading") {
    return (
      <main className="flex h-full items-center justify-center bg-textured">
        <Spinner size="sm" className="text-muted-foreground" />
      </main>
    );
  }
  if (phase.kind === "refused" || !load || !me) {
    return (
      <main className="h-full overflow-y-auto bg-textured">
        <EndScreen
          kind="refused"
          title=""
          senderName=""
          everyoneSigned={false}
          remaining={0}
          signedAt={null}
          recorded={[]}
          outsider={door.seat === "outsider"}
          signupHint={null}
          message={phase.kind === "refused" ? phase.message : ""}
          downloading={false}
        />
      </main>
    );
  }

  const facts: LandingFacts = {
    senderName,
    organizationName: load.organization.name,
    logoUrl: load.organization.logo_url,
    title,
    pages: load.documents.every((d) => typeof d.page_count === "number")
      ? load.documents.reduce((n, d) => n + (d.page_count ?? 0), 0)
      : null,
    documents: load.documents.length,
    message: str(load.envelope, "message"),
    privateMessage: str(meRecord, "private_message"),
    expiresAt: str(load.envelope, "expires_at"),
  };
  const todayText = (field: SField) => formatDate(today(), field.date_format ?? dateFormat);
  const markUrlFor = (f: SField) => (f.kind === "initials" ? marks.initials : marks.signature);
  const recordedRows = (finalValues: Record<string, FieldValue> | null): RecordedRow[] =>
    fields
      .filter((f) => f.mine && !(f.kind === "radio" && (finalValues ? finalValues[f.id] : shownValue(f, values, meRecord)) !== true))
      .map((f) => {
        const v = finalValues ? (finalValues[f.id] ?? null) : shownValue(f, values, meRecord);
        return {
          id: f.id,
          label: f.kind === "radio" ? (groups.find((g) => g.id === f.group_id)?.label ?? f.label) : f.label,
          value: describeValue(f, v, dateFormat),
          markUrl: isMarkKind(f.kind) && v === "applied" ? markUrlFor(f) : null,
        };
      });

  if (stage === "end" && end) {
    const signedAt = result?.signed_at ?? str(meRecord, "signed_at");
    const everyone = result?.everyone_signed ?? str(load.envelope, "status") === "completed";
    return (
      <div className="flex h-full flex-col bg-textured">
        <main className="min-h-0 flex-1 overflow-y-auto">
          <EndScreen
            kind={end.kind}
            title={title}
            senderName={senderName}
            everyoneSigned={everyone}
            remaining={result?.remaining ?? load.remaining_after_me}
            signedAt={signedAt}
            recorded={end.kind === "finalized" ? recordedRows(result?.final_values ?? null) : []}
            outsider={door.seat === "outsider"}
            signupHint={signupHintOf(load)}
            message={end.message}
            downloading={busy === "download"}
            onDownload={end.kind === "declined" ? undefined : () => void download(["documents"])}
            onPrint={end.kind === "declined" ? undefined : print}
            onCertificate={() => void download(["certificate"])}
            onReturn={end.kind === "later" ? () => setStage("signing") : undefined}
          />
          {notice ? <p className="mx-auto max-w-lg px-4 pb-6 type-body text-destructive">{notice}</p> : null}
        </main>
      </div>
    );
  }

  const locked = stage !== "signing";
  const marksTarget: MarkTarget | null = marks.signature ? "signature" : null;
  const emptyMarks = (t: MarkTarget) => myWalk.filter((f) => f.kind === t && values[f.id] !== "applied").length;
  const showFillAll =
    !locked && load.settings.fill_all_allowed && marksTarget !== null && emptyMarks("signature") >= 2;

  const renderPage = (docId: string, page: number) =>
    fields
      .filter((f) => f.documentId === docId && f.page === page)
      .map((f) => {
        const other = f.mine ? undefined : otherById.get(f.signer_id);
        const otherMarks = other ? load.others_marks[other.id] : undefined;
        return (
          <PaperField
            key={f.id}
            field={f}
            value={f.mine ? shownValue(f, values, meRecord) : (othersFilled.get(f.id) ?? null)}
            colorIndex={f.mine ? me.color_index : (other?.color_index ?? 5)}
            active={f.id === activeId && !locked}
            missed={missedFieldIds.has(f.id)}
            compact={compact}
            locked={locked}
            markUrl={f.mine ? markUrlFor(f) : null}
            dateText={todayText(f)}
            dateFormat={dateFormat}
            other={
              f.mine
                ? undefined
                : {
                    name: other?.name ?? null,
                    signed: other?.status === "signed",
                    markUrl: dataUrl(
                      (f.kind === "initials" ? otherMarks?.initials_base64 : otherMarks?.signature_base64) ?? null,
                    ),
                  }
            }
            onActivate={(field) => setActiveId(field.id)}
            onChange={change}
            onBlur={() => void saver.flush()}
            onMark={pressMark}
            onClear={(field) => (isMarkKind(field.kind) ? clearMark(field) : change(field.id, null))}
            onNext={advance}
          />
        );
      });

  const groupOf = (f: SField) => (f.group_id ? groups.find((g) => g.id === f.group_id) : undefined);
  const control = (f: SField, autoFocus: boolean) => {
    const g = groupOf(f);
    const options = f.kind === "radio" && f.group_id ? fields.filter((o) => o.group_id === f.group_id) : undefined;
    const v = shownValue(f, values, meRecord);
    return (
      <ControlInput
        field={f}
        options={options}
        groupTitle={g?.label}
        value={v}
        optionValues={options ? Object.fromEntries(options.map((o) => [o.id, shownValue(o, values, meRecord)])) : undefined}
        markUrl={markUrlFor(f)}
        problem={valueProblem(f, v)}
        onChange={change}
        onBlur={() => void saver.flush()}
        onMark={pressMark}
        onClearMark={clearMark}
        autoFocus={autoFocus}
        dateText={todayText(f)}
      />
    );
  };

  // Form view: one row per field, "Required" / "Optional" under each (S5.9, S8.4).
  const seenGroups = new Set<string>();
  const formRows = myWalk.filter((f) => {
    if (!f.group_id || f.kind !== "radio") return true;
    if (seenGroups.has(f.group_id)) return false;
    seenGroups.add(f.group_id);
    return true;
  });

  return (
    <div className="flex h-full flex-col bg-textured">
      <TopBar
        title={title}
        senderName={senderName}
        organizationName={load.organization.name}
        logoUrl={load.organization.logo_url}
        mode={guideMode}
        remaining={remaining}
        total={units.total.length}
        saveState={saveState}
        compact={compact}
        busy={busy !== null}
        delegationAllowed={load.settings.delegation_allowed}
        formViewAvailable={load.settings.form_view !== "off" && !viewer}
        formView={formView}
        dark={dark}
        dim={dim}
        completed={str(load.envelope, "status") === "completed"}
        onGuide={guide}
        onFinish={finish}
        onFinishLater={() => void finishLater()}
        onDecline={() => {
          setDialogError(null);
          setDialog("decline");
        }}
        onAssign={() => {
          setDialogError(null);
          setDialog("assign");
        }}
        onPrint={print}
        onDownload={() => void download(["documents"])}
        onHistory={() => void openHistory()}
        onHelp={() => setDialog("help")}
        onCertificate={() => void download(["certificate"])}
        onFormView={() => setFormView((v) => !v)}
        onDim={() => setDimChoice(!dim)}
      />

      {!compact ? (
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-background/80 px-2 sm:px-4">
          <Button variant="quiet" icon={<PanelLeft />} pressed={thumbs} aria-label="Pages" onClick={() => setThumbs((t) => !t)} />
          <span className="mx-1 h-4 w-px bg-border" />
          <Button variant="quiet" icon={<Minus />} aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} />
          <span className="w-12 text-center type-secondary tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="quiet" icon={<Plus />} aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))} />
          <Button variant="quiet" icon={<ScanLine />} pressed={zoom === 1} onClick={() => setZoom(1)}>
            Fit width
          </Button>
          {showFillAll ? (
            <Button variant="quiet" onClick={() => fillAll("signature")}>
              Fill all signature fields
            </Button>
          ) : null}
          {notice ? <span className="ml-2 truncate type-secondary text-destructive" role="alert">{notice}</span> : null}
        </div>
      ) : notice ? (
        <p className="shrink-0 border-b border-border bg-background px-3 py-1 type-secondary text-destructive" role="alert">
          {notice}
        </p>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {thumbs && !compact ? (
          <aside className="w-40 shrink-0 overflow-y-auto border-r border-border bg-background/60">
            <PageThumbnails docs={docs} onJump={jumpTo} />
          </aside>
        ) : null}

        <main
          className={cn("relative min-h-0 flex-1 overflow-auto", compact && active && !locked && "pb-[45dvh]")}
          data-matrx-page-scroll
        >
          {formView && !locked ? (
            <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
              {formRows.map((f) => (
                <div key={f.id} className="rounded-lg border border-border bg-card p-3">
                  {control(f, false)}
                </div>
              ))}
              {formRows.length === 0 ? <p className="type-body text-muted-foreground">Nothing to fill in.</p> : null}
            </div>
          ) : (
            <DocumentStack
              docs={docs}
              zoom={zoom}
              dim={dim}
              renderPage={renderPage}
              onPageRendered={pageRendered}
              onRetry={(id) => void fetchDoc(id)}
            />
          )}
        </main>

        {stage === "consent" ? (
          <>
            <div className="pointer-events-none absolute inset-0 z-30 bg-background/55" aria-hidden />
            <ConsentPanel
              facts={facts}
              disclosure={load.consent ? { title: load.consent.title, text: load.consent.text } : null}
              agreed={agreed}
              onAgreed={setAgreed}
              ready={allPreviewed}
              busy={busy === "consent"}
              error={notice}
              onContinue={() => void giveConsent()}
            />
          </>
        ) : null}

        {compact && active && !locked && !formView ? (
          <section
            aria-label={active.label}
            data-matrx-floating-bottom
            className="absolute inset-x-0 bottom-0 z-40 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-xl border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
          >
            {control(active, !isMarkKind(active.kind) && active.kind !== "checkbox" && active.kind !== "radio")}
            <div className="flex items-center justify-between gap-2">
              <Button variant="quiet" onClick={() => setActiveId(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => advance(active)}>
                {isFilled(active, shownValue(active, values, meRecord)) || active.required ? "Next field" : "Skip"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {creator ? (
        <SignatureCreatorDialog
          open
          target={creator.target}
          signerName={signerName}
          initials={str(meRecord, "initials_text") ?? initialsOf(signerName)}
          allowed={load.settings.signature_options}
          door={door}
          signedIn={door.seat === "signed_in"}
          onAdopt={(m) => void adopted(m)}
          onClose={() => setCreator(null)}
        />
      ) : null}

      <FinishDialog
        open={dialog === "finish"}
        rows={recordedRows(null)}
        senderName={senderName}
        messageAllowed={load.settings.message_to_sender_allowed}
        busy={busy === "sign"}
        error={dialogError}
        voice={door.seat === "signed_in"}
        onEdit={() => setDialog(null)}
        onFinalize={(m) => void finalize(m)}
      />
      <DeclineDialog
        open={dialog === "decline"}
        busy={busy === "decline"}
        error={dialogError}
        voice={door.seat === "signed_in"}
        onClose={() => setDialog(null)}
        onDecline={(r) => void decline(r)}
      />
      <AssignDialog
        open={dialog === "assign"}
        busy={busy === "assign"}
        error={dialogError}
        voice={door.seat === "signed_in"}
        onClose={() => setDialog(null)}
        onAssign={(input) => void assign(input)}
      />
      <HistoryDialog open={dialog === "history"} events={history} error={dialogError} onClose={() => setDialog(null)} />
      <HelpDialog
        open={dialog === "help"}
        senderName={senderName}
        senderEmail={load.sender.email ?? null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
