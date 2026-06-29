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
  Beaker,
  Scale,
  TestTubes,
  Calculator,
  Waves,
  Orbit,
  PenTool,
  FunctionSquare,
  LineChart,
  Clock,
  GitBranch,
  Headphones,
  Network,
  PenLine,
  BookOpen,
  SpellCheck,
  Terminal,
  Binary,
  Bug,
  TrendingUp,
  Repeat,
  Lightbulb,
  Mic,
  MessageCircle,
  Zap,
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Chemistry that shows its work",
        subheading:
          "Photograph a worked problem or paste a reaction — the AI reads it, grades it, and explains the chemistry behind every step.",
        columns: 3,
        items: [
          {
            icon: Scale,
            title: "Step-by-step stoichiometry",
            description:
              "The grader checks each line of a mole-ratio or limiting-reagent calculation independently and pinpoints the exact step where the math broke down.",
          },
          {
            icon: TestTubes,
            title: "Balancing and mechanisms",
            description:
              "Submit handwritten equations or organic mechanisms; the AI verifies conservation of mass and charge and flags arrows that don't account for every electron.",
          },
          {
            icon: Beaker,
            title: "Structures and bonding",
            description:
              "Lewis structures, VSEPR geometries, and reaction diagrams render as full mini-documents with formula flashcards generated straight from your textbook.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "From lab notebook to mastery",
        steps: [
          {
            number: "01",
            title: "Capture the source",
            description:
              "Upload a PDF chapter, snap a photo of handwritten lab work, or record the lecture. OCR and transcription turn all of it into structured study material.",
          },
          {
            number: "02",
            title: "Generate and drill",
            description:
              "Auto-build formula flashcards and a quiz, then run a FastFire round to lock in nomenclature, polyatomic ions, and constants under time pressure.",
          },
          {
            number: "03",
            title: "Grade your reasoning",
            description:
              "Work a multi-step problem by hand and photograph it. The AI grades each step against the source material and explains the correct approach where you slipped.",
          },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "MS–Grad", label: "Grade span" },
          { value: "AP · MCAT", label: "Exam-ready" },
          { value: "Step-graded", label: "Multi-step work" },
        ],
      },
    ],
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
    sections: [
      {
        kind: "prose",
        heading: "Physics is a problem-solving subject — so we grade the solving",
        body: "Memorizing formulas isn't the hard part of physics; choosing the right one and applying it cleanly is. Work a kinematics, dynamics, or circuits problem on paper, photograph it, and the AI grades each line of your derivation — checking units, signs, and the free-body diagram — then tells you exactly where the reasoning failed instead of just marking the final answer wrong. Every equation, from a simple v = u + at to a Schrödinger expression, renders in full LaTeX across every study mode.",
      },
      {
        kind: "feature-grid",
        heading: "Built for the way physics is actually studied",
        columns: 2,
        items: [
          {
            icon: Calculator,
            title: "Line-by-line solution grading",
            description:
              "Submit a multi-step derivation and the grader evaluates each step independently — unit consistency, vector direction, and algebra — surfacing the precise point your work diverged.",
          },
          {
            icon: Waves,
            title: "Concept-first tutoring",
            description:
              "Confused why tension differs on each side of a pulley? The Socratic tutor builds the intuition with guiding questions grounded in your own lecture notes.",
          },
          {
            icon: Orbit,
            title: "Diagram and graph analysis",
            description:
              "Upload free-body diagrams, field lines, or motion graphs; the AI explains them, quizzes you on them, and checks that your interpretation matches the physics.",
          },
          {
            icon: Atom,
            title: "From mechanics to modern",
            description:
              "Kinematics, thermodynamics, E&M, and quantum all share one study loop — flashcards, practice exams, and spaced review tuned to your upcoming test date.",
          },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          {
            q: "Can it grade a derivation I did by hand?",
            a: "Yes. Photograph the worked solution and the AI parses your handwriting step by step, grading each line for correct physics and math rather than only checking the final number.",
          },
          {
            q: "Will equations actually render correctly?",
            a: "Full LaTeX and MathJax render everywhere — on flashcards, in quiz questions, and in the tutor chat — so vectors, integrals, and Greek symbols look exactly as they should.",
          },
          {
            q: "Is it ready for AP Physics and the MCAT physics section?",
            a: "Yes. Build practice exams with configurable timing and difficulty, then review item-level feedback that explains why each answer was right or wrong.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "steps",
        heading: "Solve it, photograph it, get graded line by line",
        subheading:
          "The AI doesn't just check your final answer — it reads your full worked solution and finds the exact step where it broke.",
        steps: [
          {
            number: "01",
            title: "Work the problem by hand",
            description:
              "Solve on paper or a whiteboard the way you would on an exam. There's no special syntax to learn — write it however you normally would.",
          },
          {
            number: "02",
            title: "Snap a photo",
            description:
              "The AI reads your handwriting, including fractions, integrals, matrices, and graphs, and reconstructs each step of your reasoning.",
          },
          {
            number: "03",
            title: "See where it went wrong",
            description:
              "Every step is graded independently. Instead of a red X on the answer, you get the precise line where a sign flipped or a rule was misapplied — and how to fix it.",
          },
        ],
      },
      {
        kind: "feature-grid",
        heading: "Math tools that go beyond drilling",
        columns: 3,
        items: [
          {
            icon: FunctionSquare,
            title: "Full LaTeX everywhere",
            description:
              "Equations, limits, and summations render beautifully on flashcards, in quizzes, and in the tutor — not just in a note editor.",
          },
          {
            icon: PenTool,
            title: "Handwritten-work grading",
            description:
              "Multi-step algebra, calculus, and proofs are evaluated one line at a time, pinpointing exactly where your reasoning broke down.",
          },
          {
            icon: Sigma,
            title: "Formula flashcards",
            description:
              "A dedicated card type pairs each formula with its variable definitions, usage context, and a worked example so you learn when to use it, not just what it is.",
          },
          {
            icon: LineChart,
            title: "Graphs and functions",
            description:
              "Upload or generate function plots; the AI quizzes you on transformations, asymptotes, and behavior, checking your reading of every curve.",
          },
          {
            icon: Brain,
            title: "Socratic problem coaching",
            description:
              "When you're stuck, the tutor nudges you toward the next step with guiding questions instead of handing over the answer.",
          },
          {
            icon: Repeat,
            title: "Spaced-repetition review",
            description:
              "Theorems, identities, and procedures resurface at scientifically timed intervals so they stick through the final, not just the next quiz.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "prose",
        heading: "History is a web of causes, not a list of dates",
        body: "Names and years are the easy part; the hard part is understanding why events happened and how they connect across regions and centuries. The platform turns your readings and lectures into AI-built timelines and cause-and-effect maps that make those relationships visible, then drills you on the connections — not just the trivia — so you can write the comparative and continuity-and-change essays that earn the points.",
      },
      {
        kind: "feature-grid",
        heading: "Tools for thinking historically",
        columns: 2,
        items: [
          {
            icon: Clock,
            title: "AI-generated timelines",
            description:
              "Drop in a chapter or lecture and the platform lays out the chronology, anchoring events so you can see what overlapped across empires and continents.",
          },
          {
            icon: GitBranch,
            title: "Cause-and-effect maps",
            description:
              "Trace how a treaty, revolution, or trade route rippled outward; clickable nodes link to the flashcards, notes, and explanations behind each link.",
          },
          {
            icon: Headphones,
            title: "Dueling-perspective audio",
            description:
              "Two AI voices debate competing interpretations of the same event — colonizer and colonized, traditionalist and revisionist — so you hear the historiography, not one flat narrative.",
          },
          {
            icon: Network,
            title: "Knowledge graphs",
            description:
              "A relational map across a whole period reveals hidden connections between ideas, people, and movements that a linear outline hides.",
          },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "MS–College", label: "Grade span" },
          { value: "AP World", label: "Exam-ready" },
          { value: "Audio + visual", label: "Learning modes" },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Read closely, write better, remember more",
        columns: 3,
        items: [
          {
            icon: PenLine,
            title: "Essay coaching, not ghostwriting",
            description:
              "Paste a draft and get specific feedback on thesis, structure, argument, evidence, and clarity. The AI coaches you toward a stronger version — it never writes it for you.",
          },
          {
            icon: BookOpen,
            title: "Close-reading support",
            description:
              "Work through a passage with a Socratic tutor that surfaces theme, tone, and rhetorical moves through questions grounded in the actual text you uploaded.",
          },
          {
            icon: SpellCheck,
            title: "Vocabulary that sticks",
            description:
              "Build word lists with spaced repetition and AI-generated mnemonics so SAT vocabulary and literary terms move into long-term memory.",
          },
        ],
      },
      {
        kind: "faq",
        heading: "How the writing coach works",
        items: [
          {
            q: "Will it just write my essay for me?",
            a: "No. By design the coach critiques and guides — it points out where an argument is unsupported or a paragraph wanders and asks the questions that get you to fix it yourself. The writing stays yours.",
          },
          {
            q: "Can it help with a specific book or article?",
            a: "Yes. Upload the text or your notes and every response is grounded in that source through RAG, citing the passages it draws from rather than pulling from the open internet.",
          },
          {
            q: "Does it support test-prep vocabulary?",
            a: "Yes. Generate vocabulary decks from any reading or a typed prompt and drill them with spaced repetition, FastFire recall, and auto-generated quizzes.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Understand code, don't just copy it",
        subheading:
          "Paste a function, a class, or an entire file — the AI breaks down what it does and then tests whether you really follow it.",
        columns: 2,
        items: [
          {
            icon: Terminal,
            title: "Line-by-line explanation",
            description:
              "Upload code and the AI walks through control flow, data structures, and edge cases in plain language, grounded in the exact source you provided.",
          },
          {
            icon: Bug,
            title: "Comprehension quizzing",
            description:
              "It generates questions about a snippet's logic and output — including 'what does this print?' and 'what breaks if this line changes?' — to expose gaps before an exam does.",
          },
          {
            icon: Binary,
            title: "Algorithms and complexity",
            description:
              "Drill Big-O, sorting, recursion, and data-structure trade-offs with flashcards and diagrams generated from your lecture notes and readings.",
          },
          {
            icon: GitBranch,
            title: "Concept knowledge graphs",
            description:
              "See how language features, patterns, and systems concepts connect across a course, with clickable nodes that link back to cards and explanations.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "Turn a codebase into a study set",
        steps: [
          {
            number: "01",
            title: "Bring your code",
            description:
              "Paste a snippet, upload a file, or point the platform at lecture slides and problem sets. It ingests source code and prose alike.",
          },
          {
            number: "02",
            title: "Get it explained",
            description:
              "The AI annotates the logic, names the patterns, and traces execution so you understand the why, not just the syntax.",
          },
          {
            number: "03",
            title: "Prove you understand",
            description:
              "Auto-generated quizzes and FastFire drills test recall of behavior, output, and complexity — turning passive reading into active mastery.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "prose",
        heading: "Economics rewards understanding the model, not memorizing the curve",
        body: "Supply and demand, elasticity, fiscal versus monetary policy — economics is a subject of models and the assumptions behind them. The platform helps you read and reason about graphs, drills the terminology with spaced repetition, and stages AI debates between competing schools of thought so you grasp why economists disagree, which is exactly what free-response questions ask you to explain.",
      },
      {
        kind: "feature-grid",
        heading: "From curves to schools of thought",
        columns: 3,
        items: [
          {
            icon: LineChart,
            title: "Graph and model analysis",
            description:
              "Upload or generate supply-demand, IS-LM, and cost curves; the AI quizzes you on shifts, equilibria, and what each movement means in the real world.",
          },
          {
            icon: Headphones,
            title: "Dueling-perspective audio",
            description:
              "Hear Keynesian and monetarist voices debate the same policy so you can argue both sides — ideal for screen-free review on a commute.",
          },
          {
            icon: TrendingUp,
            title: "Auto-generated practice",
            description:
              "Build practice exams and free-response prompts from any chapter, with item-level feedback explaining the economic reasoning behind each answer.",
          },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "HS–College", label: "Grade span" },
          { value: "AP Micro · Macro", label: "Exam-ready" },
          { value: "Debate audio", label: "Learning modes" },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Built for a memory-heavy subject",
        subheading:
          "Psychology asks you to recall hundreds of studies, researchers, and terms — and to connect them. The platform is tuned for exactly that.",
        columns: 3,
        items: [
          {
            icon: Repeat,
            title: "Spaced repetition",
            description:
              "Landmark studies, researcher names, and terminology resurface at scientifically optimal intervals so they hold from the first unit through the final exam.",
          },
          {
            icon: Lightbulb,
            title: "AI mnemonics and analogies",
            description:
              "Acronyms, rhymes, and relatable analogies are generated automatically for hard sequences like the stages of sleep or the parts of the neuron.",
          },
          {
            icon: Network,
            title: "Cross-unit knowledge graphs",
            description:
              "See how biological, cognitive, and social concepts connect; the tutor links a study in one unit to a theory in another instead of treating each in isolation.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "Lock in the studies and terms",
        steps: [
          {
            number: "01",
            title: "Ingest the material",
            description:
              "Upload a textbook chapter, your notes, or a recorded lecture and the platform builds flashcards and a quiz covering the key studies and definitions.",
          },
          {
            number: "02",
            title: "Drill with FastFire",
            description:
              "Run a timed FastFire round on terminology and researchers; speak your answers and the AI grades each one for accuracy in real time.",
          },
          {
            number: "03",
            title: "Connect the concepts",
            description:
              "Ask the tutor to relate findings across units; it draws on your own materials to build the comparisons that essay questions demand.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Speak it, don't just study it",
        subheading:
          "Language learning is built on recall and pronunciation — the two things the platform's voice-first engine is best at.",
        columns: 3,
        items: [
          {
            icon: Zap,
            title: "FastFire vocabulary recall",
            description:
              "Cards fire automatically at your chosen pace; you answer out loud and the AI grades each spoken response, building the rapid recall real conversation demands.",
          },
          {
            icon: Mic,
            title: "Real-time pronunciation grading",
            description:
              "Speak in your target language and the AI grades pronunciation alongside meaning, so you hear what to fix while it still matters.",
          },
          {
            icon: MessageCircle,
            title: "Conversational tutor",
            description:
              "Practice everyday exchanges with a voice tutor that adapts to your level, corrects gently, and responds in your target language.",
          },
        ],
      },
      {
        kind: "faq",
        heading: "Questions learners ask",
        items: [
          {
            q: "Does it actually listen to me speak?",
            a: "Yes. Voice is first-class at every surface. In FastFire and conversation modes you respond out loud and the AI captures, transcribes, and grades your speech in real time.",
          },
          {
            q: "Can it grade my pronunciation, not just whether I'm right?",
            a: "Yes. Spoken-response grading evaluates pronunciation accuracy alongside content correctness, so you get feedback on how you said it, not only what you said.",
          },
          {
            q: "Which languages can I study?",
            a: "Content can be ingested in any language and the tutor responds in your preferred language, so you can build decks and practice in the language you're learning.",
          },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "Any language", label: "Content support" },
          { value: "Voice-first", label: "Spoken grading" },
          { value: "Free", label: "Core tools" },
        ],
      },
    ],
  },
];
