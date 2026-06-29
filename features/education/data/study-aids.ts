// features/education/data/study-aids.ts
//
// STUDY AIDS axis registry → /education/study-aids/<slug>.
// These are MARKETING pages for each study-aid TYPE (what it is, who it helps).
// Each links to its interactive APP tool at /education/<tool> (the content→app
// conversion bridge). Tracks VISION-education-hub.md §1,2,8,9,10,11.

import {
  Layers,
  ListChecks,
  FileCheck2,
  Headphones,
  Network,
  Lightbulb,
  NotebookPen,
  ScrollText,
  ToggleLeft,
  PenLine,
  MessageSquareText,
  Target,
  Sparkles,
  Timer,
  TrendingUp,
  BarChart3,
  Radio,
  Users,
  Mic,
  Volume2,
  MousePointerClick,
  Workflow,
  GitFork,
  Map,
  KeyRound,
  Brain,
  Building2,
  Highlighter,
  BookOpen,
  Boxes,
  Link2,
} from "lucide-react";
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
  {
    slug: "quizzes",
    name: "Quizzes & Tests",
    tagline: "Auto-generated from any material",
    description:
      "Multiple choice, true/false, fill-in-the-blank, short answer, and written response — generated from any deck or upload, with detailed item-level feedback.",
    icon: ListChecks,
    letter: "Qz",
    status: "live",
    accessTier: "free",
    featured: true,
    related: { tools: ["quizzes", "practice-tests"] },
    sections: [
      {
        kind: "prose",
        heading: "Quizzing is how memory becomes mastery",
        body: "A quiz isn't busywork — retrieval practice is one of the most powerful learning techniques there is. Pulling an answer out of memory strengthens it far more than re-reading ever could. AI Matrx turns any deck, document, or topic into a quiz in seconds, then tells you exactly what each wrong answer reveals — so every attempt is a study session, not just a score.",
      },
      {
        kind: "feature-grid",
        heading: "Five question types, one generator",
        subheading: "The same source material, asked five different ways — because varied retrieval sticks better.",
        columns: 3,
        items: [
          { icon: ListChecks, title: "Multiple choice", description: "Plausible distractors generated from your own material, not random filler." },
          { icon: ToggleLeft, title: "True / false", description: "Fast recall checks that surface the misconceptions hiding in your confidence." },
          { icon: PenLine, title: "Fill in the blank", description: "Active recall of the exact term, formula, or date — no recognition shortcuts." },
          { icon: MessageSquareText, title: "Short answer", description: "A sentence or two in your own words, graded against the source for accuracy." },
          { icon: ScrollText, title: "Written response", description: "Longer free-text answers coached against rubric criteria drawn from your material." },
          { icon: Target, title: "Item-level feedback", description: "Every question explains why your answer was right or wrong and what to review next." },
        ],
      },
      {
        kind: "cta",
        heading: "Quiz yourself on anything",
        body: "Point it at a deck, a chapter, or a single prompt and get a graded quiz with explanations in seconds.",
        primary: { label: "Generate a quiz", href: "/education/quizzes" },
        secondary: { label: "Step up to a practice test", href: "/education/practice-tests" },
      },
    ],
  },
  {
    slug: "practice-tests",
    name: "Practice Tests",
    tagline: "Full simulated exams with real scoring",
    description:
      "Configurable, timed practice exams with question-mix and difficulty control, plus a scored report and pre/post learning-gain measurement.",
    icon: FileCheck2,
    letter: "Pt",
    status: "live",
    accessTier: "trial",
    featured: true,
    related: { tools: ["practice-tests"], exams: ["sat", "mcat"] },
    sections: [
      {
        kind: "prose",
        heading: "Walk into the real exam having already taken it",
        body: "A practice test isn't a longer quiz — it's a full dress rehearsal under exam conditions. Configure the time limit, question mix, and difficulty to mirror the test you're prepping for, then sit it start to finish. You get a scored report with item-level feedback on every question, so you know not just your number but exactly which concepts cost you points.",
      },
      {
        kind: "feature-grid",
        heading: "Built to feel like the real thing",
        subheading: "The conditions, the scoring, and the proof you actually improved.",
        columns: 2,
        items: [
          { icon: Timer, title: "Timed and configurable", description: "Set the clock, question count, type mix, and difficulty to match SAT, MCAT, AP, or your own midterm." },
          { icon: Target, title: "Item-level analysis", description: "Every wrong answer is explained — why it was wrong and exactly what to review before next time." },
          { icon: TrendingUp, title: "Pre / post learning gain", description: "Take a baseline before studying and a post-test after; we measure the actual delta, not just time spent." },
          { icon: BarChart3, title: "Progress over time", description: "Mastery percentages and improvement curves by subject and concept, tracked across every attempt." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "Pre + post", label: "Measured learning gain, not streaks" },
          { value: "Item-level", label: "Feedback on every single question" },
          { value: "Any exam", label: "SAT, ACT, AP, MCAT, LSAT, GRE, boards" },
        ],
      },
      {
        kind: "cta",
        heading: "Find out where you really stand",
        body: "Generate a full timed exam from your material and get a scored report that shows your learning gain.",
        primary: { label: "Take a practice test", href: "/education/practice-tests" },
        secondary: { label: "Warm up with a quiz", href: "/education/quizzes" },
      },
    ],
  },
  {
    slug: "audio-study",
    name: "Audio Study",
    tagline: "Podcasts, debates, and panels from your notes",
    description:
      "Broadcast-quality audio overviews, two-voice debates, and multi-host panels generated from any material — study on your commute, screen-free.",
    icon: Headphones,
    letter: "Au",
    status: "live",
    accessTier: "trial",
    featured: true,
    related: { tools: ["audio-study"], subjects: ["world-history", "economics"] },
    sections: [
      {
        kind: "prose",
        heading: "Turn any material into something you can listen to",
        body: "Some of your best study time is screen-free — commuting, walking, at the gym. AI Matrx turns your notes, PDFs, or any uploaded material into broadcast-quality audio you can absorb anywhere. Not a robotic text-to-speech dump: real production, multiple voices, and formats chosen to fit the subject.",
      },
      {
        kind: "feature-grid",
        heading: "Three ways to hear your material",
        subheading: "The format adapts to the content — a summary, a debate, or a full panel.",
        columns: 3,
        items: [
          { icon: Radio, title: "Audio overviews", description: "Podcast-style summaries of any topic — the fastest way to review a unit without opening a screen." },
          { icon: Users, title: "Dueling perspectives", description: "Two AI voices argue opposing sides — ideal for history, ethics, economics, law, and literature." },
          { icon: Mic, title: "Host and panelists", description: "A named host and panelists each bring different expertise for a real multi-voice discussion." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "More than passive listening",
        columns: 2,
        items: [
          { icon: Volume2, title: "Audio review sessions", description: "Questions read aloud, you answer out loud, and the AI grades your spoken response — FastFire in audio-only form." },
          { icon: Headphones, title: "Made for your commute", description: "Download and listen anywhere; your study time isn't limited to when you're sitting at a desk." },
        ],
      },
      {
        kind: "cta",
        heading: "Listen your way through the material",
        body: "Upload a chapter or point it at a topic and get a broadcast-quality overview, debate, or panel.",
        primary: { label: "Create audio study", href: "/education/audio-study" },
        secondary: { label: "Pair it with flashcards", href: "/education/flashcards" },
      },
    ],
  },
  {
    slug: "mind-maps",
    name: "Mind Maps & Diagrams",
    tagline: "See how concepts connect",
    description:
      "AI-generated mind maps, knowledge graphs, flowcharts, timelines, and comparison tables — clickable nodes link straight to the relevant cards and explanations.",
    icon: Network,
    letter: "Mm",
    status: "live",
    accessTier: "free",
    related: { tools: ["mind-maps"], subjects: ["world-history"] },
    sections: [
      {
        kind: "prose",
        heading: "Understanding isn't a list — it's a structure",
        body: "Facts in isolation are hard to hold; facts connected to each other are hard to forget. AI Matrx builds a visual map of how the ideas in your material relate — hierarchies, cause and effect, timelines, comparisons — so you can see the shape of a subject at a glance. And because every node is clickable, the map is also a launchpad: tap any concept to jump straight to the cards and explanations behind it.",
      },
      {
        kind: "feature-grid",
        heading: "Every way ideas connect",
        subheading: "One source, many views — the diagram type that fits how the concept actually works.",
        columns: 3,
        items: [
          { icon: Network, title: "Mind maps & knowledge graphs", description: "Concept hierarchies and relational maps that reveal how ideas link across a whole subject." },
          { icon: Workflow, title: "Flowcharts & cycles", description: "Processes, cause-and-effect chains, and cycle diagrams — generated straight from your material." },
          { icon: GitFork, title: "Trees, timelines & tables", description: "Hierarchical trees, chronological timelines, Venn diagrams, and comparison tables on demand." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "A map you can actually use",
        columns: 2,
        items: [
          { icon: MousePointerClick, title: "Clickable nodes", description: "Tap any node to open the relevant flashcards, notes, or an AI explanation — the map is a navigation layer, not a picture." },
          { icon: Map, title: "Clean, scalable output", description: "Every diagram is SVG-quality: crisp at any size and exportable for slides or study guides." },
        ],
      },
      {
        kind: "cta",
        heading: "See your subject, then drill into it",
        body: "Generate a mind map from your notes or a deck and click straight through to the cards behind each idea.",
        primary: { label: "Build a mind map", href: "/education/mind-maps" },
        secondary: { label: "Open the linked cards", href: "/education/flashcards" },
      },
    ],
  },
  {
    slug: "mnemonics",
    name: "Mnemonics & Memory Aids",
    tagline: "Make hard lists impossible to forget",
    description:
      "Auto-generated acronyms, rhymes, analogies, and memory-palace scaffolding that surface right alongside your toughest cards.",
    icon: Lightbulb,
    letter: "Mn",
    status: "coming-soon",
    accessTier: "free",
    related: { tools: ["flashcards"] },
    sections: [
      {
        kind: "prose",
        heading: "The trick every top student knows",
        body: "Some things just won't stick through repetition alone — ordered lists, arbitrary sequences, dense terminology. Mnemonics are the proven fix: a memorable hook that makes recall effortless. AI Matrx generates them automatically for your hardest material and surfaces them right alongside the cards you keep missing, so you never have to invent the trick yourself.",
      },
      {
        kind: "feature-grid",
        heading: "Four kinds of memory hook",
        subheading: "Matched to the content — the right device for what you're trying to remember.",
        columns: 2,
        items: [
          { icon: KeyRound, title: "Acronyms & rhymes", description: "First-letter acronyms and rhythmic rhymes that lock ordered lists and sequences into place." },
          { icon: Sparkles, title: "Analogies & memory bridges", description: "A relatable comparison for an abstract concept, so the unfamiliar attaches to something you already know." },
          { icon: Building2, title: "Memory-palace scaffolding", description: "Spatial structures the AI suggests for large content sets — the method of loci, set up for you." },
          { icon: Brain, title: "Proactive suggestions", description: "Memory aids appear automatically beside your toughest cards; you don't have to ask for them." },
        ],
      },
      {
        kind: "cta",
        heading: "Stop forgetting the hard lists",
        body: "Memory aids surface automatically alongside your flashcards — start a deck and watch them appear.",
        primary: { label: "Study with flashcards", href: "/education/flashcards" },
      },
    ],
  },
  {
    slug: "notes",
    name: "Smart Notes",
    tagline: "Write once, study everywhere",
    description:
      "A rich note editor where any note or highlighted passage converts in one click to flashcards, a quiz, a summary, or a mind map — nothing siloed.",
    icon: NotebookPen,
    letter: "Sn",
    status: "live",
    accessTier: "free",
    related: { tools: ["notes", "flashcards"] },
    sections: [
      {
        kind: "prose",
        heading: "Your notes are the start of the study loop, not the end",
        body: "In most apps, notes are where information goes to sit. Here they're the hub of everything. Write or paste in a full rich-text and markdown editor, then turn any note — or even a single highlighted passage — into flashcards, a quiz, a summary, or a mind map with one click. Nothing is siloed: what you write flows straight into how you study.",
      },
      {
        kind: "feature-grid",
        heading: "One editor, the whole study loop",
        subheading: "Capture it once; reuse it every way you learn.",
        columns: 2,
        items: [
          { icon: Highlighter, title: "Highlight to anything", description: "Select any passage and convert it instantly into cards, a quiz, a summary, or a mind map." },
          { icon: Mic, title: "Live lecture transcription", description: "Record in class and the transcript flows straight into the editor — annotate it live as you go." },
          { icon: Layers, title: "One-click conversion", description: "A whole note becomes a deck, a practice quiz, or a diagram without leaving the page." },
          { icon: Sparkles, title: "Rich text & markdown", description: "Full formatting, images, and structure — notes are real documents, not throwaway scratch." },
        ],
      },
      {
        kind: "cta",
        heading: "Take notes that study themselves",
        body: "Write or paste your notes, then turn a highlight into flashcards or a quiz in a single click.",
        primary: { label: "Open Smart Notes", href: "/education/notes" },
        secondary: { label: "Convert them to cards", href: "/education/flashcards" },
      },
    ],
  },
  {
    slug: "study-guides",
    name: "Study Guides",
    tagline: "Comprehensive, structured, exam-ready",
    description:
      "AI-built study guides that organize a whole subject or unit into a single reviewable document — with links to drill each section.",
    icon: ScrollText,
    letter: "Sg",
    status: "coming-soon",
    accessTier: "free",
    related: { tools: ["notes"], content: ["ap-world-history"] },
    sections: [
      {
        kind: "prose",
        heading: "Everything you need to review, in one place",
        body: "When an exam covers weeks of material, the hardest part is just seeing it all together. A study guide pulls a whole subject or unit into one structured, reviewable document — organized, comprehensive, and exam-ready. AI Matrx builds it from your notes, decks, or uploads, and every section links straight to the tools to drill it, so the guide is both your overview and your starting line.",
      },
      {
        kind: "feature-grid",
        heading: "Structured for the way you review",
        subheading: "A complete overview that doubles as a launchpad into focused practice.",
        columns: 3,
        items: [
          { icon: BookOpen, title: "Whole-unit coverage", description: "A full subject or unit organized into one clean, comprehensive document you can read end to end." },
          { icon: Boxes, title: "Logical structure", description: "Concepts grouped and ordered the way an instructor would teach them — not a wall of raw notes." },
          { icon: Link2, title: "Drill each section", description: "Every section links to flashcards, a quiz, or a practice test so you can act on a weak spot instantly." },
        ],
      },
      {
        kind: "cta",
        heading: "Build your exam-ready guide",
        body: "Smart Notes is where your study guides come together — write and organize, then drill each section.",
        primary: { label: "Start in Smart Notes", href: "/education/notes" },
        secondary: { label: "Turn sections into cards", href: "/education/flashcards" },
      },
    ],
  },
];
