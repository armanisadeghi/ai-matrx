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
      url: "/education/memory",
      label: "Memory Aids",
      description:
        "VISION §11 — AI mnemonics, analogies/memory bridges, and memory-palace scaffolding from a deck or topic. Structured aids persist to education.study_media (media_kind='memory_aid', content in ir_envelope). TrustEnvelope on every set; converter target 'memory_aid'; proactive per-card affordance in the flashcards StudyDeck.",
      filePath: "app/(core)/education/memory/page.tsx",
      status: "Live",
      notes: [
        "Sub-routes: /new (generate), /[id] (view), /[id]/edit (owner controls, EDIT-gated)",
        "Feature: features/education/memory/** · agents: memory_aid 826aaa26-baaf-4e87-b5a3-2e4bba37f053 · memory_hint 4c5dd04a-4b22-43cd-bd8b-781a4d6dedb5",
        "Metered: education.memory_generate (useEntitlementGuard + EntitlementMeter, limit shown pre-action)",
      ],
    },
    {
      url: "/education/media/[id]",
      label: "Study Media (shared viewer)",
      description:
        "P3 — the canonical shareable viewer every study_media share link resolves to; dispatches to the audio / mind-map / memory-aid surface by kind. noindex.",
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
        "Feature: features/education/notes/** (EduNotesHome · EduNoteWorkspace · EduNoteActionBar · LiveCaptureButton) — Convert dialog + reverse-lineage chips are the shared primitives in features/education/convert",
        "Sub-routes: /new (create+open), /[id] + /[id]/edit (EduNoteWorkspace = NotesView single-note + education action bar)",
        "Convert: drives the canonical converter via the shared ConvertContentDialog (features/education/convert) — all seven targets live (deck/notes/quiz/practice_test/summary/mind_map/audio)",
        "Live capture: features/audio useChunkedRecordAndTranscribe → appends transcribed chunks to the note (one canonical mic path)",
        "Lineage: artifact --source--> note edges via platform.associations (recordSourceLineage in features/education/convert); reverse-lineage chips (GeneratedFromChips) on the note",
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
      url: "/education/practice-oral",
      label: "Spoken Practice (oral exam / interview / debate)",
      description:
        "App tool — LIVE. Voice-first spoken practice in three modes. Reuses the FastFire continuous mic capture + crown-jewel spoken grader + the study spine (method = mode: 'oral_exam' | 'interview_prep' | 'debate'); prompts designed by a new session-designer agent, graded on meaning, closed by the reused batch 'professor' review. Deep-link a mode via ?mode=. NO new table — the session is a study_session (settings.prompts jsonb); each answer is a study_attempt (item_type 'spoken_prompt', response_kind 'spoken').",
      filePath: "app/(core)/education/practice-oral/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/spoken-practice/** (SpokenPracticeSurface · useSpokenPractice · generateSession · grounding)",
        "New agent: Spoken Practice Session Designer e1d9c1f7-c523-4e7a-8090-a74495cdc58f (gemini-3.5-flash); grader reuses FC_AGENTS.gradeSpoken; review reuses the tutor reviewSession lane",
        "Metered via education.spoken_practice (enforced:false); grounded via TrustEnvelope (per-prompt confidence)",
      ],
    },
    {
      url: "/education/grade-work",
      label: "Grade My Handwritten Work (vision, step-by-step)",
      description:
        "App tool — LIVE. Photograph a worked math/science/free-response problem → a vision AI (Gemini Flash) reads the handwriting, grades ON MEANING against the problem/rubric, and returns a StepGradeVerdict pinpointing exactly where the reasoning broke. Also wired INTO the assessment take flow: any written_response/short_answer item can be answered by photo. NO new table — each standalone problem is a study_attempt (item_type 'handwritten_work', response_kind 'handwritten', response_image_file_id set); assessment photo answers record under item_type 'assessment_item' with response_kind 'handwritten'.",
      filePath: "app/(core)/education/grade-work/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/assessment/grade-work/** (GradeWorkSurface · useGradeWork · GradeWorkClient) + shared primitives HandwrittenWorkInput + StepBreakdown + data/imageGrading.ts (upload→vision grader→coerce)",
        "New agent: Trust — Grade Handwritten Work (Vision) 77db0f64-15a3-43dd-96f7-ec9380057be8 (Gemini Flash Latest, vision); output = GradeVerdict core + steps[] + transcription (coerceStepGradeVerdict, features/education/trust)",
        "Grading branch: gradeAnswerImage in features/education/assessment/data/grading.ts (does NOT fork the grader — the image branch of grade-on-meaning)",
        "Metered via education.image_grade (enforced:false; 20/day + 8/1h burst); photo travels through fileHandler only (system-files/image-grade)",
      ],
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
    {
      url: "/education/family",
      label: "Family / Guardian dashboard",
      description:
        "VISION §14 — the parent/guardian hub (list-first). A guardian follows a linked student's study time, mastery, weak areas, trends, and learning gain (READ-ONLY). Serves both sides of the consented link on one page: guardian roster + request-access + sent requests; student consent inbox + direct grant. Access is ALWAYS student-consented; every read is re-checked by the guardian_* RPCs.",
      filePath: "app/(core)/education/family/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/family/** (FamilyDashboard · StudentProgressView · GuardianConsentVerifyDialog · familyService · useGuardianStudents · useGuardianStudentAnalytics) — see features/education/family/FEATURE.md",
        "DB: education.guardian_link (consent link, status pending/active/revoked + verifiable-consent cols consent_method/verified_at/verification_ref) + public.guardian_* SECURITY DEFINER RPCs (migrations/edu_guardian_link.sql, edu_guardian_verifiable_consent.sql)",
        "Verifiable parental consent (COPPA §312.5): a guardian verifies an under-13 link via card ($0.50 auth-and-void, Stripe) → guardian_confirm_verification (service-only, via the Stripe webhook) stamps verified_at → edu_coppa_gate flips to allow. Revoke re-blocks.",
        "Reuse: read-only consumer of the P5 StudyAnalyticsView + computeAnalytics + learningGainService.buildGainReport — NO parallel analytics engine",
      ],
    },
    {
      url: "/education/family/[studentId]",
      label: "Student progress (guardian, read-only)",
      description:
        "Server-gated read-only view of ONE linked student's cross-mode progress. The Server Component resolves guardian_list_links and 404s unless an ACTIVE guardian link to studentId exists; the client read RPCs re-check on every call. noindex.",
      filePath: "app/(core)/education/family/[studentId]/page.tsx",
      status: "Live",
    },
    {
      url: "/education/classes",
      label: "My Classes (W2 Per-Class Hub — list)",
      description:
        "W2-class-hub.md. List-first home for a student's classes. Scopes-native: a class is a SCOPE under a per-user 'Class' scope type (slug='class') in the personal org — created on demand via the canonical create_scope_type/create_scope RPCs. No new tables. Create/edit a class (name, teacher, term, period, exam dates in scope.settings).",
      filePath: "app/(core)/education/classes/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/classes/** (useClasses · useClassContent · ClassesHome · ClassHubView · ClassFormDialog · ClassPicker · AddClassContentSheet) — see features/education/classes/FEATURE.md",
        "Reuse: legacy scope thunks (features/agent-context/redux/scope) for CRUD; NO new scope semantics",
        "DB: zero DDL — class=scope, exam dates=scope.settings JSONB, content↔class=platform.associations",
      ],
    },
    {
      url: "/education/classes/[classId]",
      label: "Per-Class Hub (course workspace)",
      description:
        "The course-scoped hub. Aggregates everything tagged to the class scope (decks/quizzes/notes/media/files) via the class scope's INCOMING platform.associations edges (reuses useContainerLinks + useEntityTitles), plus the class exam calendar with 'plan around this' deep-links to the planner. 'Add content' opens the UniversalAssociationPicker against the class scope. Access is inherited from scope RLS + per-item useAccess — a non-owner resolves nothing.",
      filePath: "app/(core)/education/classes/[classId]/page.tsx",
      status: "Live",
      notes: [
        "classId param accepts a scope id OR slug (selectScopeBySlugOrId semantics)",
        "Tagging from an artifact: <ClassPicker entityType entityId /> (thin EntityScopeTagger wrapper locked to the Class scope type) — wired into flashcard SetDetailView",
      ],
    },
    {
      url: "/education/creator",
      label: "Creator page (manage) — Convergence C",
      description:
        "CONVERGENCE_C_CREATORS.md. The authed creator dashboard: claim a unique public handle, edit identity (name/tagline/bio/links), and pick which YouTube videos + public free tools + classes to feature; publish toggle. Signed-in only (noindex); every creator_* RPC is gated on auth.uid() owning the row. The PUBLIC page is /c/[handle].",
      filePath: "app/(core)/education/creator/page.tsx",
      status: "Live",
      notes: [
        "Feature: features/education/creators/** (CreatorDashboard · service.ts direct-RPC path · youtube.ts)",
        "DB: extends users.profiles (creator_handle/public/tagline/bio/links/featured) — ZERO new tables; migrations/education_creator_profiles.sql",
        "RPCs: creator_claim_handle / creator_handle_available / creator_get_mine / creator_update_profile / creator_set_public (authed) + creator_public_page (anon)",
        "Reuses useClasses for the class picker; consumes the documented edu_class_join contract (not yet landed) via EnrollButton",
      ],
    },
    {
      url: "/c/[handle]",
      label: "Public creator landing page (SEO) — Convergence C",
      description:
        "The growth lever: a public, INDEXABLE, server-rendered landing page for each creator. Features their YouTube videos (nocookie embeds), public free tools (flashcard sets/guides → /p/e viewer, usable logged-out), and classes with enroll CTAs. Free-vs-paid layout + signup funnel. Person + Course JSON-LD, per-page OG image, sitemap entry. Anon read via creator_public_page RPC; force-dynamic (view-source has full content).",
      filePath: "app/(public)/c/[handle]/page.tsx",
      status: "Live",
      notes: [
        "Route lives in (public); components in features/education/creators/components/** (CreatorLandingPage · YouTubeEmbed · EnrollButton)",
        "OG image: app/(public)/c/[handle]/opengraph-image.tsx (reuses renderEduOgImage)",
        "Sitemap: getCreatorSitemapPaths() wired into the education sitemap; /c/<handle> per published creator",
        "Anonymous funnel: free flashcards usable via /p/e + DuplicateToEditButton; sign-up CTAs redirect back to /c/<handle>",
      ],
    },
  ],

  components: [
    {
      name: "Creator landing page + dashboard (CreatorLandingPage / CreatorDashboard / EnrollButton / YouTubeEmbed)",
      filePath: "features/education/creators/components/CreatorLandingPage.tsx",
      description:
        "Convergence C creator surface. CreatorLandingPage = the public /c/[handle] page (server-rendered, JSON-LD Person/Course, free-vs-paid layout, signup funnel). CreatorDashboard = the authed manage UI (claim handle, edit identity, feature videos/tools/classes, publish). EnrollButton = leaf client island consuming the edu_class_join contract. Extends users.profiles (zero new tables). See features/education/creators/FEATURE.md.",
      tier: "official",
    },
    {
      name: "Per-Class Hub (ClassesHome / ClassHubView / ClassFormDialog / ClassPicker / AddClassContentSheet)",
      filePath: "features/education/classes/components/ClassHubView.tsx",
      description:
        "W2 Per-Class Hub. ClassesHome = class list; ClassHubView = the course workspace (aggregated content + exam dates). ClassPicker is the importable 'tag this artifact to a class' control (EntityScopeTagger locked to the Class scope type). AddClassContentSheet = UniversalAssociationPicker against the class scope. Hooks: useClasses (scope CRUD) + useClassContent (useContainerLinks aggregation). No new tables. See features/education/classes/FEATURE.md.",
      tier: "official",
    },
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
        "P9/P4 — the ONE cross-tool dispatch: convertContent({source,targetKind}) + convertMany (kit fan-out). Live generators: deck/summary/mind_map/memory_aid/notes/quiz/practice_test/audio. See features/education/convert/FEATURE.md.",
      tier: "official",
    },
    {
      name: "MemoryAidView / MemoryHome / MemoryNew / MemoryDetail",
      filePath: "features/education/memory/components/MemoryAidView.tsx",
      description:
        "VISION §11 Memory Tools surface: list-first home, generate (deck/topic → memory_aid agent), and the aid viewer (mnemonics/analogies/palace + trust). MemoryAidButton is the opt-in proactive per-card affordance mounted in StudyDeck.",
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
      name: "StudyAnalyticsView",
      filePath:
        "features/education/study/analytics/components/StudyAnalyticsView.tsx",
      description:
        "P5 — the PURE, presentation-only progress surface (stats, mastery, per-mode, weak areas, learning-gain teaser, trends). Fed folded data; readOnly strips study-action CTAs. Shared by the self dashboard AND the guardian dashboard so the surface never forks.",
      tier: "official",
    },
    {
      name: "StudyAnalyticsDashboard",
      filePath:
        "features/education/study/analytics/components/StudyAnalyticsDashboard.tsx",
      description:
        "P5 — the SELF data wrapper over StudyAnalyticsView (/education/progress): owns the current user's data path (useStudyAnalytics + AI narrator + learning-gain fetch).",
      tier: "official",
    },
    {
      name: "FamilyDashboard",
      filePath: "features/education/family/components/FamilyDashboard.tsx",
      description:
        "VISION §14 — the /education/family hub (list-first): guardian roster (→ read-only student progress), request-access + sent requests, student consent inbox + direct grant. Consent-first; driven by useGuardianStudents + familyService.",
      tier: "official",
    },
    {
      name: "StudentProgressView",
      filePath: "features/education/family/components/StudentProgressView.tsx",
      description:
        "VISION §14 — read-only guardian detail: a linked student's cross-mode progress. Thin wrapper over StudyAnalyticsView (readOnly) fed by useGuardianStudentAnalytics (the gated guardian_* RPCs). Reuses computeAnalytics + buildGainReport — no parallel engine.",
      tier: "official",
    },
    {
      name: "GuardianConsentVerifyDialog",
      filePath:
        "features/education/family/components/GuardianConsentVerifyDialog.tsx",
      description:
        "COPPA §312.5 verifiable-parental-consent method chooser (guardian-side, for an under-13 linked child): card ($0.50 auth-and-void, live via Stripe test) · signed form (scaffold, admin-reviewed) · gov-ID/KBA vendor (stub, Arman vendor pick). Verification is confirmed server-side (Stripe webhook), never by this dialog — a child can never self-verify.",
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
      name: "SpokenPracticeSurface",
      filePath:
        "features/education/spoken-practice/components/SpokenPracticeSurface.tsx",
      description:
        "Spoken Practice surface (mode picker → setup → live runner → examiner summary). Code-split via SpokenPracticeClient (ssr:false); orchestration in useSpokenPractice (composes continuousCapture + gradeSpokenAnswer + reviewSession + studyService).",
      tier: "official",
    },
    {
      name: "GradeWorkSurface",
      filePath:
        "features/education/assessment/grade-work/GradeWorkSurface.tsx",
      description:
        "Standalone 'Grade my handwritten work' surface (problem + rubric + snap photo → step-level verdict). Code-split via GradeWorkClient (ssr:false); orchestration in useGradeWork (gradeAnswerImage → vision grader → studyService). Metered via education.image_grade.",
      tier: "official",
    },
    {
      name: "HandwrittenWorkInput",
      filePath:
        "features/education/assessment/components/HandwrittenWorkInput.tsx",
      description:
        "Reusable 'snap/upload your worked answer' photo input (local File + preview, rear camera on mobile). Shared by the assessment take flow AND the standalone grade-work surface.",
      tier: "official",
    },
    {
      name: "StepBreakdown",
      filePath: "features/education/assessment/components/StepBreakdown.tsx",
      description:
        "Renders StepGradeVerdict.steps — the per-step 'where your reasoning broke' timeline. Shared by the take-flow feedback + the grade-work surface.",
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

  apiRoutes: [
    {
      url: "/api/education/coppa-verification",
      method: "POST",
      description:
        "Start COPPA card-verification for a linked under-13 child. Auth'd guardian only; validates an active guardian_link, then creates a $0.50 Stripe Checkout session (manual capture = auth-and-void). The Stripe webhook (app/api/stripe/webhook) confirms it server-side via guardian_confirm_verification. Distinct from subscription checkout + creator payouts.",
      filePath: "app/api/education/coppa-verification/route.ts",
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
