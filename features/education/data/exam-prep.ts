// features/education/data/exam-prep.ts
//
// EXAM PREP axis registry → /education/exam-prep/<slug>.
//
// Exam prep is its OWN top-level axis (Khan Academy's gold-standard model) with
// FLAT, exam-keyed slugs. An exam is a CROSS-CUTTING entity that references
// subjects + a level rather than nesting under them. Course-aligned exams (AP/IB)
// are dual-listed: canonical content lives with the subject, and also appears
// here. See VISION-education-hub.md §8 + "Standardized exam support".

import { Target, Stethoscope, Scale, GraduationCap, Calculator, FlaskConical, Atom, Brain, Landmark, Code2, Globe2, HeartPulse, Briefcase, BookOpen, Sigma, CalendarDays, PenLine, FileText, ListChecks, Pill, ClipboardCheck, Workflow, Microscope, LineChart, TrendingUp } from "lucide-react";
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
  {
    slug: "sat",
    name: "SAT",
    tagline: "Digital SAT — reading, writing, and math",
    description: "Adaptive practice for the digital SAT with full-length timed sections, instant scoring, and a study plan that builds around your test date.",
    icon: Target,
    letter: "SA",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { examFor: "College admissions", level: "High school" },
    related: { subjects: ["math", "english"], tools: ["practice-tests", "fastfire"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Built for the digital, adaptive SAT",
        subheading:
          "The exam adapts to you in two modules per section — so your prep does too. Two sections, drilled the way the test actually runs.",
        items: [
          { icon: BookOpen, title: "Reading & Writing, module by module", description: "Short-passage practice for craft, structure, ideas, and standard-English conventions, with explanations for every choice." },
          { icon: Sigma, title: "Math with on-screen calculator drills", description: "Algebra, advanced math, problem-solving, and geometry — step-graded so you see exactly where the work broke down." },
          { icon: Target, title: "Adaptive second module", description: "Practice routes you to harder or easier follow-up questions just like the real stage-adaptive engine, so the score you see is honest." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "2", label: "Adaptive sections" },
          { value: "1600", label: "Score scale" },
          { value: "~2h 14m", label: "Total test time" },
        ],
      },
    ],
  },
  {
    slug: "act",
    name: "ACT",
    tagline: "English, math, reading, and science",
    description: "Timed section practice and targeted drills for every ACT section, with a plan that adapts as your scores climb.",
    icon: Target,
    letter: "AC",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { examFor: "College admissions", level: "High school" },
    related: { subjects: ["math", "english"], tools: ["practice-tests"] },
    sections: [
      {
        kind: "steps",
        heading: "A plan tuned to the ACT's pace",
        subheading:
          "The ACT is a speed test as much as a knowledge test. The platform builds the pacing in from day one.",
        steps: [
          { number: "01", title: "Baseline a full timed test", description: "Sit a complete English, Math, Reading, and Science run so the planner knows your real composite and per-section gaps." },
          { number: "02", title: "Drill your weakest section", description: "Targeted sets resurface the question types that cost you points, weighted by spaced repetition." },
          { number: "03", title: "Rehearse the Science reasoning", description: "Practice reading graphs, tables, and conflicting-viewpoint passages under the clock — the section that rewards strategy over recall." },
          { number: "04", title: "Re-test and re-plan", description: "Take another timed section; the study plan reshuffles automatically as your composite climbs toward your target." },
        ],
      },
      {
        kind: "faq",
        heading: "ACT prep questions",
        items: [
          { q: "Does the platform cover the Science section?", a: "Yes. Science is mostly data-reasoning, not memorization, so practice focuses on interpreting graphs, tables, and experiment summaries quickly — with item-level feedback on every miss." },
          { q: "How does pacing practice work?", a: "Every full and section practice test runs on a configurable timer that mirrors the ACT's tight per-question budget, and your results report flags where you ran out of time versus got a question wrong." },
          { q: "Can I prep for the optional Writing test?", a: "Yes. The AI essay coach gives feedback on argument, development, organization, and language so you can rehearse the writing prompt before test day." },
        ],
      },
    ],
  },
  {
    slug: "lsat",
    name: "LSAT",
    tagline: "Logical reasoning and reading comprehension",
    description: "Drill logic games and argument structures, with an AI tutor that explains why each answer is right or wrong.",
    icon: Scale,
    letter: "LS",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { examFor: "Law school", level: "Graduate" },
    related: { tools: ["tutor", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Master the reasoning, not just the answers",
        subheading:
          "The LSAT tests how you think. The tutor works the argument with you instead of handing over a letter.",
        columns: 2,
        items: [
          { icon: Brain, title: "Logical Reasoning by question type", description: "Drill assumption, flaw, strengthen/weaken, and inference questions in focused sets, with the argument structure broken down on every miss." },
          { icon: BookOpen, title: "Reading Comprehension under load", description: "Practice dense legal, scientific, and humanities passages and the comparative pair, training you to map structure fast." },
        ],
      },
      {
        kind: "prose",
        heading: "Why an explaining tutor beats an answer key",
        body:
          "On the LSAT, getting a question right for the wrong reason is a trap — the next question will punish the same fuzzy thinking. The platform's tutor is Socratic by design: when you miss, it asks what the argument actually claimed, where the gap was, and why the trap answer was tempting, so the underlying skill transfers across every question of that type.\n\nEvery full and section practice run is timed to the real format and produces an item-level report, so you can separate the questions you got wrong from the ones you simply ran out of time to reach — the two demand completely different fixes.",
      },
    ],
  },
  {
    slug: "gre",
    name: "GRE",
    tagline: "Verbal, quant, and analytical writing",
    description: "Vocabulary FastFire, quant problem-solving with step grading, and essay coaching for the analytical writing section.",
    icon: GraduationCap,
    letter: "GR",
    status: "live",
    accessTier: "free",
    meta: { examFor: "Graduate school", level: "Graduate" },
    related: { subjects: ["math", "english"], tools: ["fastfire", "tutor"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "All three measures, one system",
        subheading:
          "Verbal vocabulary, quant reasoning, and the analytical essays each need a different drill. The platform runs all three.",
        items: [
          { icon: BookOpen, title: "Verbal with vocabulary FastFire", description: "Text completion and sentence equivalence live or die on word knowledge — FastFire fires high-frequency GRE vocab at you and grades your spoken recall." },
          { icon: Sigma, title: "Quant with step grading", description: "Quantitative comparison and problem-solving worked one step at a time, so the tutor pinpoints exactly where your reasoning slipped." },
          { icon: PenLine, title: "Analytical Writing coaching", description: "The 'Analyze an Issue' task graded against the official dimensions — argument, development, and clarity — with specific, rubric-aware feedback." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "3", label: "Measured areas" },
          { value: "130–170", label: "Per-section scale" },
          { value: "1", label: "Analytical essay" },
        ],
      },
    ],
  },
  {
    slug: "gmat",
    name: "GMAT",
    tagline: "For business school",
    description: "Quant, verbal, and data insights practice with adaptive difficulty and detailed score reporting.",
    icon: Briefcase,
    letter: "GM",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "Business school", level: "Graduate" },
    related: { tools: ["practice-tests"] },
    sections: [
      {
        kind: "steps",
        heading: "A path through all three sections",
        subheading:
          "The GMAT Focus Edition rewards a balanced score across Quant, Verbal, and the new Data Insights. The plan keeps all three moving.",
        steps: [
          { number: "01", title: "Diagnose with a timed run", description: "A full practice exam sets your baseline across Quantitative Reasoning, Verbal Reasoning, and Data Insights." },
          { number: "02", title: "Build Quant and Verbal fundamentals", description: "Targeted problem-solving and critical-reasoning sets, step-graded so you see where the logic broke." },
          { number: "03", title: "Train Data Insights", description: "Practice multi-source reasoning, table analysis, and graphics interpretation — the integrated section that trips up most test-takers." },
          { number: "04", title: "Simulate the adaptive exam", description: "Full timed practice tests with a detailed score report so you walk in knowing your pacing and your weak spots." },
        ],
      },
      {
        kind: "faq",
        heading: "GMAT prep questions",
        items: [
          { q: "Does this cover the GMAT Focus Edition?", a: "Yes — the prep is organized around the current three-section format: Quantitative Reasoning, Verbal Reasoning, and Data Insights, including the question-review flexibility the Focus Edition allows." },
          { q: "How is the adaptive format handled?", a: "Full practice tests adjust question difficulty as you answer, mirroring the computer-adaptive engine, and the results report shows your performance band by section." },
          { q: "Can I drill just Data Insights?", a: "Yes. Because Data Insights is the newest and most distinctive section, you can run focused sets on multi-source reasoning and graphics interpretation on their own." },
        ],
      },
    ],
  },
  {
    slug: "bar",
    name: "Bar Exam",
    tagline: "Pass the bar with structured mastery",
    description: "Memorize black-letter law with spaced repetition and rehearse essays and MBE questions with rubric-aware grading.",
    icon: Scale,
    letter: "Ba",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "Legal licensure", level: "Professional" },
    related: { tools: ["fastfire", "tutor"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Every part of the bar, one workflow",
        subheading:
          "Black-letter recall, timed essays, and applied lawyering each demand a different drill. The platform runs all three.",
        items: [
          { icon: Scale, title: "MBE multiple choice", description: "Drill the multistate subjects with spaced repetition and timed question sets, with the governing rule surfaced on every miss." },
          { icon: PenLine, title: "Essays with rubric-aware grading", description: "Write essay answers and get feedback on issue spotting, rule statements, and application — graded against the criteria graders actually use." },
          { icon: FileText, title: "Performance-test rehearsal", description: "Practice the closed-universe lawyering task under the clock, building the skill of organizing a memo or brief from a fresh file." },
        ],
      },
      {
        kind: "prose",
        heading: "Volume is the enemy — spaced repetition is the answer",
        body:
          "No exam asks you to hold more black-letter law in active memory at once than the bar. Cramming it the week before is exactly how it slips away. The platform schedules every rule on a spaced-repetition curve from the start of your study window, so the law you learned in week one is still there on test day instead of fading.\n\nFastFire spoken recall turns dead drive time into review: the system fires rule statements and elements at you and grades your spoken answers, which is far closer to the recall the essays demand than silently re-reading an outline.",
      },
    ],
  },
  {
    slug: "nclex",
    name: "NCLEX",
    tagline: "Nursing boards, drilled to confidence",
    description: "High-yield nursing decks, prioritization practice, and spoken recall for the NCLEX-RN and NCLEX-PN.",
    icon: HeartPulse,
    letter: "NC",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "Nursing licensure", level: "Professional" },
    related: { subjects: ["biology"], tools: ["fastfire", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Think like a nurse, not a memorizer",
        subheading:
          "The NCLEX tests clinical judgment, not trivia. The platform drills the way the exam scores you.",
        items: [
          { icon: ListChecks, title: "Prioritization and delegation", description: "Practice 'who do you see first' and safe-delegation questions — the judgment calls that decide pass-or-fail far more than rote facts." },
          { icon: Pill, title: "High-yield pharmacology decks", description: "Spaced-repetition cards for the drug classes, side effects, and nursing implications that appear again and again." },
          { icon: HeartPulse, title: "Spoken recall under pressure", description: "FastFire fires labs, ranges, and intervention steps at you and grades your spoken answers, building the instant recall the clinical setting demands." },
        ],
      },
      {
        kind: "faq",
        heading: "NCLEX prep questions",
        items: [
          { q: "Does this match the computer-adaptive format?", a: "Yes. Practice tests adapt difficulty as you answer and can run to a variable length, mirroring the NCLEX's computer-adaptive engine instead of a fixed question count." },
          { q: "Are Next Generation NCLEX item types covered?", a: "The platform's question engine supports case-study and clinical-judgment style items so you can rehearse the newer NGN formats, not just standard multiple choice." },
          { q: "Does it work for both RN and PN?", a: "Yes. Decks and practice sets can be scoped to the NCLEX-RN or NCLEX-PN, since the high-yield content and judgment expectations differ between them." },
        ],
      },
    ],
  },
  {
    slug: "cpa",
    name: "CPA",
    tagline: "The accounting licensure exam",
    description: "Master the four CPA sections with targeted drills, formula cards, and full practice simulations.",
    icon: Calculator,
    letter: "CP",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "Accounting licensure", level: "Professional" },
    related: { tools: ["flashcards", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "All four sections, plus your discipline",
        subheading:
          "Under the CPA Evolution model you sit three core sections and one discipline. The platform builds a deck and a drill for each.",
        columns: 2,
        items: [
          { icon: FileText, title: "Core — FAR & REG", description: "Financial accounting and reporting plus taxation and regulation, with formula cards and step-graded calculation practice." },
          { icon: ClipboardCheck, title: "Core — AUD", description: "Auditing and attestation drilled with scenario questions, so the procedures and standards stick in the order you'll apply them." },
          { icon: Scale, title: "Your discipline section", description: "Focused sets for whichever discipline you chose — business analysis, information systems, or tax compliance and planning." },
          { icon: Calculator, title: "Task-based simulations", description: "Full practice simulations mirror the exam's applied format, with a detailed report on exactly which competencies need another pass." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "3", label: "Core sections" },
          { value: "1", label: "Discipline section" },
          { value: "75", label: "Score to pass" },
        ],
      },
    ],
  },
  // Course-aligned AP exams (dual-listed with their subjects)
  {
    slug: "ap-world-history",
    name: "AP World History",
    tagline: "Eras, themes, and the DBQ",
    description: "Build timelines, drill key terms, and practice document-based questions with AI feedback tuned to the AP rubric.",
    icon: Globe2,
    letter: "AW",
    status: "live",
    accessTier: "free",
    featured: true,
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["world-history"], tools: ["mind-maps", "practice-tests"], content: ["ap-world-history"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "From dates to arguments",
        subheading:
          "AP World rewards continuity, change, and causation across eras — not flashcard trivia alone. The platform builds both.",
        items: [
          { icon: CalendarDays, title: "Period timelines you can see", description: "Auto-generate timelines and mind maps from your notes so the relationships between events across an era click into place." },
          { icon: Workflow, title: "Themes and comparisons", description: "Drill the course's recurring themes — governance, economics, technology, culture — and the cross-regional comparisons the exam loves." },
          { icon: PenLine, title: "DBQ and LEQ practice", description: "Write document-based and long-essay responses graded against the AP rubric: thesis, evidence, contextualization, and reasoning." },
        ],
      },
      {
        kind: "steps",
        heading: "How a free-response answer gets graded",
        subheading: "The AI essay coach mirrors how a reader scores your DBQ.",
        steps: [
          { number: "01", title: "Thesis check", description: "It first looks for a defensible thesis that actually responds to the prompt — the rubric's foundation." },
          { number: "02", title: "Evidence and documents", description: "It scores how well you used the provided documents and brought in outside evidence to support the argument." },
          { number: "03", title: "Contextualization", description: "It checks that you situated the prompt in a broader historical setting rather than answering in a vacuum." },
          { number: "04", title: "Reasoning and complexity", description: "Finally it weighs your analysis and complexity, then tells you in plain language which rubric point to chase next." },
        ],
      },
    ],
  },
  {
    slug: "ap-biology",
    name: "AP Biology",
    tagline: "Big ideas and lab skills",
    description: "Diagram-rich decks and free-response practice aligned to the AP Biology framework.",
    icon: FlaskConical,
    letter: "AB",
    status: "live",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["biology"], tools: ["flashcards", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "The four big ideas, made concrete",
        subheading:
          "AP Biology is organized around big ideas and science practices, not isolated facts. The platform drills both the content and the skills.",
        items: [
          { icon: FlaskConical, title: "Diagram-rich concept decks", description: "Cards carry the figures that matter — cellular processes, genetics, and systems — because AP Bio is a visual exam, not a text dump." },
          { icon: Microscope, title: "Experimental design and data", description: "Practice interpreting experiments, controls, and graphs, the science-practice skills the multiple-choice section leans on hard." },
          { icon: PenLine, title: "Free-response practice", description: "Long and short FRQs graded against the AP framework, with feedback on how you justified claims with evidence and reasoning." },
        ],
      },
      {
        kind: "faq",
        heading: "AP Biology prep questions",
        items: [
          { q: "Will rote memorization be enough?", a: "No — and that's the point. The redesigned AP Biology exam emphasizes applying concepts and analyzing data, so the platform pairs content decks with experiment-and-graph reasoning practice." },
          { q: "Does it handle the math and statistics?", a: "Yes. Grid-in and analysis questions involving chi-square, water potential, and rates of change are worked step by step so you see where a calculation went wrong." },
          { q: "How does FRQ feedback work?", a: "The AI grades your free responses against the rubric's expectations for claims, evidence, and reasoning, then names the specific point you missed rather than just marking it wrong." },
        ],
      },
    ],
  },
  {
    slug: "ap-chemistry",
    name: "AP Chemistry",
    tagline: "Reactions, equilibrium, and FRQs",
    description: "Master AP Chemistry units with equation practice and multi-step problem grading.",
    icon: FlaskConical,
    letter: "Ch",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["chemistry"], tools: ["tutor", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Where most AP Chem points are won and lost",
        subheading:
          "The exam rewards quantitative reasoning and clear justification. The platform drills the calculation and the explanation together.",
        items: [
          { icon: Atom, title: "Reactions and bonding", description: "Concept decks for atomic structure, bonding, and intermolecular forces — the foundation every later unit builds on." },
          { icon: FlaskConical, title: "Equilibrium and kinetics", description: "Drill the units that carry the most weight, with the tutor explaining why a system shifts the way it does, not just the answer." },
          { icon: Calculator, title: "Multi-step problem grading", description: "Stoichiometry, thermochemistry, and equilibrium calculations graded one step at a time, pinpointing exactly where the work broke down." },
        ],
      },
      {
        kind: "prose",
        heading: "The free-response section rewards justification",
        body:
          "On AP Chemistry, a correct number with no explanation still loses points — the free-response section is graded as much on the reasoning as the result. The platform's tutor coaches you to state the relevant principle, connect it to particle-level behavior, and justify each step, so your written answers earn the full rubric credit instead of stalling at the calculation.\n\nBecause so much of the exam is quantitative, step-by-step grading matters: when a four-step equilibrium problem comes out wrong, you see which step failed rather than starting over from scratch.",
      },
    ],
  },
  {
    slug: "ap-physics",
    name: "AP Physics",
    tagline: "Mechanics to electromagnetism",
    description: "Concept review and step-by-step problem grading across the AP Physics sequence.",
    icon: Atom,
    letter: "AP",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["physics"], tools: ["tutor"] },
    sections: [
      {
        kind: "steps",
        heading: "Build problem-solving, not formula-hunting",
        subheading:
          "AP Physics free responses reward a clear method. The tutor trains the method, then the recall.",
        steps: [
          { number: "01", title: "Nail the concepts first", description: "Concept decks lock in the models — forces, energy, fields — so you reach for the right principle before any algebra." },
          { number: "02", title: "Set up before you solve", description: "Practice translating a scenario into a diagram and the governing equations, the habit that earns setup points on the FRQ." },
          { number: "03", title: "Grade each step", description: "Multi-step problems are graded one line at a time, so a sign error in step two doesn't hide what you did right after." },
          { number: "04", title: "Explain the physics", description: "Rehearse the qualitative 'justify your answer' prompts where points come from reasoning in words, not just numbers." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "Across the whole AP Physics sequence",
        subheading:
          "Whether you sit Physics 1, 2, or C, the platform scopes the content and the math to your course.",
        columns: 2,
        items: [
          { icon: Atom, title: "Mechanics through E&M", description: "Kinematics, dynamics, energy, and electricity and magnetism, each with concept review tuned to your specific AP Physics course." },
          { icon: Calculator, title: "Calculus-ready for Physics C", description: "For the C sequence, problem grading handles the calculus-based treatments of motion and fields, with full LaTeX rendering." },
        ],
      },
    ],
  },
  {
    slug: "ap-calculus",
    name: "AP Calculus",
    tagline: "AB and BC, fully worked",
    description: "Limits to series, with full LaTeX rendering and step-graded practice problems.",
    icon: Calculator,
    letter: "AK",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["math"], tools: ["tutor", "practice-tests"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Limits to series, every step shown",
        subheading:
          "Calculus errors hide inside long solutions. Step grading and full LaTeX rendering make every line visible.",
        items: [
          { icon: Sigma, title: "Derivatives and integrals", description: "Drill the core techniques with step-graded problems and beautifully rendered notation, so a slip in the chain rule doesn't sink the whole answer." },
          { icon: LineChart, title: "Graphical and analytical reasoning", description: "Practice reading a function from its graph, table, or equation — the multiple representations the exam constantly switches between." },
          { icon: Calculator, title: "BC topics: series and beyond", description: "For BC, extend into sequences, series, parametric, and polar work, with the tutor walking convergence tests one criterion at a time." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "AB / BC", label: "Both courses" },
          { value: "1–5", label: "Score scale" },
          { value: "2", label: "FRQ calculator modes" },
        ],
      },
    ],
  },
  {
    slug: "ap-psychology",
    name: "AP Psychology",
    tagline: "Studies, theorists, and terms",
    description: "Spaced-repetition decks and FRQ practice for the AP Psychology exam.",
    icon: Brain,
    letter: "AY",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["psychology"], tools: ["flashcards", "fastfire"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "A vocabulary-dense exam, mastered with recall",
        subheading:
          "AP Psychology lives and dies on terms, theorists, and studies. Spaced repetition and spoken recall are built for exactly this.",
        items: [
          { icon: Brain, title: "Terms and theorists on a curve", description: "Spaced-repetition decks keep hundreds of concepts and the people behind them in active memory all the way to test day." },
          { icon: BookOpen, title: "Landmark studies", description: "Drill the classic experiments and their findings — the recurring exam fodder that ties abstract concepts to concrete evidence." },
          { icon: PenLine, title: "FRQ application practice", description: "Rehearse applying concepts to a scenario in writing, graded the way the exam scores you: did you define it, then correctly apply it?" },
        ],
      },
      {
        kind: "faq",
        heading: "AP Psychology prep questions",
        items: [
          { q: "Why lead with FastFire for this exam?", a: "AP Psych is unusually terminology-heavy, and FastFire's rapid spoken recall is ideal for high-volume vocabulary — it fires terms at you and grades your answers out loud, far faster than flipping cards one by one." },
          { q: "How are the free-response questions practiced?", a: "You write responses to applied scenarios and the AI grades them against the rubric's define-and-apply expectations, flagging where you named a concept but didn't actually apply it to the prompt." },
          { q: "Does it cover the full course?", a: "Yes — decks and practice span the course units from biological bases and cognition to development, social psychology, and mental health." },
        ],
      },
    ],
  },
  {
    slug: "ap-economics",
    name: "AP Economics",
    tagline: "Micro and macro",
    description: "Graphs, models, and FRQ practice for both AP Economics exams.",
    icon: Landmark,
    letter: "AE",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["economics"], tools: ["flashcards"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Two exams, one graph-driven discipline",
        subheading:
          "AP Micro and AP Macro both turn on reading and drawing models correctly. The platform drills the diagrams, not just definitions.",
        items: [
          { icon: TrendingUp, title: "Microeconomics models", description: "Supply and demand, elasticity, costs, and market structures — drilled until you can shift a curve and read the new equilibrium fast." },
          { icon: Landmark, title: "Macroeconomics models", description: "AD-AS, the money market, and loanable funds, with the policy effects traced through each diagram the way the FRQ expects." },
          { icon: LineChart, title: "Graph and FRQ practice", description: "Practice the free-response habit that earns points: draw the correctly labeled graph, then explain the change it shows in words." },
        ],
      },
      {
        kind: "prose",
        heading: "Graphs are the language — the FRQ is graded in it",
        body:
          "Most lost points on the AP Economics exams come from graphs that are unlabeled, mislabeled, or shifted the wrong way. The free-response section explicitly asks you to draw and then interpret models, so memorizing definitions without being fluent in the diagrams leaves easy points on the table.\n\nThe platform pairs concept decks with graph-and-explanation practice so the two reinforce each other: you learn the term, then immediately use it to justify a movement on the correct model — which is exactly what a reader is scoring.",
      },
    ],
  },
  {
    slug: "ap-computer-science",
    name: "AP Computer Science",
    tagline: "A and Principles",
    description: "Code comprehension drills and concept quizzes for both AP CS exams.",
    icon: Code2,
    letter: "AS",
    status: "coming-soon",
    accessTier: "free",
    meta: { examFor: "College credit", level: "High school" },
    related: { subjects: ["computer-science"], tools: ["tutor"] },
    sections: [
      {
        kind: "feature-grid",
        heading: "Two very different CS exams",
        subheading:
          "AP CS A is Java and object-oriented programming; AP CS Principles is broad computing concepts. The platform tracks whichever you're taking.",
        columns: 2,
        items: [
          { icon: Code2, title: "CS A — read and reason about code", description: "Paste or generate Java snippets and have the tutor explain control flow, objects, and output, then quiz you on what the code actually does." },
          { icon: Workflow, title: "CS A — algorithms and structures", description: "Drill loops, recursion, arrays, and ArrayLists with the trace-the-execution questions the multiple-choice section is built around." },
          { icon: Globe2, title: "CS Principles — big ideas", description: "Concept decks for data, the internet, algorithms, and the societal impacts of computing that the CSP exam emphasizes." },
          { icon: Brain, title: "CS Principles — exam practice", description: "Quiz on the computational-thinking concepts behind the course so the written exam reinforces what your Create task already taught you." },
        ],
      },
      {
        kind: "steps",
        heading: "How code comprehension drills work",
        subheading: "The tutor turns any snippet into an understanding check.",
        steps: [
          { number: "01", title: "Read the code", description: "Paste a method or upload a class and the tutor walks the logic line by line in plain language." },
          { number: "02", title: "Predict the output", description: "It quizzes you on what the code returns or prints before revealing the answer, training exam-style tracing." },
          { number: "03", title: "Find the bug", description: "It introduces a subtle error and asks you to spot it, the skill the free-response code questions reward." },
          { number: "04", title: "Explain in words", description: "Finally you describe what the algorithm does and why, locking in conceptual understanding over rote syntax." },
        ],
      },
    ],
  },
];
