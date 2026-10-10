"use client";

// HR settings, "Review templates": the employer's templates (list) and the editor — sections,
// questions (rating / text / narrative list with min and max / responsibilities), the rating scale,
// the default, archive. Every object written is built by templateBuilder.ts with its `__kind`; the
// door's `template_invalid` problems are shown at the section, question or scale they name.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ClipboardCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Select } from "@ai-matrx/design-system/controls";
import { Switch } from "@ai-matrx/design-system";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { toast } from "@/lib/toast";

import { templateProblemMessage } from "./messages";
import { archiveTemplate, listTemplates, saveTemplate } from "./service";
import { formatDay } from "./status";
import {
  buildMetadataPayload,
  buildTemplatePayload,
  draftId,
  keyDraft,
  starterDraft,
  type DraftPoint,
  type DraftQuestion,
  type DraftSection,
  type TemplateDraft,
} from "./templateBuilder";
import type { AnswerProblem, TemplateQuestionType, TemplateRow } from "./types";

const TYPE_OPTIONS: Array<{ value: TemplateQuestionType; label: string }> = [
  { value: "narrative_list", label: "List of items" },
  { value: "responsibilities", label: "Responsibilities list" },
  { value: "text", label: "Free text" },
  { value: "rating", label: "Rating" },
];

export function TemplatesPanel() {
  const hr = useHrContext();
  const organizationId = hr.active?.organization_id ?? null;
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: TemplateDraft; metadataOnly: boolean } | null>(null);
  const [archiving, setArchiving] = useState<TemplateRow | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    void listTemplates(organizationId).then((r) => {
      if (!live) return;
      if (r.ok) {
        setRows(r.data);
        setError(null);
      } else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [organizationId, tick]);

  const columns: MatrxColumnDef<TemplateRow>[] = useMemo(
    () => [
      { id: "name", header: "Template", accessorFn: (t) => t.name, filter: "text", width: 260, frozen: true },
      {
        id: "default",
        header: "Default",
        accessorFn: (t) => (t.isDefault ? "Default" : ""),
        filter: "text",
        width: 110,
        cell: (t) => (t.isDefault ? <Badge tone="primary">Default</Badge> : null),
      },
      { id: "sections", header: "Sections", accessorFn: (t) => t.sectionCount, filter: "number", width: 100 },
      { id: "questions", header: "Questions", accessorFn: (t) => t.questionCount, filter: "number", width: 110 },
      { id: "cycles", header: "Cycles", accessorFn: (t) => t.cycleCount, filter: "number", width: 90 },
      { id: "updated", header: "Updated", accessorFn: (t) => t.updatedAt, filter: "date", width: 130, cell: (t) => formatDay(t.updatedAt) },
      {
        id: "actions",
        header: "",
        accessorFn: () => "",
        filter: false,
        width: 110,
        cell: (t) => (
          <div className="flex gap-1">
            <Button
              icon={<Pencil />}
              variant="quiet"
              aria-label={`Edit ${t.name}`}
              onClick={() =>
                setEditing({
                  metadataOnly: true,
                  draft: { ...starterDraft(), templateId: t.templateId, name: t.name, description: t.description ?? "", isDefault: t.isDefault },
                })
              }
            />
            <Button icon={<Archive />} variant="quiet" aria-label={`Archive ${t.name}`} onClick={() => setArchiving(t)} />
          </div>
        ),
      },
    ],
    [],
  );
  const copy: MatrxDataTableCopyConfig<TemplateRow> = {
    label: "review template",
    listLabel: "review templates (this view)",
    location: "HR settings, review templates",
    rowKind: "review-template",
    listKind: "review-template-list",
    rowDescription: "One performance review template: name, sections, questions and the cycles that used it.",
    listDescription: "The review templates of this employer, as currently shown.",
    humanRow: (t) => [`Template: ${t.name}`, `Sections: ${t.sectionCount}`, `Questions: ${t.questionCount}`, `Cycles: ${t.cycleCount}`].join("\n"),
  };

  if (!organizationId) return null;
  if (editing) {
    return (
      <TemplateEditor
        organizationId={organizationId}
        initial={editing.draft}
        metadataOnly={editing.metadataOnly}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  return (
    <section aria-label="Review templates" className="space-y-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <MatrxDataTable<TemplateRow>
          tableId="hr/settings/review-templates"
          data={rows}
          columns={columns}
          getRowId={(t) => t.templateId}
          pageSize={0}
          density="condensed"
          viewTabs={false}
          toolbar={{ title: "Review templates", searchPlaceholder: "Search templates", add: { onAdd: () => setEditing({ draft: starterDraft(), metadataOnly: false }) } }}
          detail={{ enabled: false }}
          copy={copy}
          emptyState={{ title: "No templates yet" }}
        />
      ) : rows ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No templates yet"
          line="The default template is made when you create your first cycle"
          action={
            <Button icon={<Plus />} variant="primary" onClick={() => setEditing({ draft: starterDraft(), metadataOnly: false })}>
              New template
            </Button>
          }
        />
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving?.name ?? "this template"}?`}
        description={`It stops being offered for new cycles${archiving?.isDefault ? " and is no longer the default" : ""}. ${archiving?.cycleCount ?? 0} existing cycles keep their own copy and are not changed.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={async () => {
          if (!archiving) return;
          const r = await archiveTemplate(archiving.templateId);
          setArchiving(null);
          if (!r.ok) toast.error(r.message);
          else {
            toast.success("Template archived");
            reload();
          }
        }}
      />
    </section>
  );
}

function TemplateEditor({
  organizationId,
  initial,
  metadataOnly,
  onClose,
  onSaved,
}: {
  organizationId: string;
  initial: TemplateDraft;
  metadataOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [problems, setProblems] = useState<AnswerProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keys = useMemo(() => keyDraft(draft), [draft]);
  const patch = (p: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...p }));
  const at = (key: string | undefined) => (key ? problems.filter((p) => p.question === key) : []);
  const general = [...at("sections"), ...at("section"), ...at("rating_scale")];

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setProblems([]);
    const payload = metadataOnly
      ? buildMetadataPayload({ templateId: draft.templateId ?? "", name: draft.name, description: draft.description, isDefault: draft.isDefault })
      : buildTemplatePayload(draft, organizationId);
    const r = await saveTemplate(payload);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      setProblems(r.problems ?? []);
      return;
    }
    toast.success(r.data.created ? "Template created" : "Template saved");
    onSaved();
  };

  const setSection = (id: string, p: Partial<DraftSection>) => patch({ sections: draft.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const setQuestion = (sid: string, qid: string, p: Partial<DraftQuestion>) =>
    patch({ sections: draft.sections.map((s) => (s.id === sid ? { ...s, questions: s.questions.map((q) => (q.id === qid ? { ...q, ...p } : q)) } : s)) });
  const setPoint = (id: string, p: Partial<DraftPoint>) => patch({ points: draft.points.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Field aria-label="Template name" placeholder="Annual performance review" value={draft.name} onChange={(e) => patch({ name: e.target.value })} className="max-w-sm" />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.isDefault} onCheckedChange={(v) => patch({ isDefault: v })} aria-label="Default for new cycles" />
          Default for new cycles
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || draft.name.trim() === ""}>
            Save template
          </Button>
        </div>
      </div>
      <Field aria-label="Description" placeholder="Who this template is for" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {general.map((p, i) => (
        <p key={i} role="alert" className="text-sm text-destructive">
          {templateProblemMessage(p.problem)}
        </p>
      ))}

      {metadataOnly ? (
        <p className="text-sm text-muted-foreground">Questions are fixed once saved. Make a new template to change them.</p>
      ) : (
        <>
          {draft.sections.map((s, si) => (
            <div key={s.id} className="space-y-2 rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Field aria-label={`Section ${si + 1} title`} placeholder="Section title" value={s.title} onChange={(e) => setSection(s.id, { title: e.target.value })} className="max-w-sm" />
                <Field aria-label={`Section ${si + 1} description`} placeholder="Description (optional)" value={s.description} onChange={(e) => setSection(s.id, { description: e.target.value })} className="min-w-48 flex-1" />
                <Button icon={<Trash2 />} variant="quiet" removes aria-label={`Remove section ${s.title || si + 1}`} onClick={() => patch({ sections: draft.sections.filter((x) => x.id !== s.id) })} />
              </div>
              {at(keys.sectionKeys.get(s.id)).map((p, i) => (
                <p key={i} role="alert" className="text-xs text-destructive">
                  {templateProblemMessage(p.problem)}
                </p>
              ))}
              {s.questions.map((q) => (
                <div key={q.id} className="space-y-2 rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select<TemplateQuestionType> aria-label="Question type" value={q.type} options={TYPE_OPTIONS} onValueChange={(type) => setQuestion(s.id, q.id, { type, items: type === "rating" && q.items.length === 0 ? [{ id: draftId(), label: "" }] : q.items })} />
                    <Field aria-label="Question label" placeholder="Question" value={q.label} onChange={(e) => setQuestion(s.id, q.id, { label: e.target.value })} className="min-w-48 flex-1" />
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={q.required} onCheckedChange={(v) => setQuestion(s.id, q.id, { required: v })} aria-label="Required" />
                      Required
                    </label>
                    <Button icon={<Trash2 />} variant="quiet" removes aria-label={`Remove question ${q.label || ""}`} onClick={() => setSection(s.id, { questions: s.questions.filter((x) => x.id !== q.id) })} />
                  </div>
                  {(q.type === "narrative_list" || q.type === "responsibilities") && (
                    <div className="flex items-center gap-2 text-sm">
                      <label className="flex items-center gap-1">
                        Min
                        <Field type="number" min={0} aria-label="Minimum items" value={String(q.minItems)} onChange={(e) => setQuestion(s.id, q.id, { minItems: Number(e.target.value) })} className="w-20" />
                      </label>
                      <label className="flex items-center gap-1">
                        Max
                        <Field type="number" min={1} aria-label="Maximum items" value={String(q.maxItems)} onChange={(e) => setQuestion(s.id, q.id, { maxItems: Number(e.target.value) })} className="w-20" />
                      </label>
                    </div>
                  )}
                  {q.type === "rating" && (
                    <div className="space-y-1">
                      {q.items.map((it) => (
                        <div key={it.id} className="flex items-center gap-2">
                          <Field aria-label="Item to rate" placeholder="Item to rate" value={it.label} onChange={(e) => setQuestion(s.id, q.id, { items: q.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) })} className="max-w-sm" />
                          <Button icon={<Trash2 />} variant="quiet" removes aria-label="Remove item" onClick={() => setQuestion(s.id, q.id, { items: q.items.filter((x) => x.id !== it.id) })} />
                        </div>
                      ))}
                      <Button icon={<Plus />} variant="quiet" onClick={() => setQuestion(s.id, q.id, { items: [...q.items, { id: draftId(), label: "" }] })}>
                        Add item
                      </Button>
                    </div>
                  )}
                  {at(keys.questionKeys.get(q.id)).map((p, i) => (
                    <p key={i} role="alert" className="text-xs text-destructive">
                      {templateProblemMessage(p.problem)}
                    </p>
                  ))}
                </div>
              ))}
              <Button
                icon={<Plus />}
                variant="quiet"
                onClick={() => setSection(s.id, { questions: [...s.questions, { id: draftId(), type: "text", label: "", required: false, minItems: 0, maxItems: 0, items: [] }] })}
              >
                Add question
              </Button>
            </div>
          ))}
          <Button icon={<Plus />} variant="outline" onClick={() => patch({ sections: [...draft.sections, { id: draftId(), title: "", description: "", questions: [] }] })}>
            Add section
          </Button>

          <div className="space-y-2 rounded-md border border-border bg-card p-3">
            <p className="text-sm font-medium">Rating scale</p>
            {draft.points.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Field type="number" aria-label="Point number" value={String(p.value)} onChange={(e) => setPoint(p.id, { value: Number(e.target.value) })} className="w-20" />
                <Field aria-label="Point label" placeholder="Label" value={p.label} onChange={(e) => setPoint(p.id, { label: e.target.value })} className="max-w-xs" />
                <Button icon={<Trash2 />} variant="quiet" removes aria-label={`Remove point ${p.label}`} onClick={() => patch({ points: draft.points.filter((x) => x.id !== p.id) })} />
              </div>
            ))}
            <Button icon={<Plus />} variant="quiet" onClick={() => patch({ points: [...draft.points, { id: draftId(), value: Math.max(0, ...draft.points.map((x) => x.value)) + 1, label: "" }] })}>
              Add point
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
