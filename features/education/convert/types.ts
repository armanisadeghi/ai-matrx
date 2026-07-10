// features/education/convert/types.ts
//
// THE cross-tool content converter contract (Education Hub, master-plan
// "Converter" contract — owned P4 + P9 week-1). ONE dispatch layer that turns a
// normalized source into a study artifact of a requested kind:
//
//     convertContent({ source, targetKind })  →  ConvertResult
//
// It is consumed by:
//   • P9 Universal Ingest — the kit fan-out (one upload → deck + summary + map + …)
//   • Smart Notes (P4)     — one-click "note → deck / quiz / map / summary"
//   • Flashcards / P1 / P3 — cross-tool "make this into X" actions
//
// Generators register themselves in `registry.ts`; a generator is a plain async
// function (NOT a hook) so the dispatch can be driven from anywhere via
// `useContentConverter()` or `runConvert(ctx)`. Do NOT build a second dispatch —
// add a generator here (or register one from your feature) instead.

import type { TrustEnvelope } from "@/features/education/trust/types";
import type { AppDispatch, AppStore } from "@/lib/redux/store";

/**
 * The study-artifact kinds a source can be converted INTO. This is the target
 * vocabulary shared across the hub; it deliberately mirrors the tool slugs.
 * Progressive: a kind is only *usable* once a generator registers for it and
 * marks itself available (see `registry.isTargetAvailable`).
 */
export type TargetKind =
  | "deck" // flashcard set (fc_set)            — LIVE
  | "summary" // grounded study summary          — LIVE
  | "mind_map" // diagram_spec (study_media)      — LIVE
  | "audio" // audio overview (study_media)      — registers when P3 audio wires in
  | "quiz" // quiz (P1)                          — registers when P1 lands
  | "practice_test" // full test (P1)            — registers when P1 lands
  | "notes"; // structured notes (P4)            — registers when P4 lands

export const ALL_TARGET_KINDS: TargetKind[] = [
  "deck",
  "summary",
  "mind_map",
  "audio",
  "quiz",
  "practice_test",
  "notes",
];

/**
 * Where a piece of content came from — the lineage anchor. Every generated
 * artifact links a `source` association edge back to this so the kit results
 * page (and citations) can trace provenance. The canonical anchor is a
 * `cld_files` row (`fileId`): the Universal Ingest pipeline normalizes EVERY
 * input (paste, URL, PDF, recording) to a durable file, so lineage is uniform.
 */
export interface SourceRef {
  kind:
    | "file"
    | "url"
    | "youtube"
    | "paste"
    | "note"
    | "deck"
    | "assessment"
    | "transcript"
    | "processed_document";
  /** Canonical anchor — the cld_files id lineage edges point at. */
  fileId?: string;
  /** RAG processed-document id, when the source was ingested into RAG. */
  processedDocumentId?: string;
  /** Original external URL / YouTube link, when applicable. */
  url?: string;
  /** For entity-sourced conversions (note→deck etc.): the source entity. */
  entityType?: string;
  entityId?: string;
}

/**
 * A normalized source ready to convert. `text` is the extracted content the
 * generators read; ingest owns getting from raw-input → text (PDF extraction,
 * scrape, transcription, paste). Generators never touch raw files.
 */
export interface ConvertSource {
  /** Extracted plain text / markdown of the source. */
  text: string;
  /** Suggested title (filename, page title, user input). Generators may refine. */
  title?: string;
  /** Lineage anchor for association edges + citations. */
  ref?: SourceRef;
}

/** Per-conversion tuning. Unknown keys are ignored by generators that don't use them. */
export interface ConvertOptions {
  /** Cards / questions / nodes count hint. */
  count?: number;
  /** "easy" | "medium" | "hard" | "Mixed" — generator-interpreted. */
  difficulty?: string;
  /** Free-form emphasis ("focus on the causes", "I have an exam on X"). */
  focus?: string;
  /** Grade level hint, where a generator supports it. */
  gradeLevel?: string;
}

export interface ConvertRequest {
  source: ConvertSource;
  targetKind: TargetKind;
  options?: ConvertOptions;
}

/** What a successful conversion yields — enough to link to + open the artifact. */
export interface ConvertResult {
  targetKind: TargetKind;
  /** The created artifact's canonical id (fc_set id, study_media id, …). */
  artifactId: string;
  /** Canonical entity/resource type token (for access + associations + admin map). */
  resourceType: string;
  /** In-app route to open the artifact. */
  href: string;
  /** Display title of the created artifact. */
  title: string;
  /** The TrustEnvelope the generator emitted (citations + confidence), if any. */
  trust?: TrustEnvelope | null;
  /** Optional one-line summary of what was produced ("18 cards", "6 nodes"). */
  detail?: string;
}

/** Context handed to a generator — the Redux plumbing + resolved identity. */
export interface ConvertContext {
  dispatch: AppDispatch;
  store: AppStore;
  /** Resolved org id for the writes (personal org by default). */
  orgId?: string;
  /**
   * Optional live hook: the generator calls this with the streaming requestId
   * as soon as the agent connects, so a progressive kit UI can render tokens
   * as they arrive instead of a spinner. Safe to ignore.
   */
  onRequestId?: (requestId: string) => void;
}

/**
 * A registered generator. `run` does the whole job: call the agent, persist the
 * artifact, link the `source` lineage edge, return a ConvertResult. Throw on
 * failure (the dispatch wraps it into a per-target error).
 */
export interface ConvertGenerator {
  targetKind: TargetKind;
  /** Short human label ("Flashcard deck", "Study summary"). */
  label: string;
  /** True when the generator can run today. Progressive targets ship false. */
  available: boolean;
  /** The entitlement capability metered on this conversion (P8), if any. */
  capability?: string;
  run(request: ConvertRequest, ctx: ConvertContext): Promise<ConvertResult>;
}
