"use client";

// features/education/assessment/components/edit/AssessmentEdit.tsx
//
// The owner/editor surface (gated by P7 useAccess — non-editors are bounced to
// the read-only detail). Edit the title/description, edit each question inline,
// delete a question, and — depth-on-demand — "Make this deeper" to append an
// exam/clinical-grade version of any question (the deepenItem agent). The
// deepen run STREAMS into the floating LiveRunWindow (THE FLOATING LAW) — the
// user watches the harder question being written instead of a toast spinner,
// and the questions they are editing never move.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  Trash2,
  Save,
  Sparkles,
  Loader2,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useFloatingRunWindow } from "@/features/agents/hooks/useFloatingAgentRun";
import { useAccess } from "@/utils/permissions/access";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { assessmentService } from "../../data/assessmentService";
import { deepenItem, deeperThan } from "../../data/deepenItem";
import { assessmentListDoor, kindConfigFor } from "../kindConfig";
import { asDepth } from "../../data/types";
import type {
  AssessmentItemRow,
  AssessmentRow,
  QuestionType,
} from "../../data/types";

const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  written_response: "Written response",
};

export function AssessmentEdit({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const access = useAccess("assessment", assessmentId);
  // One window for this editor, reused by every "Make this deeper" run.
  const deepenWindow = useFloatingRunWindow({
    instanceId: `assessment-deepen:${assessmentId}`,
  });
  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [items, setItems] = useState<AssessmentItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  // The raw failure, never a sentence — the gate decides what it means.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await assessmentService.getAssessmentWithItems(assessmentId);
      if (cancelled) return;
      if (res.error || !res.data) {
        setLoadError(res.error ?? null);
        setAssessment(null);
      } else {
        setLoadError(null);
        setAssessment(res.data.assessment);
        setItems(res.data.items);
        setTitle(res.data.assessment.title);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, reloadKey]);

  if (loading || access.loading) {
    return (
      <div className="min-h-full w-full bg-textured">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <Skeleton className="h-8 w-2/3 rounded" />
          <Skeleton className="mt-4 h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const canEdit =
    access.level === "edit" || access.level === "admin" || access.isOwner;

  if (!assessment) {
    // Denied / deleted / never existed / signed-out are indistinguishable from
    // here — the gate asks the platform and offers the real next step.
    const door = assessmentListDoor(pathname);
    return (
      <div className="min-h-full w-full bg-textured">
        <AccessGate
          token="assessment"
          id={assessmentId}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          fallbackHref={door.href}
          fallbackLabel={door.label}
        />
      </div>
    );
  }
  if (!canEdit) {
    return (
      <CenteredNotice
        icon={Lock}
        text="You have view-only access to this assessment. Make a copy to edit it."
        onBack={() => router.back()}
      />
    );
  }

  const config = kindConfigFor(assessment.assessment_kind);
  const base = `/education/${config.base}`;

  const saveTitle = async () => {
    if (title.trim() === assessment.title) return;
    const res = await assessmentService.updateAssessment(assessmentId, {
      title: title.trim() || assessment.title,
    });
    if (res.error) toast.error(res.error);
    else setAssessment(res.data);
  };

  const patchItem = (id: string, patch: Partial<AssessmentItemRow>) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );

  const saveItem = async (item: AssessmentItemRow) => {
    const res = await assessmentService.updateItem(item.id, {
      prompt: item.prompt,
      correct_answer: item.correct_answer,
      explanation: item.explanation,
      options: item.options,
    });
    if (res.error) toast.error(res.error);
    else toast.success("Question saved");
  };

  const removeItem = async (id: string) => {
    const res = await assessmentService.deleteItem(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
    toast.success("Question removed");
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() =>
              startTransition(() => router.push(`${base}/${assessmentId}`))
            }
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Edit {config.noun}
          </h1>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() =>
              startTransition(() => router.push(`${base}/${assessmentId}`))
            }
            disabled={isPending}
          >
            Done
          </Button>
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <Label htmlFor="ae-title">Title</Label>
          <Input
            id="ae-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            className="text-base"
          />
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {items.map((item, i) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={i}
              onChange={(patch) => patchItem(item.id, patch)}
              onSave={() => void saveItem(item)}
              onDelete={() => void removeItem(item.id)}
              onDeepen={async () => {
                const target = deeperThan(asDepth(item.depth));
                // Float FIRST, before the launch — the window is what the user
                // watches while the run connects.
                const live = deepenWindow.start(
                  `Writing a ${target}-depth version of Q${i + 1}`,
                );
                const deeper = await dispatch(
                  deepenItem({
                    item,
                    examType: assessment.exam_type,
                    onConversationCreated: live.bind,
                  }),
                );
                if (!deeper) {
                  toast.error("Couldn't deepen this question");
                  return;
                }
                const added = await assessmentService.addItems(assessmentId, [
                  { ...deeper, position: item.position + 1 },
                ]);
                if (added.error || !added.data?.length) {
                  toast.error(
                    added.error ?? "Couldn't add the deeper question",
                  );
                  return;
                }
                setItems((prev) => {
                  const next = [...prev];
                  next.splice(i + 1, 0, added.data![0]);
                  return next;
                });
                toast.success(`Added a ${target}-depth version`);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  index,
  onChange,
  onSave,
  onDelete,
  onDeepen,
}: {
  item: AssessmentItemRow;
  index: number;
  onChange: (patch: Partial<AssessmentItemRow>) => void;
  onSave: () => void;
  onDelete: () => void;
  onDeepen: () => Promise<void>;
}) {
  const [deepening, setDeepening] = useState(false);
  const type = item.question_type as QuestionType;
  const options = Array.isArray(item.options) ? (item.options as string[]) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Q{index + 1} · {TYPE_LABEL[type]}
          {item.depth ? ` · ${item.depth}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={async () => {
              setDeepening(true);
              await onDeepen();
              setDeepening(false);
            }}
            disabled={deepening}
            title="Generate a harder version of this question"
          >
            {deepening ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Make deeper
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Delete question"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Textarea
        value={item.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        className="mt-2 min-h-[56px] text-sm"
        placeholder="Question prompt"
      />

      {(type === "multiple_choice" || type === "true_false") &&
        options.length > 0 && (
          <RadioGroup
            value={item.correct_answer ?? ""}
            onValueChange={(val) => onChange({ correct_answer: val })}
            className="mt-2 flex flex-col gap-1.5"
          >
            {options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[oi] = e.target.value;
                    onChange({ options: next as never });
                  }}
                  className="text-sm"
                />
                <RadioGroupItem value={opt} aria-label="Mark correct" />
              </div>
            ))}
          </RadioGroup>
        )}

      {(type === "fill_blank" || type === "short_answer") && (
        <Input
          value={item.correct_answer ?? ""}
          onChange={(e) => onChange({ correct_answer: e.target.value })}
          className="mt-2 text-sm"
          placeholder="Correct answer"
        />
      )}

      <Textarea
        value={item.explanation ?? ""}
        onChange={(e) => onChange({ explanation: e.target.value })}
        className="mt-2 min-h-[44px] text-sm"
        placeholder="Explanation"
      />

      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onSave}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}

function CenteredNotice({
  icon: Icon,
  text,
  onBack,
}: {
  icon: LucideIcon;
  text: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
        <Icon className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">{text}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}
