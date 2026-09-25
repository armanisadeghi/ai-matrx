// features/rich-document/annotations/documentSource.ts
//
// An AnnotationSource over a content.document — the store the sidecar was
// designed for: a versioned canonical body (content_version bumps only when
// the body changes), past versions readable through content.version_get, and
// a save adapter that writes a SPLICE (only the changed blocks) through
// guardedUpdate on the row's `version`.

import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import { spliceProposal } from "@/features/rich-document/review/proposedEdit";

export interface LoadedDocument {
  id: string;
  title: string;
  body: string;
  contentVersion: number;
  version: number;
  organizationId: string;
  createdBy: string | null;
  typeSlug: string;
}

export async function loadDocument(id: string): Promise<LoadedDocument | null> {
  const { data, error } = await supabase
    .schema("content")
    .rpc("document_get", { p_document_id: id, p_include_body: true });
  if (error) throw new Error(`We couldn't open this document: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "Untitled document",
    body: row.body ?? "",
    contentVersion: row.content_version,
    version: row.version,
    organizationId: row.organization_id,
    createdBy: row.created_by ?? null,
    typeSlug: row.type_slug,
  };
}

export async function readDocumentVersionBody(id: string, contentVersion: number): Promise<string | null> {
  const { data, error } = await supabase
    .schema("content")
    .rpc("version_get", { p_document_id: id, p_content_version: contentVersion });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.body ?? null;
}

/**
 * Save `nextBody` over `doc` as a splice: the stored text keeps every block
 * the edit did not touch byte for byte (a proposal that would disturb a
 * protected island is refused by spliceSave, never forced).
 */
export async function saveDocumentBody(doc: LoadedDocument, nextBody: string): Promise<void> {
  const splice = spliceProposal(doc.body, nextBody);
  if (!splice) return;
  const result = await guardedUpdate<{ id: string; version: number; body: string }>({
    expectedVersion: doc.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase.schema("content").from("document")
        .update({ body: splice.text, version: nextVersion })
        .eq("id", doc.id).eq("version", expectedVersion)
        .select("id, version, body").maybeSingle(),
    fetchCurrent: () =>
      supabase.schema("content").from("document").select("id, version, body").eq("id", doc.id).maybeSingle(),
    // Only a bump that left the body exactly as this edit's base is phantom.
    rebase: { isPhantom: (current) => current.body === doc.body },
  });
  if (result.status === "conflict") {
    throw new Error("Someone else changed this document since you opened it. Reload to see their version, then apply again.");
  }
  if (result.status === "not_found") throw new Error("This document no longer exists or you can no longer edit it.");
}

/** A new document from text (the studio's "annotate this buffer"). Filed in `organizationId`. */
export async function createDocument(input: {
  organizationId: string;
  title: string;
  body: string;
  visibility: "personal" | "internal";
}): Promise<string> {
  const { data: type, error: typeError } = await supabase
    .schema("platform")
    .from("categories")
    .select("id")
    .eq("dimension", "document_type")
    .eq("slug", "note")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (typeError || !type) throw new Error(`We couldn't find the note document type: ${typeError?.message ?? "not registered"}`);
  const row = {
    organization_id: input.organizationId,
    document_type_id: type.id as string,
    title: input.title,
    body: input.body,
    visibility: input.visibility,
  };
  const { data, error } = await supabase
    .schema("content")
    .from("document")
    // content_hash / data_class are derived by the database (see service.ts createHighlight).
    .insert(row as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(`We couldn't create the document: ${error?.message ?? "no row came back"}`);
  return data.id as string;
}
