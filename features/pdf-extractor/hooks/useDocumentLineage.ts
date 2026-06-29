"use client";

/**
 * useDocumentLineage — fetches the two-axis lineage tree for a processed
 * document.
 *
 * Two independent axes:
 *
 *   Processing lineage (interpretations of the bytes)
 *     processed_documents.parent_processed_id walked both directions.
 *     Distinct rows per `derivation_kind` (re-extract, re-clean, …).
 *
 *   Binary lineage (the bytes themselves)
 *     When `processed_documents.source_kind = 'cld_file'`, the source
 *     binary is a `cld_files` row. We walk `cld_files.parent_file_id`
 *     up and `WHERE parent_file_id = current` down. Distinct rows per
 *     `derivation_kind` (extracted_pages, cropped, rotated, merged, …).
 *
 * RLS naturally scopes both queries to the signed-in user.
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";

// ── Shapes returned to the consumer ────────────────────────────────────────

export interface ProcessingNode {
  id: string;
  name: string;
  derivationKind: string;
  derivationMetadata: Record<string, unknown> | null;
  parentProcessedId: string | null;
  createdAt: string;
}

export interface BinaryNode {
  id: string;
  fileName: string;
  derivationKind: string | null;
  derivationMetadata: Record<string, unknown> | null;
  parentFileId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface DocumentLineage {
  processingAncestors: ProcessingNode[]; // furthest ancestor first
  processingChildren: ProcessingNode[];
  binaryAncestors: BinaryNode[];
  binaryChildren: BinaryNode[];
  currentBinary: BinaryNode | null;
}

const MAX_WALK = 32; // safety bound for both walks

// ── Internal walkers ───────────────────────────────────────────────────────

async function walkProcessingAncestors(
  startParentId: string | null,
): Promise<ProcessingNode[]> {
  const out: ProcessingNode[] = [];
  let cursor = startParentId;
  for (let i = 0; cursor && i < MAX_WALK; i++) {
    const { data, error } = await (supabase as any)
      .schema("docproc").from("processed_documents")
      .select(
        "id, name, derivation_kind, derivation_metadata, parent_processed_id, created_at",
      )
      .eq("id", cursor)
      .maybeSingle();
    if (error || !data) break;
    out.unshift({
      id: data.id as string,
      name: (data.name as string) ?? "Untitled",
      derivationKind: (data.derivation_kind as string) ?? "initial_extract",
      derivationMetadata:
        (data.derivation_metadata as Record<string, unknown> | null) ?? null,
      parentProcessedId: (data.parent_processed_id as string | null) ?? null,
      createdAt: data.created_at as string,
    });
    cursor = (data.parent_processed_id as string | null) ?? null;
  }
  return out;
}

async function fetchProcessingChildren(
  docId: string,
): Promise<ProcessingNode[]> {
  const { data, error } = await (supabase as any)
    .schema("docproc").from("processed_documents")
    .select(
      "id, name, derivation_kind, derivation_metadata, parent_processed_id, created_at",
    )
    .eq("parent_processed_id", docId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((d) => ({
    id: d.id as string,
    name: (d.name as string) ?? "Untitled",
    derivationKind: (d.derivation_kind as string) ?? "initial_extract",
    derivationMetadata:
      (d.derivation_metadata as Record<string, unknown> | null) ?? null,
    parentProcessedId: (d.parent_processed_id as string | null) ?? null,
    createdAt: d.created_at as string,
  }));
}

function rowToBinary(row: Record<string, unknown>): BinaryNode {
  // Phase 0 rename: `cld_files.file_size` → `cld_files.size_bytes`.
  // Read `size_bytes` first; fall back to legacy `file_size` for any
  // pre-migration cached payloads still floating around.
  // See docs/PYTHON_UPDATES.md §3.
  const rawSize = row.size_bytes ?? row.file_size;
  return {
    id: row.id as string,
    fileName: (row.file_name as string) ?? "Unnamed file",
    derivationKind: (row.derivation_kind as string | null) ?? null,
    derivationMetadata:
      (row.derivation_metadata as Record<string, unknown> | null) ?? null,
    parentFileId: (row.parent_file_id as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    fileSize:
      typeof rawSize === "number"
        ? rawSize
        : rawSize != null
          ? Number(rawSize)
          : null,
    createdAt: row.created_at as string,
  };
}

async function fetchCldFile(cldId: string): Promise<BinaryNode | null> {
  const { data, error } = await filesDb(supabase)
    .from("files")
    .select(
      "id, file_name, derivation_kind, derivation_metadata, parent_file_id, mime_type, size_bytes, created_at",
    )
    .eq("id", cldId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return rowToBinary(data as Record<string, unknown>);
}

async function walkBinaryAncestors(
  startParentId: string | null,
): Promise<BinaryNode[]> {
  const out: BinaryNode[] = [];
  let cursor = startParentId;
  for (let i = 0; cursor && i < MAX_WALK; i++) {
    const node = await fetchCldFile(cursor);
    if (!node) break;
    out.unshift(node);
    cursor = node.parentFileId;
  }
  return out;
}

async function fetchBinaryChildren(cldId: string): Promise<BinaryNode[]> {
  const { data, error } = await filesDb(supabase)
    .from("files")
    .select(
      "id, file_name, derivation_kind, derivation_metadata, parent_file_id, mime_type, size_bytes, created_at",
    )
    .eq("parent_file_id", cldId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToBinary);
}

// ── Public hook ────────────────────────────────────────────────────────────

interface Args {
  docId: string;
  parentProcessedId: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  /** Skip fetching until enabled — useful when tab is hidden. */
  enabled?: boolean;
}

export function useDocumentLineage({
  docId,
  parentProcessedId,
  sourceKind,
  sourceId,
  enabled = true,
}: Args): {
  lineage: DocumentLineage | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [lineage, setLineage] = useState<DocumentLineage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);

  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!enabled || !docId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const isCldSource = sourceKind === "cld_file" && !!sourceId;
        const [
          processingAncestors,
          processingChildren,
          currentBinary,
          binaryChildren,
        ] = await Promise.all([
          walkProcessingAncestors(parentProcessedId),
          fetchProcessingChildren(docId),
          isCldSource ? fetchCldFile(sourceId!) : Promise.resolve(null),
          isCldSource ? fetchBinaryChildren(sourceId!) : Promise.resolve([]),
        ]);

        const binaryAncestors = currentBinary
          ? await walkBinaryAncestors(currentBinary.parentFileId)
          : [];

        if (cancelled) return;
        setLineage({
          processingAncestors,
          processingChildren,
          currentBinary,
          binaryAncestors,
          binaryChildren,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load lineage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, parentProcessedId, sourceKind, sourceId, enabled, bumper]);

  return { lineage, loading, error, refresh };
}
