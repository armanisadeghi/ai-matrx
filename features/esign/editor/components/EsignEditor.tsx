"use client";

// features/esign/editor/components/EsignEditor.tsx — the sender's editor (CONTRACT §15).
//
// Left rail: Documents · People · Message · Fields. Centre: the real PDF with the field layer.
// Right: the selected field's properties. The draft is saved on the server as the sender works
// (useDraftSync); undo/redo hold 50 steps. On a phone the rails become sheets and a field is
// placed by tapping a kind, then the page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, FileText, LayoutTemplate, PenLine, Redo2, Send, Trash2, Undo2, Upload, SlidersHorizontal } from "lucide-react";

import { Button, EmptyState, Tabs } from "@ai-matrx/design-system/controls";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useRouter } from "next/navigation";

import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { DraftField, EnvelopeDraftV1, EnvelopeTemplateV1 } from "../../contract/draft";
import type { FieldKindV2 } from "../../contract/fieldModel";
import { useSenderName } from "../useSenderName";
import { clampBox, effectiveSubject, fieldRecipients, newField, newId, sendBlockers } from "../model";
import { useDraftHistory } from "../history";
import { useDraftSync, type SaveStatus } from "../useDraftSync";
import { DraftRefusal, type DetectCandidate, type EditorApi, type SendResult } from "../api/types";
import { DocumentStage } from "./DocumentStage";
import { FieldsPanel } from "./FieldsPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { RecipientsPanel, type Person } from "./RecipientsPanel";
import { DocumentsPanel, UploadButton } from "./DocumentsPanel";
import { MessagePanel } from "./MessagePanel";
import { PreviewDialog, SendDialog, TemplateDialog } from "./Dialogs";

export interface UploadedDoc {
  file_id: string;
  name: string;
}

export interface EditorUploader {
  upload(file: File): Promise<UploadedDoc>;
  /** Open the files picker; calls back with the chosen PDF. */
  pick(onPick: (doc: UploadedDoc) => void): void;
  busy: boolean;
}

export interface EsignEditorProps {
  api: EditorApi;
  mode: "envelope" | "template";
  /** null on /esign/new until the first change creates the draft. */
  envelopeId: string | null;
  initial: { draft: EnvelopeDraftV1; revision: number; /** the server's copy when `draft` is a restored local mirror */ confirmed?: EnvelopeDraftV1 };
  /** For `mode="template"`: the saved template, if any. */
  template?: { id: string | null; name: string; version: number } | null;
  organizationId: string | null;
  /** Asked when a write needs an organization and none is chosen (the organization gate). */
  resolveOrganizationId?: () => Promise<string>;
  people: Person[];
  me: Person | null;
  uploader: EditorUploader;
  /** The draft now exists on the server: the host moves the address bar. */
  onCreated?(envelopeId: string): void;
  onSendComplete?(result: SendResult): void;
  onTemplateSaved?(templateId: string): void;
  backHref?: string;
  restoredNotice?: boolean;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  dirty: "Saving soon",
  retrying: "Not saved — retrying",
  readonly: "Read only",
};

/** A template keeps roles, fields and settings; names, emails and access codes never travel. */
export function toTemplate(d: EnvelopeDraftV1): EnvelopeTemplateV1 {
  return {
    ...d,
    recipients: d.recipients.map((r, i) => {
      const { has_access_code: dropped, ...rest } = r;
      void dropped;
      return { ...rest, template_role: r.template_role || r.full_name || `Signer ${i + 1}`, full_name: "", email: "", user_id: null };
    }),
  };
}

export function EsignEditor(props: EsignEditorProps) {
  const router = useRouter();
  const { api, mode, uploader } = props;
  const templateMode = mode === "template";
  const isMobile = useIsMobile();
  const { draft, edit, replace, undo, redo, canUndo, canRedo } = useDraftHistory(props.initial.draft);

  const senderName = useSenderName();
  const [boot, setBoot] = useState({ id: props.envelopeId, revision: props.initial.revision, confirmed: props.initial.confirmed ?? props.initial.draft });
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [armed, setArmed] = useState<FieldKindV2 | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<string | null>(null);
  const [tab, setTab] = useState<"documents" | "people" | "message" | "fields">(props.initial.draft.documents.length ? "people" : "documents");
  const [zoom, setZoom] = useState(1);
  const [candidates, setCandidates] = useState<Record<string, DetectCandidate[]>>({});
  const [finding, setFinding] = useState(false);
  const [sheet, setSheet] = useState<null | "setup" | "fields" | "props">(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateState, setTemplateState] = useState(props.template ?? null);
  const [dragOver, setDragOver] = useState(false);
  const clipboard = useRef<DraftField[]>([]);
  const lastSpot = useRef<{ document_key: string; page: number } | null>(null);
  const creating = useRef<Promise<string> | null>(null);

  const sync = useDraftSync({
    api,
    envelopeId: templateMode ? null : boot.id,
    draft,
    initialRevision: boot.revision,
    confirmed: boot.confirmed,
    onMerged: replace,
  });

  // Welcome back: the local mirror restored unsaved work.
  useEffect(() => {
    if (props.restoredNotice) toast.success("Restored your unsaved changes");
  }, [props.restoredNotice]);

  // First recipient who signs is who fields are for, until the sender picks another.
  useEffect(() => {
    const signers = fieldRecipients(draft.recipients);
    if (!signers.some((r) => r.key === activeRecipient)) setActiveRecipient(signers[0]?.key ?? null);
  }, [draft.recipients, activeRecipient]);

  // Create the draft on the server the first time there is something to keep.
  const { onCreated, resolveOrganizationId, organizationId: givenOrganizationId } = props;
  const ensureDraft = useCallback(async () => {
    if (templateMode || boot.id) return;
    if (!creating.current) {
      creating.current = (async () => {
        const organizationId = givenOrganizationId ?? (await resolveOrganizationId?.());
        if (!organizationId) throw new DraftRefusal("no_organization", "Choose an organization first.");
        return api.createDraft({ organizationId, title: draft.title || "Untitled" });
      })()
        .then((made) => {
          setBoot({ id: made.envelopeId, revision: made.revision, confirmed: made.composition });
          onCreated?.(made.envelopeId);
          return made.envelopeId;
        })
        .catch((err: unknown) => {
          creating.current = null;
          toast.error(err instanceof Error ? err.message : "The draft could not be started.");
          throw err;
        });
    }
    await creating.current;
    // Honest deps: a new parent callback only re-creates this; `creating` keeps it to one draft.
  }, [api, boot.id, draft.title, givenOrganizationId, resolveOrganizationId, onCreated, templateMode]);

  useEffect(() => {
    if (!boot.id && (draft.documents.length > 0 || draft.recipients.length > 0)) void ensureDraft().catch(() => undefined);
  }, [boot.id, draft.documents.length, draft.recipients.length, ensureDraft]);

  // ── editing helpers ────────────────────────────────────────────────────────────

  const selected = useMemo(() => draft.fields.filter((f) => selection.has(f.id)), [draft.fields, selection]);

  const addDocs = useCallback(
    (docs: UploadedDoc[]) => {
      if (docs.length === 0) return;
      edit((d) => ({
        ...d,
        title: d.title || docs[0].name.replace(/\.pdf$/i, ""),
        documents: [...d.documents, ...docs.filter((x) => !d.documents.some((y) => y.file_id === x.file_id)).map((x) => ({ key: newId(), file_id: x.file_id, name: x.name.replace(/\.pdf$/i, "") + (/\.pdf$/i.test(x.name) ? ".pdf" : ""), page_count: null }))],
      }));
      setTab((t) => (t === "documents" ? "people" : t));
    },
    [edit],
  );

  const onFiles = useCallback(
    async (list: FileList | File[] | null) => {
      const done: UploadedDoc[] = [];
      for (const file of Array.from(list ?? [])) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          toast.error(`${file.name} is not a PDF.`);
          continue;
        }
        try {
          done.push(await uploader.upload(file));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
        }
      }
      addDocs(done);
    },
    [addDocs, uploader],
  );

  const place = useCallback(
    (kind: FieldKindV2, document_key: string, page: number, cx: number, cy: number) => {
      const who = activeRecipient;
      if (!who) {
        toast.error("Add someone to sign first.");
        return;
      }
      const f = newField(kind, { document_key, recipient_key: who, page, cx, cy }, draft.fields);
      let groups = draft.groups;
      if (kind === "radio") {
        const g = draft.groups.filter((x) => x.kind === "radio" && x.recipient_key === who).at(-1);
        const gid = g?.id ?? newId();
        f.group_id = gid;
        f.option_value = `Option ${draft.fields.filter((x) => x.group_id === gid).length + 1}`;
        f.required = true;
        if (!g) groups = [...groups, { id: gid, kind: "radio", document_key, recipient_key: who, label: `Choice ${draft.groups.filter((x) => x.kind === "radio").length + 1}`, required: true }];
      }
      edit((d) => ({ ...d, fields: [...d.fields, f], groups }));
      setSelection(new Set([f.id]));
      lastSpot.current = { document_key, page };
      setArmed(null);
      if (isMobile) setSheet(null);
    },
    [activeRecipient, draft.fields, draft.groups, edit, isMobile],
  );

  const duplicate = useCallback(() => {
    if (selected.length === 0) return;
    const copies = selected.map((f) => ({ ...f, id: newId(), x: Math.min(1 - f.w, f.x + 0.02), y: Math.min(1 - f.h, f.y + 0.02), label: f.label }));
    edit((d) => ({ ...d, fields: [...d.fields, ...copies] }));
    setSelection(new Set(copies.map((c) => c.id)));
  }, [edit, selected]);

  const remove = useCallback(() => {
    if (selection.size === 0) return;
    edit((d) => ({ ...d, fields: d.fields.filter((f) => !selection.has(f.id)) }));
    setSelection(new Set());
  }, [edit, selection]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (selection.size === 0) return;
      edit((d) => ({ ...d, fields: d.fields.map((f) => (selection.has(f.id) ? { ...f, ...clampBox({ ...f, x: f.x + dx, y: f.y + dy }) } : f)) }), "nudge");
    },
    [edit, selection],
  );

  // Keyboard: delete, duplicate, copy / paste, undo / redo, arrows, escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        setArmed(null);
        setSelection(new Set());
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.size) {
        e.preventDefault();
        remove();
      } else if (mod && e.key.toLowerCase() === "d" && selection.size) {
        e.preventDefault();
        duplicate();
      } else if (mod && e.key.toLowerCase() === "c" && selected.length) {
        clipboard.current = selected;
      } else if (mod && e.key.toLowerCase() === "v" && clipboard.current.length) {
        e.preventDefault();
        const spot = lastSpot.current;
        const copies = clipboard.current.map((f) => ({ ...f, id: newId(), document_key: spot?.document_key ?? f.document_key, page: spot?.page ?? f.page, x: Math.min(1 - f.w, f.x + 0.02), y: Math.min(1 - f.h, f.y + 0.02) }));
        edit((d) => ({ ...d, fields: [...d.fields, ...copies] }));
        setSelection(new Set(copies.map((c) => c.id)));
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (selection.size && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.05 : 0.01;
        nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, edit, nudge, redo, remove, selected, selection, undo]);

  // ── find fields (D4.2) ─────────────────────────────────────────────────────────

  async function detectAll() {
    const next: Record<string, DetectCandidate[]> = {};
    for (const doc of draft.documents) next[doc.key] = await api.detectFields(doc.file_id);
    return next;
  }

  async function findFields() {
    setFinding(true);
    let next: Record<string, DetectCandidate[]>;
    try {
      next = await detectAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Finding fields did not work. Try again.");
      setFinding(false);
      return;
    }
    setFinding(false);
    setCandidates(next);
    const n = Object.values(next).reduce((a, l) => a + l.length, 0);
    toast.success(n === 0 ? "No fields found in this document." : `Found ${n} suggested ${n === 1 ? "field" : "fields"}.`);
  }

  /** A field of this kind already sits where the suggestion points (half their areas overlap): accepting it adds nothing. */
  const sitsOnField = useCallback((c: DetectCandidate, documentKey: string, fields: readonly DraftField[]) => {
    return fields.some((f) => {
      if (f.document_key !== documentKey || f.page !== c.page) return false;
      const w = Math.min(f.x + f.w, c.x + c.w) - Math.max(f.x, c.x);
      const h = Math.min(f.y + f.h, c.y + c.h) - Math.max(f.y, c.y);
      return w > 0 && h > 0 && (w * h) / Math.min(f.w * f.h, c.w * c.h) >= 0.5;
    });
  }, []);

  /** Whose field already sits on a suggestion (by design a spot holds one field), named so the sender knows why nothing was added. */
  const ownerOfSpot = useCallback(
    (c: DetectCandidate, documentKey: string, fields: readonly DraftField[]): string | null => {
      const hit = fields.find((f) => sitsOnField(c, documentKey, [f]));
      if (!hit) return null;
      const r = draft.recipients.find((x) => x.key === hit.recipient_key);
      return r?.full_name.trim() || r?.email || "someone";
    },
    [draft.recipients, sitsOnField],
  );

  const acceptCandidate = useCallback(
    (c: DetectCandidate, documentKey: string, silent = false) => {
      if (sitsOnField(c, documentKey, draft.fields)) {
        setCandidates((all) => ({ ...all, [documentKey]: (all[documentKey] ?? []).filter((x) => x.candidate_id !== c.candidate_id) }));
        const owner = ownerOfSpot(c, documentKey, draft.fields);
        toast.info(owner ? `${owner} already has a field there. Place this one by hand.` : "A field is already there.");
        return;
      }
      const who = activeRecipient;
      if (!who) {
        toast.error("Add someone to sign first.");
        return;
      }
      const known = ["signature", "initials", "date_signed", "full_name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown"];
      const kind = (known.includes(c.kind) ? c.kind : "text") as FieldKindV2;
      const base = newField(kind, { document_key: documentKey, recipient_key: who, page: c.page, cx: c.x + c.w / 2, cy: c.y + c.h / 2 }, draft.fields);
      const f: DraftField = { ...base, ...clampBox({ x: c.x, y: c.y, w: c.w, h: c.h }), label: c.label || base.label, source: "detected" };
      edit((d) => ({ ...d, fields: [...d.fields, f] }));
      setCandidates((all) => ({ ...all, [documentKey]: (all[documentKey] ?? []).filter((x) => x.candidate_id !== c.candidate_id) }));
      if (!silent) setSelection(new Set([f.id]));
    },
    [activeRecipient, draft.fields, edit, ownerOfSpot, sitsOnField],
  );

  function acceptAll() {
    const who = activeRecipient;
    if (!who) return;
    const added: DraftField[] = [];
    let taken = 0;
    const known = ["signature", "initials", "date_signed", "full_name", "first_name", "last_name", "email", "company", "title", "text", "number", "date", "checkbox", "radio", "dropdown"];
    for (const [documentKey, list] of Object.entries(candidates)) {
      for (const c of list) {
        if (sitsOnField(c, documentKey, [...draft.fields, ...added])) {
          taken += 1;
          continue;
        }
        const kind = (known.includes(c.kind) ? c.kind : "text") as FieldKindV2;
        const base = newField(kind, { document_key: documentKey, recipient_key: who, page: c.page, cx: c.x + c.w / 2, cy: c.y + c.h / 2 }, [...draft.fields, ...added]);
        added.push({ ...base, ...clampBox({ x: c.x, y: c.y, w: c.w, h: c.h }), label: c.label || base.label, source: "detected" });
      }
    }
    edit((d) => ({ ...d, fields: [...d.fields, ...added] }));
    setCandidates({});
    toast.success(`Added ${added.length} ${added.length === 1 ? "field" : "fields"}.${taken > 0 ? ` ${taken} ${taken === 1 ? "spot" : "spots"} already had a field.` : ""}`);
  }

  const candidateCount = Object.values(candidates).reduce((a, l) => a + l.length, 0);

  // ── send / template ────────────────────────────────────────────────────────────

  // The awaited work sits in plain helpers and the try/catch only wraps the call: the React Compiler
  // cannot compile a `finally`, nor value blocks inside a try (verify B3).
  async function sendNow() {
    await ensureDraft();
    await sync.flushNow();
    const id = boot.id ?? (await creating.current);
    if (!id) throw new DraftRefusal("no_draft", "The draft is not saved yet.");
    return { id, result: await api.send(id) };
  }

  async function send() {
    setSending(true);
    setSendError(null);
    let sent: Awaited<ReturnType<typeof sendNow>>;
    try {
      sent = await sendNow();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The envelope could not be sent. Try again.");
      setSending(false);
      return;
    }
    setSending(false);
    const { id, result } = sent;
    setSendResult(result);
    props.onSendComplete?.(result);
    // Land on the envelope (or the signing page when only the sender signs): the editable draft
    // canvas is never left behind a "Sent" dialog.
    setSendOpen(false);
    toast.success(onlyMe ? "Ready for you to sign." : `Sent. ${result.notified} ${result.notified === 1 ? "person has" : "people have"} been told.`);
    const noBox = result.warnings.filter((w) => w.code === "signer_without_signature_field").length;
    const noCode = result.warnings.filter((w) => w.code === "access_code_not_set").length;
    if (noBox > 0) toast.warning(`${noBox} ${noBox === 1 ? "recipient has" : "recipients have"} no signature field.`);
    if (noCode > 0) toast.warning(`${noCode} ${noCode === 1 ? "recipient gets" : "recipients get"} an emailed code: no access code was set.`);
    router.replace(onlyMe ? `/sign/e/${result.envelope_id}` : `/esign/${result.envelope_id}`);
    try {
      localStorage.removeItem(`matrx.esign.draft.${id}`);
    } catch {
      /* ignore */
    }
  }

  async function saveTemplateNow(name: string, description: string) {
    const organizationId = givenOrganizationId ?? (await resolveOrganizationId?.());
    if (!organizationId) throw new DraftRefusal("no_organization", "Choose an organization first.");
    return api.saveTemplate({
      organizationId,
      templateId: templateState?.id ?? null,
      name,
      description,
      composition: toTemplate(draft),
      expectedVersion: templateState?.version ?? null,
    });
  }

  async function saveTemplate(name: string, description: string) {
    setTemplateSaving(true);
    setTemplateError(null);
    let out: Awaited<ReturnType<typeof saveTemplateNow>>;
    try {
      out = await saveTemplateNow(name, description);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "The template could not be saved.");
      setTemplateSaving(false);
      return;
    }
    setTemplateSaving(false);
    setTemplateState({ id: out.templateId, name, version: out.version });
    setTemplateOpen(false);
    toast.success("Template saved.");
    props.onTemplateSaved?.(out.templateId);
  }

  // ── panels ─────────────────────────────────────────────────────────────────────

  const setAccessCode = useCallback(
    async (recipientKey: string, code: string | null) => {
      await ensureDraft();
      await sync.flushNow();
      const id = boot.id ?? (await creating.current);
      if (!id) return false;
      const out = await api.setAccessCode(id, recipientKey, code);
      return out.hasAccessCode;
    },
    [api, boot.id, ensureDraft, sync],
  );

  const leftPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        aria-label="Envelope setup"
        fill
        value={tab}
        onValueChange={setTab}
        data={[
          { value: "documents", label: "Documents", count: draft.documents.length || null },
          { value: "people", label: "People", count: draft.recipients.length || null },
          { value: "message", label: "Message" },
          { value: "fields", label: "Fields", count: draft.fields.length || null },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "documents" && <DocumentsPanel draft={draft} edit={edit} uploading={uploader.busy} onFiles={(f) => void onFiles(f)} onPickFromFiles={() => uploader.pick((d) => addDocs([d]))} />}
        {tab === "people" && <RecipientsPanel draft={draft} edit={edit} people={props.people} me={props.me} setAccessCode={setAccessCode} templateMode={templateMode} />}
        {tab === "message" && <MessagePanel draft={draft} edit={edit} templateMode={templateMode} />}
        {tab === "fields" && (
          <FieldsPanel
            recipients={draft.recipients}
            activeRecipient={activeRecipient}
            onActiveRecipient={setActiveRecipient}
            armed={armed}
            onArm={(k) => {
              setArmed(k);
              if (k && isMobile) setSheet(null);
            }}
            onFind={() => void findFields()}
            finding={finding}
            candidateCount={candidateCount}
            onAcceptAll={acceptAll}
            canFind={draft.documents.length > 0}
          />
        )}
      </div>
    </div>
  );

  const propsPanel = <PropertiesPanel draft={draft} selected={selected} edit={edit} onDuplicate={duplicate} onDelete={remove} showAlign={!isMobile} />;

  const stage =
    draft.documents.length === 0 ? (
      <div
        className={cn("flex h-full items-center justify-center p-6", dragOver && "ring-2 ring-inset ring-primary")}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragOver(false);
          void onFiles(e.dataTransfer.files);
        }}
      >
        <EmptyState
          icon={<Upload />}
          title="Add a PDF to sign"
          line="Drop it here, upload, or choose from your files"
          action={<UploadButton primary uploading={uploader.busy} onFiles={(f) => void onFiles(f)} />}
        />
      </div>
    ) : (
      <DocumentStage
        draft={draft}
        selection={selection}
        armed={armed}
        candidates={candidates}
        zoom={zoom}
        onZoom={setZoom}
        onSelect={(ids, additive) => {
          setSelection((cur) => (additive ? new Set([...cur, ...ids]) : new Set(ids)));
          const f = draft.fields.find((x) => x.id === ids[0]);
          if (f) lastSpot.current = { document_key: f.document_key, page: f.page };
        }}
        onPlace={place}
        onMoveMany={(moves) => {
          const by = new Map(moves.map((m) => [m.id, m]));
          edit((d) => ({ ...d, fields: d.fields.map((f) => (by.has(f.id) ? { ...f, x: by.get(f.id)!.x, y: by.get(f.id)!.y } : f)) }), "move");
        }}
        onResize={(id, box) => edit((d) => ({ ...d, fields: d.fields.map((f) => (f.id === id ? { ...f, ...box } : f)) }), "resize")}
        onDuplicate={duplicate}
        onDelete={remove}
        onAcceptCandidate={(c, key) => acceptCandidate(c, key)}
        onRemoveCandidate={(cid) => setCandidates((all) => Object.fromEntries(Object.entries(all).map(([k, l]) => [k, l.filter((c) => c.candidate_id !== cid)])))}
        onPages={(key, pages) => draft.documents.find((d) => d.key === key)?.page_count !== pages && edit((d) => ({ ...d, documents: d.documents.map((x) => (x.key === key ? { ...x, page_count: pages } : x)) }), `pages-${key}`)}
      />
    );

  const blockers = sendBlockers(draft);
  const statusLabel = templateMode ? (templateState?.id ? `Template v${templateState.version}` : "New template") : STATUS_TEXT[sync.status];
  const onlyMe = !!props.me && draft.recipients.length > 0 && draft.recipients.every((r) => r.user_id === props.me?.user_id);

  return (
    <>
      <RecordPageHeader
        backHref={props.backHref ?? "/esign"}
        record={{ name: draft.title.trim() || (templateMode ? "New template" : "New envelope") }}
        status={{ label: statusLabel, tone: sync.status === "retrying" ? "warning" : sync.status === "saved" ? "success" : "neutral" }}
        actions={[
          { label: "Undo", icon: Undo2, onPress: undo, disabled: !canUndo },
          { label: "Redo", icon: Redo2, onPress: redo, disabled: !canRedo },
          { label: "Preview as a recipient", icon: Eye, onPress: () => setPreviewOpen(true), disabled: draft.recipients.length === 0 || draft.documents.length === 0 },
          { label: "Save as template", icon: LayoutTemplate, onPress: () => setTemplateOpen(true), disabled: draft.documents.length === 0 },
          ...(templateMode
            ? []
            : [{ label: "Send", icon: Send, primary: true, onPress: () => { setSendResult(null); setSendError(null); setSendOpen(true); }, disabled: draft.documents.length === 0 }]),
        ]}
      />
      <div className="h-full overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
        {sync.conflicts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-warning/10 px-3 py-2 type-body" role="alert">
            <span className="min-w-0 flex-1 truncate">Changed in another window: {sync.conflicts.map((c) => c.label).join(", ")}</span>
            <Button onClick={() => sync.resolveConflicts("mine")}>Keep mine</Button>
            <Button variant="outline" onClick={() => sync.resolveConflicts("theirs")}>Take theirs</Button>
          </div>
        )}
        <div className="flex h-full min-h-0">
          {!isMobile && <aside className="flex w-80 shrink-0 flex-col border-r border-border">{leftPanel}</aside>}
          <main className="relative min-h-0 min-w-0 flex-1">
            {stage}
            {isMobile && (
              <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 border-t border-border bg-background/95 px-2 py-1.5 backdrop-blur" data-matrx-floating-bottom>
                {selection.size > 0 ? (
                  <>
                    <Button icon={<SlidersHorizontal />} onClick={() => setSheet("props")}>Edit</Button>
                    <Button variant="outline" icon={<Copy />} onClick={duplicate}>Copy</Button>
                    <Button variant="outline" icon={<Trash2 />} onClick={remove}>Delete</Button>
                  </>
                ) : (
                  <>
                    <Button icon={<FileText />} onClick={() => setSheet("setup")}>Setup</Button>
                    <Button variant="primary" icon={<PenLine />} onClick={() => { setTab("fields"); setSheet("fields"); }}>Add field</Button>
                    <Button variant="outline" icon={<Send />} disabled={draft.documents.length === 0} onClick={() => { setSendResult(null); setSendOpen(true); }}>Send</Button>
                  </>
                )}
              </div>
            )}
            {armed && isMobile && (
              <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
                <span className="pointer-events-auto rounded-full bg-foreground px-3 py-1 type-secondary text-background">Tap the page to place it</span>
              </div>
            )}
          </main>
          {!isMobile && <aside className="w-72 shrink-0 overflow-y-auto border-l border-border p-3">{propsPanel}</aside>}
        </div>
      </div>

      {isMobile && (
        <Dialog open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{sheet === "props" ? "Field" : sheet === "fields" ? "Add a field" : "Setup"}</DialogTitle>
              <DialogDescription className="sr-only">Edit this envelope.</DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[70dvh] min-h-0 flex-col overflow-y-auto">{sheet === "props" ? propsPanel : leftPanel}</div>
          </DialogContent>
        </Dialog>
      )}

      <SendDialog open={sendOpen} draft={draft} sending={sending} result={sendResult} error={sendError} onlyMe={onlyMe} onClose={() => setSendOpen(false)} onSend={() => void send()} />
      <TemplateDialog key={String(templateOpen)} open={templateOpen} initialName={templateState?.name ?? draft.title} saving={templateSaving} error={templateError} onClose={() => setTemplateOpen(false)} onSave={(n, d) => void saveTemplate(n, d)} />
      {previewOpen && <PreviewDialog open draft={draft} initialRecipient={activeRecipient} onClose={() => setPreviewOpen(false)} />}
      <span className="sr-only" aria-live="polite">{effectiveSubject(draft, senderName)} {blockers.length ? "" : "ready"}</span>
    </>
  );
}

