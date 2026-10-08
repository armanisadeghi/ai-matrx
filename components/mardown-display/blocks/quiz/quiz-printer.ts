/**
 * MultipleChoiceQuiz — BlockPrinter
 *
 * Self-contained print logic for quiz blocks.
 */

import { buildPrintDocument, openPrintWindow, type BlockPrinter } from "@ai-matrx/print/core";
import { escapeHtml } from "@ai-matrx/kit/html-escape";
import { normalizeRawQuizJSON, type RawQuizJSON } from "./quiz-parser";

export type QuizVariant = "with-answers" | "blank" | "answer-key";

const QUIZ_STYLES = `
  .matrx-quiz-quiz-header {
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 2px solid #1e293b;
  }
  .matrx-quiz-quiz-title { font-size: 20pt; font-weight: 700; margin-bottom: 4px; }
  .matrx-quiz-quiz-meta { font-size: 9.5pt; color: #64748b; }
  .matrx-quiz-question-block {
    margin-bottom: 20px;
    page-break-inside: avoid;
  }
  .matrx-quiz-question-number {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 4px;
  }
  .matrx-quiz-question-text {
    font-size: 11pt;
    font-weight: 600;
    margin-bottom: 10px;
    line-height: 1.4;
  }
  .matrx-quiz-options-list { list-style: none; padding: 0; margin: 0; }
  .matrx-quiz-option-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 6px 10px;
    margin-bottom: 4px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 10.5pt;
  }
  .matrx-quiz-option-letter {
    font-weight: 700;
    min-width: 20px;
    color: #374151;
  }
  .matrx-quiz-option-correct {
    background: #f0fdf4;
    border-color: #22c55e;
  }
  .matrx-quiz-option-correct .matrx-quiz-option-letter { color: #16a34a; }
  .matrx-quiz-option-bubble {
    width: 16px;
    height: 16px;
    border: 1.5px solid #94a3b8;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .matrx-quiz-explanation {
    margin-top: 8px;
    padding: 8px 12px;
    background: #f8fafc;
    border-left: 3px solid #6366f1;
    font-size: 9.5pt;
    color: #374151;
    border-radius: 0 4px 4px 0;
  }
  .matrx-quiz-answer-lines {
    height: 72px;
    border-bottom: 1px solid #94a3b8;
    background: repeating-linear-gradient(to bottom, transparent 0, transparent 23px, #cbd5e1 23px, #cbd5e1 24px);
  }
  .matrx-quiz-answer-key-row {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  .matrx-quiz-answer-key-num { font-weight: 700; color: #64748b; }
  .matrx-quiz-answer-key-correct { color: #16a34a; font-weight: 600; }

  @media print {
    .matrx-quiz-option-correct { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .matrx-quiz-explanation { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function renderWithAnswers(quiz: RawQuizJSON): string {
    const questions = quiz.multipleChoice
        .map((q, qi) => {
            const opts = q.options
                .map((opt, oi) => {
                    const isCorrect = oi === q.correctAnswer;
                    return `<li class="matrx-quiz-option-item${isCorrect ? " matrx-quiz-option-correct" : ""}">
          <span class="matrx-quiz-option-letter">${LETTERS[oi] ?? oi + 1}.</span>
          <span>${escapeHtml(opt)}</span>
        </li>`;
                })
                .join("\n");

            const openAnswer = !q.options.length && q.answerText ? `<div class="matrx-quiz-explanation"><strong>Answer:</strong> ${escapeHtml(q.answerText)}</div>` : "";
            return `<div class="matrx-quiz-question-block">
      <div class="matrx-quiz-question-number">Question ${qi + 1}</div>
      <div class="matrx-quiz-question-text">${escapeHtml(q.question)}</div>
      <ul class="matrx-quiz-options-list">${opts}</ul>
      ${openAnswer}
      ${q.explanation ? `<div class="matrx-quiz-explanation"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</div>` : ""}
    </div>`;
        })
        .join("\n");

    return `<div class="matrx-quiz-quiz-header">
  <div class="matrx-quiz-quiz-title">${escapeHtml(quiz.quizTitle)}</div>
  <div class="matrx-quiz-quiz-meta">${quiz.multipleChoice.length} questions${quiz.category ? ` • ${escapeHtml(quiz.category)}` : ""} • Answers shown</div>
</div>
${questions}`;
}

function renderBlank(quiz: RawQuizJSON): string {
    const questions = quiz.multipleChoice
        .map((q, qi) => {
            const opts = q.options
                .map((opt, oi) => {
                    return `<li class="matrx-quiz-option-item">
          <span class="matrx-quiz-option-bubble"></span>
          <span class="matrx-quiz-option-letter">${LETTERS[oi] ?? oi + 1}.</span>
          <span>${escapeHtml(opt)}</span>
        </li>`;
                })
                .join("\n");

            const lines = q.options.length ? "" : `<div class="matrx-quiz-answer-lines"></div>`;
            return `<div class="matrx-quiz-question-block">
      <div class="matrx-quiz-question-number">Question ${qi + 1}</div>
      <div class="matrx-quiz-question-text">${escapeHtml(q.question)}</div>
      <ul class="matrx-quiz-options-list">${opts}</ul>
      ${lines}
    </div>`;
        })
        .join("\n");

    return `<div class="matrx-quiz-quiz-header">
  <div class="matrx-quiz-quiz-title">${escapeHtml(quiz.quizTitle)}</div>
  <div class="matrx-quiz-quiz-meta">${quiz.multipleChoice.length} questions${quiz.category ? ` • ${escapeHtml(quiz.category)}` : ""} • Name: _________________________ Score: _____/${quiz.multipleChoice.length}</div>
</div>
${questions}`;
}

function renderAnswerKey(quiz: RawQuizJSON): string {
    const rows = quiz.multipleChoice
        .map((q, qi) => {
            const hasChoice = q.correctAnswer >= 0 && q.correctAnswer < q.options.length;
            const correctLabel = hasChoice
                ? `${LETTERS[q.correctAnswer] ?? q.correctAnswer + 1}. ${q.options[q.correctAnswer]}`
                : (q.answerText ?? "");
            return `<div class="matrx-quiz-answer-key-row">
      <span class="matrx-quiz-answer-key-num">${qi + 1}.</span>
      <span><span class="matrx-quiz-answer-key-correct">${escapeHtml(correctLabel)}</span>${q.explanation ? ` — ${escapeHtml(q.explanation)}` : ""}</span>
    </div>`;
        })
        .join("\n");

    return `<div class="matrx-quiz-quiz-header">
  <div class="matrx-quiz-quiz-title">${escapeHtml(quiz.quizTitle)} — Answer Key</div>
  <div class="matrx-quiz-quiz-meta">${quiz.multipleChoice.length} questions</div>
</div>
<div style="margin-top:12px;">${rows}</div>`;
}

export const quizPrinter: BlockPrinter = {
    label: "Print quiz",
    variants: [
        {
            id: "blank",
            label: "Student version",
            description: "Questions and choices — no answers marked",
        },
        {
            id: "with-answers",
            label: "With answers & explanations",
            description: "Correct answers highlighted, explanations shown",
        },
        {
            id: "answer-key",
            label: "Answer key only",
            description: "Compact list of correct answers with explanations",
        },
    ],
    print(data: unknown, variantId: string = "blank") {
        const quiz = normalizeRawQuizJSON(data);
        if (!quiz?.multipleChoice?.length) {
            openPrintWindow(
                buildPrintDocument("<p>No quiz data available to print.</p>", "Quiz", QUIZ_STYLES),
                "quiz"
            );
            return;
        }

        let bodyHtml: string;
        switch (variantId as QuizVariant) {
            case "with-answers":
                bodyHtml = renderWithAnswers(quiz);
                break;
            case "answer-key":
                bodyHtml = renderAnswerKey(quiz);
                break;
            case "blank":
            default:
                bodyHtml = renderBlank(quiz);
                break;
        }

        openPrintWindow(
            buildPrintDocument(bodyHtml, quiz.quizTitle ?? "Quiz", QUIZ_STYLES),
            "quiz"
        );
    },
    // Inside a message's print: the student version (the answers are the quiz's own print).
    toPrintHtml(data: unknown) {
        const quiz = normalizeRawQuizJSON(data);
        if (!quiz?.multipleChoice?.length) return null;
        // The composed print strips <style> and non-matrx classes: the sheet travels as `css`.
        const output = { html: `<style>${QUIZ_STYLES}</style>${renderBlank(quiz)}`, css: QUIZ_STYLES };
        return output;
    },
};
