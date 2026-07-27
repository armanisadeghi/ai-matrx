/**
 * Runtime scope builder for the `matrx-user/pdf-extractor` surface.
 *
 * The manifest declares natural composites (`document_summary`,
 * `active_scope`) and the legacy baseline aliases (`selection`, `content`)
 * alongside the primitive fields. Deriving those at three separate emitters
 * (studio shell, studio inspector, extractor workspace) is exactly the
 * duplication the surface doctrine kills — every emitter hands its RAW
 * loaded state to this module, and it returns the typed payload through the
 * manifest's `createPdfExtractorScope` so TypeScript still enforces the
 * declaration.
 */

import {
  createPdfExtractorScope,
  type PdfExtractorScopeKind,
} from "@/features/surfaces/manifests/pdf-extractor.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

export interface PdfExtractorScopeInput {
  /** Always-available primitives. */
  full_document_text: string;
  current_page_text: string;
  active_scope_text: string;
  filename: string;
  file_id: string;
  total_pages: number;
  current_page: number;
  scope_kind: PdfExtractorScopeKind;
  using_clean_text: boolean;
  /** Conditionally-populated primitives. */
  page_range_text?: string;
  selected_text?: string;
  processed_document_id?: string;
  page_numbers?: string;
  raw_document_text?: string;
  page_texts?: Array<{ page_number: number; text: string; cleaned: boolean }>;
  visible_panes?: string[];
  sidebar_view?: string;
  find_query?: string;
  library_document_count?: number;
  library_document_names?: string[];
  pipeline_running?: boolean;
  pipeline_status?: string;
}

/**
 * Derive the composites + legacy aliases and return the manifest-typed
 * payload. Call at TRIGGER time with live values — never with stale state.
 */
export function buildPdfExtractorScope(
  input: PdfExtractorScopeInput,
): SurfaceScopePayload {
  return createPdfExtractorScope({
    ...input,
    document_summary: {
      filename: input.filename,
      file_id: input.file_id,
      processed_document_id: input.processed_document_id ?? "",
      total_pages: input.total_pages,
      using_clean_text: input.using_clean_text,
    },
    active_scope: {
      kind: input.scope_kind,
      page_numbers: input.page_numbers ?? "",
      char_count: input.active_scope_text.length,
    },
    // Baseline back-compat aliases — pre-manifest agents wired to the generic
    // editor keys keep resolving.
    selection: input.active_scope_text,
    content: input.full_document_text,
  });
}
