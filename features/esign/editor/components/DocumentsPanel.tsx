"use client";

// features/esign/editor/components/DocumentsPanel.tsx — the documents in this envelope (D1.1–D1.3):
// upload, own files, reorder, rename, remove. Order here is the order the signer reads them.

import { ArrowDown, ArrowUp, FileText, FolderOpen, Trash2, Upload } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { Spinner } from "@/components/ui/loaders/Spinner";

import type { EnvelopeDraftV1 } from "../../contract/draft";
import { ProInput } from "@/components/official/ProInput";

interface Props {
  draft: EnvelopeDraftV1;
  edit(fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1, key?: string | null): void;
  uploading: boolean;
  onFiles(files: FileList | null): void;
  onPickFromFiles(): void;
}

export function UploadButton({ uploading, onFiles, primary }: { uploading: boolean; onFiles(files: FileList | null): void; primary?: boolean }) {
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

export function DocumentsPanel({ draft, edit, uploading, onFiles, onPickFromFiles }: Props) {
  function move(index: number, by: -1 | 1) {
    edit((d) => {
      const docs = [...d.documents];
      const [row] = docs.splice(index, 1);
      docs.splice(index + by, 0, row);
      return { ...d, documents: docs };
    });
  }
  function remove(key: string) {
    edit((d) => ({
      ...d,
      documents: d.documents.filter((x) => x.key !== key),
      fields: d.fields.filter((f) => f.document_key !== key),
      groups: d.groups.filter((g) => g.document_key !== key),
    }));
  }
  return (
    <div className="flex flex-col gap-2">
      {draft.documents.map((doc, i) => (
        <div key={doc.key} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <ProInput
            aria-label="Document name"
            wrapperClassName="min-w-0 flex-1"
            value={doc.name}
            onChange={(e) => edit((d) => ({ ...d, documents: d.documents.map((x) => (x.key === doc.key ? { ...x, name: e.target.value } : x)) }), `dn-${doc.key}`)}
          />
          {doc.page_count !== null && <span className="shrink-0 type-secondary tabular-nums text-muted-foreground">{doc.page_count}p</span>}
          {draft.documents.length > 1 && (
            <>
              <Button variant="quiet" aria-label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => move(i, -1)} />
              <Button variant="quiet" aria-label="Move down" icon={<ArrowDown />} disabled={i === draft.documents.length - 1} onClick={() => move(i, 1)} />
            </>
          )}
          <Button variant="quiet" aria-label={`Remove ${doc.name}`} icon={<Trash2 />} onClick={() => remove(doc.key)} />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <UploadButton uploading={uploading} onFiles={onFiles} />
        <Button icon={<FolderOpen />} onClick={onPickFromFiles}>
          From files
        </Button>
      </div>
    </div>
  );
}
