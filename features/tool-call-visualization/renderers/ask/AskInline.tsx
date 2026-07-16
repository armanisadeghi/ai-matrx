"use client";

/**
 * AskInline — renderer for the agent-asks-the-user tools (`ask_user`,
 * `interaction_ask`). Step-0 classification: KNOWN (stable shapes) + PRETTY
 * (questions and answers are human-meaningful) → the canonical
 * `ToolResultCard` + `chrome: "card"` — no hand-rolled header, no fold line.
 *
 * Shapes (live wire, chat.tool_call):
 *   ask_user         args { question }            → result { answer, cancelled }
 *   interaction_ask  args { introduction?, questions: [{ id, prompt,
 *                    options?, component_type }] } → result confirms send
 *                    ("Questionnaire sent…"); answers may arrive later as
 *                    { answers: {id: value} } / per-question `answer`, or as
 *                    the user's next message.
 *
 * Display rules: questions are visible the moment they exist (including while
 * waiting for the user / server); each Q&A is ONE condensed row — question,
 * then the answer beneath it; unanswered rows show a quiet "Awaiting answer".
 * No ids, no component_type enums, no option dumps (options live in Tool
 * Admin / Raw).
 */

import React from "react";
import { CornerDownRight, MessageCircleQuestionMark } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ToolRendererProps } from "../../types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { ToolResultCard } from "../_shared-entity/ToolResultCard";

const ASK_ICON_TINT = "text-amber-600 dark:text-amber-400";

// ─── shapes ──────────────────────────────────────────────────────────────────

interface QA {
    question: string;
    answer: string | null;
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** Coerce any answer value (string / bool / number / array) to display text. */
function answerText(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return str(v);
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    if (Array.isArray(v)) {
        const parts = v.map(answerText).filter((s): s is string => s !== null);
        return parts.length > 0 ? parts.join(" · ") : null;
    }
    return null;
}

/** Extract the Q&A list from either tool's args + result. Null = unknown shape. */
function extractQAs(props: ToolRendererProps): { qas: QA[]; intro: string | null } | null {
    const { entry } = props;
    const result = resultAsObject(entry);

    // ask_user: single question → single answer.
    const singleQ = str(getArg<string>(entry, "question"));
    if (singleQ) {
        const cancelled = result?.cancelled === true;
        return {
            qas: [{ question: singleQ, answer: cancelled ? "(cancelled)" : answerText(result?.answer) }],
            intro: null,
        };
    }

    // interaction_ask: questions array; answers may live in several places.
    const rawQuestions = getArg<unknown>(entry, "questions");
    if (Array.isArray(rawQuestions)) {
        const answerMap =
            result && typeof result.answers === "object" && result.answers !== null && !Array.isArray(result.answers)
                ? (result.answers as Record<string, unknown>)
                : null;
        const qas: QA[] = [];
        for (const raw of rawQuestions) {
            if (raw === null || typeof raw !== "object") continue;
            const q = raw as Record<string, unknown>;
            const prompt = str(q.prompt) ?? str(q.question);
            if (!prompt) continue;
            const id = str(q.id);
            const answer =
                answerText(q.answer) ??
                (answerMap && id ? answerText(answerMap[id]) : null);
            qas.push({ question: prompt, answer });
        }
        if (qas.length > 0) {
            return { qas, intro: str(getArg<string>(entry, "introduction")) };
        }
    }

    return null;
}

// ─── component ───────────────────────────────────────────────────────────────

export const AskInline: React.FC<ToolRendererProps> = (props) => {
    const { entry, onOpenOverlay, onOpenWindowPanel, toolGroupId, expanded, onToggleExpanded } =
        props;

    if (entry.status === "error") {
        return <ToolErrorCard entry={entry} onOpenOverlay={onOpenOverlay} toolGroupId={toolGroupId} />;
    }

    const parsed = extractQAs(props);
    // Unknown shape (and nothing to show yet while running) — honest fallbacks.
    if (!parsed) {
        return isTerminal(entry) ? <GenericRenderer {...props} /> : null;
    }

    const { qas, intro } = parsed;
    const answered = qas.filter((q) => q.answer !== null).length;
    const waiting = answered < qas.length;

    const title =
        qas.length === 1
            ? waiting
                ? "Asked a question"
                : "Question answered"
            : `Asked ${qas.length} questions`;
    const sub =
        intro ??
        (qas.length === 1
            ? qas[0].question
            : waiting
              ? `${answered} of ${qas.length} answered`
              : "All answered");

    return (
        <ToolResultCard
            icon={MessageCircleQuestionMark}
            iconClassName={ASK_ICON_TINT}
            title={title}
            sub={sub}
            expanded={expanded}
            onToggleExpanded={onToggleExpanded}
            onOpenWindowPanel={onOpenWindowPanel ? () => onOpenWindowPanel() : undefined}
            onOpenOverlay={onOpenOverlay ? () => onOpenOverlay() : undefined}
        >
            <div>
                {qas.map((qa, i) => (
                    <div
                        key={i}
                        className={cn("px-4 py-2", i > 0 && "border-t border-border/30")}
                    >
                        <p className="text-[13px] leading-snug text-foreground">{qa.question}</p>
                        <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug">
                            <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                            {qa.answer !== null ? (
                                <span className="font-medium text-foreground">{qa.answer}</span>
                            ) : (
                                <span className="italic text-muted-foreground">Awaiting answer</span>
                            )}
                        </p>
                    </div>
                ))}
            </div>
        </ToolResultCard>
    );
};

export default AskInline;
