/**
 * Surface manifest — Vision Interview (`matrx-user/vision-interview`).
 *
 * `/masterwork/vision-interview` (the session list) and `/masterwork/vision-interview/[sessionId]`
 * (one interview). A session is a multi-round conversation between the user and
 * six named roles (amplifier, cartographer, archaeologist, adversary, architect,
 * scribe) that interrogates a vision statement into a living document, with an
 * Open Questions ledger and a holes register beside it (`interview.*` tables).
 *
 * Declared 2026-08-17: an entirely agent-shaped feature — six role-played
 * agents writing into a shared document — with no surface declaration at all.
 *
 * No `agentRoles` are declared here: the six roles are bound per session in
 * `interview.session.role_bindings`, not by a manifest default, and a role
 * declared here would need a Mandate behind it rather than a raw agent id.
 *
 * Curated groups (band 0-899):
 *   session_identity  Which interview is open and where it stands
 *   the_document      The living document the scribe maintains
 *   ledgers           Open questions and holes
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "session_identity",
    label: "Interview session",
    sortOrder: 100,
    description: "Which interview is open, its vision statement, and its stage.",
  },
  {
    key: "the_document",
    label: "Living document",
    sortOrder: 200,
    description:
      "The section-keyed markdown the Scribe maintains as the interview's output.",
  },
  {
    key: "ledgers",
    label: "Questions & holes",
    sortOrder: 300,
    description:
      "The Open Questions ledger and the holes register that drive the next round.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "session_id",
    label: "Session ID",
    description:
      "UUID of the open interview session. Empty on the session list, where no single interview is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 100,
    group: "session_identity",
  },
  {
    name: "session_title",
    label: "Session title",
    description:
      "Title of the open interview session. Empty when no session is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 110,
    group: "session_identity",
  },
  {
    name: "vision_statement",
    label: "Vision statement",
    description:
      "The user's vision statement — the thing the interview exists to interrogate. Empty when no session is open or the user has not written one yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 120,
    group: "session_identity",
  },
  {
    name: "session_stage",
    label: "Stage",
    description:
      '"expand", "test", "shape", "loop", or "done" — how far the interview has progressed. Empty when no session is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 130,
    group: "session_identity",
  },
  {
    name: "current_round",
    label: "Current round",
    description:
      "Which round the open interview is on, counting from 1. Absent when no session is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 140,
    group: "session_identity",
  },
  {
    name: "session_summary",
    label: "Session summary",
    description:
      "Composite of the open session as one object: { id, title, stage, current_round }. Mirrors the individual session-identity values. Absent when no session is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 150,
    group: "session_identity",
  },
  {
    name: "session_document",
    label: "Living document",
    description:
      "The session's section-keyed markdown document — the interview's actual output, written only by the Scribe. Empty when no session is open or nothing has been written yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    sortOrder: 200,
    group: "the_document",
  },
  {
    name: "open_questions",
    label: "Open questions",
    description:
      "The unresolved entries in the Open Questions ledger, each { question, state, raised_by, round_raised }. Populated when a session is open — empty array when every question is answered. Absent on the session list.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1600,
    sortOrder: 300,
    group: "ledgers",
  },
  {
    name: "open_holes",
    label: "Open holes",
    description:
      "The unresolved entries in the holes register, each { classification, status }. Populated when a session is open — empty array when none are open. A `fatal` hole is the strongest signal that the vision is not ready.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 310,
    group: "ledgers",
  },
];

export const visionInterviewManifest: SurfaceManifest = {
  surfaceName: "matrx-user/vision-interview",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared 2026-08-17 to close an entirely undeclared agent-shaped feature. Not yet audited against the session page's loaded data (turns, per-role bindings, settings), and no runtime emitter is wired.",
  label: "Vision Interview",
  urlPattern: "/masterwork/vision-interview/[sessionId]",
  intro: `<surface_intro>
You are on a Vision Interview: a multi-round interrogation of the user's vision statement by six named roles — amplifier, cartographer, archaeologist, adversary, architect, and scribe. The interview's output is the living document, which ONLY the scribe writes.
Read vision_statement as the thing under examination and session_document as what has been established so far. The Questions & holes group is what the next round exists to close: an open question is unfinished business, and a hole classified fatal means the vision is not ready regardless of how complete the document looks.
session_stage tells you how far along this is; do not push a session toward "done" while fatal holes remain open.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry as emitted in `open_questions`. */
export interface VisionInterviewOpenQuestionEntry {
  question: string;
  state: string;
  raised_by: string | null;
  round_raised: number;
}

/** One entry as emitted in `open_holes`. */
export interface VisionInterviewOpenHoleEntry {
  classification: string;
  status: string;
}

/** Type-safe payload helper. Every value here is route-conditional. */
export function createVisionInterviewScope(values: {
  selection?: string;
  context?: Record<string, unknown>;
  session_id?: string;
  session_title?: string;
  vision_statement?: string;
  session_stage?: string;
  current_round?: number;
  session_summary?: {
    id: string;
    title: string;
    stage: string;
    current_round: number;
  };
  session_document?: string;
  open_questions?: VisionInterviewOpenQuestionEntry[];
  open_holes?: VisionInterviewOpenHoleEntry[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
