/**
 * The education APP TOOLS, declared once as pure data for the shell.
 *
 * Why this file exists: `features/education/data/tools.ts` is the tool registry,
 * but it holds Lucide *components* — and `features/shell/constants/nav-data.ts`
 * is pure data with no React imports. This module is the pure-data projection of
 * that registry (`iconName` strings instead of components) so the shell menu and
 * the education hub can never disagree about which tools exist.
 *
 * The parity is GUARDED, not merely intended: `education-nav.test.ts` fails if
 * this list and `EDU_TOOLS` ever diverge by a single slug. Add a tool to the
 * registry and the test tells you to add it here.
 *
 * Consumed by:
 *   • features/shell/constants/nav-data.ts — sidebar / profile menu / dashboard
 *
 * Context: before 2026-08-17 the shell exposed only the five education MARKETING
 * axes, so a signed-in learner had no navigational path from the shell to
 * flashcards, the tutor, or FastFire — all 16 tools were reachable by URL only.
 * See common-docs/projects/education-platform (WP1, gate G12).
 */

import type { ShellIconName } from "@/features/shell/shellIconMap";

/** Flyout subgroup headings, in the order the shell should render them. */
export const EDU_NAV_GROUPS = [
  "Study",
  "Understand",
  "Practice & Feedback",
  "Plan & Track",
  "People",
] as const;

export type EduNavGroup = (typeof EDU_NAV_GROUPS)[number];

export interface EduToolNavEntry {
  /** Must match a `slug` in `EDU_TOOLS` — guarded by education-nav.test.ts. */
  slug: string;
  label: string;
  iconName: ShellIconName;
  group: EduNavGroup;
  /** One line; shown as the menu-item subtitle. */
  description: string;
}

/**
 * All 16 application tools. Grouped by what a learner is trying to DO, not by
 * how the code is organized — a student looking for "quiz me" should not have to
 * know whether that lives under assessment or flashcards.
 */
export const EDU_TOOL_NAV: EduToolNavEntry[] = [
  // Study — the surfaces a learner spends session time in.
  {
    slug: "flashcards",
    label: "Flashcard Studio",
    iconName: "Layers",
    group: "Study",
    description: "Create, generate, and study rich-media decks",
  },
  {
    slug: "fastfire",
    label: "FastFire",
    iconName: "Flame",
    group: "Study",
    description: "Rapid-fire spoken recall, graded live",
  },
  {
    slug: "quizzes",
    label: "Quiz Builder",
    iconName: "ListChecks",
    group: "Study",
    description: "Auto-generate quizzes from any material",
  },
  {
    slug: "practice-tests",
    label: "Practice Tests",
    iconName: "FileCheck2",
    group: "Study",
    description: "Full simulated exams with scored reports",
  },
  {
    slug: "game",
    label: "Study Games",
    iconName: "Gamepad2",
    group: "Study",
    description: "Play is review — multiplayer and solo arcade",
  },

  // Understand — turning material into something that sticks.
  {
    slug: "tutor",
    label: "AI Tutor",
    iconName: "GraduationCap",
    group: "Understand",
    description: "Context-aware study companion that remembers",
  },
  {
    slug: "audio-study",
    label: "Audio Study",
    iconName: "Headphones",
    group: "Understand",
    description: "Podcasts, debates, and panels from your material",
  },
  {
    slug: "mind-maps",
    label: "Mind Maps & Diagrams",
    iconName: "Network",
    group: "Understand",
    description: "Visual concept maps from notes and decks",
  },
  {
    slug: "memory",
    label: "Memory Aids",
    iconName: "Brain",
    group: "Understand",
    description: "Mnemonics, analogies, and memory palaces",
  },
  {
    slug: "notes",
    label: "Smart Notes",
    iconName: "NotebookPen",
    group: "Understand",
    description: "Notes that convert to study material in one click",
  },

  // Practice & Feedback — producing an answer and being graded on it.
  {
    slug: "practice-oral",
    label: "Spoken Practice",
    iconName: "Speech",
    group: "Practice & Feedback",
    description: "Oral exams and interviews, answered aloud",
  },
  {
    slug: "grade-work",
    label: "Grade My Work",
    iconName: "ScanText",
    group: "Practice & Feedback",
    description: "Snap handwritten work — graded step by step",
  },

  // Plan & Track.
  {
    slug: "planner",
    label: "Study Planner",
    iconName: "CalendarClock",
    group: "Plan & Track",
    description: "A living plan around your exam calendar",
  },

  // People — the shared surfaces.
  {
    slug: "classes",
    label: "My Classes",
    iconName: "GraduationCap",
    group: "People",
    description: "One hub per course, with its decks and exam dates",
  },
  {
    slug: "family",
    label: "Family Dashboard",
    iconName: "Users",
    group: "People",
    description: "Parents follow study time, mastery, and gain",
  },
  {
    slug: "creator",
    label: "Creator Page",
    iconName: "BadgeCheck",
    group: "People",
    description: "Your public page — videos, free tools, classes",
  },
];

/** `/education/<slug>` — the one place the tool URL is built. */
export function eduToolHref(slug: string): string {
  return `/education/${slug}`;
}
