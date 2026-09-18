/**
 * THE AMBIENT LADDER — typed, not just imported (V-L6a, 2026-09-17).
 *
 * The lookup tables used to be `Record<string, string>`: they read their values
 * out of `MANDATE_KEYS`, but nothing stopped a hand-typed or stale value on
 * either side, and nothing stopped the chain handing a plain `string` down to
 * `useMandate`. `MandateKey` is now the value type end to end, so a renamed or
 * retired guidance key fails `pnpm type-check` here, at the ladder, instead of
 * arriving at `GET /mandates/{key}/resolution` as a 404 the user never sees.
 */
import { MANDATE_KEYS, type MandateKey } from "@ai-matrx/agents/mandates";

const SYSTEM_AMBIENT_MANDATE = MANDATE_KEYS.ambient__page_guidance;

const MODULE_AMBIENT_MANDATES: Readonly<Record<string, MandateKey>> = {
  data: MANDATE_KEYS.data__page_guidance,
  education: MANDATE_KEYS.education__page_guidance,
  notes: MANDATE_KEYS.notes__page_guidance,
};

const EDUCATION_SECTION_MANDATES: Readonly<Record<string, MandateKey>> = {
  admin: MANDATE_KEYS.education__admin_guidance,
  "audio-study": MANDATE_KEYS.education__audio_study_guidance,
  classes: MANDATE_KEYS.education__classes_guidance,
  creator: MANDATE_KEYS.education__creator_guidance,
  data: MANDATE_KEYS.education__data_guidance,
  "exam-prep": MANDATE_KEYS.education__exam_prep_guidance,
  family: MANDATE_KEYS.education__family_guidance,
  fastfire: MANDATE_KEYS.education__fastfire_guidance,
  features: MANDATE_KEYS.education__features_guidance,
  flashcards: MANDATE_KEYS.education__flashcards_guidance,
  game: MANDATE_KEYS.education__game_guidance,
  "grade-work": MANDATE_KEYS.education__grade_work_guidance,
  learn: MANDATE_KEYS.education__learn_guidance,
  levels: MANDATE_KEYS.education__levels_guidance,
  library: MANDATE_KEYS.education__library_guidance,
  media: MANDATE_KEYS.education__media_guidance,
  memory: MANDATE_KEYS.education__memory_guidance,
  "mind-maps": MANDATE_KEYS.education__mind_maps_guidance,
  notes: MANDATE_KEYS.education__notes_guidance,
  offline: MANDATE_KEYS.education__offline_guidance,
  planner: MANDATE_KEYS.education__planner_guidance,
  "practice-oral": MANDATE_KEYS.education__practice_oral_guidance,
  "practice-tests": MANDATE_KEYS.education__practice_tests_guidance,
  progress: MANDATE_KEYS.education__progress_guidance,
  quizzes: MANDATE_KEYS.education__quizzes_guidance,
  start: MANDATE_KEYS.education__start_guidance,
  "study-aids": MANDATE_KEYS.education__study_aids_guidance,
  subjects: MANDATE_KEYS.education__subjects_guidance,
  summaries: MANDATE_KEYS.education__summaries_guidance,
  tutor: MANDATE_KEYS.education__tutor_guidance,
};

export interface AmbientAssistantMandateChain {
  system: MandateKey;
  module?: MandateKey;
  page?: MandateKey;
}

/**
 * Most-specific-first configuration for the ambient assistant's initial Agent.
 * Unbound page/module mandates intentionally fall through to the shared system
 * mandate; binding one in Administration activates that override immediately.
 */
export function ambientAssistantMandateChain(
  pathname: string,
): AmbientAssistantMandateChain {
  const segments = pathname.split("/").filter(Boolean);
  const moduleSlug = segments[0];
  const sectionSlug = segments[1];

  return {
    system: SYSTEM_AMBIENT_MANDATE,
    module: moduleSlug ? MODULE_AMBIENT_MANDATES[moduleSlug] : undefined,
    page:
      moduleSlug === "education" && sectionSlug
        ? EDUCATION_SECTION_MANDATES[sectionSlug]
        : undefined,
  };
}
