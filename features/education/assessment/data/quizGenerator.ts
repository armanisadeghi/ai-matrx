// features/education/assessment/data/quizGenerator.ts
//
// Converter-contract generators (features/education/convert) for the `quiz` and
// `practice_test` TargetKinds. Source text → a grounded, graded assessment
// persisted via `assessmentService.createWithItems`, so it lands in
// `education.assessment` exactly like a quiz created from the UI — RLS, org
// stamping, item org-inherit, and the study spine all apply unchanged.
//
// Registering these lights the "Quiz" / "Practice test" targets up on the P9
// upload-kit fan-out and the P4 note→quiz one-click convert — no picker change.
//
// Reuses the SAME grounded from-source agent (ASSESSMENT_AGENTS.generateQuizFromSource)
// and the SAME payload coercion (coerceGeneratedQuiz) as the interactive create
// surface — no forked generation path. Provenance is single-valued (source_kind/
// source_id columns, the study_media precedent), not a polymorphic edge — so no
// association token is minted here. Every item carries its TrustEnvelope through
// unchanged; document-anchored sources get openable citations backfilled.

import { assessmentService } from "./assessmentService";
import { ASSESSMENT_AGENTS } from "./agents";
import { coerceGeneratedQuiz } from "./useGenerateQuiz";
import { attachSourceRefs } from "@/features/education/trust/grounding";
import { runAgentExtraction } from "@/features/education/convert/runAgentExtraction";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "@/features/education/convert/types";
import type {
  AssessmentKind,
  Depth,
  NewAssessmentItemInput,
} from "./types";

/** Per-kind defaults: practice tests are longer, deeper, and timed. */
const KIND_DEFAULTS: Record<
  "quiz" | "practice_test",
  { count: number; depth: Depth; timeLimitSeconds: number | null; base: string; label: string }
> = {
  quiz: { count: 10, depth: "applied", timeLimitSeconds: null, base: "quizzes", label: "Quiz" },
  practice_test: {
    count: 20,
    depth: "exam",
    timeLimitSeconds: 1200,
    base: "practice-tests",
    label: "Practice test",
  },
};

function makeRun(kind: "quiz" | "practice_test") {
  const defaults = KIND_DEFAULTS[kind];
  return async function run(
    request: ConvertRequest,
    ctx: ConvertContext,
  ): Promise<ConvertResult> {
    const { source, options } = request;
    if (!source.text.trim()) {
      throw new Error("The source has no text to build questions from");
    }

    const count = Math.max(1, options?.count ?? defaults.count);
    const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
      agentId: ASSESSMENT_AGENTS.generateQuizFromSource,
      surfaceKey: `education-convert-${defaults.base}`,
      sourceFeature: "education-ingest",
      variables: {
        source_content: source.text,
        source_label: source.title ?? "",
        count: String(count),
        difficulty: options?.difficulty ?? "Medium",
        depth: defaults.depth,
        question_types: "",
        exam_type: "",
        user_request: options?.focus ?? "",
      },
      timeoutMs: 240_000,
      onRequestId: ctx.onRequestId,
    });

    const generated = coerceGeneratedQuiz(extracted.value);

    // Backfill openable citations for a document/file-anchored source so each
    // item's TrustEnvelope points at the passage it came from (TRUST mandate).
    const anchorFileId = source.ref?.fileId;
    const items: NewAssessmentItemInput[] = anchorFileId
      ? generated.questions.map((q) => ({
          ...q,
          trust: attachSourceRefs(q.trust, {
            documentId: anchorFileId,
            title: source.title ?? generated.title,
          }),
        }))
      : generated.questions;

    const finalTitle =
      generated.title || source.title || `${defaults.label} from source`;

    const created = await assessmentService.createWithItems(
      {
        assessmentKind: kind as AssessmentKind,
        title: finalTitle,
        description: generated.description,
        status: "ready",
        // Single-valued provenance via the source columns (the study_media
        // precedent) — a converted artifact traces back to its ingested source.
        sourceKind: "source",
        sourceId: source.ref?.processedDocumentId ?? source.ref?.fileId ?? null,
        sourceTitle: source.title ?? null,
        topic: source.title ?? null,
        examType: null,
        depth: defaults.depth,
        timeLimitSeconds: defaults.timeLimitSeconds,
        config: {
          count,
          difficulty: options?.difficulty ?? "Medium",
          depth: defaults.depth,
          questionTypes: [],
          timeLimitSeconds: defaults.timeLimitSeconds,
          userRequest: options?.focus ?? null,
        },
        metadata: { question_count: items.length, converted_from: source.ref?.kind ?? "source" },
        orgId: ctx.orgId,
      },
      items,
    );
    if (created.error || !created.data) {
      throw new Error(created.error ?? `Failed to save the ${defaults.label.toLowerCase()}`);
    }

    const assessmentId = created.data.assessment.id;
    return {
      targetKind: kind,
      artifactId: assessmentId,
      resourceType: "assessment",
      href: `/education/${defaults.base}/${assessmentId}`,
      title: finalTitle,
      // The per-item TrustEnvelopes carry the citations; surface the first as the
      // artifact-level trust signal for the kit results card.
      trust: items[0]?.trust ?? null,
      detail: `${items.length} question${items.length === 1 ? "" : "s"}`,
    };
  };
}

export const quizGenerator: ConvertGenerator = {
  targetKind: "quiz",
  label: "Quiz",
  available: true,
  capability: "education.quiz_generate",
  run: makeRun("quiz"),
};

export const practiceTestGenerator: ConvertGenerator = {
  targetKind: "practice_test",
  label: "Practice test",
  available: true,
  capability: "education.quiz_generate",
  run: makeRun("practice_test"),
};
