/**
 * Print Studio — realistic sample payloads.
 *
 * Every section starts populated: an empty demo proves nothing, and Arman
 * should be able to hit Print on arrival. Kept out of the components so the
 * rows stay easy to read and swap.
 */

import type { CertificateData } from "@ai-matrx/print/certificate";
import type { CheatSheetData, GlossaryData, StudyCalendarData } from "@ai-matrx/print/education";
import type { PracticeTestData } from "@ai-matrx/print/exam";
import type { Flashcard } from "@ai-matrx/print/flashcards";
import type { QrLabel } from "@ai-matrx/print/labels";

export const SAMPLE_ORIGIN = "https://aimatrx.com";
export const SAMPLE_CODE = "a1B2c3";
export const SAMPLE_GTIN = "4006381333931";

/** Rows keyed by label-format preset id, matching each preset's declared fields. */
export const SAMPLE_FORMAT_ROWS: Record<string, Record<string, string>[]> = {
    "qr-only": [
        { qrValue: "https://aimatrx.com/l/a1B2c3" },
        { qrValue: "https://aimatrx.com/l/d4E5f6" },
        { qrValue: "https://aimatrx.com/l/g7H8i9" },
        { qrValue: "https://aimatrx.com/l/j1K2l3" },
    ],
    "qr-caption": [
        { qrValue: "https://aimatrx.com/l/a1B2c3", caption: "Pallet A-14" },
        { qrValue: "https://aimatrx.com/l/d4E5f6", caption: "Pallet A-15" },
        { qrValue: "https://aimatrx.com/l/g7H8i9", caption: "Pallet B-01" },
        { qrValue: "https://aimatrx.com/l/j1K2l3", caption: "Pallet B-02" },
    ],
    garment: [
        { qrValue: "https://aimatrx.com/l/TS001XL", size: "XL", sku: "TS-001", color: "Black", price: "$29" },
        { qrValue: "https://aimatrx.com/l/TS001L", size: "L", sku: "TS-001", color: "Black", price: "$29" },
        { qrValue: "https://aimatrx.com/l/TS002M", size: "M", sku: "TS-002", color: "Heather Gray", price: "$32" },
        { qrValue: "https://aimatrx.com/l/HD400S", size: "S", sku: "HD-400", color: "Navy", price: "$58" },
    ],
    "asset-spec": [
        {
            qrValue: "https://aimatrx.com/l/AST-88213",
            title: "Dell Latitude 5540",
            spec1: "Intel Core i7-1365U",
            spec2: "32 GB DDR5",
            spec3: "1 TB NVMe SSD",
            spec4: "Asset AST-88213",
        },
        {
            qrValue: "https://aimatrx.com/l/AST-88214",
            title: "Dell Latitude 5540",
            spec1: "Intel Core i5-1345U",
            spec2: "16 GB DDR5",
            spec3: "512 GB NVMe SSD",
            spec4: "Asset AST-88214",
        },
        {
            qrValue: "https://aimatrx.com/l/AST-90011",
            title: "HP EliteBook 840 G10",
            spec1: "Intel Core i7-1355U",
            spec2: "16 GB DDR5",
            spec3: "512 GB NVMe SSD",
            spec4: "Asset AST-90011",
        },
    ],
};

export const SAMPLE_DECK_TITLE = "Cellular Biology 101";

export const SAMPLE_FLASHCARDS: Flashcard[] = [
    { front: "What is the powerhouse of the cell?", back: "The mitochondrion — it produces ATP via oxidative phosphorylation." },
    { front: "Define osmosis.", back: "Net movement of water across a semipermeable membrane toward higher solute concentration." },
    { front: "Which organelle packages proteins for secretion?", back: "The Golgi apparatus." },
    { front: "What does the rough endoplasmic reticulum do?", back: "Synthesizes and folds proteins; 'rough' from the bound ribosomes." },
    { front: "Name the four phases of mitosis, in order.", back: "Prophase, metaphase, anaphase, telophase." },
    { front: "What is the fluid mosaic model?", back: "A membrane described as a fluid phospholipid bilayer with proteins drifting within it." },
    { front: "Where does glycolysis take place?", back: "In the cytosol — no oxygen and no organelle required." },
    { front: "What is the role of the lysosome?", back: "Digests macromolecules and worn organelles using hydrolytic enzymes at low pH." },
    { front: "Distinguish prokaryote from eukaryote.", back: "Prokaryotes have no nucleus or membrane-bound organelles; eukaryotes have both." },
    { front: "What molecule carries amino acids to the ribosome?", back: "Transfer RNA (tRNA), matched to the codon by its anticodon." },
];

/* ── Wave 3: education, exam, certificate/workbook, ZPL ─────────────────── */

export const SAMPLE_CHEAT_SHEET: CheatSheetData = {
    title: "General Chemistry — Formula Sheet",
    subtitle: "Unit 1–3 reference · print at 100%, no margins",
    sections: [
        {
            heading: "Gas laws",
            items: [
                { term: "Ideal gas law", formula: "PV = nRT", note: "R = 0.08206 L·atm·mol⁻¹·K⁻¹ — match R to your pressure unit" },
                { term: "Combined gas law", formula: "P₁V₁ / T₁ = P₂V₂ / T₂", note: "Temperature is ALWAYS in kelvin" },
                { term: "Dalton's law", formula: "P_total = ΣP_i", definition: "Each gas exerts pressure independently of the others." },
                { term: "Graham's law", formula: "r₁ / r₂ = √(M₂ / M₁)", definition: "Effusion rate is inversely proportional to the square root of molar mass." },
            ],
        },
        {
            heading: "Solutions & concentration",
            items: [
                { term: "Molarity", formula: "M = mol solute / L solution", note: "Litres of SOLUTION, not of solvent" },
                { term: "Molality", formula: "m = mol solute / kg solvent", note: "Kilograms of SOLVENT — the one that survives temperature change" },
                { term: "Dilution", formula: "M₁V₁ = M₂V₂" },
                { term: "Freezing point depression", formula: "ΔT_f = i · K_f · m", definition: "i is the van 't Hoff factor — particles per formula unit." },
            ],
        },
        {
            heading: "Thermodynamics & equilibrium",
            items: [
                { term: "Gibbs free energy", formula: "ΔG = ΔH − TΔS", note: "ΔG < 0 = spontaneous at that temperature" },
                { term: "Equilibrium constant", formula: "ΔG° = −RT ln K" },
                { term: "Enthalpy of reaction", formula: "ΔH°_rxn = ΣΔH°_f(products) − ΣΔH°_f(reactants)" },
                { term: "Le Châtelier's principle", definition: "A system at equilibrium shifts to partially offset an imposed change in concentration, pressure, or temperature." },
                { term: "pH", formula: "pH = −log[H₃O⁺]", note: "pH + pOH = 14.00 at 25 °C" },
            ],
        },
    ],
};

export const SAMPLE_GLOSSARY: GlossaryData = {
    title: "Spanish 201 — Unit 4 Vocabulary",
    entries: [
        { term: "el aprendizaje", definition: "learning; apprenticeship" },
        { term: "asequible", definition: "affordable; attainable" },
        { term: "la brújula", definition: "compass (the navigation instrument)" },
        { term: "cotidiano / -a", definition: "everyday, daily" },
        { term: "desarrollar", definition: "to develop; to unfold" },
        { term: "el entorno", definition: "surroundings, environment, setting" },
        { term: "fomentar", definition: "to encourage, to foster, to promote" },
        { term: "la herramienta", definition: "tool; instrument" },
        { term: "imprescindible", definition: "essential; indispensable" },
        { term: "el logro", definition: "achievement, accomplishment" },
        { term: "plantear", definition: "to raise (a question); to pose (a problem)" },
        { term: "el reto", definition: "challenge" },
    ],
};

export const SAMPLE_STUDY_CALENDAR: StudyCalendarData = {
    title: "LSAT — 3-Week Final Push",
    subtitle: "Two hours a weekday, one timed section every Saturday",
    weeks: [
        {
            label: "Week 1 — Logical Reasoning foundations",
            days: [
                { label: "Mon", tasks: ["Assumption family drill, 20 questions", "Log every miss with its trap answer"] },
                { label: "Tue", tasks: ["Flaw questions, 20 untimed", "Re-do Monday's misses cold"] },
                { label: "Wed", tasks: ["Strengthen / weaken set", "Read one dense editorial aloud"] },
                { label: "Thu", tasks: ["Parallel reasoning, 15 questions", "Blind review yesterday's set"] },
                { label: "Fri", tasks: ["Mixed LR section, timed 35 min"] },
                { label: "Sat", tasks: ["Full timed LR section", "Full blind review"], milestone: "Milestone: LR accuracy at or above 80%" },
                { label: "Sun", tasks: ["Rest — no drills"] },
            ],
        },
        {
            label: "Week 2 — Logic Games to mastery",
            days: [
                { label: "Mon", tasks: ["Sequencing games ×3, untimed, full diagrams"] },
                { label: "Tue", tasks: ["Grouping games ×3", "Re-draw every board from memory"] },
                { label: "Wed", tasks: ["Hybrid games ×2", "Time each at 8:45"] },
                { label: "Thu", tasks: ["Re-do Week 1 games cold", "Compare inference speed"] },
                { label: "Fri", tasks: ["Timed LG section, 35 min"] },
                { label: "Sat", tasks: ["Full timed LG section", "Diagram audit"], milestone: "Milestone: every game finished inside 8:45" },
                { label: "Sun", tasks: ["Rest — light review of the error log only"] },
            ],
        },
        {
            label: "Week 3 — Full tests & taper",
            days: [
                { label: "Mon", tasks: ["Full timed PT under test conditions"] },
                { label: "Tue", tasks: ["Blind review the whole PT", "Update the error log by question type"] },
                { label: "Wed", tasks: ["Reading Comprehension ×2 passages, timed"] },
                { label: "Thu", tasks: ["Second full timed PT"] },
                { label: "Fri", tasks: ["Blind review only — no new material"] },
                { label: "Sat", tasks: ["Light warm-up set, 10 questions", "Pack ID, tickets, analog watch"], milestone: "Milestone: test day tomorrow — taper, don't cram" },
                { label: "Sun", tasks: ["Test day"] },
            ],
        },
    ],
};

export const SAMPLE_PRACTICE_TEST: PracticeTestData = {
    title: "General Chemistry — Unit 1–3 Practice Test",
    instructions:
        "50 minutes. Mark every multiple-choice answer on the separate bubble sheet — do not write answers in this booklet. Show your work for the free-response questions in the ruled space provided.",
    questions: [
        {
            prompt: "A 2.00 L vessel holds 0.500 mol of an ideal gas at 300 K. What is the pressure, in atm?",
            choices: [{ text: "3.08" }, { text: "6.15" }, { text: "12.3" }, { text: "24.6" }],
            answer: "B",
            explanation: "P = nRT/V = (0.500)(0.08206)(300)/2.00 = 6.15 atm.",
            points: 2,
        },
        {
            prompt: "Which quantity is unchanged when a solution is heated?",
            choices: [{ text: "Molarity" }, { text: "Molality" }, { text: "Volume" }, { text: "Density" }],
            answer: "B",
            explanation: "Molality is moles per kilogram of solvent — mass does not expand with temperature, volume does.",
            points: 2,
        },
        {
            prompt: "Which gas effuses fastest at a fixed temperature?",
            choices: [{ text: "He" }, { text: "N₂" }, { text: "O₂" }],
            answer: "A",
            explanation: "Graham's law: rate ∝ 1/√M, and helium has the smallest molar mass of the three.",
            points: 2,
        },
        {
            prompt: "For a reaction with ΔH = −92 kJ and ΔS = −198 J·K⁻¹, at which temperature does it become non-spontaneous?",
            choices: [{ text: "Below 265 K" }, { text: "Above 465 K" }, { text: "Above 265 K" }, { text: "It is spontaneous at every temperature" }],
            answer: "B",
            explanation: "ΔG = ΔH − TΔS turns positive when T > ΔH/ΔS = 92 000 / 198 ≈ 465 K.",
            points: 3,
        },
        {
            prompt: "25.0 mL of 0.200 M HCl is diluted to 100.0 mL. What is the new molarity?",
            choices: [{ text: "0.0125 M" }, { text: "0.0500 M" }, { text: "0.0800 M" }, { text: "0.800 M" }],
            answer: "B",
            explanation: "M₁V₁ = M₂V₂ → (0.200)(25.0) = M₂(100.0) → M₂ = 0.0500 M.",
            points: 2,
        },
        {
            prompt: "Adding an inert gas at constant volume to a system at equilibrium will:",
            choices: [
                { text: "Shift the equilibrium toward the products" },
                { text: "Shift the equilibrium toward the reactants" },
                { text: "Not shift the equilibrium at all" },
                { text: "Change the value of K" },
                { text: "Change both K and the position of equilibrium" },
            ],
            answer: "C",
            explanation: "At constant volume the partial pressures of the reacting species are unchanged, so Q still equals K.",
            points: 3,
        },
        {
            prompt: "The pH of a solution is 3.40. What is [H₃O⁺]?",
            choices: [{ text: "3.4 × 10⁻¹ M" }, { text: "4.0 × 10⁻⁴ M" }, { text: "2.5 × 10⁻¹¹ M" }, { text: "1.0 × 10⁻³ M" }],
            answer: "B",
            explanation: "[H₃O⁺] = 10^(−3.40) = 4.0 × 10⁻⁴ M.",
            points: 2,
        },
        {
            prompt: "Which statement about a catalyst is correct?",
            choices: [
                { text: "It lowers ΔH for the reaction" },
                { text: "It lowers the activation energy of both the forward and the reverse reaction" },
                { text: "It shifts the equilibrium toward products" },
                { text: "It is consumed in the rate-determining step" },
            ],
            answer: "B",
            explanation: "A catalyst provides a lower-energy path in both directions, so K is untouched and only the rate changes.",
            points: 2,
        },
        {
            prompt: "A 0.100 mol sample of a weak acid (Ka = 1.8 × 10⁻⁵) is dissolved in 1.00 L of water. The approximate pH is:",
            choices: [{ text: "1.00" }, { text: "2.87" }, { text: "4.74" }, { text: "7.00" }],
            answer: "B",
            explanation: "[H₃O⁺] ≈ √(Ka·C) = √(1.8 × 10⁻⁵ × 0.100) = 1.34 × 10⁻³ → pH = 2.87.",
            points: 3,
        },
        {
            prompt: "Which sample contains the greatest number of atoms?",
            choices: [{ text: "1.0 mol of Ne" }, { text: "1.0 mol of CO₂" }, { text: "1.0 mol of H₂O" }, { text: "1.0 mol of CH₄" }],
            answer: "D",
            explanation: "Methane has five atoms per formula unit — more than water's three, CO₂'s three, or neon's one.",
            points: 2,
        },
        {
            prompt:
                "A student mixes 50.0 mL of 0.100 M NaOH with 50.0 mL of 0.100 M CH₃COOH (Ka = 1.8 × 10⁻⁵). Calculate the pH of the resulting solution and explain, in one sentence, why it is not 7.00.",
            answer:
                "All the acid is neutralized to acetate (0.0500 M). Kb = Kw/Ka = 5.6 × 10⁻¹⁰; [OH⁻] = √(5.6 × 10⁻¹⁰ × 0.0500) = 5.3 × 10⁻⁶ → pOH 5.28 → pH 8.72. The conjugate base of a weak acid hydrolyses, so the equivalence point of a weak-acid/strong-base titration is basic.",
            explanation:
                "The common error is stopping at 'strong base + acid = neutral'. The identity of the salt at the equivalence point decides the pH.",
            points: 6,
            workSpaceLines: 12,
        },
        {
            prompt:
                "Sketch and label a reaction-energy diagram for an exothermic reaction, with and without a catalyst. Identify ΔH, the activation energy of each path, and state what the diagram proves about the equilibrium constant.",
            answer:
                "Both paths start and end at the same energies, so ΔH is identical and K is unchanged; the catalysed curve simply has a lower maximum, reducing Ea in both directions.",
            explanation: "The diagram is the argument: only the barrier moves, never the endpoints.",
            points: 6,
            workSpaceLines: 14,
        },
    ],
};

export const SAMPLE_CERTIFICATE: CertificateData = {
    recipientName: "Amelia Rodríguez",
    title: "Certificate of Completion",
    subtitle: "General Chemistry — Units 1 through 3",
    body: "has completed all coursework, laboratory hours, and the unit assessment with distinction.",
    date: "August 31, 2026",
    signatures: [
        { name: "Dr. Helen Vasquez", role: "Course Director" },
        { role: "Program Registrar" },
    ],
};

export const SAMPLE_WORKBOOK_SECTIONS = [
    {
        title: "Unit 1 — Gases and the Ideal Gas Law",
        pagesHtml: [
            `<h3>What a gas law actually claims</h3><p>Every gas law is one statement — pressure, volume, moles, and temperature are not independent — read through a different pair of fixed variables. Learn PV = nRT and the rest are corollaries.</p><ul><li>Temperature is always kelvin.</li><li>Match R to the pressure unit you are using.</li><li>Standard conditions are a convention, not a law.</li></ul>`,
            `<h3>Worked example</h3><p>A 2.00 L vessel holds 0.500 mol of an ideal gas at 300 K.</p><p><strong>P = nRT / V = (0.500)(0.08206)(300) / 2.00 = 6.15 atm.</strong></p><p>Practice: repeat with the vessel at 450 K and confirm the pressure scales linearly.</p>`,
        ],
    },
    {
        title: "Unit 2 — Solutions and Concentration",
        pagesHtml: [
            `<h3>Molarity versus molality</h3><p>Molarity is per litre of solution and moves when the solution is heated; molality is per kilogram of solvent and does not. Colligative-property problems use molality for exactly that reason.</p>`,
            `<h3>Dilution drill</h3><p>M₁V₁ = M₂V₂ is a conservation statement: the moles of solute before equal the moles after. Practise the reverse direction — given a target molarity, what starting volume do you draw?</p>`,
        ],
    },
];

export const SAMPLE_ZPL_LABELS: QrLabel[] = [
    { qrValue: "https://aimatrx.com/l/AST-88213", caption: "Dell Latitude 5540", lines: ["Asset AST-88213", "Intake 2026-08-31"], badge: "IT" },
    { qrValue: "https://aimatrx.com/l/AST-88214", caption: "HP EliteBook 840 G10", lines: ["Asset AST-88214", "Intake 2026-08-31"], badge: "IT" },
];

export const SAMPLE_MARKDOWN = `# Quarterly Field Report

Prepared for the operations review. Every figure below is illustrative.

## Summary

The intake lane processed **12,480 units** across four sites, a 14% increase
over the previous quarter. Label rejection at the dock fell to 0.3% after the
switch to spec quiet zones.

## Site throughput

| Site | Units | Rejection |
| --- | ---: | ---: |
| Phoenix | 5,120 | 0.2% |
| Denver | 3,940 | 0.3% |
| Atlanta | 2,210 | 0.4% |
| Newark | 1,210 | 0.5% |

## What changed

1. Error correction level M became the floor on every printed code.
2. Calibration sheets are printed once per stock change.
3. Asset-spec labels now carry the serial in the human-readable line.

> Codes that scan on a design monitor and fail at a dock door are almost always
> a quiet-zone problem, not a printer problem.
`;
