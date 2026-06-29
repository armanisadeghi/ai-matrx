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
  Volume2,
  Sparkles,
  BookOpen,
  Users,
  ClipboardCheck,
  Target,
  Mic,
  FlaskConical,
  Award,
  Gauge,
  Image,
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
  sections: [
    {
      kind: "feature-grid",
      heading: `Made just right for ${name.toLowerCase()}`,
      subheading:
        "Big, friendly cards and a voice that reads everything out loud — so learning feels like play, not work.",
      columns: 2,
      items: [
        {
          icon: Image,
          title: "Picture-first cards",
          description:
            "Colorful images on every card make new words and ideas easy to remember.",
        },
        {
          icon: Volume2,
          title: "Read-aloud on tap",
          description:
            "Every card and question can be read out loud, so readers of every speed can keep up.",
        },
        {
          icon: Sparkles,
          title: "Celebrations that motivate",
          description:
            "Stars, badges, and cheerful celebrations reward effort and keep practice fun.",
        },
        {
          icon: Users,
          title: "A window for grown-ups",
          description:
            "A simple parent view shows time studied and what's been mastered — no guesswork.",
        },
      ],
    },
    {
      kind: "steps",
      heading: "How a study session works",
      steps: [
        { number: "01", title: "Pick a deck", description: "Choose a set of cards on letters, numbers, words, or a favorite topic." },
        { number: "02", title: "Listen and learn", description: "Cards read themselves aloud with a picture to match every idea." },
        { number: "03", title: "Earn a reward", description: "Finish the set to collect stars and unlock a little celebration." },
      ],
    },
  ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Learning that feels like play",
        subheading:
          "From kindergarten through 5th grade, the AI keeps vocabulary simple, the tone encouraging, and every screen friendly to the youngest learners.",
        columns: 3,
        items: [
          {
            icon: Image,
            title: "Visual-heavy cards",
            description:
              "Pictures lead, words follow. Bright, uncluttered cards make new ideas stick without overwhelming a young reader.",
          },
          {
            icon: Volume2,
            title: "Read-aloud everywhere",
            description:
              "Tap any card or question to hear it read clearly — perfect for early readers and screen-free practice.",
          },
          {
            icon: BookOpen,
            title: "Story-based learning",
            description:
              "Lessons wrap facts in short stories and characters, so kids remember the idea, not just the answer.",
          },
          {
            icon: Sparkles,
            title: "Rewards that motivate",
            description:
              "Stars, badges, and gentle celebrations reward steady effort — building a habit instead of pressure.",
          },
          {
            icon: Users,
            title: "Parent dashboard",
            description:
              "Grown-ups get a clear view of time studied, decks finished, and what's been mastered — at a glance.",
          },
          {
            icon: GraduationCap,
            title: "Grows with the grade",
            description:
              "Pick any grade from kindergarten to 5th and the difficulty, words, and pace adjust to fit.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "A study session, start to finish",
        subheading: "Short, friendly, and built to end on a win.",
        steps: [
          { number: "01", title: "Choose a deck", description: "Letters, numbers, sight words, or a topic from class — picked in a tap." },
          { number: "02", title: "Learn by listening", description: "Each card reads aloud with a picture so every learner can follow along." },
          { number: "03", title: "Practice gently", description: "Easy drills and matching games reinforce the idea without frustration." },
          { number: "04", title: "Celebrate the finish", description: "Finishing the set earns stars and a celebration kids look forward to." },
        ],
      },
      {
        kind: "faq",
        heading: "Questions parents ask",
        items: [
          {
            q: "My child can't read fluently yet. Can they still use it?",
            a: "Yes. Read-aloud is built into every card and question, and cards lead with pictures — so pre-readers and early readers can learn independently.",
          },
          {
            q: "Can I see how my child is doing?",
            a: "The parent dashboard shows study time, decks completed, and mastery progress in plain language — no setup or interpretation required.",
          },
          {
            q: "Is it appropriate for the youngest grades?",
            a: "The experience adapts by grade from kindergarten through 5th: vocabulary stays simple, sessions stay short, and the tone stays encouraging.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "The bridge years, organized",
        subheading:
          "Grades 6–8 mean more subjects, more teachers, and the first real tests. Study rooms keep it all in one place and standards-aligned content keeps it on track.",
        columns: 3,
        items: [
          {
            icon: Users,
            title: "Subject study rooms",
            description:
              "A dedicated room per class keeps decks, notes, and quizzes organized — no more scattered material across six subjects.",
          },
          {
            icon: ClipboardCheck,
            title: "Standards-aligned content",
            description:
              "Generated study sets map to the standards behind each subject, so practice matches what the classroom actually covers.",
          },
          {
            icon: School,
            title: "Study with classmates",
            description:
              "Collaborative group study and shared decks let a study group prep together and quiz each other.",
          },
          {
            icon: Target,
            title: "An on-ramp to test prep",
            description:
              "A gentle introduction to practice tests and timed review builds the habits that high-school exams will demand.",
          },
          {
            icon: GraduationCap,
            title: "Difficulty that scales",
            description:
              "As mastery grows, questions get harder automatically — keeping every student challenged but never stuck.",
          },
          {
            icon: BookOpen,
            title: "Tutor that knows the class",
            description:
              "The AI tutor is grounded in the student's own materials and remembers where they're struggling across sessions.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "From class notes to confident",
        steps: [
          { number: "01", title: "Set up a study room", description: "Create a room per subject and drop in notes, handouts, or a textbook chapter." },
          { number: "02", title: "Build aligned sets", description: "Auto-generate standards-aligned flashcards, quizzes, and summaries from the material." },
          { number: "03", title: "Study together", description: "Share the room with a group and quiz each other with the same decks." },
          { number: "04", title: "Check readiness", description: "Take a short practice test to see what's mastered and what needs another pass." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          {
            q: "How is this different from the elementary experience?",
            a: "Middle school shifts from picture-first play to subject-organized study rooms, standards-aligned content, group collaboration, and an early introduction to test prep.",
          },
          {
            q: "Does it line up with what's taught in class?",
            a: "Generated content maps to the standards behind each subject, so the practice mirrors the classroom rather than drifting off-topic.",
          },
          {
            q: "Can a study group use it together?",
            a: "Yes. Shared rooms and collaborative decks let a group build and review the same material, with the AI tutor available to everyone in the room.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "Built for the volume of college",
        subheading:
          "Hundreds of textbook pages, back-to-back lectures, and a grad exam on the horizon. Ingest all of it and turn a semester into one connected study system.",
        columns: 3,
        items: [
          {
            icon: BookOpen,
            title: "Textbook-scale ingestion",
            description:
              "Drop in entire chapters or whole textbooks — including scanned PDFs — and get flashcards, summaries, and quizzes for the full course.",
          },
          {
            icon: Mic,
            title: "Lecture capture",
            description:
              "Record a lecture and walk out with a transcript and an auto-built study set; never lose what was said in the room.",
          },
          {
            icon: FlaskConical,
            title: "Research-linked study",
            description:
              "Paste papers and articles; the tutor grounds every answer in your sources and cites them, so study connects to the research it comes from.",
          },
          {
            icon: University,
            title: "Course study systems",
            description:
              "Organize a full course into folders and rooms — notes, decks, recordings, and practice exams in one connected place.",
          },
          {
            icon: GraduationCap,
            title: "Grad entrance exams",
            description:
              "Prep for the MCAT, LSAT, GRE, and more alongside coursework, with practice tests and item-level feedback.",
            href: "/education/exam-prep/mcat",
          },
          {
            icon: Volume2,
            title: "Audio overviews",
            description:
              "Turn any reading into a podcast-quality overview and study during the commute or between classes.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "A semester, systematized",
        steps: [
          { number: "01", title: "Ingest the course", description: "Upload the textbook, syllabus, and slides; record lectures as they happen." },
          { number: "02", title: "Generate the system", description: "Auto-build flashcards, summaries, quizzes, and audio across the whole course." },
          { number: "03", title: "Study research-grounded", description: "Ask the tutor anything — answers cite your own readings, not the open web." },
          { number: "04", title: "Prep the big exam", description: "Layer in MCAT, LSAT, or GRE practice tests and track your readiness curve." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "Textbook-scale", label: "Ingest whole books, not just notes" },
          { value: "Source-grounded", label: "Every answer cites your materials" },
          { value: "MCAT · LSAT · GRE", label: "Grad entrance exams supported" },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          {
            q: "Can it really handle a full textbook?",
            a: "Yes. The ingestion pipeline processes entire textbooks — including scanned and OCR'd pages — and turns them into flashcards, summaries, and quizzes for the whole course.",
          },
          {
            q: "Will the tutor make things up?",
            a: "Answers are grounded in your own uploaded materials via retrieval and cite the source passage, so responses stay traceable rather than hallucinated.",
          },
          {
            q: "Can I prep for grad school exams here too?",
            a: "Yes. MCAT, LSAT, and GRE prep run alongside your coursework, with full practice tests and detailed item-level feedback.",
          },
        ],
      },
    ],
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
    sections: [
      {
        kind: "feature-grid",
        heading: "High-stakes, high-volume mastery",
        subheading:
          "Boards, the bar, and licensure exams reward relentless recall and the ability to defend an answer out loud. This is built for exactly that.",
        columns: 2,
        items: [
          {
            icon: Award,
            title: "Licensure & board prep",
            description:
              "Targeted preparation for the bar, nursing boards (NCLEX), CPA, PE, and more — with practice exams formatted to the real thing.",
            href: "/education/exam-prep/bar",
          },
          {
            icon: Mic,
            title: "Oral-exam practice",
            description:
              "Run a simulated viva voce: the AI questions you, you answer aloud, and it grades accuracy, articulation, and completeness.",
          },
          {
            icon: Gauge,
            title: "High-volume rigor",
            description:
              "FastFire and spaced repetition drive relentless recall through thousands of items, surfacing weak areas before exam day.",
          },
          {
            icon: FlaskConical,
            title: "Workplace training",
            description:
              "Convert dense professional and certification material into structured modules for continuing education and on-the-job mastery.",
          },
        ],
      },
      {
        kind: "steps",
        heading: "From material to board-ready",
        steps: [
          { number: "01", title: "Load the corpus", description: "Ingest review books, outlines, and statutes into one organized study system." },
          { number: "02", title: "Drill at volume", description: "FastFire and spaced repetition push relentless recall across thousands of items." },
          { number: "03", title: "Defend it aloud", description: "Practice oral exams with the AI grading articulation and completeness, not just the answer." },
          { number: "04", title: "Simulate the exam", description: "Take full timed, board-formatted practice exams with item-level feedback." },
        ],
      },
      {
        kind: "stat-bar",
        stats: [
          { value: "Bar · NCLEX · CPA", label: "Licensure and board prep" },
          { value: "Oral exams", label: "Spoken answers graded in real time" },
          { value: "High-volume", label: "Relentless recall built for rigor" },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          {
            q: "Which licensure exams are supported?",
            a: "Preparation spans the bar, nursing boards (NCLEX), CPA, PE, and other professional licensure exams, with practice tests formatted to match each one.",
          },
          {
            q: "How does oral-exam practice work?",
            a: "The AI plays examiner and questions you live; you respond verbally and it grades accuracy, articulation, and completeness — ideal for viva voce and clinical orals.",
          },
          {
            q: "Can it handle the sheer volume of board prep?",
            a: "Yes. FastFire and spaced repetition are built for thousands of items, continuously prioritizing your weak areas so review effort lands where it matters most.",
          },
        ],
      },
    ],
  },
];
