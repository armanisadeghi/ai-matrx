// features/education/data/features.ts
//
// FEATURES axis registry → /education/features/<slug>.
// Marketing pages for the platform's differentiators (the "why we win" set).
// Tracks VISION-education-hub.md §3,4,5,6,9,12,16,17 + "Why We Win".

import { Flame, GraduationCap, Mic, FileStack, Repeat, ClipboardCheck, PenTool, CalendarClock, LineChart, Sigma } from "lucide-react";
import type { AxisEntry } from "../types";

export const FEATURES: AxisEntry[] = [
  {
    slug: "fastfire",
    name: "FastFire",
    tagline: "Rapid-fire recall, graded out loud, in real time",
    description:
      "Cards fire automatically at your chosen pace. You answer out loud — like a friend quizzing you — while AI captures and grades your spoken responses in parallel. A batch-level 'professor' grader spots patterns across answers, and the live session reorders itself to hit your weak spots before it ends.",
    icon: Flame,
    letter: "FF",
    status: "live",
    accessTier: "trial",
    featured: true,
    keywords: ["FastFire", "spoken recall", "AI grading", "rapid review", "active recall"],
    related: { tools: ["fastfire"], subjects: ["languages", "biology"], exams: ["mcat"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Nothing else studies like this",
        subheading: "Streaming audio capture + parallel AI grading + live adaptation — in one session.",
        items: [
          { icon: Mic, title: "Answer out loud, no buttons", description: "Continuous streaming audio capture — never press record per card. Just respond as fast as the cards come." },
          { icon: Flame, title: "Graded while you go", description: "Cards 1–17 are already graded while you answer card 20. Grading runs in parallel with the session, not after." },
          { icon: GraduationCap, title: "A professor watching the whole set", description: "After every ~10 cards a higher-order grader connects the dots and flags systematic misconceptions." },
        ],
      },
      {
        kind: "steps",
        heading: "How a FastFire session runs",
        steps: [
          { number: "01", title: "Configure", description: "Pick card count, seconds per card, audio or visual, live score or end summary." },
          { number: "02", title: "Fire", description: "Cards auto-advance with an audio cue; you answer aloud at pace." },
          { number: "03", title: "Adapt", description: "The remaining queue reorders in real time toward the concepts you're missing." },
          { number: "04", title: "Review", description: "A narrative breakdown shows where you struggled and why — and updates your study plan." },
        ],
      },
    ],
  },
  { slug: "ai-tutor", name: "AI Tutor", tagline: "A context-aware tutor at every surface", description: "Not a chatbot — a persistent, memory-carrying tutor that knows your current set, your full performance history, and your exam dates. Socratic by default, grounded in your own materials via RAG.", icon: GraduationCap, letter: "Tu", status: "live", accessTier: "trial", featured: true, related: { tools: ["tutor"] } },
  { slug: "voice-grading", name: "Voice Everywhere", tagline: "First-class voice at every study surface", description: "Voice isn't bolted onto a chat box — it's built into every surface. Tap 'I'm confused' on any card and drop straight into a voice conversation with full context.", icon: Mic, letter: "Vo", status: "live", accessTier: "trial", featured: true, related: { tools: ["tutor", "fastfire"] } },
  { slug: "multi-format-ingestion", name: "Ingest Anything", tagline: "PDF, video, audio, photos, YouTube, live lectures", description: "Drop in virtually any format and the platform converts it to structured study material — including OCR of handwritten notes and live lecture transcription.", icon: FileStack, letter: "In", status: "live", accessTier: "free", featured: true, related: { tools: ["flashcards", "notes"] } },
  { slug: "ai-grading", name: "AI Grading", tagline: "Spoken, written, typed, and handwritten", description: "Grade the full range of how students express knowledge — spoken answers, free-response essays, handwritten math photographed mid-problem, and multi-step solutions graded step by step.", icon: ClipboardCheck, letter: "Gr", status: "live", accessTier: "trial", featured: true, related: { tools: ["fastfire", "practice-tests"] } },
  { slug: "handwriting-grading", name: "Handwriting & Whiteboard", tagline: "Photograph your work; AI reads and grades it", description: "Snap a photo of worked math, a science diagram, or a whiteboard mid-problem. The AI understands what it sees, finds where the reasoning broke, and extends the work.", icon: PenTool, letter: "Hw", status: "live", accessTier: "trial", related: { tools: ["tutor"], subjects: ["math", "chemistry"] } },
  { slug: "spaced-repetition", name: "Spaced Repetition", tagline: "The SM-2+ engine behind every review queue", description: "Cards resurface at the scientifically optimal interval, weighted by your confidence ratings and live performance — the memory engine powering Learn mode.", icon: Repeat, letter: "SR", status: "live", accessTier: "free", related: { tools: ["flashcards"] } },
  { slug: "study-planner", name: "Study Planner", tagline: "A living plan around your exam dates", description: "AI builds a day-by-day plan from your exam dates, mastery levels, and available time — and re-plans automatically when a practice test reveals a gap.", icon: CalendarClock, letter: "Pl", status: "coming-soon", accessTier: "trial", related: { tools: ["practice-tests"] } },
  { slug: "progress-analytics", name: "Progress & Learning Gain", tagline: "Measured mastery, not just streaks", description: "Per-card accuracy, mastery percentages, weak-area surfacing, and pre/post learning-gain reporting — the outcome metric institutions actually buy.", icon: LineChart, letter: "Pr", status: "coming-soon", accessTier: "free", related: { tools: ["practice-tests"] } },
  { slug: "stem-tools", name: "STEM Tools", tagline: "Where every competitor falls short", description: "Full LaTeX rendering in every mode, step-by-step problem grading, handwritten-equation recognition, diagram analysis, and code understanding for CS.", icon: Sigma, letter: "St", status: "live", accessTier: "free", related: { subjects: ["math", "physics", "computer-science"], tools: ["tutor"] } },
];
