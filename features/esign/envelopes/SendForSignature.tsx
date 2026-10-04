"use client";

// features/esign/envelopes/SendForSignature.tsx — /esign/new: send PDFs for signature.
//
// DocuSign's "send an envelope" is the bar: documents, who signs (in order or all at once), a
// message, an expiry — then Send. The server freezes the exact bytes and emails the first
// signer(s); a signer who belongs to the sending organization signs as themself, anyone else gets
// a link and a one-time code.

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileText, FolderOpen, Loader2, Plus, Send, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@ai-matrx/design-system";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useAppDispatch } from "@/lib/redux/hooks";
import { formatFileSize } from "@ai-matrx/kit/format";

import { EnvelopeRefusal, sendEnvelope } from "./service";

// The picker window is heavy and opened on demand — kept out of this route's first bundle.
const FilePickerWindow = dynamic(
  () => import("@/features/resource-manager/resource-picker/FilePickerWindow").then((m) => ({ default: m.FilePickerWindow })),
  { ssr: false, loading: () => null },
);

interface DocumentChoice {
  fileId: string;
  name: string;
  size: number | null;
}

interface SignerRow {
  key: number;
  fullName: string;
  email: string;
}

const EXPIRY_CHOICES = [7, 14, 30, 60, 90];
let nextKey = 1;

export function SendForSignature() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { upload, uploading } = useFileUpload();
  const [documents, setDocuments] = useState<DocumentChoice[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signers, setSigners] = useState<SignerRow[]>([{ key: nextKey++, fullName: "", email: "" }]);
  const [order, setOrder] = useState<"sequential" | "parallel">("sequential");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState(14);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function addDocument(choice: DocumentChoice) {
    setDocuments((current) => (current.some((d) => d.fileId === choice.fileId) ? current : [...current, choice]));
    setTitle((current) => current || choice.name.replace(/\.pdf$/i, ""));
  }

  async function uploadFiles(list: FileList | null) {
    setNotice(null);
    for (const file of Array.from(list ?? [])) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setNotice(`${file.name} is not a PDF.`);
        continue;
      }
      try {
        const uploaded = await upload({ kind: "file", file }, { folderPath: "E-Signatures" });
        if (uploaded.fileId) addDocument({ fileId: uploaded.fileId, name: file.name, size: file.size });
      } catch (err) {
        setNotice(err instanceof Error ? err.message : `${file.name} could not be uploaded.`);
      }
    }
  }

  function patchSigner(key: number, patch: Partial<SignerRow>) {
    setSigners((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function moveSigner(index: number, by: -1 | 1) {
    setSigners((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  }

  const filledSigners = signers.filter((s) => s.fullName.trim() || s.email.trim());
  const ready =
    documents.length > 0 &&
    title.trim() !== "" &&
    filledSigners.length > 0 &&
    filledSigners.every((s) => s.fullName.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email.trim()));

  async function send() {
    setSending(true);
    setNotice(null);
    try {
      const answer = await sendEnvelope(dispatch, {
        title: title.trim(),
        message: message.trim() || null,
        file_ids: documents.map((d) => d.fileId),
        signers: filledSigners.map((s) => ({ full_name: s.fullName.trim(), email: s.email.trim() })),
        signing_order: order,
        expires_in_days: expiry,
      });
      startNavigation(() => router.push(`/esign/${answer.envelope_id}`));
    } catch (err) {
      setNotice(err instanceof EnvelopeRefusal ? err.message : "The envelope could not be sent. Try again.");
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader>
        <h1 className="truncate text-sm font-semibold text-foreground">Send for signature</h1>
      </PageHeader>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 pb-safe">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">Documents</h2>
            {documents.map((d) => (
              <div key={d.fileId} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                {d.size !== null && <span className="text-xs text-muted-foreground">{formatFileSize(d.size)}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => setDocuments((all) => all.filter((x) => x.fileId !== d.fileId))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <label className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void uploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <FolderOpen className="h-4 w-4" />
                Choose from files
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Signers</h2>
              <div className="flex gap-1">
                <Button size="sm" variant={order === "sequential" ? "secondary" : "ghost"} onClick={() => setOrder("sequential")}>
                  In order
                </Button>
                <Button size="sm" variant={order === "parallel" ? "secondary" : "ghost"} onClick={() => setOrder("parallel")}>
                  All at once
                </Button>
              </div>
            </div>
            {signers.map((s, i) => (
              <div key={s.key} className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center">
                {order === "sequential" && (
                  <span className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                )}
                <Input
                  aria-label="Signer name"
                  placeholder="Full name"
                  value={s.fullName}
                  autoComplete="off"
                  className="text-base sm:text-sm"
                  onChange={(e) => patchSigner(s.key, { fullName: e.target.value })}
                />
                <Input
                  aria-label="Signer email"
                  placeholder="name@company.com"
                  type="email"
                  value={s.email}
                  autoComplete="off"
                  className="text-base sm:text-sm"
                  onChange={(e) => patchSigner(s.key, { email: e.target.value })}
                />
                <div className="flex shrink-0 gap-1">
                  {order === "sequential" && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => moveSigner(i, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Move down"
                        disabled={i === signers.length - 1}
                        onClick={() => moveSigner(i, 1)}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove signer"
                    disabled={signers.length === 1}
                    onClick={() => setSigners((rows) => rows.filter((r) => r.key !== s.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setSigners((rows) => [...rows, { key: nextKey++, fullName: "", email: "" }])}
            >
              <Plus className="h-4 w-4" />
              Add signer
            </Button>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">Message</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="esign-title">Subject</Label>
              <Input id="esign-title" value={title} className="text-base sm:text-sm" onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="esign-message">Note to signers</Label>
              <Textarea
                id="esign-message"
                value={message}
                placeholder="Please review and sign by Friday."
                className="text-base sm:text-sm"
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="esign-expiry">Expires after</Label>
              <Select value={String(expiry)} onValueChange={(v) => setExpiry(Number(v))}>
                <SelectTrigger id="esign-expiry" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_CHOICES.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <Button disabled={!ready || sending || navigating} onClick={() => void send()}>
              {sending || navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
            {notice && <p className="text-sm text-destructive">{notice}</p>}
          </div>
        </div>
      </div>

      <FilePickerWindow
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scopeId="esign-send-documents"
        title="Choose a PDF"
        initialFilter="pdfs"
        onPick={(selection) => {
          addDocument({ fileId: selection.fileId, name: selection.details.filename || "Document.pdf", size: null });
          return "close";
        }}
      />
    </>
  );
}
