// features/education/intelligence-places.ts
//
// WHERE EACH EDUCATION JOB RUNS — drawn on /intelligence/education
// (flashcards have their own page). Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts,
// which also follows the feature's key maps listed in `aliases`.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { ASSESSMENT_MANDATES } from "./assessment/data/mandates";
import { CONVERT_MANDATES } from "./convert/mandates";
import { EDU_MEDIA_MANDATES } from "./media/mindmap/mandates";
import { EDU_MEMORY_MANDATES } from "./memory/mandates";
import { NOTES_MANDATES } from "./notes/mandates";
import { SPOKEN_PRACTICE_MANDATES } from "./spoken-practice/mandates";
import { STUDY_MANDATES } from "./study/planner/mandates";
import { EDU_TUTOR_MANDATES, TUTOR_MANDATE_KEY } from "./tutor/mandates";

const K = MANDATE_KEYS;

/** The page assistant's per-section jobs — every `education.*_guidance` key. */
const GUIDANCE = (Object.values(MANDATE_KEYS) as string[]).filter(
  (key) => key.startsWith("education.") && key.endsWith("_guidance"),
);

export const EDUCATION_PLACES: FeaturePlaces = {
  feature: "education",
  label: "Education",
  aliases: {
    ASSESSMENT_MANDATES,
    CONVERT_MANDATES,
    EDU_MEDIA_MANDATES,
    EDU_MEMORY_MANDATES,
    NOTES_MANDATES,
    SPOKEN_PRACTICE_MANDATES,
    STUDY_MANDATES,
    EDU_TUTOR_MANDATES,
    TUTOR_MANDATE_KEY,
  },
  roots: ["features/education", "app/(core)/education"],
  places: [
    {
      id: "tutor",
      label: "Tutor",
      trigger: "Every tutor reply",
      urlPattern: "/education/tutor/new",
      mandateKeys: [K.education__tutor_message],
      sources: ["features/education/tutor/components/EducationTutorClient.tsx"],
    },
    {
      id: "voice-tutor",
      label: "Flashcard study",
      trigger: "Talk it through with the voice tutor",
      mandateKeys: [K.education__voice_tutor],
      sources: ["features/flashcards/components/study/VoiceTutorPanel.tsx"],
    },
    {
      id: "quiz-create",
      label: "New quiz",
      trigger: "Generate questions (from a topic or your material)",
      urlPattern: "/education/quizzes/new",
      mandateKeys: [K.education__quiz_generate, K.education__quiz_generate_from_source],
      sources: [
        "features/education/assessment/components/create/AssessmentCreate.tsx",
        "features/education/assessment/data/quizGenerator.ts",
      ],
    },
    {
      id: "quiz-deepen",
      label: "A quiz",
      trigger: "Go deeper on a question",
      urlPattern: "/education/quizzes/[id]",
      mandateKeys: [K.education__quiz_deepen_item],
      sources: ["features/education/assessment/data/deepenItem.ts"],
    },
    {
      id: "grade-work",
      label: "Grade my work",
      trigger: "Grade handwritten work",
      urlPattern: "/education/grade-work",
      mandateKeys: [K.education__grade_handwritten],
      sources: [
        "features/education/assessment/data/grading.ts",
        "features/education/assessment/data/imageGrading.ts",
      ],
    },
    {
      id: "convert",
      label: "Make more from this",
      trigger: "Turn content into notes, a quiz, a mind map, a memory aid or a summary",
      mandateKeys: [
        K.education__notes_generate,
        K.education__quiz_generate,
        K.education__mindmap_generate,
        K.education__memory_generate,
        K.education__summarize,
      ],
      sources: [
        "features/education/convert/ConvertContentDialog.tsx",
        "features/education/convert/generators/summary.ts",
        "features/education/convert/generators/memoryAid.ts",
        "features/education/convert/generators/mindMap.ts",
      ],
    },
    {
      id: "memory",
      label: "New memory aid",
      trigger: "Generate",
      urlPattern: "/education/memory/new",
      mandateKeys: [K.education__memory_generate],
      sources: [
        "features/education/memory/components/MemoryNew.tsx",
        "features/education/memory/useGenerateMemoryAid.ts",
      ],
    },
    {
      id: "memory-hint",
      label: "A memory aid",
      trigger: "Give me a hint",
      urlPattern: "/education/memory/[id]",
      mandateKeys: [K.education__memory_hint],
      sources: [
        "features/education/memory/components/MemoryAidButton.tsx",
        "features/education/memory/lanes/memoryHint.ts",
      ],
    },
    {
      id: "mind-map",
      label: "New mind map",
      trigger: "Generate",
      urlPattern: "/education/mind-maps/new",
      mandateKeys: [K.education__mindmap_generate],
      sources: [
        "features/education/media/mindmap/components/MindMapNew.tsx",
        "features/education/media/mindmap/useGenerateMindMap.ts",
      ],
    },
    {
      id: "notes",
      label: "New study notes",
      trigger: "Generate",
      urlPattern: "/education/notes/new",
      mandateKeys: [K.education__notes_generate],
      sources: ["features/education/notes/notesGenerator.ts"],
    },
    {
      id: "spoken-practice",
      label: "Oral practice",
      trigger: "Build the session, grade answers and pronunciation, review",
      urlPattern: "/education/practice-oral",
      mandateKeys: [
        K.education__spoken_practice_design,
        K.education__spoken_practice_design_language,
        K.education__spoken_practice_grade,
        K.education__spoken_practice_grade_pronunciation,
        K.education__spoken_practice_review,
      ],
      sources: [
        "features/education/spoken-practice/data/generateSession.ts",
        "features/education/spoken-practice/data/gradePracticeAnswer.ts",
        "features/education/spoken-practice/data/reviewPracticeSession.ts",
        "features/education/study/components/BatchReviewBlock.tsx",
      ],
    },
    {
      id: "planner",
      label: "Study planner",
      trigger: "Make my plan",
      urlPattern: "/education/planner",
      mandateKeys: [K.education__plan_generate],
      sources: ["features/education/study/planner/usePlannerAgent.ts"],
    },
    {
      id: "progress",
      label: "Progress",
      trigger: "What your numbers mean",
      urlPattern: "/education/progress",
      mandateKeys: [K.education__analytics_narrate],
      sources: ["features/education/study/analytics/useAnalyticsNarrative.ts"],
    },
    {
      id: "kit-title",
      label: "New study kit",
      trigger: "Name the kit",
      urlPattern: "/education/kits",
      mandateKeys: [K.education__kit_title],
      sources: ["features/education/onboard/kitTitle.ts"],
    },
    {
      id: "assistant",
      label: "Every education page",
      trigger: "Floating page assistant",
      urlPattern: "/education",
      mandateKeys: [K.education__page_guidance, ...GUIDANCE],
      sources: ["features/agents/components/ambient-assistant/ambientAssistantMandates.ts"],
    },
  ],
};
