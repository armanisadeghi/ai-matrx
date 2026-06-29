// features/education/data/subjects.ts
//
// SUBJECTS axis registry → /education/subjects/<slug>.
// Subject-first is the industry-standard primary axis. `math` is the marketing
// landing for mathematics; the relocated stock algebra lessons live at the
// separate static route /education/subjects/quick-math (the real, full-
// functionality math build reserves /subjects/math's tools later).
//
// Content here must track VISION-education-hub.md. Flesh entries with sections;
// a stub (name/tagline/description) still renders a clean page.

import {
  FlaskConical,
  Dna,
  Atom,
  Sigma,
  Globe2,
  BookText,
  Code2,
  Landmark,
  Brain,
  Languages,
} from "lucide-react";
import type { AxisEntry } from "../types";

export const SUBJECTS: AxisEntry[] = [
  {
    slug: "biology",
    name: "Biology",
    tagline: "From cells to ecosystems, made unforgettable",
    description:
      "Turn dense biology chapters, lab notes, and lecture recordings into flashcards, diagrams, and quizzes. Study cellular respiration, genetics, and anatomy with an AI tutor that draws from your own materials — and grades your spoken answers like a study partner.",
    icon: Dna,
    letter: "Bi",
    status: "live",
    accessTier: "free",
    featured: true,
    keywords: ["biology flashcards", "AP biology", "anatomy study", "genetics quiz"],
    meta: { breadth: "K–Med school" },
    related: {
      tools: ["flashcards", "fastfire", "tutor"],
      exams: ["ap-biology", "mcat"],
      content: ["cell-structure-and-function"],
    },
    sections: [
      {
        kind: "feature-grid",
        heading: "Every way to learn biology",
        subheading:
          "Upload a textbook chapter or record a lecture — the platform builds the study set, then drills you on it.",
        items: [
          {
            icon: Dna,
            title: "Diagram-rich flashcards",
            description:
              "Labeled cell structures, Punnett squares, and pathways render as full mini-documents — not text-only cards.",
          },
          {
            icon: Brain,
            title: "Socratic AI tutor",
            description:
              "Stuck on the Krebs cycle? The tutor asks guiding questions grounded in your notes, never the open web.",
          },
          {
            icon: FlaskConical,
            title: "Lab + lecture capture",
            description:
              "Record a lecture or photograph handwritten lab work; both become searchable, quizzable study material.",
          },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "K–16+", label: "Grade span" },
          { value: "AP · MCAT", label: "Exam-ready" },
          { value: "Free", label: "Core tools" },
        ],
      },
    ],
  },
  {
    slug: "chemistry",
    name: "Chemistry",
    tagline: "Reactions, equations, and structures that finally click",
    description:
      "Balance equations, master stoichiometry, and visualize molecular structures. AI grades your multi-step work and shows exactly where a reaction went wrong.",
    icon: FlaskConical,
    letter: "Ch",
    status: "live",
    accessTier: "free",
    meta: { breadth: "MS–Grad" },
    related: { tools: ["flashcards", "tutor"], exams: ["ap-chemistry", "mcat"] },
  },
  {
    slug: "physics",
    name: "Physics",
    tagline: "Concepts and problem-solving, step by step",
    description:
      "From kinematics to quantum, work through problems one step at a time with an AI that grades each line of your reasoning and renders every equation in full LaTeX.",
    icon: Atom,
    letter: "Ph",
    status: "live",
    accessTier: "free",
    meta: { breadth: "HS–Grad" },
    related: { tools: ["tutor", "flashcards"], exams: ["ap-physics", "mcat"] },
  },
  {
    slug: "math",
    name: "Mathematics",
    tagline: "Arithmetic to multivariable calculus",
    description:
      "Step-by-step problem solving with full LaTeX rendering, handwritten-work grading, and formula flashcards. The AI works through every step and pinpoints where you went wrong.",
    icon: Sigma,
    letter: "Ma",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { breadth: "K–College" },
    related: {
      tools: ["flashcards", "practice-tests", "tutor"],
      exams: ["sat", "ap-calculus"],
    },
  },
  {
    slug: "world-history",
    name: "World History",
    tagline: "Timelines, causes, and connections across eras",
    description:
      "Master sweeping historical arcs with AI-built timelines, cause-and-effect maps, and dueling-perspective audio debates that bring competing interpretations to life.",
    icon: Globe2,
    letter: "WH",
    status: "live",
    accessTier: "free",
    meta: { breadth: "MS–College" },
    related: { tools: ["mind-maps", "audio-study"], exams: ["ap-world-history"], content: ["ap-world-history"] },
  },
  {
    slug: "english",
    name: "English & Literature",
    tagline: "Close reading, essays, and vocabulary",
    description:
      "Analyze texts, build vocabulary, and get essay coaching that critiques structure, argument, and evidence — coaching you to write better, never writing for you.",
    icon: BookText,
    letter: "En",
    status: "live",
    accessTier: "free",
    related: { tools: ["tutor", "flashcards"], exams: ["sat"] },
  },
  {
    slug: "computer-science",
    name: "Computer Science",
    tagline: "Code, algorithms, and systems you can explain",
    description:
      "Paste or upload code and the AI explains it, generates quiz questions about its logic and output, and tests your understanding line by line.",
    icon: Code2,
    letter: "CS",
    status: "live",
    accessTier: "free",
    related: { tools: ["flashcards", "tutor"], exams: ["ap-computer-science"] },
  },
  {
    slug: "economics",
    name: "Economics",
    tagline: "Micro, macro, and the models behind them",
    description:
      "Graphs, models, and competing schools of thought — explained with AI debates and quizzed with auto-generated practice questions.",
    icon: Landmark,
    letter: "Ec",
    status: "live",
    accessTier: "free",
    related: { tools: ["audio-study", "flashcards"], exams: ["ap-economics"] },
  },
  {
    slug: "psychology",
    name: "Psychology",
    tagline: "Theories, studies, and terminology that stick",
    description:
      "Memorize landmark studies and dense terminology with spaced repetition, mnemonics, and an AI tutor that connects concepts across units.",
    icon: Brain,
    letter: "Ps",
    status: "live",
    accessTier: "free",
    related: { tools: ["flashcards", "fastfire"], exams: ["ap-psychology", "mcat"] },
  },
  {
    slug: "languages",
    name: "World Languages",
    tagline: "Vocabulary, grammar, and spoken fluency",
    description:
      "Build vocabulary with FastFire recall drills and practice pronunciation with real-time spoken-response grading in your target language.",
    icon: Languages,
    letter: "La",
    status: "live",
    accessTier: "free",
    related: { tools: ["fastfire", "tutor"] },
  },
];
