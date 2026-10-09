// features/education/assessment/data/generateQuestionsFromSources.ts
//
// Resolved Sources → grounded, graded questions, nothing saved. THE one
// question generator behind BOTH "make a quiz / practice test from a source"
// (`quizGenerator.ts`) and "Add more questions" on an existing assessment —
// the twin of `generateCardsFromSources` (flashcards), so a quiz and its
// top-up can never drift apart in grounding, count or de-duplication.
//
//   - segmentedGenerate over the Sources (every Source earns questions; a
//     missed section is reported, never silently cut);
//   - mandate ASSESSMENT_MANDATES.generateQuizFromSource, with the person's
//     steering folded into its `user_request` slot (`foldSteer`) and the types
//     they want in `question_types` — no new agent variable;
//   - questions the assessment already has (same prompt, or a near duplicate)
//     are dropped before the count is filled;
//   - every kept question carries `metadata.batch_id` (and, for a run aimed at
//     one outline section, `metadata.outline_section_id` + `topic`);
//   - citations are backfilled with the durable ids of THEIR OWN Source.

import type { ResolvedSource, ResolvedSourceSet } from "@ai-matrx/agents/sources";
import {
  chunkOwners,
  groundCitations,
} from "@/features/flashcards/data/generateDeckFromSources";
import { sectionRunTitle } from "@/features/education/convert/coverage";
import { foldSteer, questionTypesValue, type GenerationSteer } from "@/features/education/convert/steering";
import {
  isNearDuplicateQA,
  looseKey,
  segmentedGenerate,
} from "@/features/education/convert/segmentedGenerate";
import type { ConvertContext, TargetKind } from "@/features/education/convert/types";
import type { CoverageDepth } from "@/features/education/convert/coverage";
import { ASSESSMENT_MANDATES } from "./mandates";
import { keepNewQuestions, stampQuestion, type ExistingQuestion, type QuestionSection } from "./newQuestions";
import { coerceGeneratedQuiz } from "./useGenerateQuiz";
import type { Depth, NewAssessmentItemInput } from "./types";

export interface QuestionsFromSourcesInput {
  resolved: ResolvedSourceSet;
  /** Total questions asked for; undefined = size to the material (converter). */
  count?: number;
  difficulty: string;
  depth: Depth;
  /** What the sections are titled after (the assessment's title). */
  title: string;
  /** Instruction, types, sections — folded into `user_request` / `question_types`. */
  steer?: GenerationSteer;
  /** Questions the assessment already has — never made again. */
  existing?: readonly ExistingQuestion[];
  /** Groups the questions this run adds (so "Undo" finds exactly them). */
  batchId?: string;
  /** How dense the whole run is (converter fan-out); omitted by the top-up. */
  coverageDepth?: CoverageDepth;
  /** Which converter this run belongs to (metering / mandate surface). */
  targetKind?: TargetKind;
  surfaceKey?: string;
  ctx: ConvertContext;
  timeoutMs?: number;
}

export interface QuestionsFromSourcesOutcome {
  questions: NewAssessmentItemInput[];
  sources: ResolvedSource[];
  /** Sources with text that no kept question came from. */
  unusedSources: ResolvedSource[];
  /** The agent's own title / description for the set (first answered section). */
  agentTitle: string;
  agentDescription: string | null;
  gapNote: string | null;
  sections: number;
  missed: number;
  singlePass: boolean;
  conversationId: string | null;
}

/** The one outline section a run is aimed at, when it is aimed at exactly one with an id. */
export function singleSectionOf(steer: GenerationSteer | undefined): QuestionSection | undefined {
  const only = steer?.sections?.length === 1 ? steer.sections[0] : undefined;
  if (!only) return undefined;
  const id = (only as { id?: unknown }).id;
  return typeof id === "string" && id ? { id, title: only.title } : undefined;
}

export async function generateQuestionsFromSources({
  resolved,
  count,
  difficulty,
  depth,
  title,
  steer = {},
  existing = [],
  batchId,
  coverageDepth,
  targetKind = "quiz",
  surfaceKey = "education-assessment-add-questions",
  ctx,
  timeoutMs = 240_000,
}: QuestionsFromSourcesInput): Promise<QuestionsFromSourcesOutcome> {
  const sources = resolved.sources.filter((s) => s.text.trim().length > 0);
  const lookedUp = resolved.sources.filter((s) => s.ref.delivery === "context" && !s.text.trim());
  if (sources.length === 0 && lookedUp.length > 0) {
    throw new Error(
      `${lookedUp.map((s) => s.label).join(", ")} ${lookedUp.length === 1 ? "is" : "are"} set to "let the AI look it up", which questions cannot use — they are made from the text itself. Open the Source and choose "Include the text".`,
    );
  }
  if (sources.length === 0) {
    throw new Error("None of the Sources had any text to make questions from. Check each Source, or add another.");
  }
  const owners = chunkOwners(resolved);
  const fallback = sources.length === 1 ? sources[0] : null;
  const section = singleSectionOf(steer);
  const types = steer.questionTypes ?? [];
  const userRequest = foldSteer(
    { ...steer, existing: existing.map((e) => e.prompt) },
    "questions",
  );
  let agentTitle = "";
  let agentDescription: string | null = null;

  const covered = await segmentedGenerate<NewAssessmentItemInput>({
    ctx,
    source: { text: sources.map((s) => s.text).join("\n\n"), title },
    targetKind,
    options: { count, difficulty, depth: coverageDepth },
    groups: sources.map((s) => ({ label: s.label, text: s.text })),
    mandateKey: ASSESSMENT_MANDATES.generateQuizFromSource,
    surfaceKey,
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      // The section rides in the label the agent already declares.
      source_label: plan.segments.length > 1 ? sectionRunTitle(title, segment) : title,
      count: String(segment.items),
      difficulty,
      depth,
      question_types: questionTypesValue(types),
      exam_type: "",
      user_request: userRequest,
    }),
    extract: (value) => {
      const generated = coerceGeneratedQuiz(value);
      if (!agentTitle && generated.title) agentTitle = generated.title;
      if (agentDescription === null && generated.description) agentDescription = generated.description;
      return keepNewQuestions(generated.questions, existing, types).map((q) =>
        stampQuestion(
          { ...q, trust: groundCitations(q.trust ?? undefined, owners, fallback) ?? q.trust ?? undefined },
          { batchId, section },
        ),
      );
    },
    // Two sections that cover the same fact ask the same question; ask once.
    identity: (q) => looseKey(q.prompt),
    sameAs: (a, b) =>
      isNearDuplicateQA(
        { question: a.prompt, answer: a.correctAnswer ?? "" },
        { question: b.prompt, answer: b.correctAnswer ?? "" },
      ),
    timeoutMs,
  });

  const unusedSources = [
    ...resolved.sources.filter((s) => !s.text.trim()),
    ...(sources.length > 1
      ? sources.filter((_, g) => !covered.items.some((q) => covered.groupOf(q) === g))
      : []),
  ];
  return {
    questions: covered.items,
    sources,
    unusedSources,
    agentTitle,
    agentDescription,
    gapNote: covered.gapNote,
    sections: covered.plan.segments.length,
    missed: covered.missedCount,
    singlePass: covered.plan.singlePass,
    conversationId: covered.conversationId,
  };
}
