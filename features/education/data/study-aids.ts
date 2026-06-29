// features/education/data/study-aids.ts
//
// STUDY AIDS axis registry → /education/study-aids/<slug>.
// These are MARKETING pages for each study-aid TYPE (what it is, who it helps).
// Each links to its interactive APP tool at /education/<tool> (the content→app
// conversion bridge). Tracks VISION-education-hub.md §1,2,8,9,10,11.

import { Layers, ListChecks, FileCheck2, Headphones, Network, Lightbulb, NotebookPen, ScrollText } from "lucide-react";
import type { AxisEntry } from "../types";

export const STUDY_AIDS: AxisEntry[] = [
  {
    slug: "flashcards",
    name: "Flashcards",
    tagline: "The foundation — but smarter than any you've used",
    description:
      "Rich-media cards with images, LaTeX, audio, and video on both sides. Generate them from any PDF, lecture, or photo of your notes — then study with spaced repetition that resurfaces cards at the scientifically optimal moment.",
    icon: Layers,
    letter: "Fc",
    status: "live",
    accessTier: "free",
    featured: true,
    keywords: ["AI flashcards", "flashcard maker", "spaced repetition", "Quizlet alternative"],
    related: { tools: ["flashcards", "fastfire"], subjects: ["biology", "languages"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Not your average flashcards",
        subheading: "Cards are full mini-documents, generated from anything, scheduled by science.",
        items: [
          { icon: Layers, title: "Rich media on every card", description: "Text, images, LaTeX, charts, SVGs, audio, and embedded video — both sides." },
          { icon: NotebookPen, title: "Generated from anything", description: "PDF, slides, a lecture recording, or a photo of handwritten notes becomes a deck in seconds." },
          { icon: ListChecks, title: "Spaced repetition built in", description: "An SM-2+ engine resurfaces each card at the optimal interval for long-term retention." },
        ],
      },
      {
        kind: "cta",
        heading: "Build your first deck free",
        body: "Paste a prompt, upload a chapter, or import your Quizlet library — your cards are one click away.",
        primary: { label: "Make flashcards", href: "/education/flashcards" },
        secondary: { label: "Try FastFire", href: "/education/fastfire" },
      },
    ],
  },
  { slug: "quizzes", name: "Quizzes & Tests", tagline: "Auto-generated from any material", description: "Multiple choice, true/false, fill-in-the-blank, short answer, and written response — generated from any deck or upload, with detailed item-level feedback.", icon: ListChecks, letter: "Qz", status: "live", accessTier: "free", featured: true, related: { tools: ["quizzes", "practice-tests"] } },
  { slug: "practice-tests", name: "Practice Tests", tagline: "Full simulated exams with real scoring", description: "Configurable, timed practice exams with question-mix and difficulty control, plus a scored report and pre/post learning-gain measurement.", icon: FileCheck2, letter: "Pt", status: "live", accessTier: "trial", featured: true, related: { tools: ["practice-tests"], exams: ["sat", "mcat"] } },
  { slug: "audio-study", name: "Audio Study", tagline: "Podcasts, debates, and panels from your notes", description: "Broadcast-quality audio overviews, two-voice debates, and multi-host panels generated from any material — study on your commute, screen-free.", icon: Headphones, letter: "Au", status: "live", accessTier: "trial", featured: true, related: { tools: ["audio-study"], subjects: ["world-history", "economics"] } },
  { slug: "mind-maps", name: "Mind Maps & Diagrams", tagline: "See how concepts connect", description: "AI-generated mind maps, knowledge graphs, flowcharts, timelines, and comparison tables — clickable nodes link straight to the relevant cards and explanations.", icon: Network, letter: "Mm", status: "live", accessTier: "free", related: { tools: ["mind-maps"], subjects: ["world-history"] } },
  { slug: "mnemonics", name: "Mnemonics & Memory Aids", tagline: "Make hard lists impossible to forget", description: "Auto-generated acronyms, rhymes, analogies, and memory-palace scaffolding that surface right alongside your toughest cards.", icon: Lightbulb, letter: "Mn", status: "coming-soon", accessTier: "free", related: { tools: ["flashcards"] } },
  { slug: "notes", name: "Smart Notes", tagline: "Write once, study everywhere", description: "A rich note editor where any note or highlighted passage converts in one click to flashcards, a quiz, a summary, or a mind map — nothing siloed.", icon: NotebookPen, letter: "Sn", status: "live", accessTier: "free", related: { tools: ["notes", "flashcards"] } },
  { slug: "study-guides", name: "Study Guides", tagline: "Comprehensive, structured, exam-ready", description: "AI-built study guides that organize a whole subject or unit into a single reviewable document — with links to drill each section.", icon: ScrollText, letter: "Sg", status: "coming-soon", accessTier: "free", related: { tools: ["notes"], content: ["ap-world-history"] } },
];
