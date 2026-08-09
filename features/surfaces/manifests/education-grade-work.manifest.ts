/**
 * Surface manifest — Grade Work (`matrx-user/education-grade-work`).
 *
 * The standalone /education/grade-work "Grade my handwritten work" surface:
 * the learner types the problem (+ an optional model answer / rubric),
 * photographs their worked solution, and the shared vision grading core
 * (features/education/assessment/data/imageGrading.ts — the SAME path the
 * assessment take flow uses) returns a step-level grade pinpointing where the
 * reasoning broke. Grades record to the shared study spine
 * (item_type 'handwritten_work') so they feed mastery + streak.
 *
 * Metered (education.image_grade entitlement) and COPPA-gated — a blocked run
 * opens a dialog before anything starts, so the gates never appear as errors.
 *
 * Curated groups (band 0-899):
 *
 *   problem  What the learner is asking to have graded
 *   grading  The run state + the resolved step-level verdict
 *
 * Emitter: `features/education/assessment/grade-work/GradeWorkSurface.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import type { GradeStep } from "@/features/education/trust/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "problem",
    label: "Problem",
    sortOrder: 100,
    description:
      "What the learner is asking to have graded — the problem statement, the optional model answer / rubric, and whether a photo of their work is attached.",
  },
  {
    key: "grading",
    label: "Grading",
    sortOrder: 200,
    description:
      "Where the grading run is (idle / grading / graded / error) and the resolved step-level verdict once it lands.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Problem ───────────────────────────────────────────────────────────
  {
    name: "problem_text",
    label: "Problem statement",
    description:
      "The problem / question the learner says they solved, exactly as typed. Always present — an empty string until they type it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 300,
    group: "problem",
  },
  {
    name: "expected_answer",
    label: "Model answer / rubric",
    description:
      "The optional model answer or full-credit rubric the learner provided. Always present — an empty string means the grader solves the problem itself and grades against its own solution.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 310,
    group: "problem",
  },
  {
    name: "photo_attached",
    label: "Photo attached",
    description:
      "True when the learner has attached a photo of their worked solution (grading cannot start without one). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "problem",
  },

  // ── Grading ───────────────────────────────────────────────────────────
  {
    name: "grading_status",
    label: "Grading status",
    description:
      'Where the run is: "idle" (composing), "grading" (the vision grader is working), "graded" (a verdict is on screen), or "error". Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 7,
    sortOrder: 400,
    group: "grading",
  },
  {
    name: "grade_result",
    label: "Grade result",
    description:
      'The resolved verdict: "correct", "partial", or "incorrect". Absent until a grade lands (grading_status "graded").',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 410,
    group: "grading",
  },
  {
    name: "grade_explanation",
    label: "Grade explanation",
    description:
      "The grader's meaning-terms explanation of the verdict (why credit was or wasn't earned). Absent until a grade lands.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 420,
    group: "grading",
  },
  {
    name: "grade_misconception",
    label: "Named misconception",
    description:
      "The specific misconception the learner appears to hold, when the grader identified one. Absent otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 430,
    group: "grading",
  },
  {
    name: "grade_steps",
    label: "Step breakdown",
    description:
      "The per-step breakdown of the learner's worked solution as { stepLabel, status, note } — pinpointing exactly where the reasoning broke. Absent until a grade lands, and when the grader returned no steps.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 440,
    group: "grading",
  },
  {
    name: "work_transcription",
    label: "Work transcription",
    description:
      "What the vision grader read from the learner's photo (their handwritten work as text). Absent until a grade lands, and when the grader returned no transcription.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 450,
    group: "grading",
  },
  {
    name: "grade_error",
    label: "Grading error",
    description:
      "The error message when a grading run failed (upload failure, grader failure). Absent on the happy path — present so an agent can help with the real failure.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 460,
    group: "grading",
  },
];

export const educationGradeWorkManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-grade-work",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter shipped for everything the grade-work flow holds. Not yet stamped verified: the DB sync, a live non-matching-name binding test, and the Matrx-vs-matrix context check have not been run; no agent roles are declared (the vision grader resolves via ASSESSMENT_AGENTS.gradeHandwritten, not a surface role); and no `data-surface-value` Locate anchors are tagged.",
  label: "Grade Work",
  urlPattern: "/education/grade-work",
  intro: `<surface_intro>
You are on Grade Work at /education/grade-work — the standalone "grade my handwritten work" lane. The learner types a problem they solved on paper, optionally a model answer or rubric, photographs their worked solution, and a vision grader returns a step-level verdict: overall result, a meaning-terms explanation, any named misconception, and a per-step breakdown of where their reasoning held or broke.
Read grading_status first. In "idle" the learner is composing — the Problem group is what they are about to submit (an empty expected_answer means the grader will solve the problem itself). In "grading" a run is in flight. In "graded" the Grading group is the material to reason about: grade_steps is the most valuable part — it localizes the exact step where the work went wrong, so coach from the step, not just the overall verdict. In "error", grade_error explains a real failure (often an upload problem), not a wrong answer.
Grades here are on meaning, never exact-string, and the learner can rightfully disagree — treat the verdict as evidence, not authority.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationGradeWorkScope(values: {
  // alwaysAvailable: true → required
  problem_text: string;
  expected_answer: string;
  photo_attached: boolean;
  grading_status: string;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  grade_result?: string;
  grade_explanation?: string;
  grade_misconception?: string;
  grade_steps?: GradeStep[];
  work_transcription?: string;
  grade_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
