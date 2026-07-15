// features/admin/catalogs/types.ts
//
// Remote Catalogs admin — typed rows for public.catalog_entries /
// public.catalog_entries_history. All shapes derive from the generated
// Database types — never hand-mirrored.
// Cross-repo system-of-record:
// /Users/armanisadeghi/code/common-docs/remote-catalogs/FEATURE.md

import type { Database } from "@/types/database.types";

export type CatalogEntryRow =
  Database["public"]["Tables"]["catalog_entries"]["Row"];

export type CatalogEntryHistoryRow =
  Database["public"]["Tables"]["catalog_entries_history"]["Row"];

export type CatalogUpsertArgs =
  Database["public"]["Functions"]["admin_upsert_catalog_entry"]["Args"];

// ── Link resolver (aidream POST /api/catalog-resolver/resolve) ──────────────
// Ratified contract in common-docs/remote-catalogs/FEATURE.md. The endpoint
// is not yet in types/python-generated/api-types.ts (built in a parallel
// aidream session) — these mirror the ratified contract until the OpenAPI
// types include it, at which point they must be replaced by the generated
// shapes.

export type ResolverSource = "huggingface" | "civitai" | "direct";

export interface ResolvedFile {
  filename: string;
  download_url: string;
  size_bytes?: number | null;
  sha256?: string | null;
  /** e.g. a quant label like "Q4_K_M". */
  label?: string | null;
}

export interface ResolverSuggestion {
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  artifact_url: string;
  artifact_sha256?: string | null;
  artifact_size_bytes?: number | null;
  notes?: string | null;
}

export interface ResolveLinkResult {
  source: ResolverSource;
  canonical_url: string;
  name: string;
  description?: string | null;
  license?: string | null;
  files: ResolvedFile[];
  suggestions: ResolverSuggestion[];
}

/** Prefill handed from “Add from link” to the entry editor. */
export interface EntryPrefill {
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  artifact_url: string | null;
  artifact_sha256: string | null;
  artifact_size_bytes: number | null;
  notes: string | null;
}
