/**
 * Processed-document agent-context builder.
 *
 * A `processed_document` resource is a file the user attached BY REFERENCE with
 * a chosen text representation (clean / raw). Unlike a binary `document` block,
 * it does NOT ship bytes or a content[] block — it emits a LAZY context POINTER
 * into `request.context`:
 *
 *   request.context["attached_document_<id8>"] = {
 *     source: { kind: "processed_document", id: <processed_document_id>, representation },
 *     type: "json", label, description
 *   }
 *
 * The backend (aidream `context_sources.py` + `documents/context_source_resolver.py`)
 * treats a value with a `source` and NO `content` key as the lazy form: it
 * builds a cheap descriptor (section table of contents + alternate formats) and
 * materializes the chosen representation on demand — nothing large is shipped or
 * cached. The agent reaches the OTHER formats (raw text, per-page index,
 * knowledge assets, rendered PDF page images) via the `document_content` tool,
 * which is auto-injected whenever a processed document is attached.
 *
 * This mirrors the working-document `source.kind` routing precedent
 * (workingDocumentContext.ts) — the backend dispatches on `source.kind`.
 */

import type {
  DocumentRepresentation,
  ManagedResource,
} from "@/features/agents/types/instance.types";
import type { FileDocumentLookup } from "@/features/files/api/document-lookup";

/** The `source` value stored on a `processed_document` ManagedResource. */
export interface ProcessedDocumentSource {
  kind: "processed_document";
  processed_document_id: string;
  /** The origin binary file id — used by "Attach as file instead". */
  file_id: string | null;
  derivation_kind: string;
  total_pages: number | null;
  has_clean_content: boolean;
}

/** The wire pointer the backend resolves lazily (source-only rich form). */
export interface ProcessedDocumentContextValue {
  source: {
    kind: "processed_document";
    id: string;
    representation: DocumentRepresentation;
  };
  type: "json";
  label: string;
  description: string;
}

/** One selectable representation option for the chip pill. */
export interface DocumentRepresentationOption {
  value: DocumentRepresentation;
  label: string;
  hint: string;
  /** Disabled when the representation isn't ready (e.g. clean still processing). */
  disabled?: boolean;
}

export function isProcessedDocumentSource(
  source: unknown,
): source is ProcessedDocumentSource {
  return (
    typeof source === "object" &&
    source !== null &&
    (source as { kind?: unknown }).kind === "processed_document" &&
    typeof (source as ProcessedDocumentSource).processed_document_id === "string"
  );
}

/** True for a ManagedResource that rides the context channel, not content[]. */
export function isProcessedDocumentResource(r: ManagedResource): boolean {
  return r.blockType === "processed_document";
}

/** Build the `source` value from a resolved file→document lookup. */
export function buildProcessedDocumentSource(
  doc: FileDocumentLookup,
  fileId: string | null,
): ProcessedDocumentSource {
  return {
    kind: "processed_document",
    processed_document_id: doc.processed_document_id,
    file_id: fileId,
    derivation_kind: doc.derivation_kind,
    total_pages: doc.total_pages,
    has_clean_content: doc.has_clean_content,
  };
}

/** The default primary representation: clean when ready, else raw. */
export function defaultRepresentation(
  source: ProcessedDocumentSource,
): DocumentRepresentation {
  return source.has_clean_content ? "clean" : "raw";
}

/**
 * The representation options to offer for a document, data-driven so a new
 * representation is one entry. "clean" is disabled until AI-cleaning completes.
 */
export function availableRepresentations(
  source: ProcessedDocumentSource,
): DocumentRepresentationOption[] {
  return [
    {
      value: "clean",
      label: "Clean text",
      hint: "AI-cleaned, readable text (recommended)",
      disabled: !source.has_clean_content,
    },
    {
      value: "raw",
      label: "Raw text",
      hint: "Original extracted / OCR text",
    },
  ];
}

const REPRESENTATION_LABEL: Record<DocumentRepresentation, string> = {
  clean: "Clean",
  raw: "Raw",
};

export function representationLabel(rep: DocumentRepresentation): string {
  return REPRESENTATION_LABEL[rep];
}

/**
 * The `request.context` key an attached document publishes under. Uses the FULL
 * processed_document_id (not a prefix) so two documents can never collide and
 * silently overwrite each other's pointer; attaching the SAME document twice
 * intentionally maps to one key (dedup is also enforced at attach time).
 */
export function attachedDocumentContextKey(processedDocumentId: string): string {
  return `attached_document_${processedDocumentId}`;
}

const DESCRIPTION_BASE =
  "A document the user explicitly attached. Its chosen representation is the " +
  "primary content shown here; the raw text, per-page index, knowledge assets, " +
  "and rendered PDF page images are available on demand via the document_content " +
  "tool. When a claim matters, validate it against the physical PDF pages.";

/** Build the lazy context pointer for the wire (no `content` key). */
export function buildProcessedDocumentContextValue(
  source: ProcessedDocumentSource,
  representation: DocumentRepresentation,
  label: string,
): ProcessedDocumentContextValue {
  return {
    source: {
      kind: "processed_document",
      id: source.processed_document_id,
      representation,
    },
    type: "json",
    label,
    description: DESCRIPTION_BASE,
  };
}
