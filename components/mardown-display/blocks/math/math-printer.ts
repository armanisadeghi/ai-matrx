/**
 * MathProblemBlock — BlockPrinter
 *
 * Self-contained print logic for math problem blocks.
 */

import { buildPrintDocument, openPrintWindow, escapeHtml, type BlockPrinter } from "@/lib/block-print/block-print-utils";
import type { MathProblem } from "@/features/math/types";

export type MathVariant = "problem-only" | "with-solution";

const MATH_STYLES = `
  .math-header {
    border-bottom: 2px solid #1e293b;
    margin-bottom: 20px;
    padding-bottom: 12px;
  }
  .math-title { font-size: 18pt; font-weight: 700; margin-bottom: 4px; }
  .math-meta { font-size: 9.5pt; color: #64748b; }
  .math-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 8.5pt;
    font-weight: 600;
    margin-right: 6px;
  }
  .badge-easy    { background: #dcfce7; color: #15803d; }
  .badge-medium  { background: #fef9c3; color: #a16207; }
  .badge-hard    { background: #fee2e2; color: #b91c1c; }

  .section-label {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #64748b;
    margin-bottom: 6px;
    margin-top: 16px;
  }
  .problem-box {
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 16px;
  }
  .problem-text { font-size: 11pt; margin-bottom: 8px; line-height: 1.5; }
  .problem-equation {
    font-family: 'Courier New', monospace;
    font-size: 13pt;
    font-weight: 600;
    color: #1e40af;
    margin: 8px 0;
    text-align: center;
  }
  .problem-instruction { font-size: 10pt; color: #475569; font-style: italic; }

  .solution-section {
    margin-top: 20px;
    border-top: 2px dashed #e2e8f0;
    padding-top: 16px;
  }
  .solution-title { font-size: 13pt; font-weight: 700; margin-bottom: 12px; color: #1e293b; }
  .step-block {
    margin-bottom: 14px;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    page-break-inside: avoid;
  }
  .step-number {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6366f1;
    margin-bottom: 4px;
  }
  .step-equation {
    font-family: 'Courier New', monospace;
    font-size: 12pt;
    font-weight: 600;
    color: #0f172a;
    margin: 6px 0;
  }
  .step-explanation { font-size: 10pt; color: #374151; line-height: 1.5; }
  .step-simplified { font-size: 10pt; color: #64748b; font-style: italic; margin-top: 4px; }
  .final-answer {
    background: #1e293b;
    color: #f1f5f9;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 16px;
    text-align: center;
    font-size: 13pt;
    font-weight: 700;
    page-break-inside: avoid;
  }
  .answer-label { font-size: 9pt; color: #94a3b8; margin-bottom: 4px; }

  @media print {
    .problem-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .final-answer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderProblemSection(problem: MathProblem): string {
    const ps = problem.problem_statement;
    const difficultyClass = problem.difficulty_level
        ? `badge-${problem.difficulty_level}`
        : "";

    return `<div class="math-header">
  <div class="math-title">${escapeHtml(problem.title)}</div>
  <div class="math-meta">
    ${problem.difficulty_level ? `<span class="math-badge ${difficultyClass}">${problem.difficulty_level}</span>` : ""}
    ${escapeHtml(problem.topic_name)} • ${escapeHtml(problem.module_name)}
  </div>
</div>

${problem.intro_text ? `<p style="color:#374151;margin-bottom:12px;">${escapeHtml(problem.intro_text)}</p>` : ""}

<div class="section-label">Problem</div>
<div class="problem-box">
  ${ps.text ? `<div class="problem-text">${escapeHtml(ps.text)}</div>` : ""}
  ${ps.equation ? `<div class="problem-equation">${escapeHtml(ps.equation)}</div>` : ""}
  ${ps.instruction ? `<div class="problem-instruction">${escapeHtml(ps.instruction)}</div>` : ""}
</div>`;
}

function renderSolutionSection(problem: MathProblem): string {
    const solutions = problem.solutions ?? [];
    if (solutions.length === 0) return "";

    const solutionBlocks = solutions
        .map((sol, si) => {
            const steps = (sol.steps ?? [])
                .map(
                    (step, si2) => `<div class="step-block">
    <div class="step-number">Step ${si2 + 1}: ${escapeHtml(step.title)}</div>
    ${step.equation ? `<div class="step-equation">${escapeHtml(step.equation)}</div>` : ""}
    ${step.explanation ? `<div class="step-explanation">${escapeHtml(step.explanation)}</div>` : ""}
    ${step.simplified ? `<div class="step-simplified">Simplified: ${escapeHtml(step.simplified)}</div>` : ""}
  </div>`
                )
                .join("\n");

            return `${solutions.length > 1 ? `<div class="solution-title">Solution ${si + 1}: ${escapeHtml(sol.task)}</div>` : `<div class="solution-title">${escapeHtml(sol.task)}</div>`}
${steps}
<div class="final-answer">
  <div class="answer-label">Answer</div>
  ${escapeHtml(sol.solutionAnswer)}
</div>
${sol.transitionText ? `<p style="margin-top:12px;color:#475569;font-style:italic;">${escapeHtml(sol.transitionText)}</p>` : ""}`;
        })
        .join("\n\n");

    return `<div class="solution-section">
<div class="section-label">Solution</div>
${solutionBlocks}
</div>`;
}

export const mathPrinter: BlockPrinter = {
    label: "Print math problem",
    variants: [
        {
            id: "problem-only",
            label: "Problem only",
            description: "Problem statement without the solution — good for practice",
        },
        {
            id: "with-solution",
            label: "Problem with solution",
            description: "Full problem and step-by-step solution",
        },
    ],
    print(data: unknown, variantId: string = "with-solution") {
        const problem = (data as { math_problem: MathProblem })?.math_problem ?? (data as MathProblem);
        if (!problem?.title) {
            openPrintWindow(
                buildPrintDocument("<p>No math problem data available to print.</p>", "Math Problem", MATH_STYLES),
                "math-problem"
            );
            return;
        }

        let bodyHtml = renderProblemSection(problem);
        if ((variantId as MathVariant) === "with-solution") {
            bodyHtml += renderSolutionSection(problem);
        }

        openPrintWindow(
            buildPrintDocument(bodyHtml, problem.title, MATH_STYLES),
            "math-problem"
        );
    },
};
