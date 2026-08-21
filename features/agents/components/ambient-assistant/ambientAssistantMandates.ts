const SYSTEM_AMBIENT_MANDATE = "ambient.page_guidance";

const MODULE_AMBIENT_MANDATES: Readonly<Record<string, string>> = {
  data: "data.page_guidance",
  education: "education.page_guidance",
  notes: "notes.page_guidance",
};

const EDUCATION_SECTION_MANDATES: Readonly<Record<string, string>> = {
  admin: "education.admin_guidance",
  "audio-study": "education.audio_study_guidance",
  classes: "education.classes_guidance",
  creator: "education.creator_guidance",
  data: "education.data_guidance",
  "exam-prep": "education.exam_prep_guidance",
  family: "education.family_guidance",
  fastfire: "education.fastfire_guidance",
  features: "education.features_guidance",
  flashcards: "education.flashcards_guidance",
  game: "education.game_guidance",
  "grade-work": "education.grade_work_guidance",
  learn: "education.learn_guidance",
  levels: "education.levels_guidance",
  library: "education.library_guidance",
  media: "education.media_guidance",
  memory: "education.memory_guidance",
  "mind-maps": "education.mind_maps_guidance",
  notes: "education.notes_guidance",
  offline: "education.offline_guidance",
  planner: "education.planner_guidance",
  "practice-oral": "education.practice_oral_guidance",
  "practice-tests": "education.practice_tests_guidance",
  progress: "education.progress_guidance",
  quizzes: "education.quizzes_guidance",
  start: "education.start_guidance",
  "study-aids": "education.study_aids_guidance",
  subjects: "education.subjects_guidance",
  summaries: "education.summaries_guidance",
  tutor: "education.tutor_guidance",
};

export interface AmbientAssistantMandateChain {
  system: string;
  module?: string;
  page?: string;
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
