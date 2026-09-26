"use client";

/**
 * The `decision_questions` part editor — one numbered card per question.
 *
 * A questions part is a list of output fields, each with a type and a rubric.
 * Every question is its own unit: the question text leads (it is what the
 * author thinks in), the type is a segmented control, the field name it
 * answers into is secondary, and the criteria sit indented beneath it. The
 * things authors get wrong — a duplicated field name, a two-part question, a
 * rubric with one level, a budget already blown — are shown AT the question
 * they concern. Champion: Typeform's builder and Linear's issue templates —
 * one card per item, the prompt dominant, settings a quiet row beneath.
 *
 * Contract: `common-docs/systems/agents/typed-messages/FEATURE.md`.
 * Every string field is a slot: `{{variable}}` works in the instruction and
 * in every criterion, and the chips render exactly as they do elsewhere in
 * the builder (`HighlightedText`).
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  GripVertical,
  Info,
  ListChecks,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { formatTokens } from "@/lib/tokens/estimate";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  CHOICE_OPTION_MAX,
  CHOICE_OPTION_MIN,
  SCORE_LEVEL_MAX,
  SCORE_LEVEL_MIN,
  type DecisionQuestionSpec,
  type DecisionQuestionType,
} from "@/features/agents/decision-questions/types";
import { readDecisionBudget } from "@/features/agents/decision-questions/budget";
import { lintQuestion } from "@/features/agents/decision-questions/lint";
import {
  normalizeQuestionName,
  slugifyQuestionName,
  uniqueQuestionName,
} from "@/features/agents/decision-questions/name";
import type { PartCompatibility } from "@/features/agents/decision-questions/compatibility";

const TYPE_LABELS: Record<DecisionQuestionType, string> = {
  noul: "Yes/No",
  choice: "Choice",
  score: "Score",
};

const TYPE_ORDER: DecisionQuestionType[] = ["noul", "choice", "score"];

/** A fresh question, named uniquely against the ones already in the part. */
export function newDecisionQuestion(
  existing: readonly DecisionQuestionSpec[],
): DecisionQuestionSpec {
  return {
    name: uniqueQuestionName(
      "question",
      existing.map((q) => q.name),
    ),
    type: "noul",
    instructions: "",
    criteria: { true: "", false: "" },
  };
}

/** The criteria a type starts with when the author switches to it. */
function defaultCriteria(type: DecisionQuestionType) {
  if (type === "noul") return { true: "", false: "" };
  if (type === "choice") return { yes: "", no: "" };
  return ["", ""];
}

function asChoice(
  criteria: DecisionQuestionSpec["criteria"],
): Array<[string, string]> {
  if (!criteria || Array.isArray(criteria)) return [];
  return Object.entries(criteria).map(([k, v]) => [k, v ?? ""]);
}

function asScore(criteria: DecisionQuestionSpec["criteria"]): string[] {
  return Array.isArray(criteria) ? criteria.map((v) => String(v ?? "")) : [];
}

function asNoul(criteria: DecisionQuestionSpec["criteria"]): {
  true: string;
  false: string;
} {
  if (!criteria || Array.isArray(criteria)) return { true: "", false: "" };
  const record = criteria as Record<string, string | null>;
  return { true: record.true ?? "", false: record.false ?? "" };
}

// ---------------------------------------------------------------------------
// Focus helper — Enter in the last option/level adds the next and lands there
// ---------------------------------------------------------------------------

function focusSoon(selector: string) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector);
    const target =
      el && el.matches("input, textarea")
        ? el
        : el?.querySelector<HTMLElement>("input, textarea");
    target?.focus();
  });
}

// ---------------------------------------------------------------------------
// Budget meter — the two ceilings, one compact row
// ---------------------------------------------------------------------------

function Bar({
  used,
  limit,
  over,
}: {
  used: number;
  limit: number;
  over: boolean;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="h-1 w-10 rounded-full bg-border overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          over
            ? "bg-destructive"
            : pct > 80
              ? "bg-amber-500"
              : "bg-emerald-500",
        )}
        style={{ width: `${Math.max(pct, 3)}%` }}
      />
    </div>
  );
}

function BudgetMeter({
  reading,
}: {
  reading: ReturnType<typeof readDecisionBudget>;
}) {
  const { limits } = reading;
  const source =
    limits.source === "catalog"
      ? "Limits come from this model's catalog entry."
      : limits.source === "unloaded"
        ? "Platform default limits — the model's own limits have not loaded yet."
        : "Platform default limits — this model's catalog entry declares none.";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums cursor-default"
            data-dq-budget
          >
            <span className="inline-flex items-center gap-1">
              <Bar
                used={reading.totalTokens}
                limit={limits.totalTokens}
                over={reading.overTotal}
              />
              <span className={cn(reading.overTotal && "text-destructive")}>
                {formatTokens(reading.totalTokens)}/
                {formatTokens(limits.totalTokens)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Bar
                used={reading.statePlusLongestTokens}
                limit={limits.statePlusLongestQuestionTokens}
                over={reading.overStatePlusLongest}
              />
              <span
                className={cn(
                  reading.overStatePlusLongest && "text-destructive",
                )}
              >
                {formatTokens(reading.statePlusLongestTokens)}/
                {formatTokens(limits.statePlusLongestQuestionTokens)}
              </span>
            </span>
            <Info className="h-3 w-3 opacity-60" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[260px] text-xs">
          <p>
            <span className="font-medium">First bar:</span> the rest of this
            message plus every question.
          </p>
          <p className="mt-1">
            <span className="font-medium">Second bar:</span> the rest of this
            message plus the longest single question — each question is read on
            its own against the whole message.
          </p>
          <p className="mt-1 text-muted-foreground">Estimated. {source}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const FIELD = "h-7 text-xs";

function RemoveButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function AddRowButton({
  onClick,
  disabled,
  children,
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {children}
      </button>
      <span className="text-[11px] text-muted-foreground/80">{hint}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score levels — ordered, drag-reorderable
// ---------------------------------------------------------------------------

function ScoreLevelRow({
  id,
  index,
  value,
  onChange,
  onRemove,
  onEnter,
  canRemove,
  validVariables,
  focusId,
}: {
  id: string;
  index: number;
  value: string;
  onChange: (next: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  canRemove: boolean;
  validVariables: string[];
  focusId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-1.5", isDragging && "opacity-60")}
    >
      <button
        type="button"
        className="inline-flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/60 hover:text-foreground"
        aria-label={`Reorder level ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={index === 0 ? "Lowest level" : "Describe this level"}
          aria-label={`Score level ${index + 1}`}
          data-dq-focus={focusId}
          className={FIELD}
        />
        {value.includes("{{") && (
          <div className="mt-0.5 text-[11px]">
            <HighlightedText text={value} validVariables={validVariables} />
          </div>
        )}
      </div>
      <RemoveButton
        onClick={onRemove}
        disabled={!canRemove}
        label={`Remove level ${index + 1}`}
      />
    </div>
  );
}

function ScoreCriteria({
  questionKey,
  levels,
  onChange,
  validVariables,
}: {
  questionKey: string;
  levels: string[];
  onChange: (next: string[]) => void;
  validVariables: string[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = levels.map((_, i) => `${questionKey}-level-${i}`);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(levels, from, to));
  };
  const canAdd = levels.length < SCORE_LEVEL_MAX;
  const addAfter = (i: number) => {
    if (!canAdd) return;
    const next = [...levels];
    next.splice(i + 1, 0, "");
    onChange(next);
    focusSoon(`[data-dq-focus="${questionKey}-level-${i + 1}"]`);
  };
  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {levels.map((level, i) => (
            <ScoreLevelRow
              key={ids[i]}
              id={ids[i]}
              index={i}
              value={level}
              focusId={ids[i]}
              validVariables={validVariables}
              canRemove={levels.length > SCORE_LEVEL_MIN}
              onEnter={() => addAfter(i)}
              onChange={(next) =>
                onChange(levels.map((v, idx) => (idx === i ? next : v)))
              }
              onRemove={() => onChange(levels.filter((_, idx) => idx !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <AddRowButton
        onClick={() => addAfter(levels.length - 1)}
        disabled={!canAdd}
        hint={`Lowest first · ${levels.length} of ${SCORE_LEVEL_MAX} · Enter adds the next`}
      >
        Add level
      </AddRowButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criteria — indented under the question
// ---------------------------------------------------------------------------

function CriteriaCell({
  question,
  questionKey,
  onChange,
  validVariables,
}: {
  question: DecisionQuestionSpec;
  questionKey: string;
  onChange: (criteria: DecisionQuestionSpec["criteria"]) => void;
  validVariables: string[];
}) {
  if (question.type === "noul") {
    const criteria = asNoul(question.criteria);
    return (
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Yes when
        </span>
        <Input
          value={criteria.true}
          onChange={(e) => onChange({ ...criteria, true: e.target.value })}
          placeholder="Optional"
          aria-label="Yes when"
          className={FIELD}
        />
        <span className="text-[11px] font-medium text-muted-foreground">
          No when
        </span>
        <Input
          value={criteria.false}
          onChange={(e) => onChange({ ...criteria, false: e.target.value })}
          placeholder="Optional"
          aria-label="No when"
          className={FIELD}
        />
      </div>
    );
  }

  if (question.type === "score") {
    return (
      <ScoreCriteria
        questionKey={questionKey}
        levels={asScore(question.criteria)}
        onChange={(levels) => onChange(levels)}
        validVariables={validVariables}
      />
    );
  }

  const options = asChoice(question.criteria);
  const setOptions = (next: Array<[string, string]>) => {
    const out: Record<string, string | null> = {};
    next.forEach(([key, description], i) => {
      const k = key.trim() || `option_${i + 1}`;
      out[k] = description.trim() ? description : null;
    });
    onChange(out);
  };
  const canAdd = options.length < CHOICE_OPTION_MAX;
  const addAfter = (i: number) => {
    if (!canAdd) return;
    const next = [...options];
    next.splice(i + 1, 0, ["", ""]);
    setOptions(next);
    focusSoon(`[data-dq-focus="${questionKey}-choice-${i + 1}"]`);
  };
  return (
    <div className="flex flex-col gap-1">
      {options.map(([key, description], i) => (
        <div
          key={`${questionKey}-choice-${i}`}
          className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-1.5"
        >
          <Input
            value={key}
            onChange={(e) =>
              setOptions(
                options.map((o, idx) =>
                  idx === i ? [e.target.value, o[1]] : o,
                ),
              )
            }
            placeholder="Option"
            aria-label={`Option ${i + 1} name`}
            data-dq-focus={`${questionKey}-choice-${i}`}
            className={cn(FIELD, "font-medium")}
          />
          <Input
            value={description}
            onChange={(e) =>
              setOptions(
                options.map((o, idx) =>
                  idx === i ? [o[0], e.target.value] : o,
                ),
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAfter(i);
              }
            }}
            placeholder="When this is the answer (optional)"
            aria-label={`Option ${i + 1} description`}
            className={FIELD}
          />
          <RemoveButton
            onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
            disabled={options.length <= CHOICE_OPTION_MIN}
            label={`Remove option ${i + 1}`}
          />
        </div>
      ))}
      <AddRowButton
        onClick={() => addAfter(options.length - 1)}
        disabled={!canAdd}
        hint={
          options.length >= CHOICE_OPTION_MAX - 5
            ? `${options.length} of ${CHOICE_OPTION_MAX}`
            : "Enter adds the next"
        }
      >
        Add option
      </AddRowButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One question — a numbered card
// ---------------------------------------------------------------------------

interface QuestionCardProps {
  id: string;
  index: number;
  question: DecisionQuestionSpec;
  tokens: number;
  duplicate: boolean;
  validVariables: string[];
  onInstruction: (value: string) => void;
  onName: (value: string) => void;
  onPatch: (patch: Partial<DecisionQuestionSpec>) => void;
  onRemove: () => void;
}

function QuestionCard({
  id,
  index,
  question,
  tokens,
  duplicate,
  validVariables,
  onInstruction,
  onName,
  onPatch,
  onRemove,
}: QuestionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const lint = lintQuestion(question);
  const instructions = question.instructions ?? "";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dq-question={index + 1}
      className={cn(
        "group/q rounded-md border border-border bg-background",
        isDragging && "z-10 shadow-lg opacity-90",
      )}
    >
      {/* The question — dominant */}
      <div className="flex items-start gap-2 px-2 pt-2">
        <button
          type="button"
          className="mt-1 inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
          aria-label={`Question ${index + 1} — drag to reorder`}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <span className="group-hover/q:hidden">{index + 1}</span>
          <GripVertical className="hidden h-3 w-3 group-hover/q:block" />
        </button>
        <div className="min-w-0 flex-1" data-dq-focus={`${id}-text`}>
          <ProTextarea
            value={instructions}
            onChange={(e) => onInstruction(e.target.value)}
            placeholder="Ask exactly one thing about the message above."
            aria-label={`Question ${index + 1}`}
            autoGrow
            minHeight={32}
            maxHeight={160}
            className="text-sm font-medium"
          />
          {instructions.includes("{{") && (
            <div className="mt-0.5 text-[11px] leading-snug">
              <HighlightedText
                text={instructions}
                validVariables={validVariables}
              />
            </div>
          )}
          {lint && (
            <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              <Scissors className="mt-px h-3 w-3 shrink-0" />
              <span>{lint.reason}</span>
            </p>
          )}
        </div>
        <RemoveButton
          onClick={onRemove}
          label={`Remove question ${index + 1}`}
        />
      </div>

      {/* Settings row — type first, then the quiet details */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 pb-2 pt-1.5 @[30rem]/dq:pl-9">
        <div
          role="radiogroup"
          aria-label={`Question ${index + 1} answer type`}
          className="inline-flex rounded-md border border-border bg-muted p-0.5"
        >
          {TYPE_ORDER.map((type) => {
            const on = question.type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() =>
                  !on && onPatch({ type, criteria: defaultCriteria(type) })
                }
                className={cn(
                  "h-6 rounded px-2.5 text-xs font-medium transition-colors",
                  on
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Field
          <Input
            value={question.name}
            onChange={(e) => onName(e.target.value)}
            aria-label={`Question ${index + 1} field name`}
            placeholder="field_name"
            className={cn(
              "h-6 w-52 max-w-full font-mono text-[11px]",
              duplicate && "border-destructive text-destructive",
            )}
          />
        </label>

        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Threshold
          <Input
            value={
              question.suggested_threshold == null
                ? ""
                : String(question.suggested_threshold)
            }
            onChange={(e) => {
              const raw = e.target.value.trim();
              const parsed = raw === "" ? null : Number(raw);
              onPatch({
                suggested_threshold:
                  parsed != null && Number.isFinite(parsed) ? parsed : null,
              });
            }}
            inputMode="decimal"
            placeholder="0.7"
            aria-label={`Question ${index + 1} suggested threshold`}
            className="h-6 w-14 text-center text-[11px] tabular-nums"
          />
        </label>

        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/80">
          {formatTokens(tokens)} tokens
        </span>

        {duplicate && (
          <p className="basis-full text-[11px] text-destructive">
            Another question already answers into “{question.name}” — rename one
            of them.
          </p>
        )}
      </div>

      {/* Criteria — indented, scannable */}
      <div className="border-t border-border/60 px-2 py-2 @[30rem]/dq:pl-9">
        <div className="border-l-2 border-border pl-3">
          <CriteriaCell
            question={question}
            questionKey={id}
            validVariables={validVariables}
            onChange={(criteria) => onPatch({ criteria })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

export interface DecisionQuestionsEditorProps {
  questions: DecisionQuestionSpec[];
  onChange: (next: DecisionQuestionSpec[]) => void;
  /** Text of every OTHER part of this message — the decision state. */
  stateText: string;
  model: AIModelRecord | null | undefined;
  validVariables?: string[];
  /** Verdict for the part as a whole; a refusal greys the whole editor. */
  compatibility?: PartCompatibility;
  /** Remove the whole part from the message. */
  onRemovePart?: () => void;
  className?: string;
}

export function DecisionQuestionsEditor({
  questions,
  onChange,
  stateText,
  model,
  validVariables = [],
  compatibility,
  onRemovePart,
  className,
}: DecisionQuestionsEditorProps) {
  const [manualNames, setManualNames] = useState<Set<number>>(new Set());

  const reading = useMemo(
    () => readDecisionBudget({ model, stateText, questions }),
    [model, stateText, questions],
  );

  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes = new Set<number>();
    questions.forEach((q, i) => {
      const name = q.name.trim();
      if (!name) return;
      if (seen.has(name)) dupes.add(i);
      else seen.set(name, i);
    });
    return dupes;
  }, [questions]);

  const refused = compatibility?.verdict === "refused";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = questions.map((_, i) => `dq-${i}`);

  const update = (index: number, patch: Partial<DecisionQuestionSpec>) => {
    onChange(
      questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ) as DecisionQuestionSpec[],
    );
  };

  const setInstruction = (index: number, value: string) => {
    const question = questions[index];
    const shouldDerive =
      !manualNames.has(index) &&
      (!question.name.trim() ||
        question.name === "question" ||
        question.name.startsWith("question_") ||
        question.name === slugifyQuestionName(question.instructions ?? ""));
    const patch: Partial<DecisionQuestionSpec> = { instructions: value };
    if (shouldDerive) {
      const derived = slugifyQuestionName(value);
      if (derived) {
        patch.name = uniqueQuestionName(
          derived,
          questions.filter((_, i) => i !== index).map((q) => q.name),
        );
      }
    }
    update(index, patch);
  };

  const addQuestion = () => {
    onChange([...questions, newDecisionQuestion(questions)]);
    focusSoon(`[data-dq-focus="dq-${questions.length}-text"]`);
  };

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
    setManualNames(
      (prev) =>
        new Set(
          [...prev]
            .filter((i) => i !== index)
            .map((i) => (i > index ? i - 1 : i)),
        ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(questions, from, to));
    // Manual-name marks travel with their question.
    const order = arrayMove(
      questions.map((_, i) => i),
      from,
      to,
    );
    setManualNames(
      (prev) =>
        new Set(
          order.flatMap((oldIdx, newIdx) => (prev.has(oldIdx) ? [newIdx] : [])),
        ),
    );
  };

  const over = reading.overTotal || reading.overStatePlusLongest;

  return (
    <div
      className={cn(
        "@container/dq flex w-full flex-col gap-2",
        refused && "opacity-50 grayscale",
        className,
      )}
      data-dq-editor
    >
      {/* One row. The message header already says where we are. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          Questions
          <span className="tabular-nums text-muted-foreground">
            {questions.length}
          </span>
        </span>
        <BudgetMeter reading={reading} />
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={addQuestion}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add question
          </Button>
          {onRemovePart && (
            <RemoveButton
              onClick={onRemovePart}
              label="Remove the questions part"
            />
          )}
        </div>
      </div>

      {over && (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {reading.overTotal
            ? "Over the shared budget — shorten the rest of the message or remove questions."
            : "The longest question plus the rest of the message is over budget — shorten that question."}
        </p>
      )}

      {compatibility && compatibility.verdict !== "native" && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px]",
            compatibility.verdict === "refused"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : compatibility.verdict === "unknown"
                ? "border-border bg-muted/50 text-muted-foreground"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{compatibility.reason}</span>
        </div>
      )}

      {questions.length === 0 ? (
        <button
          type="button"
          onClick={addQuestion}
          className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-4 py-5 text-center hover:bg-accent/40"
        >
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add the first question
          </span>
          <span className="text-[11px] text-muted-foreground">
            Each question becomes one named field in the answer.
          </span>
        </button>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {questions.map((question, index) => (
                <QuestionCard
                  key={ids[index]}
                  id={ids[index]}
                  index={index}
                  question={question}
                  tokens={reading.questionTokens[index] ?? 0}
                  duplicate={duplicateNames.has(index)}
                  validVariables={validVariables}
                  onInstruction={(v) => setInstruction(index, v)}
                  onName={(v) => {
                    setManualNames((prev) => new Set(prev).add(index));
                    update(index, { name: normalizeQuestionName(v) });
                  }}
                  onPatch={(patch) => update(index, patch)}
                  onRemove={() => removeQuestion(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
