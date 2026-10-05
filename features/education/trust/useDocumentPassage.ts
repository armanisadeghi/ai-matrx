"use client";

// A markdown-document citation's place: read the body once (cached per
// document), find the quoted passage, name its section. See documentPassage.ts.

import { useEffect, useState } from "react";
import { loadDocument } from "@/features/rich-document/annotations/documentSource";
import { findDocumentPassage, type DocumentPassage } from "./documentPassage";

export interface LoadedBody {
  title: string;
  body: string;
}

const cache = new Map<string, Promise<LoadedBody | null>>();

/** The document's title and markdown body; null when it cannot be read. */
export function readDocumentBody(id: string): Promise<LoadedBody | null> {
  let hit = cache.get(id);
  if (!hit) {
    hit = loadDocument(id)
      .then((d) => (d ? { title: d.title, body: d.body } : null))
      .catch(() => null);
    cache.set(id, hit);
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
): DocumentPassageState {
  const [state, setState] = useState<{ forId: string | null; doc: LoadedBody | null }>({
    forId: null,
    doc: null,
  });
  useEffect(() => {
    if (!documentId) return undefined;
    let live = true;
    void readDocumentBody(documentId).then((doc) => {
      if (live) setState({ forId: documentId, doc });
    });
    return () => {
      live = false;
    };
  }, [documentId]);
  if (!documentId) return { loading: false, doc: null, passage: null };
  if (state.forId !== documentId) return { loading: true, doc: null, passage: null };
  return {
    loading: false,
    doc: state.doc,
    passage: state.doc ? findDocumentPassage(state.doc.body, excerpt) : null,
  };
}
