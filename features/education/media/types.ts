// features/education/media/types.ts
//
// Types for GENERATED STUDY MEDIA (P3) — the Audio Study + Mind Maps tools. Both
// tools persist to ONE canonical table, `education.study_media` (a lightweight
// artifact registry): audio artifacts point into the reused podcast pipeline
// (run_id / episode_id / audio_file_id), mind maps carry their content-IR
// envelope (ir_envelope). Row types derive from the generated `education` schema
// — never hand-mirror a column shape.

import type { Database } from "@/types/database.types";
import type { TrustEnvelope } from "@/features/education/trust/types";

type Edu = Database["education"]["Tables"];

export type StudyMediaRow = Edu["study_media"]["Row"];
export type StudyMediaInsert = Edu["study_media"]["Insert"];
export type StudyMediaUpdate = Edu["study_media"]["Update"];

/**
 * Which study-media kind this artifact is. `audio` + `mind_map` are the P3
 * tools; `summary` is the grounded study summary produced by the P9 Universal
 * Ingest kit flow; `memory_aid` is the Memory Tools artifact (VISION §11 —
 * mnemonics / analogies / memory palace, structured in `ir_envelope`). All share
 * this table for their trust + visibility + versioning + source lineage.
 */
export type EduMediaKind = "audio" | "mind_map" | "summary" | "memory_aid";

/**
 * The four audio study formats.
 * - `overview` — a podcast-style narrated walkthrough (1–2 hosts).
 * - `debate`   — two genuinely distinct voices arguing opposing positions.
 * - `panel`    — a multi-host roundtable (3+).
 * - `review`   — an audio review session (spoken quiz). Not a generated podcast;
 *                it runs live over the study spine, so a `review` study_media row
 *                is only a saved *config*, not a produced audio file.
 */
export type EduAudioFormat = "overview" | "debate" | "panel" | "review";

/** Where a media artifact was generated from (single-valued provenance). */
export type EduMediaSourceKind = "deck" | "note" | "topic";

/** A resolved source the generator was pointed at. */
export interface EduMediaSource {
  kind: EduMediaSourceKind;
  /** fc_set id / note id; absent for a free-text topic. */
  id?: string | null;
  title: string;
}

/** Persisted audio-generation config (rides in `study_media.config`). */
export interface AudioGenConfig {
  format: EduAudioFormat;
  hostCount: number;
  /** When true, the brief targets the listener's weak areas (item_mastery). */
  adaptive: boolean;
  language?: string;
}

/** Persisted mind-map generation config (rides in `study_media.config`). */
export interface MindMapGenConfig {
  /** The content-IR kind emitted ('diagram_spec' | 'mermaid_diagram'). */
  diagramKind: string;
  /** A short user prompt/hint appended to the source brief, if any. */
  hint?: string;
}

/** Service result — supabase-style; the service never throws. */
export interface MediaResult<T> {
  data: T | null;
  error: string | null;
}

/** Input to create a study-media artifact. Triggers fill org/actor/version. */
export interface NewStudyMediaInput {
  mediaKind: EduMediaKind;
  title: string;
  description?: string | null;
  status?: string;
  source?: EduMediaSource | null;
  config?: AudioGenConfig | MindMapGenConfig | Record<string, unknown>;
  trust?: TrustEnvelope | null;
  // audio
  runId?: string | null;
  episodeId?: string | null;
  audioFileId?: string | null;
  audioFormat?: EduAudioFormat | null;
  durationSeconds?: number | null;
  // mind map
  irEnvelope?: unknown;
  diagramKind?: string | null;
  visibility?: Database["platform"]["Enums"]["visibility"];
}

/** Patch shape for updating an artifact after generation completes. */
export type StudyMediaPatch = Partial<
  Pick<
    StudyMediaRow,
    | "title"
    | "description"
    | "status"
    | "config"
    | "trust"
    | "episode_id"
    | "audio_file_id"
    | "duration_seconds"
    | "ir_envelope"
    | "diagram_kind"
    | "visibility"
    | "metadata"
  >
>;
