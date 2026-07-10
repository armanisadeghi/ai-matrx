// features/flashcards/admin/flashcardsAdminMap.ts
//
// Per-feature admin map for the Flashcards tool (/education/flashcards). Lists
// every resource the feature owns: the live routes, the render block that
// surfaces flashcards inline in chat, the canonical data layer (fcService +
// the study hook over the shared study spine), the education.fc_* tables and
// study RPCs it writes through, and the AI agents that will author/grade cards
// (specs in features/education/docs/AGENT_SPECS.md — agents not built yet).
//
// Keep in sync as routes/components are added — the drift warnings on the
// rendered page flag anything under app/(core)/education/flashcards not listed.

import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

export const flashcardsAdminMap: FeatureAdminMap = {
  name: "Flashcards",
  slug: "flashcards",
  description:
    "The flashcard creation + study tool under /education/flashcards. Canonical content lives in the education schema (fc_set / fc_card / fc_detail); studying writes the shared study spine (study_attempt + item_mastery). Today: a list-first browser + set detail + a classic-flip study surface. Creation / AI generation flows are out of scope until the fc_* agents are built (specs in AGENT_SPECS.md).",
  docs: [
    {
      label: "Flashcard agent specs",
      href: "/features/education/docs/AGENT_SPECS.md",
    },
    { label: "Education VISION", href: "/education/VISION-education-hub.md" },
    { label: "Education admin map", href: "/education/admin" },
  ],

  routes: [
    {
      url: "/education/flashcards",
      label: "List home",
      description:
        "Savior list view of all my/shared/public sets, recent-first; click → detail, Study → session.",
      filePath: "app/(core)/education/flashcards/page.tsx",
      status: "Live",
      notes: [
        "Reads fcService.listSets() (RLS-filtered)",
        "New-set / From document / Import buttons route to the three creation flows below",
      ],
    },
    {
      url: "/education/flashcards/new",
      label: "Create from topic (AI)",
      description:
        "CreateFromTopic — generate a set from a free-text topic via fc_generate_from_cards.",
      filePath: "app/(core)/education/flashcards/new/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/new/import",
      label: "Import (CSV/Quizlet)",
      description:
        "ImportSetView — paste/upload CSV/TSV, configurable delimiter, preview, fcService.createSetWithCards.",
      filePath: "app/(core)/education/flashcards/new/import/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/new/from-source",
      label: "Generate from a document (RAG)",
      description:
        "CreateFromSource — two-step wizard: pick a RAG-indexed doc, curate which chunks to include, then fc_generate_from_source. Persists chunk/page lineage on each card's source field.",
      filePath: "app/(core)/education/flashcards/new/from-source/page.tsx",
      status: "Live",
      notes: [
        "Phase 5 of the competitive-parity push",
        "Wires useGenerateCards' GenerateFromSourceVariables path",
      ],
    },
    {
      url: "/education/flashcards/weak-areas",
      label: "Weak-area drill",
      description:
        "WeakAreaDrillSurface — worst-first cross-set drill (struggle_flag / lowest retrievability) over the shared StudyDeck; method='weak_area'.",
      filePath: "app/(core)/education/flashcards/weak-areas/page.tsx",
      status: "Live",
      notes: [
        "Phase 3 of the competitive-parity push",
        "CTA surfaced from StudyProgress's weakAreaHref",
      ],
    },
    {
      url: "/education/flashcards/[setId]",
      label: "Set detail",
      description:
        "Set header (name/topic/count) + card grid (front/back peek + helper/example/audio badges) + audio overview.",
      filePath: "app/(core)/education/flashcards/[setId]/page.tsx",
      status: "Live",
      notes: [
        'Phase 7 added "Generate audio overview" (AudioOverviewSection) → fc_set.audio_overview_file_id',
      ],
    },
    {
      url: "/education/flashcards/[setId]/study",
      label: "Study surface",
      description:
        "Focused classic-flip session: flip, grade (Again/Partial/Got it), keyboard nav, progress, completion summary.",
      filePath: "app/(core)/education/flashcards/[setId]/study/page.tsx",
      status: "Live",
      notes: [
        "Driven by useFlashcardStudy({ withSession: true })",
        "Grading funnels through the shared study spine",
      ],
    },
    {
      url: "/education/flashcards/[setId]/learn",
      label: "Learn mode",
      description:
        "Adaptive within-session reshuffle weighted toward weak cards — a wrong/partial grade requeues the card a few slots ahead instead of never again; ends once every card is mastered once. method='learn'.",
      filePath: "app/(core)/education/flashcards/[setId]/learn/page.tsx",
      status: "Live",
      notes: [
        "Phase 1B of the competitive-parity push",
        "Driven by useFlashcardStudy({ reshuffleWeighted: true, mode: 'learn' }) → the SAME shared StudyDeck",
      ],
    },
    {
      url: "/education/flashcards/[setId]/test",
      label: "Test mode",
      description:
        "Multiple-choice quiz — distractors from sibling cards' back text first (free/instant), topped up via fc_make_quiz_items for small sets. method='test'.",
      filePath: "app/(core)/education/flashcards/[setId]/test/page.tsx",
      status: "Live",
      notes: [
        "Phase 1B of the competitive-parity push",
        "useQuizStudy + buildQuizQuestions (in-set distractors) + makeQuizItems (AI fallback)",
      ],
    },
    {
      url: "/education/flashcards/[setId]/match",
      label: "Match mode",
      description:
        "Timed click-to-pair matching game (front tiles vs back tiles, shuffled onto one board, capped at 8 cards/round). method='match'.",
      filePath: "app/(core)/education/flashcards/[setId]/match/page.tsx",
      status: "Live",
      notes: [
        "Phase 1B of the competitive-parity push",
        "Mismatches are gameplay, not graded — only a completed pair writes a study_attempt",
      ],
    },
    {
      url: "/education/flashcards/[setId]/write",
      label: "Write mode",
      description:
        "Free-typed recall graded against the back text via normalized Levenshtein similarity; user confirms/overrides the suggested grade. method='write'.",
      filePath: "app/(core)/education/flashcards/[setId]/write/page.tsx",
      status: "Live",
      notes: [
        "Phase 1B of the competitive-parity push",
        "responseKind='typed', responseTranscript persisted on the attempt",
      ],
    },
    {
      url: "/education/flashcards/[setId]/edit",
      label: "Edit surface",
      description:
        "Authoring surface (view↔edit split): rename set, edit card front/back inline, add cards. RLS-gated.",
      filePath: "app/(core)/education/flashcards/[setId]/edit/page.tsx",
      status: "Live",
      notes: [
        "VIEW-vs-EDIT permission gate + duplicate-to-edit for sharees is a Wave-5 follow-up",
      ],
    },
    {
      url: "/education/fastfire",
      label: "Fast Fire drill",
      description:
        "Voice-graded, timed flashcard drill (?set=<id> deep-links a set). Web-Audio PCM→WAV capture core.",
      filePath: "app/(core)/education/fastfire/page.tsx",
      status: "Live",
      notes: [
        "Capture core rebuilt on AudioWorklet→PCM→WAV (sample-accurate clips)",
      ],
    },
    {
      url: "/education/fastfire/capture-test",
      label: "Audio capture test (admin)",
      description:
        "Prove-it surface: record cards, play back full-session + per-card WAVs with real durations/waveforms. Admin-only; removable.",
      filePath: "app/(core)/education/fastfire/capture-test/page.tsx",
      status: "Live",
      notes: ["Gated by selectIsAdmin", "Temporary dev aid for the audio core"],
    },
    {
      url: "/education/flashcards/sessions",
      label: "Study history (all sets)",
      description:
        "The learner's study/Fast Fire session history across all sets (mode-agnostic SessionsBrowser over the study spine).",
      filePath: "app/(core)/education/flashcards/sessions/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/sessions/[sessionId]",
      label: "Session detail",
      description:
        "One session: header + aggregate, full recording, holistic review, and the per-attempt ledger (result/score/transcript/audio).",
      filePath: "app/(core)/education/flashcards/sessions/[sessionId]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/[setId]/sessions",
      label: "Sessions for a set",
      description:
        "Study/Fast Fire sessions scoped to one set; rows open the shared session detail.",
      filePath: "app/(core)/education/flashcards/[setId]/sessions/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/review",
      label: "Review due (adaptive)",
      description:
        "Adaptive cross-set study of the FSRS due queue (VISION §2/§16). useDueReview → getCardsByIds + listDue; grades method='adaptive'. Renders the shared StudyDeck.",
      filePath: "app/(core)/education/flashcards/review/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/progress",
      label: "Study progress",
      description:
        "Mastery distribution, accuracy, what's due now, streak, and activity over the shared study spine (VISION §16). Mode-agnostic StudyProgress + StudyTrends (accuracy trend, weekly time, per-topic breakdown).",
      filePath: "app/(core)/education/flashcards/progress/page.tsx",
      status: "Live",
      notes: [
        'Phase 6 added StudyTrends (topicSource="fc_card")',
        "Real planner CRUD lives at /education/planner (education-hub-level tool, not flashcards-specific)",
      ],
    },
    {
      url: "/education/flashcards/admin",
      label: "This admin map",
      description: "Per-feature resource index (admin-gated).",
      filePath: "app/(core)/education/flashcards/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "FlashcardsHome",
      filePath: "features/flashcards/components/home/FlashcardsHome.tsx",
      description:
        "List-first home: loads listSets(), renders set cards with Study affordances + disabled New-set.",
      tier: "internal",
    },
    {
      name: "SetDetailView",
      filePath: "features/flashcards/components/set-detail/SetDetailView.tsx",
      description:
        "Set detail: header + card-peek grid (detail-presence badges) + Study button + back.",
      tier: "internal",
    },
    {
      name: "StudySurface",
      filePath: "features/flashcards/components/study/StudySurface.tsx",
      description:
        "Focused study session over useFlashcardStudy; flip/grade/keyboard + completion summary.",
      tier: "internal",
    },
    {
      name: "StudyDeck",
      filePath: "features/flashcards/components/study/StudyDeck.tsx",
      description:
        'Shared presentational deck reused by every study surface (classic/adaptive/weak-area). Phase 4 added the "Ask AI" tutor affordance (fc_help_live), auto end-of-session batch review (fc_review_batch), and per-card micro-coaching toasts (fc_micro_coach). F1: 1-5 confidence grading (FSRS), cloze flip faces, and a branch to MatchingCardPlayer for matching cards.',
      tier: "internal",
    },
    {
      name: "FlashcardConfidenceRow",
      filePath: "features/flashcards/components/study/FlashcardConfidenceRow.tsx",
      description:
        "F1: the one-tap 1-5 confidence rating row (Brainscape-style) → FSRS grades via recordAttempt({ confidence }). Toggleable with the 3-way FlashcardGradeButton row (persisted).",
      tier: "internal",
    },
    {
      name: "MatchingCardPlayer",
      filePath: "features/flashcards/components/study/MatchingCardPlayer.tsx",
      description:
        "F1: the study interaction for a matching card variant — tap-to-match, self-grades on completion (0 miss=correct, else partial) through the study spine.",
      tier: "internal",
    },
    {
      name: "EditSetView",
      filePath: "features/flashcards/components/editor/EditSetView.tsx",
      description:
        "The set authoring surface: rename set, inline per-card edit, add card (basic/cloze/matching kind menu). F1: debounced autosave with a status indicator (no manual save), a version-history/restore entry point, per-card mastery pills, and the trust footer (verify-against-source) on generated cards. Writes via fcService.",
      tier: "internal",
    },
    {
      name: "SetVersionHistoryDialog",
      filePath: "features/flashcards/components/editor/SetVersionHistoryDialog.tsx",
      description:
        "F1: never-lose-work version restore — lists the set's platform row-versions (get_version_history) and restores any prior version (restore_version, append-only). Opened from the editor's History button.",
      tier: "internal",
    },
    {
      name: "EnhanceSetDialog",
      filePath: "features/flashcards/components/set-detail/EnhanceSetDialog.tsx",
      description:
        '"Make this deeper": per-card enrich (fc_enrich_card → detail layers) + deepen (fc_expand_card → atomic sub-cards) with a depth tier (recall/applied/exam), preview-then-persist. Opened from the set-detail Enhance button (owner/editor only).',
      tier: "internal",
    },
    {
      name: "CreateFromTopic",
      filePath: "features/flashcards/components/create/CreateFromTopic.tsx",
      description:
        "AI generation from a free-text topic — the /new entry point.",
      tier: "internal",
    },
    {
      name: "ImportSetView",
      filePath: "features/flashcards/components/import/ImportSetView.tsx",
      description:
        "CSV/TSV/Quizlet-paste import: configurable delimiter, row preview, createSetWithCards.",
      tier: "internal",
    },
    {
      name: "CreateFromSource",
      filePath: "features/flashcards/components/create/CreateFromSource.tsx",
      description:
        "RAG-sourced generation: DocPickerStep (useLibrary) → CurateStep (chunk checklist via useDocumentChunks) → fc_generate_from_source, with source lineage backfilled from the picked document.",
      tier: "internal",
    },
    {
      name: "WeakAreaDrillSurface",
      filePath: "features/flashcards/components/study/WeakAreaDrillSurface.tsx",
      description:
        "Cross-set worst-first drill query feeding the shared StudyDeck; method='weak_area'.",
      tier: "internal",
    },
    {
      name: "LearnSurface",
      filePath: "features/flashcards/components/study/LearnSurface.tsx",
      description:
        "Phase 1B — Learn mode driver: useFlashcardStudy({ reshuffleWeighted: true, mode: 'learn' }) → the shared StudyDeck (flip/grade/keyboard/tutor/review all reused for free).",
      tier: "internal",
    },
    {
      name: "TestSurface",
      filePath: "features/flashcards/components/study/TestSurface.tsx",
      description:
        "Phase 1B — Test mode: multiple-choice question panel, instant feedback, completion summary. Driven by useQuizStudy.",
      tier: "internal",
    },
    {
      name: "MatchSurface",
      filePath: "features/flashcards/components/study/MatchSurface.tsx",
      description:
        "Phase 1B — Match mode: click-to-pair tile board, live timer, completion summary with time/attempts/accuracy. Driven by useMatchGame.",
      tier: "internal",
    },
    {
      name: "WriteSurface",
      filePath: "features/flashcards/components/study/WriteSurface.tsx",
      description:
        "Phase 1B — Write mode: typed-answer panel with auto-grade (textSimilarity.ts) + confirm/override via the shared grade-button row.",
      tier: "internal",
    },
    {
      name: "AudioOverviewSection",
      filePath:
        "features/flashcards/components/set-detail/AudioOverviewSection.tsx",
      description:
        'Phase 7 — "Generate audio overview" action on set detail. Calls the generic podcast generator (usePodcastRun) with the deck serialized to markdown (podcastOverview.ts), persists the durable file_id to fc_set.audio_overview_file_id, plays back via the shared SessionAudio.',
      tier: "internal",
    },
    {
      name: "CanvasFlashcardsView",
      filePath: "features/flashcards/components/CanvasFlashcardsView.tsx",
      description:
        "Inline canvas study view for a chat-materialized set (the grade-wiring reference).",
      tier: "internal",
    },
    {
      name: "FlashcardItem",
      filePath:
        "components/mardown-display/blocks/flashcards/FlashcardItem.tsx",
      description:
        "The canonical card visual: 3D flip + onReview grade buttons. Reused by every study surface.",
      tier: "internal",
    },
    {
      name: "FlashcardsBlock (render block)",
      filePath:
        "components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx",
      description:
        "Markdown/stream render block that surfaces a flashcard set inline in chat.",
      tier: "internal",
    },
    {
      name: "AudioCaptureDebugPanel",
      filePath:
        "features/flashcards/fast-fire/debug/AudioCaptureDebugPanel.tsx",
      description:
        "Admin-gated real-time view of the capture core (buffer/clock, per-card sample windows, level, worklet vs scriptprocessor). Temporary.",
      tier: "internal",
    },
    {
      name: "CaptureTestSurface",
      filePath:
        "features/flashcards/fast-fire/capture-test/CaptureTestSurface.tsx",
      description:
        "The prove-it surface: exercises the real capture API and plays back full-session + per-card WAVs (decoded duration + waveform). Admin-only.",
      tier: "internal",
    },
  ],

  reduxSlices: [],

  relatedFeatures: [
    {
      name: "Education Hub",
      adminUrl: "/education/admin",
      description:
        "Flashcards is an app-tool under /education; the hub owns the tools registry + access tiers.",
    },
    {
      name: "Canvas / Artifacts",
      description:
        "Chat-generated sets materialize as canvas_items linked to fc_set (CanvasFlashcardsView studies them).",
    },
    {
      name: "Files",
      description:
        "Card source lineage + media (illustration/audio) are fc_card → file association edges.",
    },
  ],
};
