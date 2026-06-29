// features/education/data/learn-content.ts
//
// LEARN content registry → /education/learn/<...slug> (the pure-SEO content
// layer). These are informational pages ABOUT the subject matter, server-
// rendered and keyword-rich, that funnel into the app tools via `related`.
//
// Seeded here for the demo; the production engine will read
// education.study_structured_section (see FEATURE.md "Content engine"). Slugs
// may be hierarchical ("biology/cell-structure-and-function").

import type { LearnDoc } from "../types";

export const LEARN_DOCS: LearnDoc[] = [
  {
    slug: "ap-world-history",
    title: "AP World History: The Complete Study Guide",
    summary:
      "What AP World History covers, how the exam is structured, the nine units and their themes, and the fastest way to master it — from the 1200 CE starting point to the modern era.",
    subject: "world-history",
    letter: "AW",
    updated: "2026-06-01",
    keywords: [
      "AP World History",
      "AP World History study guide",
      "AP World History units",
      "AP World History exam",
    ],
    related: {
      subjects: ["world-history"],
      exams: ["ap-world-history"],
      tools: ["flashcards", "mind-maps", "practice-tests"],
    },
    sections: [
      {
        kind: "prose",
        heading: "What is AP World History?",
        body:
          "AP World History: Modern is a college-level survey of human history from roughly 1200 CE to the present, organized around patterns of change and continuity across regions. The course asks you to think like a historian — comparing societies, tracing causation, and arguing from evidence — rather than memorizing isolated facts.\n\nThe exam rewards two things above all: a command of the broad chronological arc, and the analytical skills to deploy specific evidence inside a written argument. This guide breaks down both.",
      },
      {
        kind: "feature-grid",
        heading: "The nine units",
        subheading: "Weighted roughly evenly on the exam — none is safe to skip.",
        columns: 3,
        items: [
          { title: "1 · The Global Tapestry (1200–1450)", description: "State-building across Afro-Eurasia: Song China, Dar al-Islam, European feudalism, the Americas." },
          { title: "2 · Networks of Exchange (1200–1450)", description: "The Silk Roads, Indian Ocean, and trans-Saharan routes — and what moved along them." },
          { title: "3 · Land-Based Empires (1450–1750)", description: "The Ottomans, Safavids, Mughals, Ming/Qing, and how gunpowder reshaped power." },
          { title: "4 · Transoceanic Connections (1450–1750)", description: "The Columbian Exchange, maritime empires, and the first truly global economy." },
          { title: "5 · Revolutions (1750–1900)", description: "Enlightenment, industrialization, and the political revolutions they ignited." },
          { title: "6 · Consequences of Industrialization", description: "Imperialism, migration, and economic transformation across the globe." },
        ],
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Build the timeline first", description: "Anchor every fact to one of the four time periods — the exam is organized around them." },
          { number: "02", title: "Drill the themes, not just dates", description: "Governance, economics, culture, technology, and environment recur in every unit." },
          { number: "03", title: "Practice the writing", description: "The DBQ and LEQ are where points are won — rehearse them with rubric-aware feedback." },
          { number: "04", title: "Test under timed conditions", description: "Full practice exams reveal pacing problems long before test day." },
        ],
      },
    ],
  },
  {
    slug: "cell-structure-and-function",
    title: "Cell Structure and Function, Explained",
    summary:
      "A clear walkthrough of the cell — the basic unit of life — covering the major organelles, the difference between prokaryotic and eukaryotic cells, and how structure drives function.",
    subject: "biology",
    letter: "Cs",
    updated: "2026-06-10",
    keywords: ["cell structure", "organelles", "eukaryotic vs prokaryotic", "cell biology"],
    related: { subjects: ["biology"], exams: ["ap-biology", "mcat"], tools: ["flashcards", "fastfire"] },
    sections: [
      {
        kind: "prose",
        heading: "The cell: life's basic unit",
        body:
          "Every living thing is built from cells. Some organisms are a single cell; you are tens of trillions of them, specialized into tissues and organs. Despite that diversity, cells share a common toolkit of structures — and in biology, structure almost always explains function.\n\nThe central divide is between prokaryotic cells (bacteria and archaea — no membrane-bound nucleus) and eukaryotic cells (plants, animals, fungi, protists — a true nucleus and specialized organelles). Understanding that split is the foundation for nearly everything else in cell biology.",
      },
      {
        kind: "feature-grid",
        heading: "The major organelles",
        items: [
          { title: "Nucleus", description: "Houses DNA and directs protein synthesis — the cell's control center." },
          { title: "Mitochondria", description: "Generate ATP through cellular respiration — the cell's power plants." },
          { title: "Ribosomes", description: "Assemble proteins from amino acids following mRNA instructions." },
          { title: "Endoplasmic reticulum", description: "Rough ER builds proteins; smooth ER synthesizes lipids and detoxifies." },
          { title: "Golgi apparatus", description: "Modifies, packages, and ships proteins to their destinations." },
          { title: "Cell membrane", description: "A selectively permeable bilayer controlling what enters and exits." },
        ],
      },
    ],
  },
];

export const LEARN_DOC_BY_SLUG: Record<string, LearnDoc> = Object.fromEntries(
  LEARN_DOCS.map((d) => [d.slug, d]),
);
