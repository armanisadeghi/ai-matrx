// features/vision-interview/types.ts
//
// Row types for the five `interview.*` tables + role/stage metadata.
//
// NOTE — hand-declared row types: the `interview` schema is not yet in
// `types/database.types.ts` (this container cannot run `pnpm db-types`).
// On the next `pnpm db-types` these declarations are REPLACED by
// `Database["interview"]["Tables"][...]["Row"]` aliases — do not let the two
// drift; the generated types win.

import type { LucideIcon } from "lucide-react";
import {
  DraftingCompass,
  Landmark,
  Map as MapIcon,
  Megaphone,
  PenLine,
  Swords,
} from "lucide-react";

// ── Enums (mirror the live DB CHECK constraints) ────────────────────────────

export type InterviewStage = "expand" | "test" | "shape" | "loop" | "done";

export type RoleKey =
  | "amplifier"
  | "cartographer"
  | "archaeologist"
  | "adversary"
  | "architect"
  | "scribe";

/** `interview.turn.speaker` — the human or one of the six role keys. */
export type Speaker = "human" | RoleKey;

export type QuestionState =
  | "open"
  | "answered"
  | "partially_answered"
  | "dodged"
  | "deferred";

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
  stage: InterviewStage;
  current_round: number;
  run_id: string | null;
  role_bindings: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
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
  created_at: string;
  updated_at: string;
}

/** `interview.question` — the living Open Questions ledger. */
export interface InterviewQuestionRow {
  id: string;
  session_id: string;
  question: string;
  state: QuestionState;
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

export const ROLE_ORDER: RoleKey[] = [
  "amplifier",
  "cartographer",
  "archaeologist",
  "adversary",
  "architect",
  "scribe",
];

export const ROLES: Record<RoleKey, RoleMeta> = {
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
 * Resolve a workflow node id to the role speaking through it. Node ids carry
 * the role key (e.g. `role_amplifier`, `role_adversary_2`) per the backend
 * contract.
 */
export function roleFromNodeId(nodeId: string | null | undefined): RoleKey | null {
  if (!nodeId) return null;
  const lower = nodeId.toLowerCase();
  for (const key of ROLE_ORDER) {
    if (lower.includes(key)) return key;
  }
  return null;
}

// ── Stage metadata ──────────────────────────────────────────────────────────

export interface StageMeta {
  key: InterviewStage;
  label: string;
  /** Which roles the router activates in this stage (Scribe runs every round). */
  activeRoles: RoleKey[];
  next: InterviewStage | null;
}

export const STAGE_ORDER: InterviewStage[] = [
  "expand",
  "test",
  "shape",
  "loop",
  "done",
];

export const STAGES: Record<InterviewStage, StageMeta> = {
  expand: {
    key: "expand",
    label: "Expand",
    activeRoles: ["amplifier", "cartographer", "scribe"],
    next: "test",
  },
  test: {
    key: "test",
    label: "Test",
    activeRoles: ["archaeologist", "adversary", "scribe"],
    next: "shape",
  },
  shape: {
    key: "shape",
    label: "Shape",
    activeRoles: ["architect", "scribe"],
    next: "loop",
  },
  loop: {
    key: "loop",
    label: "Loop",
    // In loop, activation is hole-driven (fatal→Amplifier, unknown→Cartographer,
    // undecided→Architect); all are candidates.
    activeRoles: [
      "amplifier",
      "cartographer",
      "architect",
      "adversary",
      "scribe",
    ],
    next: "done",
  },
  done: {
    key: "done",
    label: "Done",
    activeRoles: [],
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
