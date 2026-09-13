"use client";

// features/question-desk/components/QuestionScreen.tsx
//
// ONE question, filling the screen. Everything above the action bar.
//
// The order is the reference page's, and it is the argument: the tags say what
// kind of decision this is and whether it can be undone; the title names it;
// the question itself is the ONE direct question; the background is what a
// stranger needs; the recommendation is the answer he can take with one key;
// and the four research parts stay COLLAPSED — the homework is there to be
// opened, not to be waded through.

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  DOOR_LABEL,
  KIND_LABEL,
  RESEARCH_PARTS,
  VERDICT_LABEL,
  WEIGHT_LABEL,
  type DecisionQuestionRow,
  type Verdict,
} from "../types";

export interface QuestionScreenProps {
  question: DecisionQuestionRow;
  /** Re-open an answered question for a fresh answer, prior words in hand. */
  onReanswer: () => void;
}

export function QuestionScreen({ question, onReanswer }: QuestionScreenProps) {
  const answered = question.answered_at !== null && question.verdict !== null;
  const verdictWords = answered
    ? (VERDICT_LABEL[question.verdict as Verdict] ?? "Answered")
    : null;

  const tags = useMemo(() => {
    const list: { text: string; tone: "plain" | "door" | "accent" }[] = [];
    if (question.weight)
      list.push({
        text: WEIGHT_LABEL[question.weight] ?? question.weight,
        tone: "plain",
      });
    if (question.kind)
      list.push({
        text: KIND_LABEL[question.kind] ?? question.kind,
        tone: "plain",
      });
    list.push({
      text: DOOR_LABEL[question.door] ?? question.door,
      tone: question.door === "one_way" ? "door" : "plain",
    });
    if (question.node) list.push({ text: question.node, tone: "accent" });
    return list;
  }, [question.weight, question.kind, question.door, question.node]);

  return (
    <div className="max-w-[820px]">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={`${tag.tone}-${tag.text}`}
            className={cn(
              "rounded border px-2 py-0.5 font-mono text-[10px] tracking-[0.09em] uppercase",
              tag.tone === "plain" &&
                "border-border bg-muted text-muted-foreground",
              tag.tone === "door" &&
                "border-transparent bg-destructive/10 text-destructive",
              tag.tone === "accent" &&
                "border-transparent bg-primary/10 text-primary",
            )}
          >
            {tag.text}
          </span>
        ))}
      </div>

      <h2 className="qd-editorial mb-5 text-[30px] leading-[1.2] font-semibold tracking-[-0.015em] text-balance text-foreground">
        {question.title}
      </h2>

      {answered ? (
        <div className="mb-4 rounded-lg border border-transparent bg-success/10 px-4 py-3.5">
          <b className="mb-1.5 block font-mono text-[10px] font-medium tracking-[0.1em] uppercase text-success">
            Answered · {verdictWords}
          </b>
          {question.answer_text ? (
            // Verbatim: `whitespace-pre-wrap` so the spacing he typed is the
            // spacing he sees. Never trimmed, never re-flowed.
            <p className="qd-editorial m-0 text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground">
              {question.answer_text}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onReanswer}
            className="mt-2.5 rounded font-mono text-[10.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Answer again — your words above stay in the record
          </button>
        </div>
      ) : null}

      <p className="qd-editorial mb-6 max-w-[62ch] text-[21px] leading-[1.45] text-pretty text-foreground">
        {question.question}
      </p>

      {question.background ? (
        <p className="mb-7 max-w-[66ch] text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/80">
          {question.background}
        </p>
      ) : null}

      {question.recommendation ? (
        <div className="mb-6 rounded-lg border border-border border-l-[3px] border-l-primary bg-card px-5 py-4 shadow-sm">
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase text-primary">
            My recommendation
          </h3>
          <p className="m-0 max-w-[64ch] text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground">
            {question.recommendation}
          </p>
        </div>
      ) : null}

      {question.default_in_force ? (
        // WHAT SKIP MEANS. Without this sentence, pressing 2 is a decision
        // whose consequence the person cannot see — the desk's default ships
        // and nobody said what it was. Verifier finding 2, 2026-09-12.
        <div className="mb-6 rounded-lg border border-border border-l-[3px] border-l-warning bg-card px-5 py-4">
          <h3 className="mb-2 font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase text-warning">
            If you skip, this is what ships
          </h3>
          <p className="m-0 max-w-[64ch] text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground">
            {question.default_in_force}
          </p>
        </div>
      ) : null}

      {question.blocks ? (
        <p className="mb-6 max-w-[66ch] rounded-md bg-muted px-3 py-2 text-[13px] text-foreground/80">
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">
            Blocked until you answer:{" "}
          </span>
          {question.blocks}
        </p>
      ) : null}

      {RESEARCH_PARTS.map((part) => {
        const body = question[part.key];
        if (!body) return null;
        return (
          <details
            key={part.key}
            className="qd-disclosure border-t border-border py-3"
          >
            <summary className="cursor-pointer list-none font-mono text-[12px] tracking-[0.07em] uppercase text-muted-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {part.label}
            </summary>
            <p className="mt-2.5 max-w-[66ch] text-[14px] leading-relaxed whitespace-pre-wrap text-foreground/80">
              {body}
            </p>
          </details>
        );
      })}

      {question.why_it_matters ? (
        <details className="qd-disclosure border-t border-border py-3">
          <summary className="cursor-pointer list-none font-mono text-[12px] tracking-[0.07em] uppercase text-muted-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Why this matters
          </summary>
          <p className="mt-2.5 max-w-[66ch] text-[14px] leading-relaxed whitespace-pre-wrap text-foreground/80">
            {question.why_it_matters}
          </p>
        </details>
      ) : null}

      <Provenance question={question} />

      {question.door_note ? (
        <p className="mt-4 max-w-[66ch] rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {question.door === "one_way" ? "Cannot be undone: " : "Note on the door: "}
          {question.door_note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * WHERE THIS CAME FROM. Every question is filed by an agent in a real chat, in
 * a real repository, on a real branch, and the tool stores all of it. Until
 * 2026-09-12 none of it reached the screen, so a question arrived with no way
 * to ask "who wants this, and out of what conversation?". Collapsed, because it
 * is provenance rather than argument — but present, because the tool advertises
 * these fields and a field the tool accepts and never shows is a broken promise.
 */
function Provenance({ question }: { question: DecisionQuestionRow }) {
  const rows: { label: string; value: string }[] = [];
  if (question.filed_chat_title)
    rows.push({ label: "Chat", value: question.filed_chat_title });
  if (question.filed_repo)
    rows.push({
      label: "Repository",
      value: question.filed_branch
        ? `${question.filed_repo} · ${question.filed_branch}`
        : question.filed_repo,
    });
  if (question.filed_session_id)
    rows.push({ label: "Coding session", value: question.filed_session_id });
  if (question.filed_conversation_id)
    rows.push({
      label: "Conversation",
      value: question.filed_conversation_id,
    });
  if (question.node) rows.push({ label: "Node", value: question.node });
  const alsoAsked = Array.isArray(question.also_asked_by)
    ? question.also_asked_by
    : [];
  if (alsoAsked.length > 0)
    rows.push({
      label: "Also asked by",
      value: alsoAsked.map((entry) => String(entry)).join(", "),
    });
  if (rows.length === 0) return null;

  return (
    <details className="qd-disclosure border-t border-border py-3">
      <summary className="cursor-pointer list-none font-mono text-[12px] tracking-[0.07em] uppercase text-muted-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Where this came from
      </summary>
      <dl className="mt-2.5 grid max-w-[66ch] grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-muted-foreground">
              {row.label}
            </dt>
            <dd className="m-0 break-words text-foreground/80">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  );
}
