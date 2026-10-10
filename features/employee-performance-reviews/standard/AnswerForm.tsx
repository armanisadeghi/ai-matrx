"use client";

// One half of a standard review (the self form or the manager form), built from the cycle's frozen
// template snapshot out of the same question components the review demo uses (ListEditor,
// RatingScale, ProTextarea). Edits autosave through save_response (debounced, with the version the
// server handed back); Submit flushes the last edit first and shows any `answers_incomplete`
// problems under the question they name.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@ai-matrx/design-system/controls";

import { ProTextarea } from "@/components/official/ProTextarea";
import { Field, ListEditor, RatingScale, SectionCard } from "@/features/employee-performance-reviews/components/review-form-components";
import { isRatingValue } from "@/features/employee-performance-reviews/schema";
import { toast } from "@/lib/toast";

import { problemMessage } from "./messages";
import { saveResponse, submitResponse, type StdResult } from "./service";
import type { AnswerProblem, ResponseRole, ReviewAnswers, TemplateQuestion, TemplateSnapshot } from "./types";
import { emptyAnswers } from "./types";

const AUTOSAVE_MS = 1200;
type SaveState = "idle" | "saving" | "saved" | "error";

/** key -> the words the person sees for a problem's `question` (a question, or `category.item`). */
export function labelMap(template: TemplateSnapshot): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of template.sections)
    for (const q of s.questions) {
      m.set(q.key, q.label);
      for (const i of q.items) m.set(`${q.key}.${i.key}`, `${q.label}, ${i.label}`);
    }
  return m;
}

export function AnswerForm({
  reviewId,
  role,
  template,
  initialAnswers,
  initialVersion,
  canSubmit,
  subjectName,
  onSubmitted,
  onConflict,
}: {
  reviewId: string;
  role: ResponseRole;
  template: TemplateSnapshot;
  initialAnswers: ReviewAnswers | null;
  initialVersion: number | null;
  canSubmit: boolean;
  subjectName: string;
  onSubmitted: () => void;
  onConflict: () => void;
}) {
  const [answers, setAnswers] = useState<ReviewAnswers>(() => initialAnswers ?? emptyAnswers());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problems, setProblems] = useState<AnswerProblem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const labels = useMemo(() => labelMap(template), [template]);

  const latest = useRef(answers);
  const version = useRef<number | null>(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<StdResult<unknown> | null>>(Promise.resolve(null));
  const dirty = useRef(false);
  const everSaved = useRef(initialVersion !== null);

  const persist = useCallback((): Promise<StdResult<unknown> | null> => {
    const run = chain.current.then(async (): Promise<StdResult<unknown> | null> => {
      if (!dirty.current && everSaved.current) return null;
      dirty.current = false;
      setSaveState("saving");
      const r = await saveResponse(reviewId, role, latest.current, version.current);
      if (r.ok) {
        version.current = r.data.version;
        everSaved.current = true;
        setSaveError(null);
        setSaveState(dirty.current ? "saving" : "saved");
      } else {
        dirty.current = true;
        setSaveState("error");
        setSaveError(r.message);
        if (r.reason === "version_conflict") onConflict();
      }
      return r;
    });
    chain.current = run;
    return run;
  }, [reviewId, role, onConflict]);

  const change = useCallback(
    (next: ReviewAnswers) => {
      latest.current = next;
      dirty.current = true;
      setAnswers(next);
      setProblems([]);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      // Leaving with an unsaved edit: save it now rather than lose it.
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirty.current) void persist();
      }
    },
    [persist],
  );

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    const saved = await persist();
    if (saved && !saved.ok) {
      setSubmitting(false);
      toast.error(saved.message);
      return;
    }
    const r = await submitResponse(reviewId, role);
    setSubmitting(false);
    if (!r.ok) {
      if (r.problems && r.problems.length > 0) setProblems(r.problems);
      toast.error(r.problems && r.problems.length > 0 ? "A few answers are still missing. They are marked below." : r.message);
      return;
    }
    toast.success(role === "self" ? "Self review submitted" : "Your review is submitted");
    onSubmitted();
  };

  const scope = useCallback(() => ({ context: { surface: "hr-standard-performance-review", part: role, employee: subjectName } }), [role, subjectName]);
  const problemsFor = (key: string) => problems.filter((p) => p.question === key);

  const renderQuestion = (q: TemplateQuestion) => {
    if (q.type === "narrative_list" || q.type === "responsibilities") {
      const items = answers.lists[q.key] ?? [];
      const setItems = (next: string[]) => change({ ...answers, lists: { ...answers.lists, [q.key]: next } });
      return (
        <ListEditor
          items={items}
          maxItems={q.maxItems ?? 5}
          placeholder={q.type === "responsibilities" ? "A core responsibility of this role" : `Add to ${q.label.toLowerCase()}`}
          onAdd={(text) => setItems([...items, text.trim()])}
          onEdit={(i, text) => setItems(items.map((x, idx) => (idx === i ? text.trim() : x)))}
          onRemove={(i) => setItems(items.filter((_, idx) => idx !== i))}
          onMove={(i, dir) => {
            const j = i + dir;
            if (j < 0 || j >= items.length) return;
            const next = [...items];
            [next[i], next[j]] = [next[j]!, next[i]!];
            setItems(next);
          }}
          surfaceName="hr-standard-performance-review"
          getApplicationScope={scope}
        />
      );
    }
    if (q.type === "rating") {
      return (
        <div className="divide-y divide-border">
          {q.items.map((item) => {
            const key = `${q.key}.${item.key}`;
            const value = answers.ratings[key];
            return (
              <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm">{item.label}</span>
                <RatingScale
                  value={isRatingValue(value) ? value : undefined}
                  onSelect={(v) => change({ ...answers, ratings: { ...answers.ratings, [key]: v } })}
                />
                {problemsFor(key).map((p) => (
                  <p key={p.problem} role="alert" className="basis-full text-xs text-destructive">
                    {problemMessage(p, (k) => labels.get(k) ?? k)}
                  </p>
                ))}
              </div>
            );
          })}
          <p className="pt-2 text-[11px] text-muted-foreground">{template.ratingPoints.map((p) => `${p.value} ${p.label}`).join("  ·  ")}</p>
        </div>
      );
    }
    return (
      <ProTextarea
        value={answers.texts[q.key] ?? ""}
        onChange={(e) => change({ ...answers, texts: { ...answers.texts, [q.key]: e.target.value } })}
        placeholder={q.label}
        minHeight={96}
        maxHeight={480}
        surfaceName="hr-standard-performance-review"
        getApplicationScope={scope}
        enableTextStats={false}
        className="min-h-[96px] resize-y text-base sm:text-sm"
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={role === "self" ? "info" : "primary"}>{role === "self" ? "Your self review" : `Your review of ${subjectName}`}</Badge>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "Saves as you type"}
        </span>
      </div>
      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
      {problems.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-card p-3 text-sm">
          <p className="font-medium">To submit, fix these</p>
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={`${p.question}-${p.problem}-${i}`}>{problemMessage(p, (k) => labels.get(k) ?? k)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {template.sections.map((section, index) => (
        <SectionCard key={section.key} badge={index + 1} title={section.title} description={section.description ?? undefined} anchor={`section-${section.key}`}>
          <div className="space-y-4">
            {section.questions.map((q) => (
              <Field key={q.key} label={q.label} anchor={`question-${q.key}`}>
                {renderQuestion(q)}
                {q.type !== "rating"
                  ? problemsFor(q.key).map((p) => (
                      <p key={p.problem} role="alert" className="text-xs text-destructive">
                        {problemMessage(p, (k) => labels.get(k) ?? k)}
                      </p>
                    ))
                  : null}
              </Field>
            ))}
          </div>
        </SectionCard>
      ))}
      {canSubmit ? (
        <div className="flex justify-end">
          <Button variant="primary" disabled={submitting} onClick={() => void submit()}>
            {role === "self" ? "Submit self review" : "Submit your review"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
