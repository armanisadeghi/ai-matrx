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
// COVERAGE (2026-08-21): both kinds used to send the whole source in ONE call
// with a hardcoded count (10 / 20), so a 77-slide deck produced a 10-question
// quiz about its opening slides — and the practice test produced 10 too, because
// "up to 20" over a whole textbook is a number a model talks itself down from.
// They now run through `segmentedGenerate`, which covers every section of the
// material and sizes the assessment to it (`features/education/convert/coverage.ts`).
//
// Reuses the SAME grounded from-source mandate (ASSESSMENT_MANDATES.generateQuizFromSource)
// and the SAME payload coercion (coerceGeneratedQuiz) as the interactive create
// surface — no forked generation path. Provenance is recorded BOTH ways, like the
// other converter generators: the flat source_kind/source_id columns (fast filter
// + learning-gain matching) AND the canonical `source` association edge to the
// origin (recordSourceLineage — the polymorphic lineage every kit/convert surface
// reads). Every item carries its TrustEnvelope through unchanged; document-anchored
// sources get openable citations backfilled.

import { assessmentService } from "./assessmentService";
import { generateQuestionsFromSources } from "./generateQuestionsFromSources";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "@/features/education/convert/types";
import type { AssessmentKind, Depth } from "./types";
import {
  RESOLVED_SOURCE_SET_KIND,
  createSourceRef,
  type ResolvedSourceSet,
} from "@ai-matrx/agents/sources";
import type { ConvertSource } from "@/features/education/convert/types";

/**
 * The converter's one pasted/ingested source as the resolved shape the ONE
 * question generator reads. Its anchor (file / document / entity) rides the
 * ref so citations open the real material, exactly as before.
 */
function resolvedFromConvertSource(source: ConvertSource): ResolvedSourceSet {
  const ref = source.ref;
  const type = ref?.fileId
    ? "file"
    : ref?.processedDocumentId
      ? "processed_document"
      : (ref?.entityType ?? "text");
  const id = ref?.fileId ?? ref?.processedDocumentId ?? ref?.entityId ?? "source";
  return {
    __kind: RESOLVED_SOURCE_SET_KIND,
    sources: [
      {
        ref: createSourceRef(type, id),
        label: source.title ?? "Study material",
        form_used: "text",
        text: source.text,
        segments: [],
        ...(ref?.fileId ? { file_id: ref.fileId } : {}),
        ...(ref?.processedDocumentId ? { processed_document_id: ref.processedDocumentId } : {}),
        state: "ready",
        truncated: false,
        notes: [],
      },
    ],
    dropped: [],
    total_chars: source.text.length,
  };
}

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

    const covered = await generateQuestionsFromSources({
      resolved: resolvedFromConvertSource(source),
      count: options?.count,
      difficulty: options?.difficulty ?? "Medium",
      depth: defaults.depth,
      title: source.title ?? "Study material",
      steer: { instruction: options?.focus },
      coverageDepth: options?.depth,
      targetKind: kind,
      surfaceKey: `education-convert-${defaults.base}`,
      ctx,
    });
    const agentTitle = covered.agentTitle;
    const agentDescription = covered.agentDescription;

    const items = covered.questions;
    if (items.length === 0) {
      throw new Error(
        `The ${defaults.label.toLowerCase()} generator returned no usable questions`,
      );
    }
    const count = items.length;

    // On a multi-section run the agent's title names a section, not the whole
    // assessment, so the source's own title wins.
    const finalTitle = covered.singlePass
      ? agentTitle || source.title || `${defaults.label} from source`
      : source.title || agentTitle || `${defaults.label} from source`;

    const created = await assessmentService.createWithItems(
      {
        assessmentKind: kind as AssessmentKind,
        title: finalTitle,
        description: agentDescription,
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
    const result: ConvertResult = {
      targetKind: kind,
      artifactId: assessmentId,
      resourceType: "assessment",
      href: `/education/${defaults.base}/${assessmentId}`,
      title: finalTitle,
      // The per-item TrustEnvelopes carry the citations; surface the first as the
      // artifact-level trust signal for the kit results card.
      trust: items[0]?.trust ?? null,
      detail: covered.gapNote
        ? `${items.length} question${items.length === 1 ? "" : "s"} - ${covered.gapNote}`
        : `${items.length} question${items.length === 1 ? "" : "s"}`,
    };

    // Canonical `source` lineage edge → the origin (ingest anchor file OR the
    // source entity for an entity-sourced convert). Parity with every other
    // generator; the flat source columns above stay for filter/learning-gain.
    await recordSourceLineage(result, source, ctx.orgId);

    return result;
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
  // Per-kind metering, matching kindConfig (quiz vs practice_test are separate caps).
  capability: "education.practice_test_generate",
  run: makeRun("practice_test"),
};
