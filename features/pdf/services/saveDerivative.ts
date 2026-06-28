"use client";

/**
 * saveDerivative — THE persist-a-derived-PDF path.
 *
 * Uploads the derived blob through the canonical fileHandler (never raw
 * storage) and creates the lineage-bearing processed_documents row
 * (parent_processed_id + derivation_kind/metadata). Extracted from
 * ManipulationPanel during the 2026-06 consolidation so every surface
 * (extractor ops, Analysis Studio page/document ops, future panels) saves
 * derivatives through one identical path — the W2 bridge triggers then
 * link the new doc's pages automatically.
 *
 * `parent` accepts either a full extractor PdfDocument-shaped object or a
 * minimal { id, name, totalPages } — Analysis Studio callers only have
 * the latter.
 */

import { fileHandler } from "@/features/files";
import { supabase } from "@/utils/supabase/client";

export interface DerivativeParent {
  /** processed_documents.id of the parent (lineage anchor). */
  id: string;
  name: string | null;
  totalPages: number | null;
}

export interface SaveDerivativeParams {
  parent: DerivativeParent;
  userId: string;
  result: { blob: Blob; filename: string; contentType?: string };
  derivationKind: string;
  derivationMetadata: Record<string, unknown>;
}

export async function saveDerivative({
  parent,
  userId,
  result,
  derivationKind,
  derivationMetadata,
}: SaveDerivativeParams): Promise<{ docId: string | null; error: string | null }> {
  // 1. Upload blob to cld_files via the canonical handler.
  const file = new File([result.blob], result.filename, {
    type: result.contentType || "application/pdf",
  });
  let fileId: string;
  let storageUri: string;
  try {
    const normalized = await fileHandler.upload(
      { kind: "file", file },
      { folderPath: `derivatives/${parent.id}` },
    );
    if (!normalized.fileId || !normalized.fileUri) {
      throw new Error("Upload returned no fileId/fileUri");
    }
    fileId = normalized.fileId;
    storageUri = normalized.fileUri;
  } catch (err) {
    return {
      docId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Create the derivative processed_documents row with lineage.
  const { data: newDoc, error: insertError } = await (supabase as any)
    .schema("docproc").from("processed_documents")
    .insert({
      name: result.filename.replace(/\.pdf$/i, ""),
      storage_uri: storageUri,
      source_kind: "cld_file",
      source_id: fileId,
      source_hash: "",
      owner_id: userId,
      parent_processed_id: parent.id,
      derivation_kind: derivationKind,
      derivation_metadata: {
        ...derivationMetadata,
        original_name: parent.name,
        original_total_pages: parent.totalPages,
      },
      mime_type: "application/pdf",
    })
    .select("id")
    .single();

  if (insertError) {
    return { docId: null, error: insertError.message };
  }
  return { docId: (newDoc as { id: string }).id, error: null };
}
