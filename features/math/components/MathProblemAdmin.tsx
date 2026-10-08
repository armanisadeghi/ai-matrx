"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FilePlus2, Loader2, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useRead } from "@ai-matrx/design-system";
import { ReadFailure } from "@ai-matrx/design-system";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import {
  createEducationQuickMathAuthoringScope,
  EDUCATION_QUICK_MATH_AUTHORING_SURFACE_NAME,
} from "@/features/surfaces/manifests/education-quick-math-authoring.manifest";
import {
  parseCreateMathProblems,
  parseDeleteMathProblems,
  parseUpdateMathProblems,
} from "../mathProblemAgentWrites";
import type { Json } from "@/types/database.types";
import {
  mathProblemAdminService,
  parseJsonValue,
  type MathProblemInsert,
  type MathProblemRow,
  type MathProblemUpdate,
} from "../admin-service";

type ProblemDraft = {
  title: string;
  courseName: string;
  topicName: string;
  moduleName: string;
  description: string;
  introText: string;
  finalStatement: string;
  hint: string;
  difficulty: string;
  sortOrder: string;
  published: boolean;
  problemStatement: string;
  solutions: string;
};

const EMPTY_PROBLEM_STATEMENT = JSON.stringify(
  { text: "", equation: "", instruction: "" },
  null,
  2,
);

const EMPTY_SOLUTIONS = JSON.stringify([], null, 2);

function newDraft(): ProblemDraft {
  return {
    title: "", courseName: "Mathematics", topicName: "", moduleName: "",
    description: "", introText: "", finalStatement: "", hint: "", difficulty: "medium",
    sortOrder: "0", published: false, problemStatement: EMPTY_PROBLEM_STATEMENT,
    solutions: EMPTY_SOLUTIONS,
  };
}

function draftFromRow(row: MathProblemRow): ProblemDraft {
  return {
    title: row.title, courseName: row.course_name, topicName: row.topic_name,
    moduleName: row.module_name, description: row.description ?? "",
    introText: row.intro_text ?? "", finalStatement: row.final_statement ?? "",
    hint: row.hint ?? "", difficulty: row.difficulty_level ?? "", sortOrder: String(row.sort_order ?? 0),
    published: row.is_published ?? false,
    problemStatement: JSON.stringify(row.problem_statement, null, 2),
    solutions: JSON.stringify(row.solutions, null, 2),
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Sort order must be a whole number of zero or more.");
  }
  return parsed;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  return trimmed;
}

function requireProblemStatement(value: Json): Json {
  if (!isJsonObject(value)) {
    throw new Error("Problem statement must be an object with text, equation, and instruction.");
  }
  return value;
}

function isJsonObject(value: Json): value is { [key: string]: Json } {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function requireSolutions(value: Json): Json {
  if (!Array.isArray(value)) {
    throw new Error("Solutions must be a JSON array.");
  }
  return value;
}

function toWriteValues(draft: ProblemDraft) {
  const problemStatement = requireProblemStatement(parseJsonValue(draft.problemStatement, "Problem statement"));
  const solutions = requireSolutions(parseJsonValue(draft.solutions, "Solutions"));
  const difficulty = draft.difficulty.trim();
  if (difficulty && difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error("Difficulty must be easy, medium, hard, or blank.");
  }
  return {
    title: requireText(draft.title, "Title"),
    course_name: requireText(draft.courseName, "Course"),
    topic_name: requireText(draft.topicName, "Topic"),
    module_name: requireText(draft.moduleName, "Module"),
    description: textOrNull(draft.description),
    intro_text: textOrNull(draft.introText),
    final_statement: textOrNull(draft.finalStatement),
    hint: textOrNull(draft.hint),
    difficulty_level: difficulty || null,
    sort_order: positiveInteger(draft.sortOrder),
    is_published: draft.published,
    problem_statement: problemStatement,
    solutions,
  };
}

function createInput(draft: ProblemDraft): Omit<MathProblemInsert, "organization_id"> {
  return { ...toWriteValues(draft), metadata: {}, published_to_web: draft.published };
}

function updatePatch(draft: ProblemDraft): MathProblemUpdate {
  return { ...toWriteValues(draft), published_to_web: draft.published };
}

export function MathProblemAdmin() {
  const [selected, setSelected] = useState<MathProblemRow | null>(null);
  const [draft, setDraft] = useState<ProblemDraft>(newDraft);
  const [saving, setSaving] = useState(false);
  const read = useRead(
    () => mathProblemAdminService.list(),
    [],
    { initialData: [] as MathProblemRow[] },
  );
  const rows = read.data ?? [];
  const getScope = () => createEducationQuickMathAuthoringScope({
    problems_loaded: !read.isLoading && !read.isError,
    problem_count: rows.length,
    math_problems: rows.map((row) => ({
      id: row.id,
      title: row.title,
      course_name: row.course_name,
      topic_name: row.topic_name,
      module_name: row.module_name,
      difficulty_level: row.difficulty_level,
      sort_order: row.sort_order,
      is_published: row.is_published,
      version: row.version,
    })),
  });
  const getWriteHandlers = () => collectionWriteHandlers({
    plural: "math_problems", singular: "Quick Math problem",
    create: {
      parse: (value) => parseCreateMathProblems(value, rows),
      run: async (input) => {
        const saved = await mathProblemAdminService.create(input);
        void read.retry();
        return { id: saved.id, name: saved.title };
      },
      nameOf: (input) => input.title,
    },
    update: {
      parse: (value) => parseUpdateMathProblems(value, rows),
      run: async (plan) => {
        const saved = await mathProblemAdminService.update(plan.id, plan.version, plan.patch);
        void read.retry();
        return { id: saved.id, name: saved.title };
      },
      nameOf: (plan) => plan.name,
      changedOf: (plan) => plan.changed,
    },
    delete: {
      parse: (value) => parseDeleteMathProblems(value, rows),
      run: async (row) => {
        await mathProblemAdminService.softDelete(row.id, row.version);
        void read.retry();
        return { id: row.id, name: row.title };
      },
      nameOf: (row) => row.title,
    },
  }, refuseSurfaceWrite);

  function startNew() {
    setSelected(null);
    setDraft(newDraft());
  }

  function edit(row: MathProblemRow) {
    setSelected(row);
    setDraft(draftFromRow(row));
  }

  function set<K extends keyof ProblemDraft>(key: K, value: ProblemDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = selected
        ? await mathProblemAdminService.update(selected.id, selected.version, updatePatch(draft))
        : await mathProblemAdminService.create(createInput(draft));
      setSelected(saved);
      setDraft(draftFromRow(saved));
      void read.retry();
      toast.success(selected ? "Quick Math problem saved." : "Quick Math problem created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this Quick Math problem.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MathProblemRow) {
    const accepted = await confirm({
      title: "Delete Quick Math problem?",
      description: `“${row.title}” will stop appearing in lessons. This keeps the row as a recoverable soft delete.`,
      confirmLabel: "Delete problem",
      variant: "destructive",
    });
    if (!accepted) return;
    try {
      await mathProblemAdminService.softDelete(row.id, row.version);
      if (selected?.id === row.id) startNew();
      void read.retry();
      toast.success("Quick Math problem deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this Quick Math problem.");
    }
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={EDUCATION_QUICK_MATH_AUTHORING_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Quick Math problems</CardTitle>
          <Button icon={<FilePlus2 />} variant="primary" onClick={startNew}>New</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {read.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading problems…</div> : null}
          {read.isError ? <ReadFailure error={read.error} what="Quick Math problems" onRetry={read.retry} /> : null}
          {!read.isLoading && !read.isError && rows.length === 0 ? <p className="text-sm text-muted-foreground">No Quick Math problems exist yet.</p> : null}
          {!read.isError && rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => edit(row)}>
                  <div className="truncate text-sm font-medium">{row.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{row.course_name} · {row.topic_name} · {row.module_name}</div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button icon={<Pencil />} variant="quiet" aria-label={`Edit ${row.title}`} onClick={() => edit(row)} />
                  <Button icon={<Trash2 className="text-destructive" />} variant="quiet" aria-label={`Delete ${row.title}`} onClick={() => void remove(row)} />
                </div>
              </div>
              <Link href={`/education/subjects/quick-math/${row.id}`} className="mt-2 inline-block text-xs text-primary hover:underline">Open learner view</Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{selected ? "Edit problem" : "New problem"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><Input value={draft.title} onChange={(event) => set("title", event.target.value)} /></Field>
            <Field label="Course"><Input value={draft.courseName} onChange={(event) => set("courseName", event.target.value)} /></Field>
            <Field label="Topic"><Input value={draft.topicName} onChange={(event) => set("topicName", event.target.value)} /></Field>
            <Field label="Module"><Input value={draft.moduleName} onChange={(event) => set("moduleName", event.target.value)} /></Field>
            <Field label="Difficulty"><Input value={draft.difficulty} placeholder="easy, medium, or hard" onChange={(event) => set("difficulty", event.target.value)} /></Field>
            <Field label="Sort order"><Input inputMode="numeric" value={draft.sortOrder} onChange={(event) => set("sortOrder", event.target.value)} /></Field>
          </div>
          <Field label="Description"><Textarea value={draft.description} onChange={(event) => set("description", event.target.value)} /></Field>
          <Field label="Introduction"><Textarea value={draft.introText} onChange={(event) => set("introText", event.target.value)} /></Field>
          <Field label="Problem statement JSON"><Textarea mono minHeight={160} value={draft.problemStatement} onChange={(event) => set("problemStatement", event.target.value)} /></Field>
          <Field label="Solutions JSON"><Textarea mono minHeight={208} value={draft.solutions} onChange={(event) => set("solutions", event.target.value)} /></Field>
          <Field label="Hint"><Textarea value={draft.hint} onChange={(event) => set("hint", event.target.value)} /></Field>
          <Field label="Final statement"><Textarea value={draft.finalStatement} onChange={(event) => set("finalStatement", event.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.published} onChange={(event) => set("published", event.target.checked)} />Publish in the learner lesson list</label>
          <Button icon={<Save />} variant="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save problem"}</Button>
        </CardContent>
      </Card>
    </div>
    </SurfaceRuntimeProvider>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
