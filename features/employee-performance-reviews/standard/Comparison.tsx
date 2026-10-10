"use client";

// Self review and manager review, side by side, DIFFERENCES FIRST: rating gaps ranked largest
// first (computed in code, deltas.ts), then each written answer next to the other.

import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";

import { SectionCard } from "@/features/employee-performance-reviews/components/review-form-components";

import { averageRatings, rankRatingDeltas } from "./deltas";
import type { ReviewAnswers, ReviewGoal, TemplateSnapshot } from "./types";

function Side({ title, answers, template, qKey, type, goals = [] }: { title: string; answers: ReviewAnswers; template: TemplateSnapshot; qKey: string; type: string; goals?: ReviewGoal[] }) {
  void template;
  if (type === "goal_review") {
    return (
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {goals.length === 0 ? <p className="text-sm text-muted-foreground">No goals in this period</p> : null}
        {goals.map((g) => (
          <div key={g.goalId} className="text-sm">
            <span className="font-medium">{g.title}</span>: {answers.ratings[g.answerKey] ?? "not rated"}
            {answers.texts[g.answerKey] ? <p className="text-muted-foreground">{answers.texts[g.answerKey]}</p> : null}
          </div>
        ))}
      </div>
    );
  }
  const list = answers.lists[qKey] ?? [];
  const text = answers.texts[qKey] ?? "";
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {type === "text" ? (
        text ? (
          <div className="text-sm leading-relaxed">
            <RichContent source={text} level="standard" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing written</p>
        )
      ) : list.length > 0 ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {list.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing written</p>
      )}
    </div>
  );
}

export function Comparison({
  template,
  self,
  manager,
  employeeName,
  managerName,
  goals = [],
}: {
  template: TemplateSnapshot;
  self: ReviewAnswers;
  manager: ReviewAnswers;
  employeeName: string;
  managerName: string;
  goals?: ReviewGoal[];
}) {
  const deltas = rankRatingDeltas(template, self, manager);
  const avg = averageRatings(deltas);
  const differing = deltas.filter((d) => d.size > 0);

  return (
    <div className="space-y-3">
      <SectionCard badge="Δ" title="Where you differ" description={differing.length === 0 ? "The two reviews rate every item the same." : "Largest gap first."}>
        {avg.self !== null && avg.manager !== null ? (
          <p className="mb-2 text-sm text-muted-foreground">
            Average rating: {employeeName} {avg.self.toFixed(1)}, {managerName} {avg.manager.toFixed(1)}
          </p>
        ) : null}
        {differing.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2 font-semibold">Item</th>
                <th className="px-2 py-1 text-right font-semibold">{employeeName}</th>
                <th className="px-2 py-1 text-right font-semibold">{managerName}</th>
                <th className="py-1 pl-2 text-right font-semibold">Gap</th>
              </tr>
            </thead>
            <tbody>
              {differing.map((d) => (
                <tr key={d.key} className="border-t border-border">
                  <td className="py-1.5 pr-2">
                    <span className="text-muted-foreground">{d.category}: </span>
                    {d.item}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.self}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{d.manager}</td>
                  <td className="py-1.5 pl-2 text-right font-semibold tabular-nums">{d.gap > 0 ? `+${d.gap}` : d.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </SectionCard>

      {template.sections.flatMap((section, index) =>
        section.questions
          .filter((q) => q.type !== "rating")
          .map((q) => (
            <SectionCard key={q.key} badge={index + 1} title={q.label}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Side title={employeeName} answers={self} template={template} qKey={q.key} type={q.type} goals={goals} />
                <Side title={managerName} answers={manager} template={template} qKey={q.key} type={q.type} goals={goals} />
              </div>
            </SectionCard>
          )),
      )}
    </div>
  );
}

/** One person's finished answers, read-only (their own submitted half, or the shared manager review). */
export function AnswerReadout({ template, answers, title, goals = [] }: { template: TemplateSnapshot; answers: ReviewAnswers; title: string; goals?: ReviewGoal[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{title}</p>
      {template.sections.map((section, index) => (
        <SectionCard key={section.key} badge={index + 1} title={section.title}>
          <div className="space-y-4">
            {section.questions.map((q) =>
              q.type === "rating" ? (
                <div key={q.key} className="divide-y divide-border">
                  <p className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{q.label}</p>
                  {q.items.map((i) => (
                    <div key={i.key} className="flex items-center justify-between py-1.5 text-sm">
                      <span>{i.label}</span>
                      <span className="tabular-nums">{answers.ratings[`${q.key}.${i.key}`] ?? "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Side key={q.key} title={q.label} answers={answers} template={template} qKey={q.key} type={q.type} goals={goals} />
              ),
            )}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
