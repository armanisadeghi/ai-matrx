/**
 * Processed-document representation helpers.
 *
 * A file the user attaches by REFERENCE (an OCR'd → AI-cleaned document) is now a
 * durable `platform.associations` edge (`processed_document → conversation` or
 * `file → conversation`) — NOT a per-turn `request.context` pointer. The backend
 * reads the conversation's association edges at call time and injects the chosen
 * representation itself; the FE only creates/removes the edge and renders the
 * chip. This module holds the shared source shape + the Clean/Raw representation
 * options the chip's pill offers. (The old lazy `request.context` wire builder
 * was removed when attachments moved onto associations — see
 * `attached-documents.ts` + the chat FEATURE.md.)
 */

import type { DocumentRepresentation } from "@/features/agents/types/instance.types";
import type { FileDocumentLookup } from "@/features/files/api/document-lookup";

/** The `source` value describing an attached processed document. */
export interface ProcessedDocumentSource {
  kind: "processed_document";
  processed_document_id: string;
  /** The origin binary file id — used by "Attach as file instead". */
  file_id: string | null;
  derivation_kind: string;
  total_pages: number | null;
  has_clean_content: boolean;
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
    typeof (source as ProcessedDocumentSource).processed_document_id ===
      "string"
  );
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
<<<<<<< Updated upstream

/** How an attached document is wired into agent context. */
export type AttachedDocumentMode = "file" | DocumentRepresentation;

export function attachedDocumentModeLabel(mode: AttachedDocumentMode): string {
  if (mode === "file") return "File";
  return representationLabel(mode);
}

/** One row in the unified attached-document chip menu. */
export interface AttachedDocumentModeOption {
  mode: AttachedDocumentMode;
  label: string;
  hint: string;
  disabled?: boolean;
}

/** File + Clean + Raw options for the combined composer chip. */
export function attachedDocumentModeOptions(params: {
  hasProcessedDocument: boolean;
  hasCleanContent: boolean;
  hasOriginFile: boolean;
}): AttachedDocumentModeOption[] {
  const { hasProcessedDocument, hasCleanContent, hasOriginFile } = params;
  const options: AttachedDocumentModeOption[] = [];

  if (hasOriginFile) {
    options.push({
      mode: "file",
      label: "File",
      hint: "Original binary file attachment",
    });
  }
  if (hasProcessedDocument) {
    options.push(
      {
        mode: "clean",
        label: "Clean text",
        hint: "AI-cleaned, readable text (recommended)",
        disabled: !hasCleanContent,
      },
      {
        mode: "raw",
        label: "Raw text",
        hint: "Original extracted / OCR text",
      },
    );
  }

  return options;
}
=======
>>>>>>> Stashed changes
