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
    { label: "VISION (source of truth)", href: "/education/VISION-education-hub.md" },
    { label: "Education FEATURE.md", href: "/features/education/FEATURE.md" },
    { label: "Entitlements & Billing requirements (forked)", href: "/docs/proposals/ENTITLEMENTS_AND_BILLING_REQUIREMENTS.md" },
  ],
  routeScanPath: "app/(core)/education",

  routes: [
    { url: "/education", label: "Hub home", description: "Landing / savior list view into all axes, content, and tools.", filePath: "app/(core)/education/page.tsx", status: "Live" },
    { url: "/education/subjects", label: "Subjects index", description: "Data-driven from data/subjects.ts; detail at /subjects/[slug].", filePath: "app/(core)/education/subjects/page.tsx", status: "Live" },
    { url: "/education/levels", label: "Levels index", description: "Three-band model; detail at /levels/[slug] incl. individual grades.", filePath: "app/(core)/education/levels/page.tsx", status: "Live" },
    { url: "/education/exam-prep", label: "Exam Prep index", description: "Flat exam-keyed entries; detail at /exam-prep/[slug].", filePath: "app/(core)/education/exam-prep/page.tsx", status: "Live" },
    { url: "/education/study-aids", label: "Study Aids index", description: "Content-type axis; detail at /study-aids/[slug].", filePath: "app/(core)/education/study-aids/page.tsx", status: "Live" },
    { url: "/education/features", label: "Features index", description: "Platform differentiators; detail at /features/[slug].", filePath: "app/(core)/education/features/page.tsx", status: "Live" },
    { url: "/education/learn", label: "Study guides (content engine)", description: "Pure-SEO content library; articles at /learn/[...slug] (JSON-LD).", filePath: "app/(core)/education/learn/page.tsx", status: "Live", notes: ["Demo seeded from data/learn-content.ts", "Production engine will read education.study_structured_section"] },
    { url: "/education/subjects/quick-math", label: "Quick Math (relocated)", description: "Stock algebra lessons relocated from the old (public)/education/math; features/math service+components unchanged.", filePath: "app/(core)/education/subjects/quick-math/page.tsx", status: "Live", notes: ["'quick-' marks non-permanent stock content; /subjects/math reserved for the full build"] },
    { url: "/education/flashcards", label: "Flashcard Studio", description: "App tool — LIVE list-first browser; detail + study under it. See /education/flashcards/admin.", filePath: "app/(core)/education/flashcards/page.tsx", status: "Live", notes: ["Sub-routes: /[setId] (detail), /[setId]/study (classic-flip session), /admin (feature map)", "Creation/AI flows pending the fc_* agents"] },
    { url: "/education/fastfire", label: "FastFire", description: "App tool — placeholder (signature feature).", filePath: "app/(core)/education/fastfire/page.tsx", status: "Coming soon" },
    { url: "/education/tutor", label: "AI Tutor", description: "App tool — placeholder.", filePath: "app/(core)/education/tutor/page.tsx", status: "Coming soon" },
    { url: "/education/quizzes", label: "Quiz Builder", description: "App tool — placeholder.", filePath: "app/(core)/education/quizzes/page.tsx", status: "Coming soon" },
    { url: "/education/practice-tests", label: "Practice Tests", description: "App tool — placeholder.", filePath: "app/(core)/education/practice-tests/page.tsx", status: "Coming soon" },
    { url: "/education/audio-study", label: "Audio Study", description: "App tool — placeholder.", filePath: "app/(core)/education/audio-study/page.tsx", status: "Coming soon" },
    { url: "/education/mind-maps", label: "Mind Maps", description: "App tool — placeholder.", filePath: "app/(core)/education/mind-maps/page.tsx", status: "Coming soon" },
    { url: "/education/notes", label: "Smart Notes", description: "App tool — placeholder.", filePath: "app/(core)/education/notes/page.tsx", status: "Coming soon" },
    { url: "/education/planner", label: "Study Planner", description: "App tool — placeholder.", filePath: "app/(core)/education/planner/page.tsx", status: "Coming soon" },
  ],

  components: [
    { name: "EducationHub", filePath: "features/education/components/landing/EducationHub.tsx", description: "Bespoke hub landing composed from the section primitives + axis config.", tier: "official" },
    { name: "AxisIndex / AxisDetail", filePath: "features/education/components/AxisIndex.tsx", description: "Data-driven renderers for every axis index + entry page (registry → page).", tier: "official" },
    { name: "SectionRenderer", filePath: "features/education/components/sections/SectionRenderer.tsx", description: "The one place marketing page-body JSX lives; renders the EduSection block union.", tier: "official" },
    { name: "EduHero", filePath: "features/education/components/sections/EduHero.tsx", description: "Canonical hero (LegalLanding house style), used by hub + axes.", tier: "official" },
    { name: "LearnArticle", filePath: "features/education/components/LearnArticle.tsx", description: "Pure-content study-guide renderer with Article JSON-LD + conversion bridge.", tier: "official" },
    { name: "EduComingSoon / EduToolComingSoon", filePath: "features/education/components/EduComingSoon.tsx", description: "The single coming-soon placeholder for every app-tool route.", tier: "official" },
    { name: "StatusPill / AccessTierBadge", filePath: "features/education/components/sections/StatusPill.tsx", description: "Live/Coming-soon pill + Free/Trial/Pro funnel marker (display only).", tier: "internal" },
    { name: "Registries (data/*)", filePath: "features/education/data/registry.ts", description: "subjects / levels / exam-prep / study-aids / features / tools / learn-content — add an entry, get a page.", tier: "official" },
  ],

  relatedFeatures: [
    { name: "Math", description: "features/math powers Quick Math (service + MathProblem renderer)." },
    { name: "Notes / Podcasts / Scheduling", description: "Smart Notes, Audio Study, and the Study Planner tools will consume these features when built." },
    { name: "Pricing / Entitlements", description: "Funnel markers (AccessTierBadge) are display-only; enforcement is the forked Entitlements & Billing system." },
    { name: "RAG", description: "The AI Tutor will ground answers in the student's materials via the RAG system." },
  ],
};

export default function EducationAdminPage() {
  return <FeatureAdminPage map={EDUCATION_ADMIN_MAP} />;
}
