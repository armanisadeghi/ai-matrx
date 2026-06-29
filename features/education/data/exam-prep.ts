// features/education/data/exam-prep.ts
//
// EXAM PREP axis registry → /education/exam-prep/<slug>.
//
// Exam prep is its OWN top-level axis (Khan Academy's gold-standard model) with
// FLAT, exam-keyed slugs. An exam is a CROSS-CUTTING entity that references
// subjects + a level rather than nesting under them. Course-aligned exams (AP/IB)
// are dual-listed: canonical content lives with the subject, and also appears
// here. See VISION-education-hub.md §8 + "Standardized exam support".

import { Target, Stethoscope, Scale, GraduationCap, Calculator, FlaskConical, Atom, Brain, Landmark, Code2, Globe2, HeartPulse, Briefcase } from "lucide-react";
import type { AxisEntry } from "../types";

export const EXAMS: AxisEntry[] = [
  {
    slug: "mcat",
    name: "MCAT",
    tagline: "The medical-school marathon, conquered",
    description:
      "The MCAT spans biology, chemistry, physics, and psychology — so prep can't live in one subject. Generate high-yield decks across all four, drill them with FastFire spoken recall, and take full timed practice sections with item-level feedback that targets your weakest content.",
    icon: Stethoscope,
    letter: "MC",
    status: "live",
    accessTier: "free",
    featured: true,
    keywords: ["MCAT prep", "MCAT flashcards", "MCAT practice test", "med school"],
    meta: { examFor: "Medical school", level: "Graduate" },
    related: {
      subjects: ["biology", "chemistry", "physics", "psychology"],
      tools: ["fastfire", "practice-tests", "tutor"],
    },
    sections: [
      {
        kind: "feature-grid",
        heading: "Built for a four-subject exam",
        subheading:
          "The MCAT punishes single-subject study. The platform builds one cross-subject system and drills the connections.",
        items: [
          { icon: FlaskConical, title: "High-yield decks, all four sciences", description: "Generate cross-subject flashcards from your prep books and class notes in one library." },
          { icon: Target, title: "Spoken recall under pressure", description: "FastFire fires questions at exam pace and grades your spoken answers in real time." },
          { icon: Brain, title: "Pattern-spotting professor grader", description: "A batch-level AI reviews your sessions and names the systematic misconceptions costing you points." },
        ],
      },
    ],
  },
  { slug: "sat", name: "SAT", tagline: "Digital SAT — reading, writing, and math", description: "Adaptive practice for the digital SAT with full-length timed sections, instant scoring, and a study plan that builds around your test date.", icon: Target, letter: "SA", status: "live", accessTier: "free", featured: true, meta: { examFor: "College admissions", level: "High school" }, related: { subjects: ["math", "english"], tools: ["practice-tests", "fastfire"] } },
  { slug: "act", name: "ACT", tagline: "English, math, reading, and science", description: "Timed section practice and targeted drills for every ACT section, with a plan that adapts as your scores climb.", icon: Target, letter: "AC", status: "live", accessTier: "free", featured: true, meta: { examFor: "College admissions", level: "High school" }, related: { subjects: ["math", "english"], tools: ["practice-tests"] } },
  { slug: "lsat", name: "LSAT", tagline: "Logical reasoning and reading comprehension", description: "Drill logic games and argument structures, with an AI tutor that explains why each answer is right or wrong.", icon: Scale, letter: "LS", status: "live", accessTier: "free", featured: true, meta: { examFor: "Law school", level: "Graduate" }, related: { tools: ["tutor", "practice-tests"] } },
  { slug: "gre", name: "GRE", tagline: "Verbal, quant, and analytical writing", description: "Vocabulary FastFire, quant problem-solving with step grading, and essay coaching for the analytical writing section.", icon: GraduationCap, letter: "GR", status: "live", accessTier: "free", meta: { examFor: "Graduate school", level: "Graduate" }, related: { subjects: ["math", "english"], tools: ["fastfire", "tutor"] } },
  { slug: "gmat", name: "GMAT", tagline: "For business school", description: "Quant, verbal, and data insights practice with adaptive difficulty and detailed score reporting.", icon: Briefcase, letter: "GM", status: "coming-soon", accessTier: "free", meta: { examFor: "Business school", level: "Graduate" }, related: { tools: ["practice-tests"] } },
  { slug: "bar", name: "Bar Exam", tagline: "Pass the bar with structured mastery", description: "Memorize black-letter law with spaced repetition and rehearse essays and MBE questions with rubric-aware grading.", icon: Scale, letter: "Ba", status: "coming-soon", accessTier: "free", meta: { examFor: "Legal licensure", level: "Professional" }, related: { tools: ["fastfire", "tutor"] } },
  { slug: "nclex", name: "NCLEX", tagline: "Nursing boards, drilled to confidence", description: "High-yield nursing decks, prioritization practice, and spoken recall for the NCLEX-RN and NCLEX-PN.", icon: HeartPulse, letter: "NC", status: "coming-soon", accessTier: "free", meta: { examFor: "Nursing licensure", level: "Professional" }, related: { subjects: ["biology"], tools: ["fastfire", "practice-tests"] } },
  { slug: "cpa", name: "CPA", tagline: "The accounting licensure exam", description: "Master the four CPA sections with targeted drills, formula cards, and full practice simulations.", icon: Calculator, letter: "CP", status: "coming-soon", accessTier: "free", meta: { examFor: "Accounting licensure", level: "Professional" }, related: { tools: ["flashcards", "practice-tests"] } },
  // Course-aligned AP exams (dual-listed with their subjects)
  { slug: "ap-world-history", name: "AP World History", tagline: "Eras, themes, and the DBQ", description: "Build timelines, drill key terms, and practice document-based questions with AI feedback tuned to the AP rubric.", icon: Globe2, letter: "AW", status: "live", accessTier: "free", featured: true, meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["world-history"], tools: ["mind-maps", "practice-tests"], content: ["ap-world-history"] } },
  { slug: "ap-biology", name: "AP Biology", tagline: "Big ideas and lab skills", description: "Diagram-rich decks and free-response practice aligned to the AP Biology framework.", icon: FlaskConical, letter: "AB", status: "live", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["biology"], tools: ["flashcards", "practice-tests"] } },
  { slug: "ap-chemistry", name: "AP Chemistry", tagline: "Reactions, equilibrium, and FRQs", description: "Master AP Chemistry units with equation practice and multi-step problem grading.", icon: FlaskConical, letter: "AC", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["chemistry"], tools: ["tutor", "practice-tests"] } },
  { slug: "ap-physics", name: "AP Physics", tagline: "Mechanics to electromagnetism", description: "Concept review and step-by-step problem grading across the AP Physics sequence.", icon: Atom, letter: "AP", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["physics"], tools: ["tutor"] } },
  { slug: "ap-calculus", name: "AP Calculus", tagline: "AB and BC, fully worked", description: "Limits to series, with full LaTeX rendering and step-graded practice problems.", icon: Calculator, letter: "AK", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["math"], tools: ["tutor", "practice-tests"] } },
  { slug: "ap-psychology", name: "AP Psychology", tagline: "Studies, theorists, and terms", description: "Spaced-repetition decks and FRQ practice for the AP Psychology exam.", icon: Brain, letter: "AY", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["psychology"], tools: ["flashcards", "fastfire"] } },
  { slug: "ap-economics", name: "AP Economics", tagline: "Micro and macro", description: "Graphs, models, and FRQ practice for both AP Economics exams.", icon: Landmark, letter: "AE", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["economics"], tools: ["flashcards"] } },
  { slug: "ap-computer-science", name: "AP Computer Science", tagline: "A and Principles", description: "Code comprehension drills and concept quizzes for both AP CS exams.", icon: Code2, letter: "AS", status: "coming-soon", accessTier: "free", meta: { examFor: "College credit", level: "High school" }, related: { subjects: ["computer-science"], tools: ["tutor"] } },
];
