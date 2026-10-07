"use client";

// features/esign/envelopes/SendForSignature.tsx — /esign/new: send PDFs for signature.
//
// DocuSign / Dropbox Sign's send flow on one screen: the documents are ON SCREEN from the moment
// they are attached; recipients are picked from the sending organization's members or added as
// guests by name and email; each recipient's Signature / Initials / Date / Name boxes are placed
// on the pages in that recipient's colour; then Send. The server freezes the exact bytes and
// emails the first signer(s). A signer with no signature box is warned about, never blocked
// (their signature then lives on the certificate).
//
// Layout: desktop is a left rail (documents, recipients, message, Send) beside the document; a
// phone stacks the same parts and the document keeps a tall, scrollable frame.

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, FolderOpen, Send, Trash2, Upload } from "lucide-react";

import { Button, EmptyState, Field, SegmentedControl, Select } from "@ai-matrx/design-system/controls";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveOrganizationId,
  selectActiveOrganizationName,
} from "@/features/scopes/redux/selectors/active-context";
import { formatFileSize } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";

import { EnvelopeRefusal, sendEnvelope } from "./service";
import { fieldsForSend, type PlacedField, type Recipient } from "./types";
import { RecipientPicker } from "./send/RecipientPicker";
import { FieldPlacementCanvas } from "./send/FieldPlacementCanvas";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { ProTextarea } from "@/components/official/ProTextarea";
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

const EXPIRY_CHOICES = [7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d} days` }));
const ORDER_CHOICES = [
  { value: "sequential", label: "In order" },
  { value: "parallel", label: "All at once" },
] as const;

export function SendForSignature() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { upload, uploading } = useFileUpload();
  const [documents, setDocuments] = useState<DocumentChoice[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [activeRecipient, setActiveRecipient] = useState<string | null>(null);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [order, setOrder] = useState<"sequential" | "parallel">("sequential");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState("14");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  // An envelope is filed in the active organization (every write carries it), and that decides
  // whose members are colleagues (they sign with their account) — so the page names it.
  const organizationName = useAppSelector(selectActiveOrganizationName);
  const organizationId = useAppSelector(selectActiveOrganizationId);

  function addDocument(choice: DocumentChoice) {
    setDocuments((current) => (current.some((d) => d.fileId === choice.fileId) ? current : [...current, choice]));
    setTitle((current) => current || choice.name.replace(/\.pdf$/i, ""));
  }

  function removeDocument(fileId: string) {
    setDocuments((all) => all.filter((d) => d.fileId !== fileId));
    setFields((all) => all.filter((f) => f.fileId !== fileId));
  }

  function changeRecipients(next: Recipient[]) {
    setRecipients(next);
    const keys = new Set(next.map((r) => r.key));
    setFields((all) => all.filter((f) => keys.has(f.recipientKey)));
    if (!activeRecipient || !keys.has(activeRecipient)) setActiveRecipient(next[0]?.key ?? null);
  }

  async function uploadFiles(list: FileList | File[] | null) {
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

  const withSignature = new Set(fields.filter((f) => f.kind === "signature").map((f) => f.recipientKey));
  const missingSignature = new Set(recipients.filter((r) => !withSignature.has(r.key)).map((r) => r.key));
  const missingNames = recipients.filter((r) => missingSignature.has(r.key)).map((r) => r.fullName);
  const ready = documents.length > 0 && title.trim() !== "" && recipients.length > 0;

  async function send() {
    setSending(true);
    setNotice(null);
    try {
      const answer = await sendEnvelope(dispatch, {
        title: title.trim(),
        message: message.trim() || null,
        file_ids: documents.map((d) => d.fileId),
        // A picked member carries their user id: they sign as themself.
        signers: recipients.map((r) => ({ full_name: r.fullName.trim(), email: r.email.trim(), user_id: r.userId })),
        signing_order: order,
        expires_in_days: Number(expiry),
        // The boxes, indexed against exactly the documents and signers sent.
        fields: fieldsForSend(
          fields,
          documents.map((d) => d.fileId),
          recipients.map((r) => r.key),
        ),
      });
      startNavigation(() => router.push(`/esign/${answer.envelope_id}`));
    } catch (err) {
      setNotice(err instanceof EnvelopeRefusal ? err.message : "The envelope could not be sent. Try again.");
      setSending(false);
    }
  }

  const busy = sending || navigating;

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate type-title text-foreground">Send for signature</h1>
          {organizationName && (
            <span className="hidden truncate type-secondary text-muted-foreground sm:inline">From {organizationName}</span>
          )}
          <Button
            variant="primary"
            className="ml-auto shrink-0"
            disabled={!ready || busy}
            icon={busy ? <Spinner size="xs" className="text-current" /> : <Send />}
            onClick={() => void send()}
          >
            Send
          </Button>
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
        <div data-matrx-page-scroll className="h-full overflow-y-auto lg:overflow-clip">
          <div className="flex flex-col lg:h-full lg:flex-row">
            <aside className="flex shrink-0 flex-col gap-5 border-border p-4 lg:w-[22rem] lg:overflow-y-auto lg:border-r">
              <section className="flex flex-col gap-2">
                <h2 className="type-title text-foreground">Documents</h2>
                {documents.map((d) => (
                  <div key={d.fileId} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate type-body">{d.name}</span>
                    {d.size !== null && <span className="type-secondary text-muted-foreground">{formatFileSize(d.size)}</span>}
                    <Button variant="quiet" aria-label={`Remove ${d.name}`} icon={<Trash2 />} onClick={() => removeDocument(d.fileId)} />
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <UploadButton uploading={uploading} onFiles={(files) => void uploadFiles(files)} />
                  <Button icon={<FolderOpen />} onClick={() => setPickerOpen(true)}>
                    From files
                  </Button>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="type-title text-foreground">Signers</h2>
                  {recipients.length > 1 && (
                    <SegmentedControl
                      aria-label="Signing order"
                      value={order}
                      onValueChange={(v) => setOrder(v)}
                      data={ORDER_CHOICES}
                    />
                  )}
                </div>
                <RecipientPicker
                  organizationId={organizationId}
                  recipients={recipients}
                  onChange={changeRecipients}
                  sequential={order === "sequential"}
                  missingSignature={documents.length > 0 ? missingSignature : new Set()}
                  activeKey={activeRecipient}
                  onActivate={setActiveRecipient}
                />
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="type-title text-foreground">Message</h2>
                <Field
                  aria-label="Subject"
                  placeholder="Subject"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <ProTextarea
                  aria-label="Note to signers"
                  value={message}
                  placeholder="Note to signers (optional)"
                  onChange={(e) => setMessage(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="type-secondary text-muted-foreground">Expires after</span>
                  <Select aria-label="Expires after" value={expiry} options={EXPIRY_CHOICES} onValueChange={setExpiry} />
                </div>
              </section>

              <div className="flex flex-col gap-2">
                {documents.length > 0 && missingNames.length > 0 && (
                  <p className="flex items-start gap-1.5 type-secondary text-muted-foreground">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>
                      No signature box: {missingNames.join(", ")}
                    </span>
                  </p>
                )}
                <Button
                  variant="primary"
                  disabled={!ready || busy}
                  icon={busy ? <Spinner size="xs" className="text-current" /> : <Send />}
                  onClick={() => void send()}
                >
                  Send
                </Button>
                {notice && <p className="type-body text-destructive">{notice}</p>}
              </div>
            </aside>

            <section
              aria-label="Document"
              className={cn(
                "relative h-[85dvh] min-h-0 overflow-hidden border-t border-border lg:h-auto lg:flex-1 lg:border-t-0",
                dropping && "ring-2 ring-inset ring-primary",
              )}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setDropping(true);
                }
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                if (!e.dataTransfer.files.length) return;
                e.preventDefault();
                setDropping(false);
                void uploadFiles(e.dataTransfer.files);
              }}
            >
              {documents.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6">
                  <EmptyState
                    icon={uploading ? <Spinner size="xs" className="text-current" /> : <Upload />}
                    title="Add a PDF to sign"
                    line="Drop it here, upload, or choose from your files"
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <UploadButton uploading={uploading} onFiles={(files) => void uploadFiles(files)} primary />
                        <Button icon={<FolderOpen />} onClick={() => setPickerOpen(true)}>
                          From files
                        </Button>
                      </div>
                    }
                  />
                </div>
              ) : (
                <FieldPlacementCanvas
                  documents={documents}
                  recipients={recipients}
                  fields={fields}
                  onFieldsChange={setFields}
                  activeRecipientKey={activeRecipient}
                  onActiveRecipient={setActiveRecipient}
                />
              )}
            </section>
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

function UploadButton({ uploading, onFiles, primary }: { uploading: boolean; onFiles: (files: FileList | null) => void; primary?: boolean }) {
  return (
    <Button variant={primary ? "primary" : "outline"} asChild disabled={uploading}>
      <label>
        {uploading ? <Spinner size="xs" className="text-current" /> : <Upload className="h-4 w-4" />}
        Upload PDF
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </Button>
  );
}
