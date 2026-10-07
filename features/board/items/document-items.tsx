"use client";

/**
 * Document on a board — the `/documents` rich-text document (Univer), not a
 * spreadsheet. The tile body IS `DocumentRecord`
 * (`features/documents/components/DocumentRecord.tsx`), the same component
 * `/documents/[id]` renders: rename, Copy reference, Share, the Rulebook
 * notice, the editor with its save status, snapshot and History — and the
 * `matrx-user/documents` agent surface for this one document (name,
 * description and the body text, read and write). Only the route's back
 * button and header are left out; the title and actions sit in a strip.
 *
 * Start new places a tile at once; the document is created when the person
 * presses Create (`DocumentDraftBody`). Bring in is the platform's document
 * picker (`DocumentsResourcePicker`). Sources and matching:
 * ./document-items.logic.ts.
 */

import { useEffect } from "react";
import { FileText } from "lucide-react";
import { DocumentRecord } from "@/features/documents/components/DocumentRecord";
import { DOCUMENTS_SURFACE_NAME } from "@/features/documents/agent-context/buildDocumentsContextData";
import { DocumentsResourcePicker } from "@/features/resource-manager/resource-picker/DocumentsResourcePicker";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";
import { DocumentDraftBody } from "./DocumentDraftBody";
import {
  DOCUMENT_ITEM_KEY,
  currentDocumentSource,
  documentHref,
  documentIdOf,
  documentSource,
  matchesDocument,
  newDocumentItem,
  pickedDocumentItem,
} from "./document-items.logic";
import { titleToAdopt } from "./feature-items.logic";

function DocumentPicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="rounded-lg border border-border">
      <DocumentsResourcePicker onBack={onCancel} onSelect={(doc) => onPick([pickedDocumentItem(doc)])} />
    </div>
  );
}

function DocumentRecordBody({ id, title, onSource }: ItemBodyProps & { id: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <DocumentRecord
        documentId={id}
        onDocument={(doc) => {
          // The tile is named after its document (renamed here, on its page,
          // or by an agent).
          const next = titleToAdopt(title, doc.document_name);
          if (next) onSource(documentSource(id), next);
        }}
        renderHeader={({ title: field, actions }) => (
          <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-2 py-1">
            <div className="flex min-w-0 flex-1 items-center gap-1">{field}</div>
            {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
          </div>
        )}
      />
    </div>
  );
}

function DocumentBody(props: ItemBodyProps) {
  const { source, onSource } = props;
  const id = documentIdOf(source);
  // An older `{ kind: "document" }` tile is saved in the current form.
  useEffect(() => {
    const upgraded = currentDocumentSource(source);
    if (upgraded) onSource(upgraded);
  }, [source, onSource]);
  if (!id) return <DocumentDraftBody onSource={onSource} />;
  return <DocumentRecordBody key={id} id={id} {...props} />;
}

const documentDoor = (id: string) => tryGetEntityInfo(DOCUMENT_ITEM_KEY)?.hrefFor?.(id) ?? null;

export const DOCUMENT_ITEMS: readonly BoardItemType[] = [
  {
    key: DOCUMENT_ITEM_KEY,
    surface: { name: DOCUMENTS_SURFACE_NAME },
    comments: (s) => {
      const id = documentIdOf(s);
      return id ? { token: "udt_document", id } : null;
    },
    label: "Document",
    kindLabel: "document",
    icon: FileText,
    group: "work",
    accent: "indigo",
    status: { none: "Its save status lives in the editor's own bar, not in a store the board can read." },
    // A page-width document (~794px) plus the title strip and the editor bar.
    defaultSize: { w: 840, h: 760 },
    matches: matchesDocument,
    Body: DocumentBody,
    startNew: { label: "New document", create: newDocumentItem },
    bringIn: { label: "Document", Picker: DocumentPicker },
    record: { place: (id, title) => pickedDocumentItem({ id, document_name: title ?? null }), searchToken: DOCUMENT_ITEM_KEY },
    href: (s) => documentHref(s, documentDoor),
    // Checked 2026-10-03 (remount harness udt_document + :quiet green; the
    // board in the browser): the typed text is kept across sleep / wake and a
    // removed-and-undone tile, one save, nothing re-read. The document is one
    // working copy per tab (lib/working-copy, kind udt_document) kept warm
    // after its last view leaves.
    sleeps: true,
  },
];
