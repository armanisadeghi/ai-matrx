"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { isDecisionQuestionType, type DecisionQuestion } from "./decision-form";

interface Props {
  questions: DecisionQuestion[];
  onChange: (questions: DecisionQuestion[]) => void;
}

export function DecisionQuestionEditor({ questions, onChange }: Props) {
  const update = (index: number, next: DecisionQuestion) => {
    onChange(questions.map((question, questionIndex) => questionIndex === index ? next : question));
  };
  const remove = (index: number) => onChange(questions.filter((_, questionIndex) => questionIndex !== index));

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <section key={question.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              value={question.name}
              onChange={(event) => update(index, { ...question, name: event.target.value })}
              aria-label={`Question ${index + 1} name`}
              placeholder="Question name"
              className="h-8 flex-1 font-medium"
            />
            <select
              value={question.type}
              onChange={(event) => {
                const type = event.target.value;
                if (!isDecisionQuestionType(type)) return;
                if (type === "choice") update(index, { ...question, type, criteria: [{ key: "yes", description: "" }, { key: "no", description: "" }] });
                if (type === "score") update(index, { ...question, type, criteria: ["low", "high"] });
                if (type === "noul") update(index, { ...question, type, criteria: { true: "", false: "" } });
              }}
              aria-label={`${question.name || "Question"} type`}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="choice">Choice</option>
              <option value="score">Score</option>
              <option value="noul">Noul</option>
            </select>
            <Button variant="ghost" size="icon-sm" type="button" onClick={() => remove(index)} disabled={questions.length === 1} aria-label={`Remove ${question.name || "question"}`}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <ProTextarea
            value={question.instructionsMode === "text" ? question.instructions : question.instructionsJson}
            onChange={(event) => update(index, question.instructionsMode === "text" ? { ...question, instructions: event.target.value } : { ...question, instructionsJson: event.target.value })}
            placeholder={question.instructionsMode === "text" ? "Instructions for this decision" : "{\n  \"rule\": \"…\"\n}"}
            aria-label={`${question.name || "Question"} instructions`}
            autoGrow
            minHeight={72}
            maxHeight={180}
            className="mt-2 text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Instructions</span><EditorMode value={question.instructionsMode} textValue="text" textLabel="Text" jsonLabel="JSON" onChange={(mode) => update(index, { ...question, instructionsMode: mode })} /></div>
          <CriteriaEditor question={question} onChange={(next) => update(index, next)} />
        </section>
      ))}
    </div>
  );
}

function CriteriaEditor({ question, onChange }: { question: DecisionQuestion; onChange: (question: DecisionQuestion) => void }) {
  if (question.criteriaMode === "json") {
    return <div className="mt-2 space-y-2"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Criteria JSON</span><EditorMode value={question.criteriaMode} textValue="rows" textLabel="Rows" jsonLabel="JSON" onChange={(mode) => onChange({ ...question, criteriaMode: mode })} /></div><ProTextarea value={question.criteriaJson} onChange={(event) => onChange({ ...question, criteriaJson: event.target.value })} placeholder={question.type === "score" ? "[\n  \"low\",\n  \"high\"\n]" : "{\n  \"yes\": null,\n  \"no\": null\n}"} aria-label="Criteria JSON" autoGrow minHeight={96} maxHeight={260} className="font-mono text-sm" /></div>;
  }
  if (question.type === "noul") {
    return <div className="mt-2 space-y-2"><div className="flex justify-end"><EditorMode value={question.criteriaMode} textValue="rows" textLabel="Rows" jsonLabel="JSON" onChange={(mode) => onChange({ ...question, criteriaMode: mode })} /></div><div className="grid gap-2 sm:grid-cols-2">
      <ProTextarea value={question.criteria.true} onChange={(event) => onChange({ ...question, criteria: { ...question.criteria, true: event.target.value } })} placeholder="True description (optional)" aria-label="True description" autoGrow minHeight={40} maxHeight={120} />
      <ProTextarea value={question.criteria.false} onChange={(event) => onChange({ ...question, criteria: { ...question.criteria, false: event.target.value } })} placeholder="False description (optional)" aria-label="False description" autoGrow minHeight={40} maxHeight={120} />
    </div></div>;
  }
  if (question.type === "score") {
    return <div className="mt-2 space-y-2"><div className="flex justify-end"><EditorMode value={question.criteriaMode} textValue="rows" textLabel="Rows" jsonLabel="JSON" onChange={(mode) => onChange({ ...question, criteriaMode: mode })} /></div>
      {question.criteria.map((criterion, index) => <div key={`${question.id}-${index}`} className="flex items-center gap-2"><span className="w-5 text-right text-xs text-muted-foreground">{index + 1}</span><ProTextarea value={criterion} onChange={(event) => onChange({ ...question, criteria: question.criteria.map((value, valueIndex) => valueIndex === index ? event.target.value : value) })} aria-label={`Score level ${index + 1}`} autoGrow minHeight={40} maxHeight={120} /><Button type="button" size="icon-sm" variant="ghost" disabled={question.criteria.length === 2} onClick={() => onChange({ ...question, criteria: question.criteria.filter((_, valueIndex) => valueIndex !== index) })} aria-label="Remove score level"><Trash2 className="size-4" /></Button></div>)}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...question, criteria: [...question.criteria, ""] })}><Plus className="size-3.5" />Add score level</Button>
    </div>;
  }
  return <div className="mt-2 space-y-2"><div className="flex justify-end"><EditorMode value={question.criteriaMode} textValue="rows" textLabel="Rows" jsonLabel="JSON" onChange={(mode) => onChange({ ...question, criteriaMode: mode })} /></div>
    {question.criteria.map((criterion, index) => <div key={`${question.id}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(8rem,0.45fr)_minmax(12rem,1fr)_auto]"><Input value={criterion.key} onChange={(event) => onChange({ ...question, criteria: question.criteria.map((value, valueIndex) => valueIndex === index ? { ...value, key: event.target.value } : value) })} aria-label={`Choice ${index + 1} key`} placeholder="Choice key" /><ProTextarea value={criterion.description} onChange={(event) => onChange({ ...question, criteria: question.criteria.map((value, valueIndex) => valueIndex === index ? { ...value, description: event.target.value } : value) })} aria-label={`Choice ${index + 1} description`} placeholder="Description (optional)" autoGrow minHeight={40} maxHeight={120} /><Button type="button" size="icon-sm" variant="ghost" disabled={question.criteria.length === 2} onClick={() => onChange({ ...question, criteria: question.criteria.filter((_, valueIndex) => valueIndex !== index) })} aria-label="Remove choice"><Trash2 className="size-4" /></Button></div>)}
    <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...question, criteria: [...question.criteria, { key: "", description: "" }] })}><Plus className="size-3.5" />Add choice</Button>
  </div>;
}

function EditorMode<M extends "text" | "rows">({ value, textLabel, jsonLabel, onChange, textValue }: { value: M | "json"; textLabel: string; jsonLabel: string; textValue: M; onChange: (value: M | "json") => void }) {
  return <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs"><button type="button" onClick={() => onChange(textValue)} className={`rounded px-2 py-1 ${value === textValue ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{textLabel}</button><button type="button" onClick={() => onChange("json")} className={`rounded px-2 py-1 ${value === "json" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{jsonLabel}</button></div>;
}
