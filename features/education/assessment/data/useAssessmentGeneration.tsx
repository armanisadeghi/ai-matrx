"use client";

// features/education/assessment/data/useAssessmentGeneration.tsx
//
// THE one "generate a quiz / practice test" path: school-safe COPPA gate →
// metered entitlement check (paywall on a cap, never a started run) → the
// generator mandate (topic, flashcard deck, or Knowledge document — the last
// two cited) → `assessmentService.createWithItems` → record usage on success
// only. The New quiz form (`AssessmentCreate`) and the list's agent target
// (`generate_quizzes` / `generate_practice_tests`) both call `run`, so a
// person and an agent generate exactly the same way and pay exactly the same.
//
// Render `<Gates />` once where the hook is used: it carries the COPPA dialog
// and the paywall, which self-control their visibility.

import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { fcService } from "@/features/flashcards/data/fcService";
import { fetchDocumentChunks } from "@/features/rag/api/document";
import { attachSourceRefs } from "@/features/education/trust/grounding";
import { assessmentService } from "./assessmentService";
import { ASSESSMENT_MANDATES } from "./mandates";
import { useGenerateQuiz } from "./useGenerateQuiz";
import type {
  AssessmentRow,
  AssessmentSourceKind,
  Depth,
  Difficulty,
  NewAssessmentItemInput,
  QuestionType,
} from "./types";
import type { KindConfig } from "../components/kindConfig";

const CHUNK_FETCH_LIMIT = 800;

export type GenerationSource =
  | { mode: "topic"; topic: string }
  | { mode: "deck"; deck: { id: string; name: string } }
  | { mode: "document"; document: { id: string; name: string } };

export interface GenerationRequest {
  source: GenerationSource;
  count: number;
  difficulty: Difficulty;
  depth: Depth;
  /** Empty = automatic mix. */
  questionTypes: QuestionType[];
  examType: string;
  userRequest: string;
  /** Practice tests only; 0 = untimed. */
  timeLimitMinutes: number;
}

export type GenerationOutcome =
  | { status: "created"; assessment: AssessmentRow; questionCount: number }
  /** The person was stopped before spending (COPPA dialog, paywall, plan check). */
  | { status: "blocked"; reason: string }
  | { status: "failed"; error: string };

export function useAssessmentGeneration(config: KindConfig) {
  const { generate, isGenerating, conversationId } = useGenerateQuiz();
  const entitlement = useEntitlementGuard(config.capability);
  const coppa = useAiComplianceGate();

  const run = async (req: GenerationRequest): Promise<GenerationOutcome> => {
    if (!(await coppa.ensureAllowed()))
      return { status: "blocked", reason: "This account needs a parent's approval before using AI." };
    let outcome: GenerationOutcome = {
      status: "blocked",
      reason: `The ${config.noun} generations included in this plan are used up for now.`,
    };
    const verdict = await entitlement.guard(async () => {
      outcome = await generateAndSave(req);
    });
    if (!verdict.allowed && verdict.reason === "resolver_error")
      return { status: "blocked", reason: "The plan check could not be reached. Try again." };
    return outcome;
  };

  const generateAndSave = async (req: GenerationRequest): Promise<GenerationOutcome> => {
    const safeCount = Math.min(config.countMax, Math.max(1, req.count || 1));
    const sharedVars = {
      count: safeCount,
      difficulty: req.difficulty,
      depth: req.depth,
      question_types: req.questionTypes.join(","),
      exam_type: req.examType.trim(),
      user_request: req.userRequest.trim(),
    };
    try {
      let generated;
      let sourceKind: AssessmentSourceKind;
      let sourceId: string | null = null;
      let sourceTitle: string | null = null;
      let attach: ((q: NewAssessmentItemInput) => NewAssessmentItemInput) | null = null;
      const src = req.source;

      if (src.mode === "topic") {
        sourceKind = "topic";
        generated = await generate(ASSESSMENT_MANDATES.generateQuiz, {
          topic: src.topic.trim(),
          grade_level: "",
          ...sharedVars,
        });
      } else if (src.mode === "deck") {
        sourceKind = "deck";
        sourceId = src.deck.id;
        sourceTitle = src.deck.name;
        const setRes = await fcService.getSetWithCards(src.deck.id);
        const cards = setRes.data?.cards ?? [];
        if (cards.length === 0)
          return { status: "failed", error: "That deck has no cards to build from." };
        const sourceContent = cards
          .map((c) => `### Card ${c.id}\nQ: ${c.front}\nA: ${c.back}`)
          .join("\n\n");
        generated = await generate(ASSESSMENT_MANDATES.generateQuizFromSource, {
          source_content: sourceContent,
          source_label: src.deck.name,
          ...sharedVars,
        });
      } else {
        sourceKind = "source";
        sourceId = src.document.id;
        sourceTitle = src.document.name;
        const chunks = (await fetchDocumentChunks(src.document.id, { limit: CHUNK_FETCH_LIMIT }))
          .slice()
          .sort((a, b) => a.chunk_index - b.chunk_index);
        if (chunks.length === 0)
          return { status: "failed", error: "That document has no processed passages yet." };
        const sourceContent = chunks
          .map((c) => {
            const pages = c.page_numbers?.length ? ` (page ${c.page_numbers.join(", ")})` : "";
            return `### Chunk ${c.chunk_id}${pages}\n${c.content_text}`;
          })
          .join("\n\n");
        const pageByChunk = new Map(
          chunks.map((c) => [c.chunk_id, c.page_numbers?.length ? c.page_numbers[0] : undefined]),
        );
        const doc = src.document;
        attach = (q) => ({
          ...q,
          trust: attachSourceRefs(q.trust, {
            documentId: doc.id,
            title: doc.name,
            pageForCitation: (cit) => (cit.sourceId ? pageByChunk.get(cit.sourceId) : undefined),
          }),
        });
        generated = await generate(ASSESSMENT_MANDATES.generateQuizFromSource, {
          source_content: sourceContent,
          source_label: doc.name,
          ...sharedVars,
        });
      }

      const items = attach ? generated.questions.map(attach) : generated.questions;
      const timeLimitSeconds =
        config.timed && req.timeLimitMinutes > 0 ? req.timeLimitMinutes * 60 : null;
      const topicText = src.mode === "topic" ? src.topic.trim() : sourceTitle;
      const created = await assessmentService.createWithItems(
        {
          assessmentKind: config.kind,
          title: generated.title || topicText || config.label,
          description: generated.description,
          status: "ready",
          sourceKind,
          sourceId,
          sourceTitle,
          topic: topicText,
          examType: req.examType.trim() || null,
          depth: req.depth,
          timeLimitSeconds,
          config: {
            count: safeCount,
            difficulty: req.difficulty,
            depth: req.depth,
            questionTypes: req.questionTypes,
            examType: req.examType.trim() || null,
            timeLimitSeconds,
            userRequest: req.userRequest.trim() || null,
          },
          metadata: { question_count: items.length },
        },
        items,
      );
      if (created.error || !created.data)
        return { status: "failed", error: created.error ?? `Could not save the ${config.noun}` };
      // Metered action SUCCEEDED — record real usage. Failed branches return
      // first, so a failed generation never burns quota.
      await entitlement.commit();
      return {
        status: "created",
        assessment: created.data.assessment,
        questionCount: items.length,
      };
    } catch (e) {
      return {
        status: "failed",
        error: e instanceof Error ? e.message : `Failed to generate the ${config.noun}`,
      };
    }
  };

  const Gates = () => (
    <>
      <coppa.Gate />
      <entitlement.Paywall />
    </>
  );

  return {
    run,
    isGenerating,
    conversationId,
    isChecking: entitlement.isChecking,
    /** Uses left this period (`null` = unlimited) — for the approval wording. */
    remaining: entitlement.remaining,
    /** Server-truth plan check without spending. */
    check: entitlement.check,
    Gates,
  };
}
