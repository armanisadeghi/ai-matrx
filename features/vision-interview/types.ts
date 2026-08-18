// features/vision-interview/types.ts
//
// Row types for the five `interview.*` tables + role/stage/category metadata.
//
// NOTE — hand-declared row types: the `interview` schema is not yet in
// `types/database.types.ts` (this container cannot run `pnpm db-types`).
// On the next `pnpm db-types` these declarations are REPLACED by
// `Database["interview"]["Tables"][...]["Row"]` aliases — do not let the two
// drift; the generated types win.

import type { LucideIcon } from "lucide-react";
import {
  CircleHelp,
  DraftingCompass,
  Ear,
  Landmark,
  Map as MapIcon,
  Megaphone,
  PenLine,
  Swords,
} from "lucide-react";

// ── Enums (mirror the live DB CHECK constraints) ────────────────────────────

/** v2 stage arc (backend contract, 2026-08-17). */
export type InterviewStage =
  | "capture"
  | "ground"
  | "enhance"
  | "articulate"
  | "stress"
  | "shape"
  | "revisit"
  | "done";

/** v1 stage values that may still sit on old session rows until the server
 *  heals them. Display-only mapping — the FE never writes stage. */
export type LegacyInterviewStage = "expand" | "test" | "loop";

/** What `interview.session.stage` can actually carry on the wire. */
export type InterviewStageWire = InterviewStage | LegacyInterviewStage;

const LEGACY_STAGE_MAP: Record<LegacyInterviewStage, InterviewStage> = {
  expand: "enhance",
  test: "stress",
  loop: "revisit",
};

/** Map a wire stage (possibly legacy) to the canonical v2 stage key. */
export function normalizeStage(stage: InterviewStageWire): InterviewStage {
  return (LEGACY_STAGE_MAP as Record<string, InterviewStage | undefined>)[stage] ??
    (stage as InterviewStage);
}

export type RoleKey =
  | "sounding_board"
  | "amplifier"
  | "cartographer"
  | "archaeologist"
  | "adversary"
  | "architect"
  | "scribe";

/** `interview.turn.speaker` — the human or one of the seven role keys. */
export type Speaker = "human" | RoleKey;

export type QuestionState =
  | "open"
  | "answered"
  | "partially_answered"
  | "dodged"
  | "deferred";

/** `interview.question.category` — which kind of asking produced it. May be
 *  null on pre-v2 rows; a null category reads as `gap`. */
export type QuestionCategory =
  | "core"
  | "grounding"
  | "enhancement"
  | "articulation"
  | "risk"
  | "architectural"
  | "gap";

export type HoleClassification = "fatal" | "unknown" | "undecided";

export type HoleStatus =
  | "open"
  | "patched"
  | "accepted_risk"
  | "needs_human_arbitration";

// ── Rows ────────────────────────────────────────────────────────────────────

/** `interview.session` — canonical entity table. */
export interface InterviewSessionRow {
  id: string;
  title: string;
  vision_statement: string | null;
  /** The living document — section-keyed markdown, written ONLY by scribe_apply. */
  document: string | null;
  stage: InterviewStageWire;
  current_round: number;
  run_id: string | null;
  role_bindings: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  /**
   * Final deliverables (v2 §13.3) — written by the server's finalize step.
   * All null until the interview is finalized; `finalized_at` stamps when.
   * Hand-declared like the rest of this row (see file header).
   */
  cleaned_transcript: string | null;
  vision_document: string | null;
  requirements_document: string | null;
  finalized_at: string | null;
  visibility: string;
  created_by: string;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
  metadata: Record<string, unknown> | null;
}

/** `interview.turn` — component of session (no visibility column; RLS via parent). */
export interface InterviewTurnRow {
  id: string;
  session_id: string;
  round: number;
  speaker: Speaker;
  content: string;
  position: number;
  run_id: string | null;
  node_id: string | null;
  /**
   * Raw audio behind a dictated human turn (v2 §13.1 "never lose the
   * speaker's audio") — a `cld_files` UUID stamped by the FE after the
   * recorder's canonical upload lands. Null for typed turns and all role
   * turns. Render ONLY via `<InlineMediaRef>` (re-mints from file_id —
   * media-durability doctrine; never a raw `<audio src>` of a signed URL).
   */
  audio_file_id: string | null;
  /** Machine sidecar — the Scribe's full structured envelope rides
   *  `metadata.scribe_output` (its `content` is the human-readable summary). */
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** `interview.question` — the living Open Questions ledger. */
export interface InterviewQuestionRow {
  id: string;
  session_id: string;
  question: string;
  state: QuestionState;
  /** Null on pre-v2 rows — read through `questionCategory()`. */
  category: QuestionCategory | null;
  missing_part: string | null;
  raised_by: Speaker | null;
  round_raised: number;
  last_state_round: number | null;
  dodge_count: number;
  times_raised: number;
  parent_question_id: string | null;
  answer_note: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** The question's effective category — null (pre-v2 rows) reads as `gap`. */
export function questionCategory(
  question: Pick<InterviewQuestionRow, "category">,
): QuestionCategory {
  return question.category ?? "gap";
}

/** `interview.hole` — Adversary findings, the loop's routing signal. */
export interface InterviewHoleRow {
  id: string;
  session_id: string;
  claim_attacked: string;
  why_it_breaks: string | null;
  classification: HoleClassification;
  reclassified_by_human: boolean;
  status: HoleStatus;
  routed_to: RoleKey | null;
  round_opened: number;
  roundtrip_count: number;
  resolution: string | null;
  question_id: string | null;
  created_at: string;
  updated_at: string;
}

/** `interview.document_revision` — snapshots of the living document. */
export interface InterviewDocumentRevisionRow {
  id: string;
  session_id: string;
  round: number;
  document: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

// ── Supabase schema shape for the interviewDb helper ────────────────────────
// Minimal GenericSchema so supabase-js queries type-check until `interview`
// lands in the generated Database type (see file header).

type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface InterviewSchema {
  Tables: {
    session: TableShape<InterviewSessionRow>;
    turn: TableShape<InterviewTurnRow>;
    question: TableShape<InterviewQuestionRow>;
    hole: TableShape<InterviewHoleRow>;
    document_revision: TableShape<InterviewDocumentRevisionRow>;
  };
  Views: Record<string, never>;
  Functions: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
}

// ── Role metadata ───────────────────────────────────────────────────────────

export interface RoleMeta {
  key: RoleKey;
  name: string;
  /** One line, from the design doc — what this role does in the room. */
  description: string;
  icon: LucideIcon;
  /**
   * Theme-aware accent classes (chart tokens — semantic, defined for light
   * AND dark in globals.css). `avatar` styles the presence/turn avatar disc;
   * `text` colors the speaker name; `ring` is the active-speaker halo.
   */
  accent: { avatar: string; text: string; ring: string };
}

/** Presence/summon order — the stage arc's primaries in order, Scribe last. */
export const ROLE_ORDER: RoleKey[] = [
  "sounding_board",
  "archaeologist",
  "amplifier",
  "cartographer",
  "adversary",
  "architect",
  "scribe",
];

export const ROLES: Record<RoleKey, RoleMeta> = {
  sounding_board: {
    key: "sounding_board",
    // "Sounding Board" is a PROVISIONAL name (proposed with backend v2,
    // 2026-08-17) — render it normally; if the lexicon settles on another
    // name, this display string is the one place to change.
    name: "Sounding Board",
    description:
      "Listens first — reflects your vision back so you hear what you actually said.",
    icon: Ear,
    accent: {
      avatar: "bg-chart-6/15 text-chart-6",
      text: "text-chart-6",
      ring: "ring-chart-6/60",
    },
  },
  amplifier: {
    key: "amplifier",
    name: "Amplifier",
    description:
      "Pushes the vision further — surfaces what you haven't articulated yet.",
    icon: Megaphone,
    accent: {
      avatar: "bg-chart-1/15 text-chart-1",
      text: "text-chart-1",
      ring: "ring-chart-1/60",
    },
  },
  cartographer: {
    key: "cartographer",
    name: "Cartographer",
    description:
      "Maps the terrain — names what exists, and states what the name fails to capture.",
    icon: MapIcon,
    accent: {
      avatar: "bg-chart-2/15 text-chart-2",
      text: "text-chart-2",
      ring: "ring-chart-2/60",
    },
  },
  archaeologist: {
    key: "archaeologist",
    name: "Archaeologist",
    description: "Digs for buried assumptions and unstated constraints.",
    icon: Landmark,
    accent: {
      avatar: "bg-chart-3/15 text-chart-3",
      text: "text-chart-3",
      ring: "ring-chart-3/60",
    },
  },
  adversary: {
    key: "adversary",
    name: "Adversary",
    description: "Attacks claims to find where the vision breaks.",
    icon: Swords,
    accent: {
      avatar: "bg-chart-5/15 text-chart-5",
      text: "text-chart-5",
      ring: "ring-chart-5/60",
    },
  },
  architect: {
    key: "architect",
    name: "Architect",
    description: "Shapes the vision into a buildable structure.",
    icon: DraftingCompass,
    accent: {
      avatar: "bg-chart-4/15 text-chart-4",
      text: "text-chart-4",
      ring: "ring-chart-4/60",
    },
  },
  scribe: {
    key: "scribe",
    name: "Scribe",
    description:
      "The only writer — keeps the living document and the question ledger.",
    icon: PenLine,
    accent: {
      avatar: "bg-primary/15 text-primary",
      text: "text-primary",
      ring: "ring-primary/60",
    },
  },
};

/**
 * Roles whose model output is a STRUCTURED JSON envelope, not prose. Their
 * raw token stream must never render as speech — the live layer shows a
 * working state instead, and the persisted turn carries the readable record.
 */
export const STRUCTURED_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  "adversary",
  "scribe",
]);

/**
 * Resolve a workflow node id to the role speaking through it. Node ids carry
 * the role key (e.g. `role_sounding_board`, `role_adversary_2`) per the
 * backend contract.
 */
export function roleFromNodeId(nodeId: string | null | undefined): RoleKey | null {
  if (!nodeId) return null;
  const lower = nodeId.toLowerCase();
  for (const key of ROLE_ORDER) {
    if (lower.includes(key)) return key;
  }
  return null;
}

/**
 * Roles running as SILENT OBSERVERS in the session's current round, read from
 * the server's round stamp (`metadata.active_round_roles.modes` — stamped at
 * round start; observers write no turn rows and must never render as
 * speakers). Empty set when no stamp is present.
 */
export function observerRoles(
  session: Pick<InterviewSessionRow, "metadata"> | null,
): Set<RoleKey> {
  const stamp = session?.metadata?.["active_round_roles"];
  if (!stamp || typeof stamp !== "object") return new Set();
  const modes = (stamp as { modes?: Record<string, unknown> }).modes;
  if (!modes || typeof modes !== "object") return new Set();
  const out = new Set<RoleKey>();
  for (const [role, mode] of Object.entries(modes)) {
    if (mode === "observer" && role in ROLES) out.add(role as RoleKey);
  }
  return out;
}

// ── Stage metadata ──────────────────────────────────────────────────────────
// ONE frontend mirror of the backend's stage table (aidream v2 contract):
// each working stage has a label, the primary role that speaks in it (one
// primary per round now — observers run silently and only their EFFECTS
// land), and the question category its rounds raise.

export interface StageMeta {
  key: InterviewStage;
  label: string;
  /** The role that leads this stage's rounds. Null = dynamic (revisit picks
   *  the most eager voice; done has no rounds). */
  primaryRole: RoleKey | null;
  /** Question category this stage's asking produces (null for done). */
  questionCategory: QuestionCategory | null;
  /** One short human line for the wizard — what happens at this step. */
  hint: string;
  next: InterviewStage | null;
}

export const STAGE_ORDER: InterviewStage[] = [
  "capture",
  "ground",
  "enhance",
  "articulate",
  "stress",
  "shape",
  "revisit",
  "done",
];

export const STAGES: Record<InterviewStage, StageMeta> = {
  capture: {
    key: "capture",
    hint: "Say it all, in your words",
    label: "Capture",
    primaryRole: "sounding_board",
    questionCategory: "core",
    next: "ground",
  },
  ground: {
    key: "ground",
    hint: "Find the real problem",
    label: "Ground",
    primaryRole: "archaeologist",
    questionCategory: "grounding",
    next: "enhance",
  },
  enhance: {
    key: "enhance",
    hint: "Make it bigger and better",
    label: "Enhance",
    primaryRole: "amplifier",
    questionCategory: "enhancement",
    next: "articulate",
  },
  articulate: {
    key: "articulate",
    hint: "Give it proper names",
    label: "Articulate",
    primaryRole: "cartographer",
    questionCategory: "articulation",
    next: "stress",
  },
  stress: {
    key: "stress",
    hint: "Find the cracks early",
    label: "Stress",
    primaryRole: "adversary",
    questionCategory: "risk",
    next: "shape",
  },
  shape: {
    key: "shape",
    hint: "Make it buildable",
    label: "Shape",
    primaryRole: "architect",
    questionCategory: "architectural",
    next: "revisit",
  },
  revisit: {
    key: "revisit",
    hint: "Open floor — loose ends",
    label: "Revisit",
    primaryRole: null, // dynamic — the most eager voice leads
    questionCategory: "gap",
    next: "done",
  },
  done: {
    key: "done",
    hint: "The vision, delivered",
    label: "Done",
    primaryRole: null,
    questionCategory: null,
    next: null,
  },
};

// ── Question / hole display metadata ────────────────────────────────────────

export const QUESTION_STATE_LABELS: Record<QuestionState, string> = {
  open: "Open",
  answered: "Answered",
  partially_answered: "Partial",
  dodged: "Dodged",
  deferred: "Deferred",
};

export interface QuestionCategoryMeta {
  key: QuestionCategory;
  label: string;
  icon: LucideIcon;
  /** Chip classes — semantic/chart tokens only, tied to the accent of the
   *  stage primary that raises this category. */
  chip: string;
}

export const QUESTION_CATEGORIES: Record<QuestionCategory, QuestionCategoryMeta> = {
  core: {
    key: "core",
    label: "Core",
    icon: Ear,
    chip: "border-chart-6/40 bg-chart-6/10 text-chart-6",
  },
  grounding: {
    key: "grounding",
    label: "Grounding",
    icon: Landmark,
    chip: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  },
  enhancement: {
    key: "enhancement",
    label: "Enhancement",
    icon: Megaphone,
    chip: "border-chart-1/40 bg-chart-1/10 text-chart-1",
  },
  articulation: {
    key: "articulation",
    label: "Articulation",
    icon: MapIcon,
    chip: "border-chart-2/40 bg-chart-2/10 text-chart-2",
  },
  risk: {
    key: "risk",
    label: "Risk",
    icon: Swords,
    chip: "border-chart-5/40 bg-chart-5/10 text-chart-5",
  },
  architectural: {
    key: "architectural",
    label: "Architectural",
    icon: DraftingCompass,
    chip: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  },
  gap: {
    key: "gap",
    label: "Gap",
    icon: CircleHelp,
    chip: "border-border bg-muted text-muted-foreground",
  },
};

export const HOLE_CLASSIFICATION_LABELS: Record<HoleClassification, string> = {
  fatal: "Fatal",
  unknown: "Unknown",
  undecided: "Undecided",
};

export const HOLE_STATUS_LABELS: Record<HoleStatus, string> = {
  open: "Open",
  patched: "Patched",
  accepted_risk: "Accepted risk",
  needs_human_arbitration: "Needs arbitration",
};
