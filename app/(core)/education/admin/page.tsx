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
        "Pure-SEO content library; articles at /learn/[...slug] (JSON-LD).",
      filePath: "app/(core)/education/learn/page.tsx",
      status: "Live",
      notes: [
        "Demo seeded from data/learn-content.ts",
        "Production engine will read education.study_structured_section",
      ],
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
      description: "App tool — placeholder.",
      filePath: "app/(core)/education/quizzes/page.tsx",
      status: "Coming soon",
    },
    {
      url: "/education/practice-tests",
      label: "Practice Tests",
      description: "App tool — placeholder.",
      filePath: "app/(core)/education/practice-tests/page.tsx",
      status: "Coming soon",
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
      description: "App tool — placeholder.",
      filePath: "app/(core)/education/notes/page.tsx",
      status: "Coming soon",
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
        "subjects / levels / exam-prep / study-aids / features / tools / learn-content — add an entry, get a page.",
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
