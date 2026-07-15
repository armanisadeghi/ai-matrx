// features/education/data/tools.ts
//
// APPLICATION TOOLS registry → /education/<slug> (the interactive app layer).
// Every entry currently renders the EduComingSoon placeholder. When a tool is
// built for real it graduates to the agents-route server-shell pattern (server
// layout + cache() + Redux hydrator + per-page loading.tsx) at the same slug.
//
// `capabilities` is a BUILDER CHECKLIST, not marketing. `visionRef` pins each
// tool to its source-of-truth section in VISION-education-hub.md.

import { Layers, Flame, GraduationCap, ListChecks, FileCheck2, Headphones, Network, Brain, NotebookPen, CalendarClock, Gamepad2, Speech, ScanText, Users, BadgeCheck } from "lucide-react";
import type { EduToolEntry } from "../types";

export const EDU_TOOLS: EduToolEntry[] = [
  {
    slug: "flashcards",
    name: "Flashcard Studio",
    tagline: "Create, generate, and study rich-media decks",
    description: "The flashcard creation + study workspace: manual rich-text editor, AI generation from any source, and every study mode.",
    icon: Layers,
    letter: "Fc",
    status: "live",
    accessTier: "free",
    visionRef: "VISION §1 Flashcard System, §2 Study Modes",
    capabilities: [
      "Rich-text editor on both card sides (text, image, audio, video, LaTeX, charts, SVG, embedded YouTube)",
      "AI generation from PDF / slides / lecture / photo / prompt",
      "Bulk import: CSV, paste, Quizlet",
      "Sets, folders, courses, tags; public/shared/private",
      "Study modes: classic, Learn, spaced repetition, write, match",
    ],
    featured: true,
  },
  {
    slug: "fastfire",
    name: "FastFire",
    tagline: "Rapid-fire spoken-recall sessions, graded live",
    description: "The signature mode: configure pace, fire cards, answer aloud, get parallel AI grading and live session adaptation.",
    icon: Flame,
    letter: "FF",
    status: "live",
    accessTier: "trial",
    visionRef: "VISION §3 FastFire",
    capabilities: [
      "Session config: card count, seconds/card, audio vs visual, live score vs summary",
      "Continuous streaming audio capture (no per-card record)",
      "Parallel card-level grading + batch 'professor' grader every ~10 cards",
      "Live in-session queue reordering toward weak concepts",
      "Feeds the study plan after each session",
    ],
    featured: true,
  },
  {
    slug: "tutor",
    name: "AI Tutor",
    tagline: "Context-aware, memory-carrying study companion",
    description: "Persistent tutor present at every surface, grounded in the student's own materials via RAG, Socratic by default.",
    icon: GraduationCap,
    letter: "Tu",
    status: "live", // P2 shipped: grounded, memory-carrying conversational tutor
    accessTier: "trial",
    visionRef: "VISION §4 AI Tutor",
    capabilities: [
      "Full session + cross-session memory (sets seen, answers, performance trends, exam dates)",
      "Socratic mode + inline 'I'm confused' voice entry from any card",
      "Source-grounded, citation-backed answers (no open-web unless asked)",
      "Tunable personality / teaching style",
    ],
    featured: true,
  },
  {
    slug: "quizzes",
    name: "Quiz Builder",
    tagline: "Auto-generate quizzes from any material",
    description: "Generate MC, T/F, fill-in-blank, short-answer, and written-response questions from any deck or upload.",
    icon: ListChecks,
    letter: "Qz",
    status: "live", // P1 — 5 question types, depth-on-demand, grade-on-meaning, grounded citations, spine-recorded, learning gain
    accessTier: "free",
    visionRef: "VISION §2 Test/Quiz mode",
    capabilities: [
      "Five question types auto-generated from a topic, deck, or document",
      "Depth-on-demand (recall → applied → exam) + per-item 'make deeper'",
      "Grade-on-meaning for free-response; grounded, cited questions (TrustEnvelope)",
      "Every answer feeds the study spine (FSRS mastery + weak-area review)",
    ],
  },
  {
    slug: "practice-tests",
    name: "Practice Tests",
    tagline: "Full simulated exams with scored reports",
    description: "Configurable, timed, full-length practice exams with detailed post-test analysis and pre/post learning-gain.",
    icon: FileCheck2,
    letter: "Pt",
    status: "live", // P1 — timed full-length tests reusing the assessment engine; detailed post-test analysis + learning gain
    accessTier: "trial",
    visionRef: "VISION §8 Practice Tests & Exam Prep",
    capabilities: [
      "Configurable question mix, difficulty, count, time limits",
      "Timed taker with auto-submit; detailed item-level post-test analysis",
      "Pre/post testing → persisted, measured learning gain",
      "Standardized-exam formats (SAT/ACT/AP/MCAT/…) via exam-type config",
    ],
  },
  {
    slug: "audio-study",
    name: "Audio Study",
    tagline: "Podcasts, debates, and panels from your material",
    description: "Generate broadcast-quality audio overviews, two-voice debates, and multi-host panels; audio review quizzes.",
    icon: Headphones,
    letter: "Au",
    // P3 — FE path complete + proven end-to-end up to the backend handoff (deck
    // resolution → buildAudioRequest → pc_studio_runs + study_media rows → NDJSON
    // stream consumption → error persistence). Audio REVIEW → study-spine is
    // PROVEN (study_attempt method='audio_review' verified via SQL). Audio
    // GENERATION is currently UNVERIFIABLE LIVE: a backend outage blocks it — the
    // podcast script agent returns prose instead of a <podcast_dialogue> block,
    // and the whole agent-run pipeline fails resolve_call_profile for every model
    // (both filed as critical feedback, aidream-owned). Re-verify once fixed.
    status: "live",
    accessTier: "trial",
    visionRef: "VISION §9 Audio Study",
    capabilities: [
      "Audio overviews (podcast-style) from any source",
      "Dueling-perspective debates + host/panel formats",
      "Audio review sessions (spoken quiz + verbal grading)",
      "Reuse the platform audio/podcast pipeline (features/podcasts, features/audio)",
    ],
  },
  {
    slug: "mind-maps",
    name: "Mind Maps & Diagrams",
    tagline: "Visual concept maps from notes and decks",
    description: "AI-generated mind maps, knowledge graphs, and diagrams with clickable nodes that link to cards and explanations.",
    icon: Network,
    letter: "Mm",
    // P3 — clickable nodes SHIPPED: a node resolves to its source card (linkCards
    // util, ~9/10 precise on a deck-grounded map) or offers "Ask my tutor about
    // this" (AskTutorButton). Trust envelope now populated on both create paths.
    // Rendering + node-click verified against real agent-generated diagrams.
    // Fresh GENERATION is currently blocked by the platform-wide agent-run backend
    // outage (resolve_call_profile fails for every model — filed, aidream-owned);
    // re-verify a live generation once fixed.
    status: "live",
    accessTier: "free",
    visionRef: "VISION §10 Visual Learning",
    capabilities: [
      "Mind maps + knowledge graphs from notes/decks/docs",
      "Flowcharts, trees, comparison tables, timelines, Venn, cycle, cause-effect",
      "Clickable nodes → source card or Ask-tutor; exportable",
    ],
  },
  {
    slug: "memory",
    name: "Memory Aids",
    tagline: "Mnemonics, analogies & memory palaces that make it stick",
    description: "AI-generated mnemonics, analogies/memory bridges, and memory-palace scaffolding from any deck or topic — plus proactive per-card memory aids that surface while you study.",
    icon: Brain,
    letter: "Me",
    status: "live", // VISION §11 — memory_aid agent → structured aids on education.study_media; converter target + proactive StudyDeck affordance
    accessTier: "free",
    visionRef: "VISION §11 Memory Tools",
    capabilities: [
      "AI mnemonics (acronyms, acrostics, rhymes, keyword images) for hard lists/sequences/terms",
      "Analogies & memory bridges for abstract concepts, with the mapping spelled out",
      "Memory-palace (method-of-loci) scaffolding for large ordered sets",
      "Proactive per-card memory aids surfaced alongside flashcards (opt-in)",
      "Grounded in your own material (TrustEnvelope: citations + confidence); note→memory-aid + upload-kit converter target",
    ],
  },
  {
    slug: "notes",
    name: "Smart Notes",
    tagline: "Notes that convert to study material in one click",
    description: "Rich note editor with one-click conversion of any note/passage to flashcards, quiz, summary, or mind map.",
    icon: NotebookPen,
    letter: "Sn",
    status: "live", // P4 — rich notes (thin skin over features/notes) + live lecture capture + one-click converter (note → deck/summary/mind_map) with note↔artifact lineage
    accessTier: "free",
    visionRef: "VISION §7 Note-Taking",
    capabilities: [
      "Rich markdown/rich-text editor (reuses the canonical notes editor + sharing)",
      "One-click note → flashcards / summary / mind map (quiz/audio light up as P1/P3 register)",
      "Live lecture capture — record → real-time transcription streamed into the editor",
      "Every converted artifact links back to the note (visible lineage both directions)",
      "Registers the converter `notes` target (source → structured, grounded study note)",
    ],
  },
  {
    slug: "planner",
    name: "Study Planner",
    tagline: "A living plan around your exam calendar",
    description: "AI day-by-day study schedule from exam dates + mastery + available time. It notices when your performance drifts or you've been away, and offers a gentle re-plan — never a guilt wall of overdue cards.",
    icon: CalendarClock,
    letter: "Pl",
    status: "live", // P5 — AI day-by-day plan (Study Planner agent → heuristic fallback), calendar agenda, signal-triggered re-plan, recovery-after-absence, anti-burnout load-smoothing; + goals CRUD
    accessTier: "trial",
    visionRef: "VISION §12 Personalized Study Planner",
    capabilities: [
      "AI day-by-day plan from exam date + per-topic mastery (FSRS) + daily time",
      "Calendar / agenda view with per-day load and block-level deep links",
      "Detects when new performance data makes your plan stale → one-tap re-plan",
      "Recovery plan after an absence — triages the backlog, eases you back in gently",
      "Anti-burnout: honored rest days, gentle daily caps (shared with the due queue), tapered finish",
    ],
  },
  {
    slug: "practice-oral",
    name: "Spoken Practice",
    tagline: "Oral exams, interviews, debate & language — answered out loud, graded live",
    description: "Answer out loud to an AI examiner, interviewer, debate opponent, or language coach. Prompts are grounded in your material; every spoken answer is graded on meaning (and, in Language & Pronunciation mode, on pronunciation and fluency too), and a persona-matched summary closes the session.",
    icon: Speech,
    letter: "Sp",
    status: "live", // Spoken practice — reuses the FastFire capture + spoken grader + study spine; new session-designer agent per mode
    accessTier: "trial",
    visionRef: "VISION 'Features Coming Soon' — Oral exam/viva, Interview prep, Debate; §4 Tutor, §6 AI Grading",
    capabilities: [
      "Four modes: oral exam / viva voce, interview prep (college/med/job), debate & argumentation, and language & pronunciation",
      "Language & Pronunciation: say a target-language phrase aloud — graded on BOTH content AND pronunciation/fluency (accuracy, intelligibility, prosody), judged holistically from your recording (transcript-level, not phoneme-perfect)",
      "Grounded in your own deck or pasted material (TrustEnvelope: honest per-prompt confidence)",
      "Voice-first: reuses the FastFire continuous mic capture + crown-jewel spoken grader",
      "Graded on meaning (accuracy/articulation/completeness · content+delivery · argument/evidence/reasoning · content+pronunciation)",
      "Debate opponent counter-argues to stress-test your reasoning",
      "Every answer records to the study spine (method=mode) + a persona-matched batch summary",
    ],
    featured: true,
  },
  {
    slug: "grade-work",
    name: "Grade My Work",
    tagline: "Snap your handwritten solution — graded step by step",
    description: "Photograph a worked math, science, or free-response problem and a vision AI reads your handwriting, grades it on meaning against the answer or rubric, and shows exactly which step your reasoning broke on.",
    icon: ScanText,
    letter: "Gw",
    status: "live", // Vision grader (Gemini) reads a photo → step-level GradeVerdict; records to the study spine
    accessTier: "trial",
    visionRef: "VISION §6 AI Grading (Handwritten), §17 STEM (handwritten equation recognition, step-by-step grading, whiteboard capture)",
    capabilities: [
      "Snap or upload a photo of handwritten / typed worked work (rear camera on mobile)",
      "Vision AI transcribes what you wrote, then grades on meaning (never exact-string)",
      "Per-step breakdown pinpoints exactly where the reasoning first broke (follow-through aware)",
      "Names the misconception + gives an encouraging, specific fix",
      "Also available inside quizzes / practice tests: answer any written item by photo",
      "Every grade records to the study spine (item_type handwritten_work, response_kind handwritten)",
    ],
    featured: true,
  },
  {
    slug: "game",
    name: "Study Games",
    tagline: "Play IS review — SRS-wired multiplayer + solo arcade",
    description: "A real-time multiplayer study game (host a room, join by code) and a solo arcade, both fed by the FSRS engine so every round is genuine review. Healthy streaks, opt-in leagues, outcome badges — no speed-shame, ever.",
    icon: Gamepad2,
    letter: "Gm",
    status: "live", // P10 — SRS-wired multiplayer + solo arcade + healthy streaks/leagues/badges
    accessTier: "free",
    visionRef: "VISION §11 Engagement / Gamification",
    capabilities: [
      "Real-time multiplayer: host a room, players join by code (no player tax)",
      "Per-player SRS-biased question queues — every answer is real review",
      "Solo arcade against your due/weak queue (the daily-habit surface)",
      "Correctness-first scoring + earn-to-upgrade power-ups + comeback assist",
      "Healthy streaks (freezes + rest days), opt-in mastery-gain leagues, outcome badges",
      "Every answer records to the study spine (method='game') → mastery + P5 analytics",
    ],
    featured: true,
  },
  {
    slug: "family",
    name: "Family Dashboard",
    tagline: "Parents follow a learner's study time, mastery & learning gain",
    description: "A read-only, privacy-respecting view of a linked student's progress — study time, mastery, weak areas, trends, and learning gain. A guardian only ever sees a student who granted them access.",
    icon: Users,
    letter: "Fm",
    status: "live", // VISION §14 + 'Coming Soon: Parent/guardian dashboard (K-8)'. Guardian↔student consent link (education.guardian_link) + gated guardian_* RPCs; reuses the P5 StudyAnalyticsView + learning-gain engine as a read-only consumer.
    accessTier: "free",
    visionRef: "VISION §14 Collaboration, 'Features Coming Soon' — Parent and guardian dashboard; §16 Progress Analytics",
    capabilities: [
      "Guardian follows a linked student's study time, mastery %, weak areas, trends, streaks, and pre/post learning gain",
      "Read-only + privacy-respecting: a guardian only ever sees a student who granted access (student-consented link)",
      "Consent lifecycle: student grants directly, or guardian requests → student approves; either side can revoke",
      "Reuses the P5 analytics + learning-gain surfaces as a read-only consumer — no parallel analytics engine",
      "Server-gated route + SECURITY DEFINER guardian_* RPCs re-check the active link on every read",
    ],
    featured: true,
  },
  {
    slug: "classes",
    name: "My Classes",
    tagline: "One hub per course — its decks, quizzes, notes, media & exam dates",
    description: "A course-scoped workspace for each class you take. Tag any study material to a class, and its hub gathers everything in one place with your exam calendar. Scopes-native: a class is a scope, so it can also be your active study context.",
    icon: GraduationCap,
    letter: "Cl",
    status: "live", // W2 Per-Class Hub — scopes-native (class = scope; content↔class = platform.associations); no new tables
    accessTier: "free",
    visionRef: "W2-class-hub.md (Wave 2 — per-class hub); VISION §14 Collaboration",
    capabilities: [
      "Add the courses you take; each class is a scope in your personal workspace",
      "Tag decks, quizzes, notes, media, and files to a class (ClassPicker → local scope tags)",
      "Per-class hub aggregates everything tagged to it + the class's exam dates",
      "Plan around a class's exams (deep-links into the study planner)",
      "Scopes-native: set a class active in the scope picker to bias generation + the tutor",
    ],
    featured: true,
  },
  {
    slug: "creator",
    name: "Creator page",
    tagline: "Your public page — feature your videos, free tools & classes",
    description: "Claim a public handle and get an SEO-first landing page at /c/<handle>. Feature your YouTube videos, your free flashcard sets and study guides, and your classes with enroll CTAs. Teachers and creators bring their audience; the page converts them.",
    icon: BadgeCheck,
    letter: "Cp",
    status: "live", // Convergence C — creator profiles + public landing pages; manage at /education/creator, public at /c/[handle]
    accessTier: "free",
    visionRef: "CONVERGENCE_C_CREATORS.md (Convergence C — Creators, Classes & Monetization)",
    capabilities: [
      "Claim a unique public handle → indexable page at /c/<handle>",
      "Feature YouTube videos (privacy-friendly nocookie embeds)",
      "Feature your public flashcard sets + study guides as instantly-usable free tools",
      "Feature your classes with open / closed / paid enroll CTAs (edu_class_join contract)",
      "Anonymous funnel: free tools usable logged-out, sign-up saves progress + enrolls",
    ],
    featured: true,
  },
];

export const EDU_TOOL_BY_SLUG: Record<string, EduToolEntry> = Object.fromEntries(
  EDU_TOOLS.map((t) => [t.slug, t]),
);
