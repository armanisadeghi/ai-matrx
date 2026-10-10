// features/education/kits/generate/runKitGenerate.ts
//
// The kit chat's generate door (living-kit W4), headless. It does exactly what
// the kit's dialogs do, with no dialog:
//   - a NEW aid  → the converter contract (`convert`) the Make more dialog drives,
//     with the same steering and the same lineage write;
//   - MORE cards into a deck → the Add more cards run (`generateCardsFromSources`
//     over the kit's Sources, the kit Outline, kit-wide dedupe, `fcService.addCards`);
//   - MORE questions into a quiz / practice test → the Add more questions run
//     (`generateQuestionsFromSources`, `assessmentService.addItems`).
// Metering, the age gate and the run marker belong to the caller
// (`KitGenerateRunner`), the same guards the dialogs wear.

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { sourcesClient } from "@/features/resource-manager/source-input/sourceSetApi";
import {
  backfillFileIds,
  deckLineageResult,
  generateCardsFromSources,
  lineageSourceOf,
  plannedCardCount,
} from "@/features/flashcards/data/generateDeckFromSources";
import { fcService } from "@/features/flashcards/data/fcService";
import { undoCardBatch } from "@/features/flashcards/data/undoCardBatch";
import { asCardKind } from "@/features/flashcards/utils/cardVariants";
import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { generateQuestionsFromSources } from "@/features/education/assessment/data/generateQuestionsFromSources";
import { undoAddedQuestions } from "@/features/education/assessment/components/AddMoreQuestionsButton";
import { isDepth, QUESTION_TYPES, type QuestionType } from "@/features/education/assessment/data/types";
import { emptyRunMessage } from "@/features/education/convert/segmentedGenerate";
import { readDeckItems, readExistingKitItems, readQuestionItems } from "@/features/education/convert/existingItems";
import { recordLineageForSources, recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import { announceLineage } from "@/features/education/convert/announceLineage";
import { gapSections, newBatchId, type GenerationSteer } from "@/features/education/convert/steering";
import type { ConvertContext, ConvertProgress, ConvertResult, ConvertSource, TargetKind } from "@/features/education/convert/types";
import { leastCoveredSections, readKitOutline, readOutlineGroups } from "../outline/outlineService";
import type { OutlineSection } from "../outline/types";
import { KIT_TOKEN } from "../kitScope";
import type { StudyKit } from "../kitService";
import type { KitGenerateRequest } from "../kitWrites";
import type { RecoveredKitMaterial } from "../recoverKitMaterial";

/** Cards one chat request makes when it names no count (the Add more dialog's own default). */
export const KIT_GENERATE_DEFAULT_COUNT = 10;

export interface KitGenerateOutcome {
  /** One line naming what was added and where. */
  summary: string;
  href: string | null;
  /** Takes the added items back out; resolves a problem sentence or null. */
  undo?: () => Promise<string | null>;
}

export interface KitGenerateDeps {
  kit: StudyKit;
  request: KitGenerateRequest;
  orgId: string;
  ctx: ConvertContext;
  /** The per-run card limit (the `flashcards.max_cards_per_run` knob). */
  maxCards: number;
  /** Reads the kit's material for a NEW aid (the same recovery Make more uses). */
  recover: () => Promise<RecoveredKitMaterial>;
  /** Cards / questions per section already in the kit (for "focus on gaps"). */
  coverage?: { cards: ReadonlyMap<string, number>; questions: ReadonlyMap<string, number> };
  onStatus: (line: string) => void;
  onRequestId?: (id: string) => void;
  convert: (request: { source: ConvertSource; targetKind: TargetKind; options?: { count?: number; steer?: GenerationSteer } }, onRequestId?: (id: string) => void) => Promise<ConvertResult>;
  /** Called just before a save is sent (tab-bound run safety). */
  saving: () => Promise<void>;
  settle: () => void;
}

const STEERED = new Set<string>(["deck", "quiz", "practice_test"]);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function outlineOf(kit: StudyKit): Promise<OutlineSection[]> {
  return kit.sourceType === KIT_TOKEN ? readKitOutline(kit.sourceId) : [];
}

function aimedSections(all: OutlineSection[], ids: readonly string[]): OutlineSection[] {
  return ids.length ? all.filter((s) => ids.includes(s.id)) : [];
}

/** The kit's Sources as a SourceSet, direct delivery — what the top-up dialogs resolve. */
async function resolveKitSources(kit: StudyKit, orgId: string) {
  const refs =
    kit.sourceType === KIT_TOKEN
      ? kit.sources.map((s) => createSourceRef(s.type, s.id, { delivery: "direct" }))
      : [createSourceRef(kit.sourceType, kit.sourceId, { delivery: "direct" })];
  if (refs.length === 0) throw new Error("Add a source to this kit first.");
  return backfillFileIds(await sourcesClient.resolve(createSourceSet(refs), { organizationId: orgId }));
}

export async function runKitGenerate(deps: KitGenerateDeps): Promise<KitGenerateOutcome> {
  const { request } = deps;
  if (request.into && request.kind === "deck") return addCardsToDeck(deps);
  if (request.into) return addQuestionsToAssessment(deps);
  return makeNewAid(deps);
}

async function makeNewAid(deps: KitGenerateDeps): Promise<KitGenerateOutcome> {
  const { kit, request, orgId } = deps;
  deps.onStatus("Reading your material…");
  const recovered = await deps.recover();
  const source: ConvertSource = {
    text: recovered.text,
    title: kit.title || recovered.origin.title || "Study material",
    ref: recovered.ref,
  };
  let steer: GenerationSteer | undefined;
  if (STEERED.has(request.kind)) {
    const outline = await outlineOf(kit);
    const counts = request.kind === "deck" ? deps.coverage?.cards : deps.coverage?.questions;
    const sections = request.sectionIds.length
      ? aimedSections(outline, request.sectionIds)
      : outline.length && counts
        ? gapSections(outline, counts)
        : undefined;
    steer = {
      instruction: request.instruction,
      ...(request.kind === "deck" ? { cardKinds: request.cardKinds.map(asCardKind) } : { questionTypes: request.questionTypes.filter((t): t is QuestionType => (QUESTION_TYPES as readonly string[]).includes(t)) }),
      sections,
    };
  }
  deps.onStatus("Making it…");
  const result = await deps.convert(
    { source, targetKind: request.kind, options: { count: request.count, steer } },
    deps.onRequestId,
  );
  announceLineage(result.lineage, () => recordSourceLineage(result, source, orgId), { inKit: Boolean(source.ref?.kitId) });
  return { summary: `Created "${result.title}"${result.detail ? ` (${result.detail})` : ""} in this kit.`, href: result.href };
}

async function addCardsToDeck(deps: KitGenerateDeps): Promise<KitGenerateOutcome> {
  const { kit, request, orgId, ctx } = deps;
  const into = request.into!;
  const asked = Math.min(request.count ?? KIT_GENERATE_DEFAULT_COUNT, deps.maxCards);
  const count = plannedCardCount(Math.max(1, asked), 1);
  deps.onStatus("Reading your material…");
  const resolved = await resolveKitSources(kit, orgId);
  deps.onStatus(`Making ${plural(count, "new card", "new cards")}…`);
  const inKit = kit.sourceType === KIT_TOKEN;
  const deckItems = await readDeckItems([into.id]);
  const kitItems = inKit ? await readExistingKitItems(kit.sourceId, "cards") : deckItems;
  const outline = await outlineOf(kit);
  const perSection = new Map<string, number>();
  for (const c of kitItems) if (c.sectionId) perSection.set(c.sectionId, (perSection.get(c.sectionId) ?? 0) + 1);
  const picked = request.sectionIds.length ? aimedSections(outline, request.sectionIds) : leastCoveredSections(outline, perSection, count);
  const groups = inKit && picked.length > 0 ? await readOutlineGroups(kit.sourceId, picked.map((s) => s.id)) : null;
  const batchId = newBatchId();
  const made = await generateCardsFromSources({
    resolved,
    count,
    difficulty: "medium",
    depth: "recall",
    title: into.title || "Your deck",
    existingCards: kitItems.map((c) => ({ front: c.text, back: c.answer })),
    outline: groups,
    steer: { instruction: request.instruction, cardKinds: request.cardKinds.map(asCardKind) },
    batchId,
    ctx: { ...ctx, onProgress: (p: ConvertProgress) => deps.onStatus(p.total > 1 ? `Making ${plural(count, "new card", "new cards")} — part ${Math.min(p.done + 1, p.total)} of ${p.total}…` : `Making ${plural(count, "new card", "new cards")}…`) },
  });
  if (made.cards.length === 0) {
    throw new Error(emptyRunMessage(made, "cards", made.gapNote ?? "Nothing new came out of this material — the deck already covers it."));
  }
  deps.onStatus("Adding them to the deck…");
  await deps.saving();
  const added = await fcService.addCards(into.id, made.cards, { orgId, startPosition: deckItems.length });
  if (added.error) throw new Error(added.error);
  deps.settle();
  const result = deckLineageResult(into.id, into.title || "Your deck", `${made.cards.length} more cards`);
  const linkSources = made.sources.map(lineageSourceOf);
  announceLineage(await recordLineageForSources(result, linkSources, orgId), () => recordLineageForSources(result, linkSources, orgId));
  return {
    summary: `Added ${plural(made.cards.length, "card", "cards")} to "${into.title}"${made.gapNote ? ` — ${made.gapNote}` : ""}.`,
    href: result.href,
    undo: async () => (await undoCardBatch(into.id, batchId)).error ?? null,
  };
}

async function addQuestionsToAssessment(deps: KitGenerateDeps): Promise<KitGenerateOutcome> {
  const { kit, request, orgId, ctx } = deps;
  const into = request.into!;
  const asked = Math.max(1, request.count ?? KIT_GENERATE_DEFAULT_COUNT);
  deps.onStatus("Reading your material…");
  const resolved = await resolveKitSources(kit, orgId);
  const assessmentRes = await assessmentService.getAssessment(into.id);
  const assessment = assessmentRes.data;
  if (!assessment) throw new Error(assessmentRes.error ?? "That quiz could not be opened.");
  const inKit = kit.sourceType === KIT_TOKEN;
  const ownItems = await readQuestionItems([into.id]);
  const existing = inKit ? await readExistingKitItems(kit.sourceId, "questions") : ownItems;
  const outline = await outlineOf(kit);
  const perSection = new Map<string, number>();
  for (const q of existing) if (q.sectionId) perSection.set(q.sectionId, (perSection.get(q.sectionId) ?? 0) + 1);
  const sections = request.sectionIds.length
    ? aimedSections(outline, request.sectionIds)
    : outline.length
      ? gapSections(outline, perSection)
      : undefined;
  const steer: GenerationSteer = {
    instruction: request.instruction,
    questionTypes: request.questionTypes.filter((t): t is QuestionType => (QUESTION_TYPES as readonly string[]).includes(t)),
    sections,
  };
  const batchId = newBatchId();
  deps.onStatus(`Making ${plural(asked, "question", "questions")}…`);
  const made = await generateQuestionsFromSources({
    resolved,
    count: asked,
    difficulty: "Medium",
    depth: assessment.depth && isDepth(assessment.depth) ? assessment.depth : request.kind === "practice_test" ? "exam" : "applied",
    title: assessment.title,
    steer,
    existing: existing.map((q) => ({ prompt: q.text, correctAnswer: q.answer })),
    batchId,
    targetKind: request.kind === "practice_test" ? "practice_test" : "quiz",
    surfaceKey: `education-add-more-${request.kind === "practice_test" ? "practice-tests" : "quizzes"}`,
    ctx: { ...ctx, onProgress: (p: ConvertProgress) => deps.onStatus(p.total > 1 ? `Making ${plural(asked, "question", "questions")} — part ${Math.min(p.done + 1, p.total)} of ${p.total}…` : `Making ${plural(asked, "question", "questions")}…`) },
  });
  if (made.questions.length === 0) {
    throw new Error(emptyRunMessage(made, "questions", made.gapNote ?? "Nothing new came out of this material. Try a different focus."));
  }
  deps.onStatus("Adding them to the list…");
  await deps.saving();
  const added = await assessmentService.addItems(assessment.id, made.questions, { startPosition: ownItems.length });
  if (added.error || !added.data) throw new Error(added.error ?? "The questions could not be saved.");
  deps.settle();
  const base = request.kind === "practice_test" ? "practice-tests" : "quizzes";
  const result = {
    targetKind: request.kind as TargetKind,
    artifactId: assessment.id,
    resourceType: "assessment",
    href: `/education/${base}/${assessment.id}`,
    title: assessment.title,
    detail: `${plural(made.questions.length, "question", "questions")} more`,
  };
  const linkSources = made.sources.map(lineageSourceOf);
  announceLineage(await recordLineageForSources(result, linkSources, orgId), () => recordLineageForSources(result, linkSources, orgId));
  const ids = added.data.map((row) => row.id);
  return {
    summary: `Added ${plural(ids.length, "question", "questions")} to "${assessment.title}"${made.gapNote ? ` — ${made.gapNote}` : ""}.`,
    href: result.href,
    undo: () => undoAddedQuestions(ids),
  };
}
