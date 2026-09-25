// components/markdown-studio/AnnotateView.tsx
//
// /markdown-studio → Annotate: the proving route for the RC-B11 annotation
// sidecar on a REAL content.document (never the studio's copy-buffer). The
// document renders through the ONE renderer (<RichDocument>) inside
// <AnnotatedContent>; the panel lists everything on it. "Edit text" saves a
// splice through the document's own save adapter, so the resolver can be
// watched carrying (or honestly orphaning) every annotation across versions.

"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { RichDocument } from "@/features/rich-document/RichDocument";
import {
  AnnotatedContent,
  AnnotationSidecarProvider,
} from "@/features/rich-document/annotations/AnnotationSidecar";
import { AnnotationPanel } from "@/features/rich-document/annotations/AnnotationPanel";
import {
  createDocument,
  loadDocument,
  readDocumentVersionBody,
  saveDocumentBody,
  type LoadedDocument,
} from "@/features/rich-document/annotations/documentSource";
import type { AnnotationSource } from "@/features/rich-document/annotations/types";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

export function AnnotateView({
  documentId,
  buffer,
  bufferTitle,
  onOpenDocument,
}: {
  /** The loaded content.document, when the studio has one open. */
  documentId: string | null;
  /** The studio buffer — offered as the body of a new document. */
  buffer: string;
  bufferTitle: string | null;
  onOpenDocument: (id: string) => void;
}) {
  const [doc, setDoc] = useState<LoadedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const reload = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadDocument(id);
      if (!next) setError("This document does not exist or you cannot open it.");
      setDoc(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId) void reload(documentId);
    else setDoc(null);
  }, [documentId]);

  if (!documentId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
          <FileText className="mb-2 h-5 w-5 text-primary" aria-hidden />
          <p className="font-medium text-foreground">Annotations live on a saved document.</p>
          <p className="mt-1 text-muted-foreground">
            Open one with the source picker (Document), or turn the text in the studio into a new private document and annotate that.
          </p>
          <Button
            className="mt-3"
            size="sm"
            disabled={creating || !buffer.trim()}
            onClick={async () => {
              setCreating(true);
              try {
                const orgId = await ensureOrgId(null);
                const id = await createDocument({
                  organizationId: orgId,
                  title: bufferTitle || buffer.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 80) || "Untitled document",
                  body: buffer,
                  visibility: "personal",
                });
                onOpenDocument(id);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {buffer.trim() ? "Create a document from this text" : "Type or load some text first"}
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !doc) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Opening the document
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div role="alert" className="m-6 rounded-lg border border-destructive/30 p-4 text-sm">
        <p>{error ?? "This document could not be opened."}</p>
        <Button className="mt-2" size="sm" variant="outline" onClick={() => void reload(documentId)}>Try again</Button>
      </div>
    );
  }

  const source: AnnotationSource = {
    token: "document",
    id: doc.id,
    title: doc.title,
    body: doc.body,
    contentVersion: doc.contentVersion,
    readVersionBody: (v) => readDocumentVersionBody(doc.id, v),
    save: async (next) => {
      await saveDocumentBody(doc, next);
      await reload(doc.id);
    },
    href: `/markdown-studio?source=document&id=${doc.id}`,
  };

  return (
    <AnnotationSidecarProvider source={source}>
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
            <span className="truncate font-medium text-foreground">{doc.title}</span>
            <span className="shrink-0 text-muted-foreground">version {doc.contentVersion}</span>
            <Button
              size="sm"
              variant={editing ? "default" : "outline"}
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => {
                setDraft(doc.body);
                setEditing((e) => !e);
              }}
            >
              <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
              {editing ? "Close editor" : "Edit text"}
            </Button>
          </div>
          {editing && (
            <div className="grid gap-1 border-b border-border p-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Document text"
                className="h-48 w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-base md:text-xs"
              />
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  disabled={saving || draft === doc.body}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await source.save!(draft);
                      setEditing(false);
                      toast.success("Saved. Only the changed blocks were written; annotations were re-checked against the new text.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving" : "Save"}
                </Button>
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <AnnotatedContent>
              <RichDocument
                content={doc.body}
                source={{ type: "raw" }}
                actionsVariant="icon-only"
                actionsPosition="top-right"
                actionsBehavior="hover-only"
              />
            </AnnotatedContent>
          </div>
        </section>
        <AnnotationPanel className="min-h-0 border-t border-border lg:border-t-0" />
      </div>
    </AnnotationSidecarProvider>
  );
}
