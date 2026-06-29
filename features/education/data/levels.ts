// features/education/data/levels.ts
//
// LEVELS axis registry → /education/levels/<slug>.
//
// Three-band model, validated against Khan Academy + IXL (June 2026 research):
//   • Pre-K–Grade 5: PER-GRADE pages (finer granularity for younger learners)
//   • Middle School (6–8) / High School (9–12): grouped bands
//   • College / Graduate & Professional: grouped bands
// Individual grade pages are `indexHidden` flat siblings, surfaced from the
// Elementary band via `children`. The AI adapts vocabulary/difficulty/tone to
// the level (see VISION-education-hub.md "Who We Serve").

import {
  Baby,
  Blocks,
  GraduationCap,
  School,
  University,
  Stethoscope,
  Pencil,
} from "lucide-react";
import type { AxisEntry } from "../types";

// Individual elementary grades (flat siblings, hidden from the index).
const GRADES: AxisEntry[] = (
  [
    ["kindergarten", "Kindergarten", "Letters, numbers, and first words"],
    ["1st-grade", "1st Grade", "Reading, addition, and the world around us"],
    ["2nd-grade", "2nd Grade", "Fluency, place value, and curiosity"],
    ["3rd-grade", "3rd Grade", "Multiplication, paragraphs, and science"],
    ["4th-grade", "4th Grade", "Fractions, research, and deeper reading"],
    ["5th-grade", "5th Grade", "Decimals, essays, and getting ready for middle school"],
  ] as const
).map(([slug, name, tagline]) => ({
  slug,
  name,
  tagline,
  description: `Picture-rich flashcards, read-aloud, and gentle drills built for ${name.toLowerCase()} — with celebrations that keep younger learners motivated and a parent view of progress.`,
  icon: Blocks,
  letter: name.replace(/[^0-9A-Za-z]/g, "").slice(0, 2),
  status: "coming-soon" as const,
  accessTier: "free" as const,
  indexHidden: true,
  meta: { audience: "Elementary" },
  related: { tools: ["flashcards", "audio-study"] },
}));

export const LEVELS: AxisEntry[] = [
  {
    slug: "elementary",
    name: "Elementary",
    tagline: "Kindergarten through 5th grade",
    description:
      "Visual-heavy cards, read-aloud, story-based learning, and sticker-style rewards — with a parent dashboard. The AI keeps vocabulary simple and the tone encouraging for the youngest learners.",
    icon: Baby,
    letter: "Em", // distinct from the Levels index badge ("El")
    status: "coming-soon",
    accessTier: "free",
    featured: true,
    meta: { gradeRange: "Grades K–5" },
    related: { tools: ["flashcards", "audio-study"] },
    children: GRADES,
  },
  ...GRADES,
  {
    slug: "middle-school",
    name: "Middle School",
    tagline: "Grades 6–8",
    description:
      "Subject-organized study rooms, standards-aligned content, collaborative group study, and an early on-ramp to test prep — with difficulty that scales as mastery grows.",
    icon: School,
    letter: "MS",
    status: "coming-soon",
    accessTier: "free",
    featured: true,
    meta: { gradeRange: "Grades 6–8" },
    related: { tools: ["flashcards", "quizzes", "tutor"] },
  },
  {
    slug: "high-school",
    name: "High School",
    tagline: "Grades 9–12 — AP, honors, and college-ready",
    description:
      "Master AP and honors coursework, build for the SAT and ACT, and tackle advanced STEM with an AI tutor that knows your syllabus. Competitive modes and streaks keep daily study habits alive.",
    icon: GraduationCap,
    letter: "HS",
    status: "live",
    accessTier: "free",
    featured: true,
    keywords: ["high school study app", "AP prep", "SAT prep", "honors"],
    meta: { gradeRange: "Grades 9–12" },
    related: {
      tools: ["fastfire", "tutor", "practice-tests"],
      exams: ["sat", "act", "ap-world-history"],
      subjects: ["biology", "world-history", "math"],
    },
    sections: [
      {
        kind: "feature-grid",
        heading: "Built for the high-school grind",
        subheading:
          "Five classes, three clubs, and an SAT date. The platform turns whatever you're handed into study material and keeps you on pace.",
        items: [
          {
            icon: GraduationCap,
            title: "AP & honors, course-aligned",
            description:
              "Generate course-aligned decks and practice exams for any AP subject; AP content doubles as exam prep.",
            href: "/education/exam-prep/ap-world-history",
          },
          {
            icon: Pencil,
            title: "Essay & free-response coaching",
            description:
              "Get rubric-aware feedback on structure, argument, and evidence — coaching you to write better, not writing for you.",
          },
          {
            icon: School,
            title: "Compete and keep streaks",
            description:
              "Head-to-head challenges, class leaderboards, and streaks turn daily review into a habit.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "From syllabus to A",
        steps: [
          { number: "01", title: "Drop in your material", description: "Upload notes, a textbook chapter, or record the lecture." },
          { number: "02", title: "Auto-build study sets", description: "Flashcards, quizzes, summaries, and audio generate instantly." },
          { number: "03", title: "Drill the weak spots", description: "FastFire and spaced repetition target exactly what you keep missing." },
          { number: "04", title: "Prove it on the test", description: "Full practice exams with item-level feedback show you're ready." },
        ],
      },
    ],
  },
  {
    slug: "college",
    name: "College & University",
    tagline: "Undergraduate and graduate coursework",
    description:
      "Textbook-scale ingestion, lecture capture, and research-linked study. Build entire course study systems and prep for graduate entrance exams in one place.",
    icon: University,
    letter: "Co",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { gradeRange: "Undergrad–Grad" },
    related: { tools: ["tutor", "practice-tests", "audio-study"], exams: ["mcat", "lsat", "gre"] },
  },
  {
    slug: "graduate-professional",
    name: "Graduate & Professional",
    tagline: "Med, law, MBA, and licensure boards",
    description:
      "Certification and licensure prep — CPA, PE, nursing boards, the bar — plus oral-exam practice and workplace training. Built for high-stakes, high-volume mastery.",
    icon: Stethoscope,
    letter: "GP",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { gradeRange: "Post-grad" },
    related: { tools: ["fastfire", "tutor"], exams: ["mcat", "lsat", "bar", "nclex", "cpa"] },
  },
];
