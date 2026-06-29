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
  {
    slug: "biology/photosynthesis",
    title: "Photosynthesis, Explained",
    summary:
      "How plants, algae, and some bacteria turn sunlight, water, and carbon dioxide into sugar and oxygen — the light-dependent reactions, the Calvin cycle, and why this single process underwrites nearly all life on Earth.",
    subject: "biology",
    letter: "Ph",
    updated: "2026-06-01",
    keywords: [
      "photosynthesis",
      "light-dependent reactions",
      "Calvin cycle",
      "chloroplast",
      "photosynthesis explained",
    ],
    related: {
      subjects: ["biology"],
      exams: ["ap-biology", "mcat"],
      tools: ["flashcards", "fastfire", "mind-maps"],
    },
    sections: [
      {
        kind: "prose",
        heading: "What photosynthesis actually does",
        body:
          "Photosynthesis is the process by which plants, algae, and certain bacteria capture energy from sunlight and use it to build sugar from carbon dioxide and water, releasing oxygen as a by-product. The overall reaction is deceptively simple: six molecules of carbon dioxide plus six of water, powered by light, yield one molecule of glucose and six of oxygen.\n\nThat one reaction is the foundation of almost every food chain on the planet and the source of the oxygen you are breathing right now. Understanding it means understanding two linked stages — the light-dependent reactions that capture energy, and the Calvin cycle that uses that energy to assemble sugar.",
      },
      {
        kind: "feature-grid",
        heading: "The key players",
        subheading: "Where it happens and what each part contributes.",
        columns: 3,
        items: [
          { title: "Chloroplast", description: "The organelle where photosynthesis occurs, containing stacked membranes (thylakoids) and a fluid interior (stroma)." },
          { title: "Chlorophyll", description: "The green pigment that absorbs red and blue light and reflects green, driving energy capture." },
          { title: "Thylakoid membrane", description: "Site of the light-dependent reactions; houses the photosystems and the electron transport chain." },
          { title: "Stroma", description: "The fluid surrounding the thylakoids, where the Calvin cycle builds sugar." },
          { title: "ATP and NADPH", description: "The energy and electron carriers produced in stage one and spent in stage two." },
          { title: "Rubisco", description: "The enzyme that fixes carbon dioxide into an organic molecule — the most abundant protein on Earth." },
        ],
      },
      {
        kind: "prose",
        heading: "Two stages, one assembly line",
        body:
          "In the light-dependent reactions, photons strike chlorophyll in the thylakoid membrane, exciting electrons that travel down an electron transport chain. This splits water (releasing oxygen), pumps protons to build a gradient, and powers the synthesis of ATP and NADPH. These two molecules are the energy currency handed off to the next stage.\n\nIn the Calvin cycle (the light-independent reactions), the ATP and NADPH are spent to fix carbon dioxide into a three-carbon sugar via the enzyme rubisco. Several turns of the cycle produce glucose. The two stages are tightly coupled: stage one captures energy, stage two converts it into stored chemical form.",
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Learn the overall equation cold", description: "Reactants in, products out — anchor everything else to carbon dioxide plus water yielding glucose plus oxygen." },
          { number: "02", title: "Separate the two stages", description: "Know exactly where each happens (thylakoid vs. stroma) and what each produces or consumes." },
          { number: "03", title: "Trace the energy carriers", description: "Follow ATP and NADPH from where they are made to where they are spent — this is the most-tested link." },
          { number: "04", title: "Drill with active recall", description: "Flashcards on inputs, outputs, and locations expose gaps fast; quiz yourself before re-reading." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "Why do leaves look green?", a: "Chlorophyll absorbs red and blue wavelengths for energy and reflects green light, which is why foliage appears green to your eyes." },
          { q: "Does photosynthesis stop at night?", a: "The light-dependent reactions stop without light, but the Calvin cycle can run briefly on the ATP and NADPH already produced. Sustained sugar production requires light." },
          { q: "How is this related to cellular respiration?", a: "They are near-opposites: photosynthesis stores energy in glucose using carbon dioxide and water, while respiration releases that energy and regenerates carbon dioxide and water." },
        ],
      },
    ],
  },
  {
    slug: "biology/cell-cycle-and-mitosis",
    title: "The Cell Cycle and Mitosis, Explained",
    summary:
      "How a single cell becomes two identical daughter cells — the phases of the cell cycle, the stages of mitosis, the checkpoints that keep division under control, and why failures lead to cancer.",
    subject: "biology",
    letter: "Mi",
    updated: "2026-06-02",
    keywords: [
      "cell cycle",
      "mitosis",
      "prophase metaphase anaphase telophase",
      "cell division",
      "mitosis stages",
    ],
    related: {
      subjects: ["biology"],
      exams: ["ap-biology", "mcat"],
      tools: ["flashcards", "mind-maps", "quizzes"],
    },
    sections: [
      {
        kind: "prose",
        heading: "Why cells divide",
        body:
          "Every multicellular organism grows, repairs wounds, and replaces worn-out cells through cell division. The cell cycle is the ordered sequence of events that takes one cell, doubles its contents, and splits it into two genetically identical daughter cells. Get the order and the controls right and you understand most of how tissues build and maintain themselves.\n\nThe cycle has two broad parts: interphase, the long preparatory phase where the cell grows and copies its DNA, and the mitotic (M) phase, where the duplicated chromosomes are separated and the cell physically divides.",
      },
      {
        kind: "feature-grid",
        heading: "The phases of the cell cycle",
        subheading: "Most of a cell's life is spent in interphase, preparing to divide.",
        columns: 3,
        items: [
          { title: "G1 phase", description: "The cell grows, makes proteins, and carries out its normal functions while monitoring conditions for division." },
          { title: "S phase", description: "DNA is replicated, so each chromosome now consists of two identical sister chromatids." },
          { title: "G2 phase", description: "The cell continues growing and produces the proteins needed for division, then checks for DNA damage." },
          { title: "Mitosis (M)", description: "The nucleus divides and sister chromatids are pulled to opposite poles." },
          { title: "Cytokinesis", description: "The cytoplasm splits, producing two separate daughter cells." },
          { title: "G0 phase", description: "A resting state where some cells exit the cycle, either temporarily or permanently." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "The four stages of mitosis",
        subheading: "A useful mnemonic: Prophase, Metaphase, Anaphase, Telophase — \"PMAT.\"",
        columns: 2,
        items: [
          { title: "Prophase", description: "Chromatin condenses into visible chromosomes, the nuclear envelope breaks down, and the spindle begins to form." },
          { title: "Metaphase", description: "Chromosomes line up single-file along the cell's equator, attached to spindle fibers from both poles." },
          { title: "Anaphase", description: "Sister chromatids are pulled apart to opposite poles, ensuring each daughter cell gets a complete set." },
          { title: "Telophase", description: "Chromosomes decondense, nuclear envelopes reform around each set, and the cell prepares to split." },
        ],
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Master interphase before mitosis", description: "Most students rush to PMAT and forget that G1, S, and G2 are where the cell grows and copies its DNA." },
          { number: "02", title: "Use the PMAT mnemonic", description: "Lock the order of the four mitotic stages, then attach one defining event to each." },
          { number: "03", title: "Draw it, don't just read it", description: "Sketch chromosome behavior at each stage — a mind map or diagram beats re-reading the textbook." },
          { number: "04", title: "Connect checkpoints to cancer", description: "Understanding what the G1, G2, and M checkpoints guard against makes the whole topic click — and it is heavily tested." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "How is mitosis different from meiosis?", a: "Mitosis produces two identical diploid cells for growth and repair; meiosis produces four genetically varied haploid gametes for reproduction." },
          { q: "What are checkpoints?", a: "Control points (mainly at G1, G2, and within mitosis) where the cell verifies conditions are right before proceeding. They prevent damaged or incomplete cells from dividing." },
          { q: "What happens when the cell cycle goes wrong?", a: "Loss of checkpoint control allows cells with DNA damage to keep dividing, which is the underlying mechanism of cancer." },
        ],
      },
    ],
  },
  {
    slug: "world-history/french-revolution",
    title: "The French Revolution: Causes and Timeline",
    summary:
      "Why France's old order collapsed after 1789 — the financial crisis, social inequality, and Enlightenment ideas that lit the fuse — and a clear timeline from the Estates-General through the Terror to Napoleon.",
    subject: "world-history",
    letter: "Fr",
    updated: "2026-06-03",
    keywords: [
      "French Revolution",
      "French Revolution causes",
      "French Revolution timeline",
      "Reign of Terror",
      "Estates-General",
    ],
    related: {
      subjects: ["world-history"],
      exams: ["ap-world-history"],
      tools: ["flashcards", "mind-maps", "practice-tests"],
    },
    sections: [
      {
        kind: "prose",
        heading: "A world turned upside down",
        body:
          "Between 1789 and 1799, France dismantled an absolute monarchy that had stood for centuries, executed its king, and tried to rebuild society on the principles of liberty, equality, and fraternity. The French Revolution reshaped not only France but the political imagination of the entire modern world, giving rise to the language of citizenship, rights, and nationalism still used today.\n\nIt did not happen for a single reason. A bankrupt state, a rigid social hierarchy, food shortages, and a flood of Enlightenment ideas converged at once. Understanding the Revolution means seeing how those pressures combined and then tracing the chain of events they set off.",
      },
      {
        kind: "feature-grid",
        heading: "The causes",
        subheading: "Long-term structural pressures plus short-term triggers.",
        columns: 3,
        items: [
          { title: "Financial crisis", description: "Costly wars, including support for the American Revolution, left the crown nearly bankrupt and unable to raise revenue." },
          { title: "The estate system", description: "Society was split into three estates; the clergy and nobility were largely tax-exempt while the Third Estate bore the burden." },
          { title: "Enlightenment ideas", description: "Thinkers like Rousseau, Voltaire, and Montesquieu spread ideas of popular sovereignty, reason, and natural rights." },
          { title: "Food shortages", description: "Poor harvests drove bread prices to crushing levels, pushing the urban poor toward open revolt." },
          { title: "A weak monarchy", description: "Louis XVI's indecision and the perception of royal extravagance eroded confidence in the crown." },
          { title: "An emerging bourgeoisie", description: "A prosperous middle class wanted political power to match its economic weight and resented aristocratic privilege." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "The timeline at a glance",
        subheading: "A decade of escalation, radicalization, and consolidation.",
        columns: 2,
        items: [
          { title: "1789 · The opening", description: "The Estates-General meets, the Third Estate forms the National Assembly, the Bastille falls, and feudal privileges are abolished." },
          { title: "1789–1791 · Reform", description: "The Declaration of the Rights of Man is adopted and a constitutional monarchy is established." },
          { title: "1792–1794 · Radical phase", description: "The monarchy is abolished, the king is executed, and the Reign of Terror sees mass executions under Robespierre." },
          { title: "1795–1799 · Consolidation", description: "The Directory governs an exhausted nation until Napoleon's 1799 coup ends the revolutionary era." },
        ],
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Separate causes from events", description: "First nail down why the Revolution happened, then learn what happened — confusing the two is the most common mistake." },
          { number: "02", title: "Anchor a clean timeline", description: "Memorize four turning points (1789, the republic, the Terror, Napoleon) and slot every detail into one of them." },
          { number: "03", title: "Track the key factions", description: "Know the Jacobins, Girondins, and sans-culottes — the Revolution radicalized as power shifted between them." },
          { number: "04", title: "Practice cause-and-effect writing", description: "Exam essays reward arguments linking causes to outcomes, so rehearse explaining how one event triggered the next." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "What set off the Revolution in 1789?", a: "The immediate trigger was the financial crisis that forced Louis XVI to convene the Estates-General, which the Third Estate then transformed into a revolutionary assembly." },
          { q: "What was the Reign of Terror?", a: "A period from roughly 1793 to 1794 when the radical government, led by Robespierre, executed tens of thousands of suspected enemies of the Revolution." },
          { q: "How did the Revolution end?", a: "It wound down under the Directory and effectively ended when Napoleon Bonaparte seized power in a 1799 coup, eventually crowning himself emperor." },
        ],
      },
    ],
  },
  {
    slug: "math/solving-linear-equations",
    title: "Solving Linear Equations, Explained",
    summary:
      "A step-by-step guide to solving for an unknown in a linear equation — isolating the variable, balancing both sides, clearing fractions, and checking your answer — the foundation of all of algebra.",
    subject: "math",
    letter: "Le",
    updated: "2026-06-04",
    keywords: [
      "linear equations",
      "solving for x",
      "algebra basics",
      "isolate the variable",
      "solving linear equations",
    ],
    related: {
      subjects: ["math"],
      exams: ["sat", "act", "ap-calculus"],
      tools: ["practice-tests", "tutor", "flashcards"],
    },
    sections: [
      {
        kind: "prose",
        heading: "What a linear equation is",
        body:
          "A linear equation is a statement that two expressions are equal, where the unknown (usually written x) appears only to the first power — no squares, no roots, no variables multiplied together. Examples look like 3x + 5 = 20 or 2(x − 4) = x + 1. Solving one means finding the single value of x that makes the statement true.\n\nThe core idea is balance. An equation is like a scale: whatever you do to one side you must do to the other to keep it level. Every technique below is just a disciplined way of using that rule to peel everything away from the variable until it stands alone.",
      },
      {
        kind: "feature-grid",
        heading: "The tools you balance with",
        subheading: "Inverse operations undo what is happening to the variable.",
        columns: 2,
        items: [
          { title: "Addition and subtraction", description: "Move a constant to the other side by adding or subtracting it from both sides." },
          { title: "Multiplication and division", description: "Remove a coefficient by dividing both sides by it (or multiply to clear a fraction)." },
          { title: "The distributive property", description: "Expand expressions like 2(x − 4) into 2x − 8 before combining terms." },
          { title: "Combining like terms", description: "Simplify each side by collecting all the x-terms and all the constants together first." },
        ],
      },
      {
        kind: "steps",
        heading: "The solving procedure",
        subheading: "Worked on 3x + 5 = 20.",
        steps: [
          { number: "01", title: "Simplify each side", description: "Distribute and combine like terms so each side is as clean as possible. Here both sides are already simple." },
          { number: "02", title: "Move the variable to one side", description: "Use addition or subtraction to get all x-terms on one side and constants on the other. Subtract 5: 3x = 15." },
          { number: "03", title: "Isolate the variable", description: "Divide both sides by the coefficient. Divide by 3: x = 5." },
          { number: "04", title: "Check your answer", description: "Substitute back into the original equation: 3(5) + 5 = 20. It holds, so the solution is correct." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "What if there are fractions?", a: "Multiply every term on both sides by the least common denominator to clear the fractions, then solve the simpler equation as usual." },
          { q: "What does 'no solution' mean?", a: "If the variables cancel and you are left with a false statement like 3 = 7, the equation has no solution. If you get a true statement like 5 = 5, every number is a solution." },
          { q: "Why check the answer?", a: "Substituting your solution back into the original equation catches arithmetic slips instantly — it is the fastest way to know you are right." },
        ],
      },
    ],
  },
  {
    slug: "physics/newtons-laws-of-motion",
    title: "Newton's Three Laws of Motion, Explained",
    summary:
      "The three laws that govern how objects move — inertia, force equals mass times acceleration, and action-reaction — with the intuition, the equations, and the everyday examples that make them stick.",
    subject: "physics",
    letter: "Nw",
    updated: "2026-06-05",
    keywords: [
      "Newton's laws of motion",
      "inertia",
      "F=ma",
      "action reaction",
      "Newton's three laws",
    ],
    related: {
      subjects: ["physics"],
      exams: ["ap-physics", "mcat"],
      tools: ["flashcards", "tutor", "practice-tests"],
    },
    sections: [
      {
        kind: "prose",
        heading: "The rules of motion",
        body:
          "In the late 1600s, Isaac Newton distilled how objects move into three short laws. Together they explain everything from why you lurch forward when a car brakes to why a rocket can push itself through empty space. Nearly all of classical mechanics is built on this foundation, and most introductory physics problems are an application of one or more of these laws.\n\nThe key is to treat them as a connected set: the first law defines when forces are absent, the second law quantifies what a net force does, and the third law describes how forces always come in pairs.",
      },
      {
        kind: "feature-grid",
        heading: "The three laws",
        subheading: "Each law answers a different question about force and motion.",
        columns: 3,
        items: [
          { title: "First law (inertia)", description: "An object at rest stays at rest and an object in motion stays in motion at constant velocity unless acted on by a net external force." },
          { title: "Second law (F = ma)", description: "The net force on an object equals its mass times its acceleration; more force means more acceleration, more mass means less." },
          { title: "Third law (action-reaction)", description: "For every action there is an equal and opposite reaction; forces always occur in pairs between two objects." },
        ],
      },
      {
        kind: "feature-grid",
        heading: "Everyday examples",
        subheading: "Each law shows up constantly in ordinary life.",
        columns: 3,
        items: [
          { title: "A seatbelt", description: "When a car stops suddenly, your body keeps moving forward by inertia — the first law in action." },
          { title: "Pushing a cart", description: "An empty cart accelerates easily; a full one resists. Same push, more mass, less acceleration — the second law." },
          { title: "A rocket launch", description: "Engines push exhaust gases down; the gases push the rocket up with equal force — the third law." },
        ],
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Understand inertia first", description: "The first law reframes the everyday assumption that motion needs a constant push — it does not. This idea unlocks the rest." },
          { number: "02", title: "Make F = ma your workhorse", description: "Most problems reduce to identifying the net force, the mass, and solving for acceleration. Practice rearranging the equation." },
          { number: "03", title: "Draw free-body diagrams", description: "Sketch every force acting on an object before calculating. This single habit prevents the majority of mistakes." },
          { number: "04", title: "Watch for action-reaction pairs", description: "Remember the paired forces act on different objects, so they never cancel each other out on the same object." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "What exactly is a 'net force'?", a: "It is the single combined force you get after adding up all the individual forces acting on an object, accounting for their directions." },
          { q: "If action-reaction forces are equal and opposite, why does anything move?", a: "Because the two forces act on two different objects. The force on each object is what determines its own motion, and they don't cancel." },
          { q: "Does the second law work for heavy and light objects the same way?", a: "Yes. For the same net force, a heavier object accelerates less and a lighter one more, exactly as F = ma predicts." },
        ],
      },
    ],
  },
  {
    slug: "economics/supply-and-demand",
    title: "Supply and Demand, Explained",
    summary:
      "How prices are set in a market — the law of demand, the law of supply, how they meet at equilibrium, and what makes the whole curve shift — the single most important model in economics.",
    subject: "economics",
    letter: "Sd",
    updated: "2026-06-06",
    keywords: [
      "supply and demand",
      "law of demand",
      "market equilibrium",
      "price determination",
      "supply and demand explained",
    ],
    related: {
      subjects: ["economics"],
      exams: ["ap-economics", "gmat"],
      tools: ["flashcards", "mind-maps", "tutor"],
    },
    sections: [
      {
        kind: "prose",
        heading: "How markets set prices",
        body:
          "Supply and demand is the model economists use to explain how prices and quantities are determined in a market. It rests on two simple behavioral tendencies: buyers want more of something when it is cheaper, and sellers want to provide more of it when the price is high. Where those two forces meet sets the market price.\n\nAlmost every topic in microeconomics — taxes, shortages, surpluses, minimum wages, the effect of a new technology — is an application of this one framework. Master how the two curves move and you can reason about a huge range of real-world questions.",
      },
      {
        kind: "feature-grid",
        heading: "The core concepts",
        subheading: "Two laws, one meeting point, and the forces that move them.",
        columns: 3,
        items: [
          { title: "Law of demand", description: "As the price of a good falls, the quantity buyers want rises, and vice versa — the demand curve slopes downward." },
          { title: "Law of supply", description: "As the price rises, the quantity sellers want to provide rises — the supply curve slopes upward." },
          { title: "Equilibrium", description: "The price where the quantity demanded equals the quantity supplied; the market clears with no shortage or surplus." },
          { title: "Surplus", description: "When price is above equilibrium, sellers offer more than buyers want, and downward pressure on price results." },
          { title: "Shortage", description: "When price is below equilibrium, buyers want more than sellers offer, pushing the price upward." },
          { title: "Shifts vs. movements", description: "A price change moves you along a curve; a change in another factor (income, tastes, costs) shifts the whole curve." },
        ],
      },
      {
        kind: "prose",
        heading: "What shifts the curves",
        body:
          "A common point of confusion is the difference between moving along a curve and shifting it. A change in the good's own price moves you along the existing curve. A change in anything else shifts the entire curve to a new position.\n\nDemand shifts with consumer income, tastes, the prices of related goods, expectations, and the number of buyers. Supply shifts with production costs, technology, the prices of inputs, expectations, and the number of sellers. When a curve shifts, the equilibrium price and quantity both move to a new point.",
      },
      {
        kind: "steps",
        heading: "How to study it (the efficient way)",
        steps: [
          { number: "01", title: "Internalize the two laws", description: "Demand slopes down, supply slopes up. Everything else builds on these two directions, so make them automatic." },
          { number: "02", title: "Find equilibrium on a graph", description: "Practice locating the intersection point and reading off the equilibrium price and quantity." },
          { number: "03", title: "Master shift vs. movement", description: "For any scenario, ask first: did the good's own price change (movement) or did something else change (shift)?" },
          { number: "04", title: "Predict the new equilibrium", description: "Shift one curve, then state how both the price and the quantity respond. This is the single most-tested skill." },
        ],
      },
      {
        kind: "faq",
        heading: "Common questions",
        items: [
          { q: "What is the difference between demand and quantity demanded?", a: "Quantity demanded is the amount wanted at one specific price (a point); demand is the whole relationship across all prices (the entire curve)." },
          { q: "What causes a shortage?", a: "A price set below equilibrium, where buyers want more than sellers are willing to supply. The gap pushes the price up toward equilibrium." },
          { q: "What shifts a demand curve?", a: "Changes in consumer income, tastes and preferences, the prices of related goods, expectations about the future, and the number of buyers in the market." },
        ],
      },
    ],
  },
];

export const LEARN_DOC_BY_SLUG: Record<string, LearnDoc> = Object.fromEntries(
  LEARN_DOCS.map((d) => [d.slug, d]),
);
