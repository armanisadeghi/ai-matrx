// app/(core)/education/admin/page.tsx
//
// Per-feature admin map for the Education Hub. Renders via <FeatureAdminPage>
// (admin-gated, utilitarian). Keep this in sync as routes/components are added
// — the drift warnings on the rendered page flag anything under
// app/(core)/education not enumerated here.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const EDUCATION_ADMIN_MAP: FeatureAdminMap = {
  name: "Education Hub",
  slug: "education",
  description:
    "The AI study platform. Two layers under /education: a server-rendered marketing/discovery layer (five axes + a pure-SEO content engine) and an interactive app-tool layer (coming-soon placeholders today). Source of truth for WHAT we build is VISION-education-hub.md.",
  docs: [
    {
      label: "VISION (source of truth)",
      href: "/education/VISION-education-hub.md",
    },
    { label: "Education FEATURE.md", href: "/features/education/FEATURE.md" },
    {
      label: "Entitlements & Billing requirements (forked)",
      href: "/docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md",
    },
  ],
  routeScanPath: "app/(core)/education",

  routes: [
    {
      url: "/education",
      label: "Hub home",
      description:
        "Landing / savior list view into all axes, content, and tools.",
      filePath: "app/(core)/education/page.tsx",
      status: "Live",
    },
    {
      url: "/education/start",
      label: "Universal Ingest — Study Kit (P9)",
      description:
        "The hero onboarding flow: drop/paste/link ANY input (PDF, notes, URL, YouTube) → one grounded, cited study kit (deck + summary + mind map; quiz/audio as P1/P3 register on the converter). Every artifact links a `source` edge to a durable cld_files anchor.",
      filePath: "app/(core)/education/start/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/onboard/** (useIngest → useKitGeneration → StartHero)",
        "Converter contract: features/education/convert/** (convertContent / useContentConverter)",
        "Agents: kit-deck 0de9ff99 · summary 92b607a4 · mindmap d13184d4",
      ],
    },
    {
      url: "/education/data",
      label: "Your data — export/import + pledge (P9)",
      description:
        "Data-ownership back door: export any deck (JSON/Markdown/Anki/CSV) or the whole library as a zip; one-click import from Quizlet/CSV/TSV/Matrx-JSON/Anki .apkg/paste; the anti-lock-in pledge.",
      filePath: "app/(core)/education/data/page.tsx",
      status: "Live",
      notes: [
        "Export/import: features/education/onboard/export|import/** · Anki decode via jszip + sql.js (dynamic import)",
      ],
    },
    {
      url: "/education/summaries/[id]",
      label: "Study summary viewer (P9)",
      description:
        "Grounded study summary (education.study_media, media_kind='summary') — markdown + key points + P0 citations + Markdown export.",
      filePath: "app/(core)/education/summaries/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/subjects",
      label: "Subjects index",
      description:
        "Data-driven from data/subjects.ts; detail at /subjects/[slug].",
      filePath: "app/(core)/education/subjects/page.tsx",
      status: "Live",
    },
    {
      url: "/education/levels",
      label: "Levels index",
      description:
        "Three-band model; detail at /levels/[slug] incl. individual grades.",
      filePath: "app/(core)/education/levels/page.tsx",
      status: "Live",
    },
    {
      url: "/education/exam-prep",
      label: "Exam Prep index",
      description: "Flat exam-keyed entries; detail at /exam-prep/[slug].",
      filePath: "app/(core)/education/exam-prep/page.tsx",
      status: "Live",
    },
    {
      url: "/education/study-aids",
      label: "Study Aids index",
      description: "Content-type axis; detail at /study-aids/[slug].",
      filePath: "app/(core)/education/study-aids/page.tsx",
      status: "Live",
    },
    {
      url: "/education/features",
      label: "Features index",
      description: "Platform differentiators; detail at /features/[slug].",
      filePath: "app/(core)/education/features/page.tsx",
      status: "Live",
    },
    {
      url: "/education/learn",
      label: "Study guides (content engine)",
      description:
        "DB-backed SEO content library; articles at /learn/[...slug] (JSON-LD, ISR).",
      filePath: "app/(core)/education/learn/page.tsx",
      status: "Live",
      notes: [
        "Content in education.learn_doc; reads via features/education/publishing/queries.ts",
        "Authoring at /education/learn/admin (super-admin; publish without deploy)",
      ],
    },
    {
      url: "/education/learn/admin",
      label: "Study-guide authoring",
      description:
        "Super-admin authoring: create / edit / preview / publish learn docs; agent-assisted drafting.",
      filePath: "app/(core)/education/learn/admin/page.tsx",
      status: "Live",
    },
    {
      url: "/education/library",
      label: "Community Library (P6-C)",
      description:
        "Public browse over community decks (edu_public_decks): search, Certified-only facet, view (P7 /p/e), duplicate-to-edit, suggest-edit. Super-admins certify inline.",
      filePath: "app/(core)/education/library/page.tsx",
      status: "Live",
      notes: [
        "Certified tier: education.content_certification (super-admin RPCs edu_certify_content/edu_uncertify_content)",
        "Contribution flywheel: education.deck_suggestion (edu_suggest_edit / edu_resolve_suggestion)",
        "Feature: features/education/library/**",
      ],
    },
    {
      url: "/education/library/suggestions",
      label: "Suggestion inbox",
      description:
        "Deck owner's inbox of suggest-edits on their decks (accept / decline). Signed-in only; RLS + RPC gate to owner.",
      filePath: "app/(core)/education/library/suggestions/page.tsx",
      status: "Live",
    },
    {
      url: "/education/subjects/quick-math",
      label: "Quick Math (relocated)",
      description:
        "Stock algebra lessons relocated from the old (public)/education/math; features/math service+components unchanged.",
      filePath: "app/(core)/education/subjects/quick-math/page.tsx",
      status: "Live",
      notes: [
        "'quick-' marks non-permanent stock content; /subjects/math reserved for the full build",
      ],
    },
    {
      url: "/education/flashcards",
      label: "Flashcard Studio",
      description:
        "App tool — LIVE list-first browser; detail + study under it. See /education/flashcards/admin.",
      filePath: "app/(core)/education/flashcards/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /[setId] (detail), /[setId]/{study,learn,test,match,write} (5 study modes), /admin (feature map)",
        "Creation/AI flows: /new, /new/import, /new/from-source",
      ],
    },
    {
      url: "/education/fastfire",
      label: "FastFire",
      description: "App tool — LIVE. Signature spoken-recall drill with live per-card AI grading.",
      filePath: "app/(core)/education/fastfire/page.tsx",
      status: "Live",
    },
    {
      url: "/education/tutor",
      label: "AI Tutor (home / list)",
      description:
        "App tool — LIVE. Grounded, memory-carrying conversational tutor. List view: start a session or resume past ones. See features/education/tutor/FEATURE.md.",
      filePath: "app/(core)/education/tutor/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /new (fresh session), /[conversationId] (resume)",
        "Built on the agent-execution + conversation infra (education-tutor source_feature)",
        "AskTutor side-panel reachable from flashcard study (StudyDeck)",
      ],
    },
    {
      url: "/education/tutor/new",
      label: "AI Tutor — new session",
      description:
        "Fresh grounded conversation: injects learner memory + own study material as launch grounding, promotes URL to /education/tutor/[conversationId] after first message.",
      filePath: "app/(core)/education/tutor/new/page.tsx",
      status: "Live",
    },
    {
      url: "/education/tutor/[conversationId]",
      label: "AI Tutor — conversation",
      description:
        "Resume a single tutor conversation (view-gated shareable transcript).",
      filePath: "app/(core)/education/tutor/[conversationId]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/quizzes",
      label: "Quiz Builder",
      description:
        "P1 Assessment Engine (quiz kind). List → new (topic/deck/document, depth, type mix) → [id] detail/take → [id]/results → [id]/edit. Grade-on-meaning; grounded citations; spine-recorded.",
      filePath: "features/education/assessment/components/AssessmentHome.tsx",
      status: "Live",
      notes: [
        "/education/quizzes/new — generate (AssessmentCreate)",
        "/education/quizzes/[id] — detail + shareable take URL (?start=1); learning-gain (?phase=/?gain=)",
        "/education/quizzes/[id]/results — scored report (?r=<resultId>)",
        "/education/quizzes/[id]/edit — inline edit + 'make deeper' (EDIT-gated)",
      ],
    },
    {
      url: "/education/practice-tests",
      label: "Practice Tests",
      description:
        "P1 Assessment Engine (practice_test kind) — same engine as quizzes, timed + full-length. Countdown auto-submit; detailed post-test analysis; pre/post learning gain.",
      filePath: "features/education/assessment/components/AssessmentHome.tsx",
      status: "Live",
      notes: [
        "/education/practice-tests/new — configure + generate (timed)",
        "/education/practice-tests/[id] — detail + timed taker",
        "/education/practice-tests/[id]/results — post-test analysis",
        "/education/practice-tests/[id]/edit — edit (EDIT-gated)",
      ],
    },
    {
      url: "/education/audio-study",
      label: "Audio Study",
      description:
        "P3 — generate overview/debate/panel audio from a deck or topic (reuses the podcast pipeline + agent_run recovery); weak-area-adaptive; audio review spoken quiz → study spine. Persists to education.study_media.",
      filePath: "app/(core)/education/audio-study/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /new (generate), /[id] (player + live gen + recovery), /[id]/edit (owner controls), /review (spoken audio-review session, method 'audio_review')",
        "Feature: features/education/media/audio/**",
      ],
    },
    {
      url: "/education/mind-maps",
      label: "Mind Maps",
      description:
        "P3 — AI concept maps from a deck or topic via a diagram_spec agent, rendered with InteractiveDiagramBlock (clickable nodes + inline explanations). Persists to education.study_media.",
      filePath: "app/(core)/education/mind-maps/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /new (generate), /[id] (view), /[id]/edit (owner controls)",
        "Feature: features/education/media/mindmap/** · agent d13184d4-6a46-4b08-aff4-a95b7be93fc5",
      ],
    },
    {
      url: "/education/media/[id]",
      label: "Study Media (shared viewer)",
      description:
        "P3 — the canonical shareable viewer every study_media share link resolves to; dispatches to the audio or mind-map surface by kind. noindex.",
      filePath: "app/(core)/education/media/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/notes",
      label: "Smart Notes",
      description:
        "App tool — LIVE (P4). List-first home over the student's platform notes; New → creates a note. A THIN education skin over features/notes (canonical editor, autosave, sharing, RAG) — no forked note store.",
      filePath: "app/(core)/education/notes/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/notes/** (EduNotesHome · EduNoteWorkspace · EduNoteActionBar · ConvertNoteDialog · LiveCaptureButton · GeneratedArtifactsChips)",
        "Sub-routes: /new (create+open), /[id] + /[id]/edit (EduNoteWorkspace = NotesView single-note + education action bar)",
        "Convert: drives the canonical converter (features/education/convert) — note → deck/summary/mind_map live; quiz/audio light up as P1/P3 register their generators",
        "Live capture: features/audio useChunkedRecordAndTranscribe → appends transcribed chunks to the note (one canonical mic path)",
        "Lineage: artifact --source--> note edges via platform.associations (features/education/notes/service.ts); reverse-lineage chips on the note",
        "Registers the converter `notes` target → Study Notes agent f23562ce (source → grounded structured note)",
      ],
    },
    {
      url: "/education/planner",
      label: "Study Planner",
      description:
        "App tool — LIVE (P5). AI day-by-day plan (Study Planner agent → heuristic fallback) with calendar agenda, adaptive re-plan, anti-burnout load-smoothing; plus the goals tab (study_goal CRUD).",
      filePath: "app/(core)/education/planner/page.tsx",
      status: "Live",
    },
    {
      url: "/education/progress",
      label: "Progress dashboard",
      description:
        "App tool — LIVE (P5). Unified cross-mode analytics: outcome-first stats, mastery, per-mode breakdown, highest-leverage weak areas, AI narrative, learning-gain teaser, trends.",
      filePath: "app/(core)/education/progress/page.tsx",
      status: "Live",
    },
    {
      url: "/education/progress/learning-gain",
      label: "Learning-gain report",
      description:
        "App tool — LIVE (P5). Pre/post improvement report + print/save-as-PDF. Reads P1's learning-gain contract (seed fixtures until P1's table lands).",
      filePath: "app/(core)/education/progress/learning-gain/page.tsx",
      status: "Live",
    },
    {
      url: "/education/flashcards/progress",
      label: "Flashcards progress (redirect)",
      description:
        "Redirects to /education/progress — progress was promoted cross-mode (P5).",
      filePath: "app/(core)/education/flashcards/progress/page.tsx",
      status: "Live",
    },
    {
      url: "/education/game",
      label: "Study Games (Engagement Engine)",
      description:
        "App tool — LIVE (P10). List-first home: Solo Arcade, Host, Join + healthy streak (freezes/rest days), opt-in weekly league (mastery-gain), outcome badges. Play IS review — every answer records to the spine (method='game').",
      filePath: "app/(core)/education/game/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /solo (arcade), /host (create room), /join (by code), /play/[roomId]?code= (live multiplayer)",
        "Realtime: Supabase Broadcast + presence (channel edu-game:<roomId>); only results persist",
        "DB: education.game_room / game_result / game_badge / league_membership + streak forgiveness",
      ],
    },
    {
      url: "/education/game/solo",
      label: "Solo Arcade",
      description:
        "P10 — single-player against your SRS due/weak queue; the daily-habit surface. Heavy client, code-split (ssr:false).",
      filePath: "app/(core)/education/game/solo/page.tsx",
      status: "Live",
    },
    {
      url: "/education/game/host",
      label: "Host a game",
      description:
        "P10 — create a multiplayer room from a deck or your due queue; wires P8 education.game_room_size (max players shown before hosting).",
      filePath: "app/(core)/education/game/host/page.tsx",
      status: "Live",
    },
    {
      url: "/education/game/join",
      label: "Join a game",
      description:
        "P10 — join a room by 5-char code (cross-owner via game_room_by_code RPC). No player tax.",
      filePath: "app/(core)/education/game/join/page.tsx",
      status: "Live",
    },
    {
      url: "/education/game/play/[roomId]",
      label: "Live multiplayer game",
      description:
        "P10 — lobby → play → results. Broadcast roster + per-player SRS queues + comeback power-ups + team/private scoreboard (no speed-shame). Rejoin syncs to host started_at.",
      filePath: "app/(core)/education/game/play/[roomId]/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "EducationHub",
      filePath: "features/education/components/landing/EducationHub.tsx",
      description:
        "Bespoke hub landing composed from the section primitives + axis config.",
      tier: "official",
    },
    {
      name: "Content Converter (contract)",
      filePath: "features/education/convert/useContentConverter.ts",
      description:
        "P9/P4 — the ONE cross-tool dispatch: convertContent({source,targetKind}) + convertMany (kit fan-out). Live generators: deck/summary/mind_map; placeholders: audio(P3)/quiz+practice_test(P1)/notes(P4). See features/education/convert/FEATURE.md.",
      tier: "official",
    },
    {
      name: "StartHero (Universal Ingest)",
      filePath: "features/education/onboard/components/StartHero.tsx",
      description:
        "P9 — the upload-hero flow: input picker (file/paste/link) → kit target picker → live per-target board → linked artifacts. Driven by useKitGeneration + useIngest.",
      tier: "official",
    },
    {
      name: "DataOwnershipPage / ImportDeckPanel",
      filePath: "features/education/onboard/components/DataOwnershipPage.tsx",
      description:
        "P9 — the /education/data back door: pledge + per-deck/all export + one-click import (incl. Anki .apkg). useDataOwnership + importDeck/importAnki + deckFormats.",
      tier: "official",
    },
    {
      name: "SummaryDetail",
      filePath: "features/education/onboard/components/SummaryDetail.tsx",
      description:
        "P9 — the study-summary viewer (study_media 'summary' kind): markdown + key points + P0 citations + Markdown export.",
      tier: "official",
    },
    {
      name: "AxisIndex / AxisDetail",
      filePath: "features/education/components/AxisIndex.tsx",
      description:
        "Data-driven renderers for every axis index + entry page (registry → page).",
      tier: "official",
    },
    {
      name: "SectionRenderer",
      filePath: "features/education/components/sections/SectionRenderer.tsx",
      description:
        "The one place marketing page-body JSX lives; renders the EduSection block union.",
      tier: "official",
    },
    {
      name: "EduHero",
      filePath: "features/education/components/sections/EduHero.tsx",
      description:
        "Canonical hero (LegalLanding house style), used by hub + axes.",
      tier: "official",
    },
    {
      name: "LearnArticle",
      filePath: "features/education/components/LearnArticle.tsx",
      description:
        "Pure-content study-guide renderer with Article JSON-LD + conversion bridge.",
      tier: "official",
    },
    {
      name: "EduComingSoon / EduToolComingSoon",
      filePath: "features/education/components/EduComingSoon.tsx",
      description:
        "The single coming-soon placeholder for every app-tool route.",
      tier: "official",
    },
    {
      name: "StatusPill / AccessTierBadge",
      filePath: "features/education/components/sections/StatusPill.tsx",
      description:
        "Live/Coming-soon pill + Free/Trial/Pro funnel marker (display only).",
      tier: "internal",
    },
    {
      name: "Registries (data/*)",
      filePath: "features/education/data/registry.ts",
      description:
        "subjects / levels / exam-prep / study-aids / features / tools — add a registry entry, get a page. Learn docs are DB-backed (education.learn_doc).",
      tier: "official",
    },
    {
      name: "StudyAnalyticsDashboard",
      filePath:
        "features/education/study/analytics/components/StudyAnalyticsDashboard.tsx",
      description:
        "P5 — the unified cross-mode progress dashboard (/education/progress): outcome-first stats, mastery, per-mode breakdown, weak areas, AI narrative, learning-gain teaser, reuses StudyTrends.",
      tier: "official",
    },
    {
      name: "NarrativeCard",
      filePath:
        "features/education/study/analytics/components/NarrativeCard.tsx",
      description:
        "P5 — renders the Study Analytics Narrator output (headline + insights + deep-linked recommendations).",
      tier: "official",
    },
    {
      name: "StudyTrends",
      filePath: "features/education/study/components/StudyTrends.tsx",
      description:
        "Accuracy-over-time + weekly time-studied charts + per-topic mastery breakdown; reused inside StudyAnalyticsDashboard.",
      tier: "official",
    },
    {
      name: "PlannerWorkspace / StudyPlanView / PlanAgenda",
      filePath:
        "features/education/study/planner/components/PlannerWorkspace.tsx",
      description:
        "P5 — the AI planner surface: generate (agent → heuristic), calendar agenda, adaptive re-plan, anti-burnout load bar + block deep-links.",
      tier: "official",
    },
    {
      name: "StudyPlanner",
      filePath: "features/education/study/components/StudyPlanner.tsx",
      description:
        "study_goal CRUD (create/edit/achieve/archive/delete); the Goals tab of PlannerWorkspace (embedded).",
      tier: "official",
    },
    {
      name: "StudyTodayCard",
      filePath: "features/education/study/dashboard/StudyTodayCard.tsx",
      description:
        "P5 — the authenticated 'what to study next' centerpiece on the education home (plan-of-day + due + weak + goals + streak).",
      tier: "official",
    },
    {
      name: "LearningGainReportView",
      filePath:
        "features/education/study/learning-gain/components/LearningGainReportView.tsx",
      description:
        "P5 — pre/post learning-gain report + print/PDF export (reads P1's contract; seed fixtures until it lands).",
      tier: "official",
    },
    {
      name: "EngageHome",
      filePath: "features/education/engage/components/EngageHome.tsx",
      description:
        "P10 — the /education/game list-first home (Solo/Host/Join + streak + league + badges).",
      tier: "internal",
    },
    {
      name: "PlaySurface",
      filePath: "features/education/engage/components/play/PlaySurface.tsx",
      description:
        "P10 — the shared in-game UI (HUD, MC question, power-up bar, feedback) driven by useGamePlay; used by solo + multiplayer.",
      tier: "internal",
    },
    {
      name: "MultiplayerGameImpl",
      filePath:
        "features/education/engage/components/multiplayer/MultiplayerGameImpl.tsx",
      description:
        "P10 — the live multiplayer surface (lobby → play → results) composing the Broadcast channel + game engine. Code-split via MultiplayerGame.",
      tier: "internal",
    },
    {
      name: "SoloArcadeImpl",
      filePath: "features/education/engage/components/solo/SoloArcadeImpl.tsx",
      description:
        "P10 — the solo arcade round surface. Code-split via SoloArcade (ssr:false).",
      tier: "internal",
    },
    {
      name: "StreakCard",
      filePath: "features/education/engage/components/streak/StreakCard.tsx",
      description:
        "P10 — the healthy-streak surface: current/longest, banked freezes, planned rest-day picker (anti-Duolingo).",
      tier: "internal",
    },
  ],

  relatedFeatures: [
    {
      name: "Math",
      description:
        "features/math powers Quick Math (service + MathProblem renderer).",
    },
    {
      name: "Notes / Podcasts / Scheduling",
      description:
        "Smart Notes, Audio Study, and the Study Planner tools will consume these features when built.",
    },
    {
      name: "Pricing / Entitlements",
      description:
        "Funnel markers (AccessTierBadge) are display-only; enforcement is the forked Entitlements & Billing system.",
    },
    {
      name: "RAG",
      description:
        "The AI Tutor will ground answers in the student's materials via the RAG system.",
    },
  ],
};

export default function EducationAdminPage() {
  return <FeatureAdminPage map={EDUCATION_ADMIN_MAP} />;
}
