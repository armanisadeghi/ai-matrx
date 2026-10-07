"use client";

// A markdown-document citation's place: read the body once (cached per
// document), find the quoted passage, name its section. See documentPassage.ts.

import { useEffect, useState } from "react";
import { getDocument, getLatestDocumentSnapshot } from "@/features/documents/document-service";
import { univerDocToMarkdown } from "@/features/documents/univer-doc-to-markdown";
import { loadDocument } from "@/features/rich-document/annotations/documentSource";
import { findDocumentPassage, type DocumentPassage } from "./documentPassage";

export interface LoadedBody {
  title: string;
  body: string;
}

/** Which table the cited document lives in. */
export type CitedDocumentKind = "document" | "udt_document";

const cache = new Map<string, Promise<LoadedBody | null>>();

/**
 * A cloud document (workbench.udt_documents): its name and its latest
 * snapshot as text — through the one snapshot reader (`univerDocToMarkdown`).
 */
export async function readCloudDocumentBody(id: string): Promise<LoadedBody | null> {
  try {
    const doc = await getDocument(id);
    if (!doc.success) return null;
    const snap = await getLatestDocumentSnapshot(id);
    if (!snap.success) return null;
    return {
      title: doc.data.document_name || "Untitled document",
      body: univerDocToMarkdown(snap.data?.snapshot),
    };
  } catch {
    return null;
  }
}

async function readMarkdownDocumentBody(id: string): Promise<LoadedBody | null> {
  try {
    const d = await loadDocument(id);
    return d ? { title: d.title, body: d.body } : null;
  } catch {
    return null;
  }
}

/**
 * The cited document's title and text; null when it cannot be read. A
 * citation stamped `document` before the two kinds were told apart may name a
 * cloud document, so a markdown miss is retried against the cloud table.
 */
export function readDocumentBody(
  id: string,
  kind: CitedDocumentKind = "document",
): Promise<LoadedBody | null> {
  const key = `${kind}:${id}`;
  let hit = cache.get(key);
  if (!hit) {
    hit =
      kind === "udt_document"
        ? readCloudDocumentBody(id)
        : readMarkdownDocumentBody(id).then((d) => d ?? readCloudDocumentBody(id));
    cache.set(key, hit);
  }
  return hit;
}

export interface DocumentPassageState {
  loading: boolean;
  doc: LoadedBody | null;
  passage: DocumentPassage | null;
}

export function useDocumentPassage(
  documentId: string | null,
  excerpt: string | null | undefined,
  kind: CitedDocumentKind = "document",
): DocumentPassageState {
  const [state, setState] = useState<{ forId: string | null; doc: LoadedBody | null }>({
    forId: null,
    doc: null,
  });
  useEffect(() => {
    if (!documentId) return undefined;
    let live = true;
    void readDocumentBody(documentId, kind).then((doc) => {
      if (live) setState({ forId: documentId, doc });
    });
    return () => {
      live = false;
    };
  }, [documentId, kind]);
  if (!documentId) return { loading: false, doc: null, passage: null };
  if (state.forId !== documentId) return { loading: true, doc: null, passage: null };
  return {
    loading: false,
    doc: state.doc,
    passage: state.doc ? findDocumentPassage(state.doc.body, excerpt) : null,
  };
}
