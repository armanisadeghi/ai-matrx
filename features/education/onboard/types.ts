// features/education/onboard/types.ts
//
// Types for the Universal Ingest / Study Kit flow (P9). Ingest normalizes ANY
// input to `NormalizedIngest`; the kit orchestrator fans it out through the
// converter contract (`features/education/convert`).

import type { SourceRef, TargetKind } from "@/features/education/convert";

/** The raw input the user handed us at the front door. */
export type IngestInputKind = "paste" | "file" | "url" | "youtube";

export interface RawIngestInput {
  kind: IngestInputKind;
  /** For `file`. */
  file?: File;
  /** For `paste`. */
  text?: string;
  /** For `url` / `youtube`. */
  url?: string;
  /** Optional user-supplied title override. */
  title?: string;
}

/**
 * A normalized source: extracted text + a durable `cld_files` anchor every
 * generated artifact links back to. Ingest owns getting here; generators never
 * see raw files.
 */
export interface NormalizedIngest {
  text: string;
  title: string;
  ref: SourceRef;
  /** Diagnostics for the UI ("12 pages · 8,431 chars · native"). */
  meta: {
    pages?: number;
    chars: number;
    extractionMethod?: string;
    truncated?: boolean;
    inputKind: IngestInputKind;
  };
}

/** A stage in the ingest progress stream (for the hero UI). */
export interface IngestProgress {
  phase: "uploading" | "extracting" | "scraping" | "ready";
  message: string;
}

/** One target's live state in the kit fan-out. */
export interface KitTargetState {
  targetKind: TargetKind;
  label: string;
  status: "pending" | "running" | "success" | "error";
  /** Populated on success. */
  href?: string;
  title?: string;
  detail?: string;
  artifactId?: string;
  resourceType?: string;
  /** Populated on error. */
  error?: string;
  /** Live streaming request id (for token-level preview), when available. */
  requestId?: string;
}
