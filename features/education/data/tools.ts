// features/education/data/tools.ts
//
// APPLICATION TOOLS registry → /education/<slug> (the interactive app layer).
// Every entry currently renders the EduComingSoon placeholder. When a tool is
// built for real it graduates to the agents-route server-shell pattern (server
// layout + cache() + Redux hydrator + per-page loading.tsx) at the same slug.
//
// `capabilities` is a BUILDER CHECKLIST, not marketing. `visionRef` pins each
// tool to its source-of-truth section in VISION-education-hub.md.

import { Layers, Flame, GraduationCap, ListChecks, FileCheck2, Headphones, Network, NotebookPen, CalendarClock } from "lucide-react";
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
    status: "coming-soon",
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
    status: "coming-soon",
    accessTier: "free",
    visionRef: "VISION §2 Test/Quiz mode",
    capabilities: [
      "Five question types auto-generated from source",
      "Per-item explanations and feedback",
      "Quiz session state persisted (education.quiz_sessions)",
    ],
  },
  {
    slug: "practice-tests",
    name: "Practice Tests",
    tagline: "Full simulated exams with scored reports",
    description: "Configurable, timed, full-length practice exams with detailed post-test analysis and pre/post learning-gain.",
    icon: FileCheck2,
    letter: "Pt",
    status: "coming-soon",
    accessTier: "trial",
    visionRef: "VISION §8 Practice Tests & Exam Prep",
    capabilities: [
      "Configurable question mix, difficulty, count, time limits",
      "Item-level feedback + explanations",
      "Pre/post testing → measured learning gain",
      "Standardized-exam formats (SAT/ACT/AP/MCAT/…)",
    ],
  },
  {
    slug: "audio-study",
    name: "Audio Study",
    tagline: "Podcasts, debates, and panels from your material",
    description: "Generate broadcast-quality audio overviews, two-voice debates, and multi-host panels; audio review quizzes.",
    icon: Headphones,
    letter: "Au",
    status: "coming-soon",
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
    status: "coming-soon",
    accessTier: "free",
    visionRef: "VISION §10 Visual Learning",
    capabilities: [
      "Mind maps + knowledge graphs from notes/decks/docs",
      "Flowcharts, trees, comparison tables, timelines, Venn, cycle, cause-effect",
      "SVG-quality, exportable, interactive clickable nodes",
    ],
  },
  {
    slug: "notes",
    name: "Smart Notes",
    tagline: "Notes that convert to study material in one click",
    description: "Rich note editor with one-click conversion of any note/passage to flashcards, quiz, summary, or mind map.",
    icon: NotebookPen,
    letter: "Sn",
    status: "coming-soon",
    accessTier: "free",
    visionRef: "VISION §7 Note-Taking",
    capabilities: [
      "Rich markdown/rich-text editor",
      "One-click note → flashcards / quiz / summary / mind map",
      "Live lecture transcription into the editor",
      "Reuse features/notes primitives where possible",
    ],
  },
  {
    slug: "planner",
    name: "Study Planner",
    tagline: "A living plan around your exam calendar",
    description: "AI day-by-day study schedule from exam dates + mastery + available time, re-planning automatically.",
    icon: CalendarClock,
    letter: "Pl",
    status: "coming-soon",
    accessTier: "trial",
    visionRef: "VISION §12 Personalized Study Planner",
    capabilities: [
      "Day-by-day plan from exam dates + per-subject mastery + daily time",
      "Exam calendar integration",
      "Adaptive re-planning on new performance data",
      "Reuse features/scheduling where it fits",
    ],
  },
];

export const EDU_TOOL_BY_SLUG: Record<string, EduToolEntry> = Object.fromEntries(
  EDU_TOOLS.map((t) => [t.slug, t]),
);
